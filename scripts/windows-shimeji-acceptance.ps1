param(
  [string]$AppPath = (Join-Path $PSScriptRoot 'PetLitePet.exe'),
  [ValidateRange(8, 3600)][int]$ObserveSeconds = 24,
  [ValidateRange(0, 180)][int]$SoakMinutes = 0,
  [ValidateRange(5, 300)][int]$SampleSeconds = 30,
  [ValidateRange(1, 30)][int]$LifecycleCycleMinutes = 5,
  [ValidateSet('none', 'core', 'mixed')][string]$ManualProfile = 'none',
  [ValidateSet(100, 125, 150)][int]$ExpectedDpiPercent = 100
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

function Get-AppProcesses {
  $target = [IO.Path]::GetFullPath($AppPath)
  $found = @()
  foreach ($process in Get-Process -ErrorAction SilentlyContinue) {
    try {
      if ($process.Path -and [IO.Path]::GetFullPath($process.Path) -eq $target) { $found += $process }
    } catch {}
  }
  return @($found)
}

function Get-AppProcessIds {
  return @(Get-AppProcesses | ForEach-Object { [uint32]$_.Id })
}

function Get-AppProbeProcessCount([uint32[]]$ParentIds) {
  if ($ParentIds.Count -eq 0) { return 0 }
  $children = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $ParentIds -contains [uint32]$_.ParentProcessId })
  return $children.Count
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

$integrityPath = Join-Path $PSScriptRoot 'runtime-integrity.json'
Add-Check '运行时完整性记录存在' (Test-Path -LiteralPath $integrityPath -PathType Leaf) $integrityPath
if (-not (Test-Path -LiteralPath $integrityPath -PathType Leaf)) { throw '缺少 runtime-integrity.json，请重新完整解压测试 ZIP。' }
$artifactIntegrity = Get-Content -LiteralPath $integrityPath -Raw -Encoding UTF8 | ConvertFrom-Json
$runtimeExeSha256 = (Get-FileHash -LiteralPath $AppPath -Algorithm SHA256).Hash.ToLowerInvariant()
$manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$runtimeIdentityOk = $artifactIntegrity.schemaVersion -eq 1 -and
  $artifactIntegrity.executable.path -eq [IO.Path]::GetFileName($AppPath) -and
  $artifactIntegrity.executable.sha256 -eq $runtimeExeSha256 -and
  $artifactIntegrity.manifestSha256 -eq $manifestSha256
Add-Check '实际运行的 EXE 与 manifest 身份匹配候选记录' $runtimeIdentityOk ("exeSha256=$runtimeExeSha256 manifestSha256=$manifestSha256")
if (-not $runtimeIdentityOk) { throw '运行时文件完整性校验失败，请删除当前解压目录并从原 ZIP 重新完整解压。' }

$acceptanceScriptSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
Add-Check '验收脚本身份已记录' ($acceptanceScriptSha256 -match '^[a-f0-9]{64}$') ("sha256=" + $acceptanceScriptSha256)

$windowsOs = Get-CimInstance Win32_OperatingSystem
$windowsBuildNumber = [int]$windowsOs.BuildNumber
$windowsGeneration = if ($windowsBuildNumber -ge 22000) { '11' } else { '10' }
$osEvidence = [ordered]@{
  caption = [string]$windowsOs.Caption
  version = [string]$windowsOs.Version
  buildNumber = $windowsBuildNumber
  architecture = [string]$windowsOs.OSArchitecture
  generation = $windowsGeneration
}
$supportedWindows = $windowsBuildNumber -ge 10240 -and
  $osEvidence.caption -match 'Windows (10|11)' -and
  $osEvidence.architecture -match '64'
Add-Check '记录 Windows 版本与架构' $supportedWindows ("$($osEvidence.caption) version=$($osEvidence.version) build=$windowsBuildNumber arch=$($osEvidence.architecture)")
if (-not $supportedWindows) { throw '本轮验收只接受 64 位 Windows 10 或 Windows 11。' }

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
$dpiPercent = [int][Math]::Round($dpi / 96 * 100)
Add-Check '记录当前 Windows DPI' ($dpi -gt 0) ("dpi=$dpi scale=$dpiPercent%")
$targetDpiOk = $dpiPercent -eq $ExpectedDpiPercent
Add-Check '当前 DPI 与目标档位一致' $targetDpiOk ("actual=$dpiPercent% target=$ExpectedDpiPercent%")
if (-not $targetDpiOk) {
  throw "当前宠物窗口为 $dpiPercent% 缩放，本轮目标是 $ExpectedDpiPercent%。请先调整 Windows 屏幕缩放，再重新运行。"
}

$runLabel = "win$windowsGeneration-dpi$dpiPercent-$ManualProfile"
if ($SoakMinutes -gt 0) { $runLabel += "-soak${SoakMinutes}m" }
$labeledEvidenceDir = Join-Path $PSScriptRoot ("acceptance-evidence-$runLabel-" + $startedAt.ToString('yyyyMMdd-HHmmss'))
Move-Item -LiteralPath $evidenceDir -Destination $labeledEvidenceDir
$evidenceDir = $labeledEvidenceDir
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

$soakSamples = [System.Collections.Generic.List[object]]::new()
$lifecycleCycles = 0
$soakHealthy = $true
if ($SoakMinutes -gt 0) {
  $soakStartedAt = Get-Date
  $soakDeadline = $soakStartedAt.AddMinutes($SoakMinutes)
  $nextLifecycleAt = $soakStartedAt.AddMinutes($LifecycleCycleMinutes)
  Write-Host "`n开始长稳验收：$SoakMinutes 分钟；每 $SampleSeconds 秒采样；每 $LifecycleCycleMinutes 分钟召唤并关闭一只宠物。"

  do {
    $now = Get-Date
    if ($now -ge $nextLifecycleAt -and $now -lt $soakDeadline) {
      $beforeCycle = @(Get-PetWindows)
      if ($beforeCycle.Count -ge 1 -and $beforeCycle.Count -lt 8) {
        [void](Start-Process -FilePath $AppPath -PassThru)
        $spawnedCycle = @(Wait-PetWindows ($beforeCycle.Count + 1))
        if ($spawnedCycle.Count -eq ($beforeCycle.Count + 1)) {
          [void][PetStudioWin32]::PostMessage([IntPtr]$spawnedCycle[0].hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
          Start-Sleep -Seconds 3
          $afterCycle = @(Get-PetWindows)
          if ($afterCycle.Count -eq $beforeCycle.Count) { $lifecycleCycles += 1 }
          else { $soakHealthy = $false }
        } else {
          $soakHealthy = $false
        }
      } else {
        $soakHealthy = $false
      }
      do { $nextLifecycleAt = $nextLifecycleAt.AddMinutes($LifecycleCycleMinutes) } while ($nextLifecycleAt -le $now)
    }

    $appProcesses = @(Get-AppProcesses)
    $processIds = @()
    $workingSetBytes = [double]0
    $handleCount = 0
    $unresponsiveCount = 0
    foreach ($appProcess in $appProcesses) {
      try {
        $appProcess.Refresh()
        $processIds += [uint32]$appProcess.Id
        $workingSetBytes += [double]$appProcess.WorkingSet64
        $handleCount += [int]$appProcess.HandleCount
        if ($appProcess.MainWindowHandle -ne 0 -and -not $appProcess.Responding) { $unresponsiveCount += 1 }
      } catch {
        # A short-lived second-instance helper may exit between enumeration and
        # sampling. It is omitted instead of turning a healthy soak into a race.
      }
    }
    $petWindows = @(Get-PetWindows)
    $probeChildren = Get-AppProbeProcessCount $processIds
    $sample = [ordered]@{
      timestamp = (Get-Date).ToString('o')
      processCount = $processIds.Count
      visibleWindows = $petWindows.Count
      responding = ($unresponsiveCount -eq 0)
      workingSetMb = [Math]::Round(([double]$workingSetBytes / 1MB), 2)
      handleCount = [int]$handleCount
      probeChildren = [int]$probeChildren
    }
    $soakSamples.Add($sample)
    Write-Host ("[SOAK] {0} processes={1} windows={2} memory={3}MB handles={4} probes={5}" -f $sample.timestamp, $sample.processCount, $sample.visibleWindows, $sample.workingSetMb, $sample.handleCount, $sample.probeChildren)
    if ($processIds.Count -eq 0 -or $petWindows.Count -eq 0 -or $unresponsiveCount -gt 0) {
      $soakHealthy = $false
      break
    }

    $remainingSeconds = [Math]::Max(0, ($soakDeadline - (Get-Date)).TotalSeconds)
    if ($remainingSeconds -gt 0) {
      Start-Sleep -Seconds ([Math]::Min($SampleSeconds, [Math]::Ceiling($remainingSeconds)))
    }
  } while ((Get-Date) -lt $soakDeadline)

  $sampleArray = @($soakSamples)
  $sampleArray | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidenceDir 'soak-samples.json') -Encoding UTF8
  Add-Check '长稳期间进程、窗口与响应状态持续正常' $soakHealthy ("samples=" + $sampleArray.Count)

  $expectedCycles = [Math]::Max(0, [Math]::Ceiling($SoakMinutes / $LifecycleCycleMinutes) - 1)
  Add-Check '长稳期间反复召唤并关闭宠物' ($lifecycleCycles -ge $expectedCycles) ("cycles=$lifecycleCycles expected>=$expectedCycles")

  $maxProbeChildren = if ($sampleArray.Count -gt 0) {
    [int](($sampleArray | Measure-Object -Property probeChildren -Maximum).Maximum)
  } else { 0 }
  Add-Check 'PowerShell 窗口探测子进程没有持续堆积' ($maxProbeChildren -le 2) ("maxConcurrent=$maxProbeChildren")

  $edgeCount = [Math]::Min(3, $sampleArray.Count)
  if ($edgeCount -gt 0) {
    $firstMemory = [double](($sampleArray | Select-Object -First $edgeCount | Measure-Object -Property workingSetMb -Average).Average)
    $lastMemory = [double](($sampleArray | Select-Object -Last $edgeCount | Measure-Object -Property workingSetMb -Average).Average)
    $memoryGrowth = [Math]::Round($lastMemory - $firstMemory, 2)
    $memoryAllowance = [Math]::Max(128, $firstMemory * 0.5)
    Add-Check '长稳工作集没有明显持续增长' ($memoryGrowth -le $memoryAllowance) ("first=${firstMemory}MB last=${lastMemory}MB growth=${memoryGrowth}MB allowance=${memoryAllowance}MB")

    $firstHandles = [double](($sampleArray | Select-Object -First $edgeCount | Measure-Object -Property handleCount -Average).Average)
    $lastHandles = [double](($sampleArray | Select-Object -Last $edgeCount | Measure-Object -Property handleCount -Average).Average)
    $handleGrowth = [Math]::Round($lastHandles - $firstHandles, 2)
    $handleAllowance = [Math]::Max(512, $firstHandles * 0.5)
    Add-Check '长稳句柄数没有明显持续增长' ($handleGrowth -le $handleAllowance) ("first=$firstHandles last=$lastHandles growth=$handleGrowth allowance=$handleAllowance")
  }
  Save-Screenshot '04-after-soak.png'
}

$manualChecks = [System.Collections.Generic.List[object]]::new()
$manualCompletedAt = $null
if ($ManualProfile -ne 'none') {
  $manualSpecs = @(
    [ordered]@{ id = 'transparent-background'; name = '背景透明且图集显示正常'; prompt = '背景完全透明，无黑框、白底、方形阴影或串帧' },
    [ordered]@{ id = 'continuous-motion'; name = '移动、跟随与坠落连续'; prompt = '自动游走、窗口跟随和坠落均为连续动画，没有突然换位置' },
    [ordered]@{ id = 'edge-impact'; name = '三侧撞击停止水平滑行'; prompt = '分别抛向顶边、左边、右边后停止水平滑行并自然下落' },
    [ordered]@{ id = 'visible-boundary'; name = '可见角色精准接触屏幕边缘'; prompt = '拖到顶边和左右边时，可见角色贴边且没有约一个身位的空隙' },
    [ordered]@{ id = 'notepad-interaction'; name = '记事本攀爬、支撑与坠落正常'; prompt = '记事本侧边使用独立攀爬动画；顶边落点准确；移动时跟随；最小化或关闭后坠落' },
    [ordered]@{ id = 'menu-and-size'; name = '右键菜单与尺寸调整正常'; prompt = '自动游走、召唤、尺寸面板和复位入口正常；改变尺寸时脚底中心稳定' }
  )
  if ($ManualProfile -eq 'mixed') {
    $manualSpecs += [ordered]@{
      id = 'mixed-dpi-anchor'; name = '混合 DPI 双屏锚点稳定'
      prompt = '把宠物完整拖过双屏接缝并改变尺寸后，脚底中心稳定、完整留在当前显示器且不跳回另一屏'
    }
  }

  Write-Host "`n开始人工视觉验收（$ManualProfile）。请保留宠物运行，不要手动关闭宠物；每项实际操作后输入 Y 或 N。"
  $yesAnswers = @('y', 'yes', '是', '通过')
  $noAnswers = @('n', 'no', '否', '失败')
  foreach ($spec in $manualSpecs) {
    do {
      $answer = (Read-Host ("{0}：{1} [Y/N]" -f $spec.name, $spec.prompt)).Trim().ToLowerInvariant()
    } while (($yesAnswers -notcontains $answer) -and ($noAnswers -notcontains $answer))
    $manualPassed = $yesAnswers -contains $answer
    $manualScreenshot = "manual-$($spec.id).png"
    Save-Screenshot $manualScreenshot
    $manualChecks.Add([ordered]@{
      id = $spec.id; name = $spec.name; passed = $manualPassed; screenshot = $manualScreenshot
    })
    Add-Check ("人工：" + $spec.name) $manualPassed ("answer=" + $answer + " screenshot=" + $manualScreenshot)
  }
  $manualCompletedAt = (Get-Date).ToString('o')
}

$beforeSingleClose = @(Get-PetWindows)
if ($beforeSingleClose.Count -ge 2) {
  [void][PetStudioWin32]::PostMessage([IntPtr]$beforeSingleClose[0].hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  Start-Sleep -Seconds 3
}
$remaining = @(Get-PetWindows)
$expectedRemaining = [Math]::Max(1, $beforeSingleClose.Count - 1)
Add-Check '关闭其中一只不会退出另一只' ($remaining.Count -eq $expectedRemaining) ("before=$($beforeSingleClose.Count) after=$($remaining.Count) expected=$expectedRemaining")

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
  schemaVersion = 3
  startedAt = $startedAt.ToString('o')
  finishedAt = (Get-Date).ToString('o')
  appPath = [IO.Path]::GetFullPath($AppPath)
  runtimeExeSha256 = $runtimeExeSha256
  manifestSha256 = $manifestSha256
  acceptanceScriptSha256 = $acceptanceScriptSha256
  artifactIntegrity = $artifactIntegrity
  manifest = $manifest
  os = $osEvidence
  dpi = $dpi
  expectedDpiPercent = $ExpectedDpiPercent
  virtualScreen = $virtual
  manual = [ordered]@{
    profile = $ManualProfile
    completedAt = $manualCompletedAt
    checks = @($manualChecks)
  }
  soak = [ordered]@{
    requestedMinutes = $SoakMinutes
    sampleSeconds = $SampleSeconds
    lifecycleCycleMinutes = $LifecycleCycleMinutes
    lifecycleCycles = $lifecycleCycles
    samples = @($soakSamples)
  }
  checks = $checks
  passed = @($checks | Where-Object { $_.passed }).Count
  failed = @($checks | Where-Object { -not $_.passed }).Count
}
$resultPath = Join-Path $evidenceDir 'result.json'
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8
Write-Host "`n证据目录：$evidenceDir"
Write-Host "自动验收：$($result.passed) 通过，$($result.failed) 失败"
if ($result.failed -gt 0) { exit 1 }
