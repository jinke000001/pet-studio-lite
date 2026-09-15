$ErrorActionPreference = 'Stop'
& "$PSScriptRoot/test-windows-kit-start.ps1"
. "$PSScriptRoot/windows-kit/core.ps1"
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
$items = @(New-Check 'files'; New-Check 'visual')
Assert ((Get-Overall $items) -eq 'incomplete') 'Missing required checks must not pass'
$items[0].status = 'pass'
Assert ((Get-Overall $items) -eq 'incomplete') 'Skipped visual must not pass'
$items[1].status = 'blocked'
Assert ((Get-Overall $items) -eq 'blocked') 'Blocked summary'
$items[0].status = 'fail'
Assert ((Get-Overall $items) -eq 'fail') 'Failure wins over blocked'
$items[0].status = 'pass'; $items[1].status = 'pass'
Assert ((Get-Overall $items) -eq 'pass') 'All required checks passed'
Assert ((Get-Overall @()) -eq 'incomplete') 'Empty report must not pass'
Assert ((Convert-Answer 'S') -eq 'incomplete') 'Skip status'
Assert ((Convert-Answer 'B') -eq 'blocked') 'Blocked status'
Assert ((Convert-Answer 'N') -eq 'fail') 'Manual failure'
Assert ((Convert-Answer '') -eq 'incomplete') 'Empty input must not pass'
Assert ((ConvertTo-NativeArgument 'C:\pets space\') -eq '"C:\pets space\\"') 'Trailing slash quoting'
$root = Join-Path ([IO.Path]::GetTempPath()) ('kit-tests-' + [guid]::NewGuid())
New-Item -ItemType Directory $root | Out-Null
try {
  $shell = (Get-Process -Id $PID).Path
  $timed = Invoke-BoundedProcess $shell '-NoProfile -Command "Start-Sleep -Seconds 10"' $root 'timeout' 1 @{}
  Assert $timed.timedOut 'Timed process did not time out'
  Assert (-not (Get-Process -Id $timed.pid -ErrorAction SilentlyContinue)) 'Timed child left running'
  $failed = Invoke-BoundedProcess $shell '-NoProfile -Command "exit 3"' $root 'failed' 10 @{}
  Assert ($failed.exitCode -eq 3 -and -not $failed.timedOut) 'Nonzero exit was lost'
  $report = [ordered]@{ checks = $items; overall = 'incomplete' }
  Save-KitReport $report $root
  $saved = Get-Content (Join-Path $root 'result.json') -Raw | ConvertFrom-Json
  Assert ($saved.overall -eq 'pass') 'Report must compute summary'
  $items[1].status = 'incomplete'
  Save-KitReport $report $root
  $saved = Get-Content (Join-Path $root 'result.json') -Raw | ConvertFrom-Json
  Assert ($saved.overall -eq 'incomplete') 'Skipped item hidden in report'
  Assert (Test-Path (Join-Path $root 'summary.txt')) 'Missing human summary'
  Write-Host 'PASS: report, failure, skip, blocked, empty, timeout and owned process cleanup'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }

# Simulated process table: include descendants of our root, exclude unrelated/PID reuse.
. "$PSScriptRoot/windows-kit/native.ps1"
$created = [datetime]::UtcNow.AddMinutes(-1)
$script:owned = @{ 200 = @{ id = 200; ticks = [Math]::Floor($created.Ticks / 10000) } }
$script:fakeProcesses = @(
  [pscustomobject]@{ ProcessId = 200; ParentProcessId = 1; CreationDate = $created },
  [pscustomobject]@{ ProcessId = 201; ParentProcessId = 200; CreationDate = $created.AddSeconds(1) },
  [pscustomobject]@{ ProcessId = 300; ParentProcessId = 1; CreationDate = $created }
)
function Get-CimInstance { param($ClassName, $OperationTimeoutSec) return $script:fakeProcesses }
try {
  $ownedIds = @(Get-OwnedProcesses | ForEach-Object { $_.id })
  Assert ($ownedIds.Count -eq 2 -and $ownedIds -contains 201 -and $ownedIds -notcontains 300) 'Process ownership leaked'
  $script:fakeProcesses[0].CreationDate = $created.AddSeconds(20)
  $remainingIds = @(Get-OwnedProcesses | ForEach-Object { $_.id })
  Assert ($remainingIds -notcontains 200 -and $remainingIds -contains 201) 'PID reuse or known orphan handling incorrect'
  Write-Host 'PASS: process ancestry, unrelated process isolation and PID reuse'
} finally { Remove-Item Function:Get-CimInstance }
function Get-KitWindows { return @() }
try {
  $timedOut = $false
  try { [void](Wait-KitWindows 1 1) } catch { $timedOut = $_.Exception.Message -match 'timeout' }
  Assert $timedOut 'Missing window must time out, not pass on process liveness'
  Write-Host 'PASS: no visible window produces a timeout'
} finally { Remove-Item Function:Get-KitWindows }
