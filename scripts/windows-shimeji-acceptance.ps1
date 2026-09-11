param(
  [string]$AppPath = (Join-Path $PSScriptRoot 'PetLitePet.exe'),
  [int]$ObserveSeconds = 24
)

$ErrorActionPreference = 'Stop'
$startedAt = Get-Date
$evidenceDir = Join-Path $PSScriptRoot ('acceptance-evidence-' + $startedAt.ToString('yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $evidenceDir | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class PetStudioWin32 {
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
}
'@

$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
  $checks.Add([ordered]@{ name = $Name; passed = $Passed; detail = $Detail })
  $mark = if ($Passed) { '[PASS]' } else { '[FAIL]' }
  Write-Host "$mark $Name - $Detail"
}

function Get-AppProcessIds {
  $target = [IO.Path]::GetFullPath($AppPath)
  $ids = @()
  foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
    try {
      if ($process.Path -and [IO.Path]::GetFullPath($process.Path) -eq $target) { $ids += [uint32]$process.Id }
    } catch {}
  }
  return @($ids)
}

trap {
  $message = $_.Exception.Message
  $message | Set-Content -LiteralPath (Join-Path $evidenceDir 'failure.txt') -Encoding UTF8
  foreach ($processId in @(Get-AppProcessIds)) {
    Get-Process -Id $processId -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Write-Error $message
  exit 2
}

function Get-PetWindows {
  $ids = @(Get-AppProcessIds)
  $found = [System.Collections.Generic.List[object]]::new()
  $callback = [PetStudioWin32+EnumWindowsProc]{
    param([IntPtr]$hwnd, [IntPtr]$unused)
    $pidValue = [uint32]0
    [void][PetStudioWin32]::GetWindowThreadProcessId($hwnd, [ref]$pidValue)
    if ($ids -contains $pidValue -and [PetStudioWin32]::IsWindowVisible($hwnd)) {
      $rect = New-Object PetStudioWin32+RECT
      if ([PetStudioWin32]::GetWindowRect($hwnd, [ref]$rect)) {
        $found.Add([ordered]@{
          hwnd = $hwnd.ToInt64(); pid = $pidValue; x = $rect.Left; y = $rect.Top
          width = $rect.Right - $rect.Left; height = $rect.Bottom - $rect.Top
        })
      }
    }
    return $true
  }
  [void][PetStudioWin32]::EnumWindows($callback, [IntPtr]::Zero)
  return @($found)
}

function Wait-PetWindows([int]$Minimum, [int]$TimeoutSeconds = 12) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $windows = @(Get-PetWindows)
    if ($windows.Count -ge $Minimum) { return $windows }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  return @(Get-PetWindows)
}

function Save-Screenshot([string]$Name) {
  $x = [PetStudioWin32]::GetSystemMetrics(76)
  $y = [PetStudioWin32]::GetSystemMetrics(77)
  $width = [PetStudioWin32]::GetSystemMetrics(78)
  $height = [PetStudioWin32]::GetSystemMetrics(79)
  if ($width -le 0 -or $height -le 0) { return }
  $bitmap = [Drawing.Bitmap]::new($width, $height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($x, $y, 0, 0, $bitmap.Size)
    $bitmap.Save((Join-Path $evidenceDir $Name), [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose(); $bitmap.Dispose()
  }
}

$preexisting = @(Get-Process -Name 'PetLitePet' -ErrorAction SilentlyContinue)
Add-Check '验收前没有同名运行时残留' ($preexisting.Count -eq 0) ("count=" + $preexisting.Count)
if ($preexisting.Count -gt 0) { throw '请先通过宠物右键菜单“退出全部宠物”，再重新运行验收脚本。' }
if (-not (Test-Path -LiteralPath $AppPath -PathType Leaf)) { throw "找不到桌宠程序：$AppPath" }

$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
Add-Check 'ZIP 已完整解压且 manifest 存在' (Test-Path -LiteralPath $manifestPath -PathType Leaf) $manifestPath
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Check '产物为 Windows x64 内测包' ($manifest.platform -eq 'win32' -and $manifest.arch -eq 'x64' -and $manifest.distribution -eq 'internal-test-only') ("$($manifest.platform)/$($manifest.arch)/$($manifest.distribution)")

$launch = Start-Process -FilePath $AppPath -PassThru
$one = @(Wait-PetWindows 1)
Add-Check '首次启动出现一只可见宠物窗口' ($one.Count -ge 1) ("visibleWindows=" + $one.Count)
if ($one.Count -lt 1) { throw '首次启动后未发现可见宠物窗口。' }

$virtual = [ordered]@{
  x = [PetStudioWin32]::GetSystemMetrics(76); y = [PetStudioWin32]::GetSystemMetrics(77)
  width = [PetStudioWin32]::GetSystemMetrics(78); height = [PetStudioWin32]::GetSystemMetrics(79)
}
$first = $one[0]
$overlapsVirtualDesktop = ($first.x + $first.width) -gt $virtual.x -and
  ($first.y + $first.height) -gt $virtual.y -and
  $first.x -lt ($virtual.x + $virtual.width) -and
  $first.y -lt ($virtual.y + $virtual.height)
# BrowserWindow 为气泡保留透明区域。为了让可见角色真正碰到屏幕边缘，
# 这部分透明留白可以伸出虚拟桌面，因此不能再要求整个原生窗口都在屏内。
Add-Check '首只宠物窗口与虚拟桌面有效相交' $overlapsVirtualDesktop ("window=$($first.x),$($first.y),$($first.width)x$($first.height)")
$dpi = try { [PetStudioWin32]::GetDpiForWindow([IntPtr]$first.hwnd) } catch { 0 }
Add-Check '记录当前 Windows DPI' ($dpi -gt 0) ("dpi=$dpi scale=" + [Math]::Round($dpi / 96 * 100) + '%')
Save-Screenshot '01-first-launch.png'

[void](Start-Process -FilePath $AppPath -PassThru)
$two = @(Wait-PetWindows 2)
Add-Check '再次启动由单实例进程召唤第二只宠物' ($two.Count -ge 2) ("visibleWindows=" + $two.Count)
Save-Screenshot '02-two-pets.png'

$beforeMotion = @($two | ForEach-Object { "$($_.hwnd):$($_.x),$($_.y)" })
Start-Sleep -Seconds ([Math]::Max(8, $ObserveSeconds))
$afterMotionWindows = @(Get-PetWindows)
$afterMotion = @($afterMotionWindows | ForEach-Object { "$($_.hwnd):$($_.x),$($_.y)" })
$moved = ($beforeMotion -join '|') -ne ($afterMotion -join '|')
Add-Check '自动游走触发可观察的位置变化' $moved ("before=" + ($beforeMotion -join ';') + " after=" + ($afterMotion -join ';'))
Save-Screenshot '03-after-motion.png'

if ($afterMotionWindows.Count -ge 2) {
  [void][PetStudioWin32]::PostMessage([IntPtr]$afterMotionWindows[0].hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  Start-Sleep -Seconds 3
}
$remaining = @(Get-PetWindows)
Add-Check '关闭其中一只不会退出另一只' ($remaining.Count -ge 1) ("visibleWindows=" + $remaining.Count)

foreach ($window in $remaining) {
  [void][PetStudioWin32]::PostMessage([IntPtr]$window.hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
}
Start-Sleep -Seconds 4
$leftProcesses = @(Get-AppProcessIds)
Add-Check '关闭最后一只后运行时完全退出' ($leftProcesses.Count -eq 0) ("processes=" + $leftProcesses.Count)
if ($leftProcesses.Count -gt 0) {
  Get-Process -Id $leftProcesses -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

$result = [ordered]@{
  schemaVersion = 1
  startedAt = $startedAt.ToString('o')
  finishedAt = (Get-Date).ToString('o')
  appPath = [IO.Path]::GetFullPath($AppPath)
  manifest = $manifest
  dpi = $dpi
  virtualScreen = $virtual
  checks = $checks
  passed = @($checks | Where-Object { $_.passed }).Count
  failed = @($checks | Where-Object { -not $_.passed }).Count
}
$resultPath = Join-Path $evidenceDir 'result.json'
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8
Write-Host "`n证据目录：$evidenceDir"
Write-Host "自动验收：$($result.passed) 通过，$($result.failed) 失败"
if ($result.failed -gt 0) { exit 1 }
