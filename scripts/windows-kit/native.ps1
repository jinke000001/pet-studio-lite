# Win32 window enumeration for Petdex acceptance.
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class PetKitWin32 {
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr r);
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
function Get-OwnedProcesses {
  # Roots are Process objects started by this run; descendants must have a matching live parent.
  $all = @(Get-CimInstance Win32_Process -OperationTimeoutSec 5)
  $known = @{}
  foreach ($entry in $script:owned.Values) {
    $live = $all | Where-Object { $_.ProcessId -eq $entry.id -and [Math]::Floor($_.CreationDate.ToUniversalTime().Ticks / 10000) -eq $entry.ticks }
    if ($live) { $known[[int]$entry.id] = $entry }
  }
  do {
    $added = $false
    foreach ($item in $all) {
      if (-not $known.ContainsKey([int]$item.ProcessId) -and $known.ContainsKey([int]$item.ParentProcessId)) {
        $parent = $known[[int]$item.ParentProcessId]
        if ([Math]::Floor($item.CreationDate.ToUniversalTime().Ticks / 10000) -ge $parent.ticks) {
          $entry = @{ id = [int]$item.ProcessId; ticks = [Math]::Floor($item.CreationDate.ToUniversalTime().Ticks / 10000) }
          $known[$entry.id] = $entry; $script:owned[$entry.id] = $entry; $added = $true
        }
      }
    }
  } while ($added)
  return @($known.Values)
}
function Get-KitWindows {
  $ids = @(Get-OwnedProcesses | ForEach-Object { $_.id })
  $found = [Collections.Generic.List[object]]::new()
  $callback = [PetKitWin32+EnumWindowsProc]{
    param([IntPtr]$handle, [IntPtr]$unused)
    $owner = [uint32]0
    [void][PetKitWin32]::GetWindowThreadProcessId($handle, [ref]$owner)
    if ($ids -contains [int]$owner -and [PetKitWin32]::IsWindowVisible($handle)) {
      $rect = New-Object PetKitWin32+RECT
      if ([PetKitWin32]::GetWindowRect($handle, [ref]$rect)) {
        $reply = [IntPtr]::Zero
        $responds = [PetKitWin32]::SendMessageTimeout($handle, 0, [IntPtr]::Zero, [IntPtr]::Zero, 2, 500, [ref]$reply) -ne [IntPtr]::Zero
        $found.Add(@{ hwnd = $handle.ToInt64(); pid = $owner; x = $rect.Left; y = $rect.Top; width = $rect.Right-$rect.Left; height = $rect.Bottom-$rect.Top; responds = $responds; dpi = [PetKitWin32]::GetDpiForWindow($handle) })
      }
    }
    return $true
  }
  [void][PetKitWin32]::EnumWindows($callback, [IntPtr]::Zero)
  return $found.ToArray()
}
function Wait-KitWindows([int]$Count, [int]$Seconds = 15) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    $found = @(Get-KitWindows)
    if ($found.Count -eq $Count) { return $found }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  throw "timeout: 等待 $Count 个窗口超时；实际 $($found.Count)"
}
function Stop-OwnedProcesses {
  foreach ($entry in @(Get-OwnedProcesses | Sort-Object ticks -Descending)) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($process -and [Math]::Floor($process.StartTime.ToUniversalTime().Ticks / 10000) -eq $entry.ticks) {
      Stop-Process -InputObject $process -Force -ErrorAction SilentlyContinue
    }
  }
}
