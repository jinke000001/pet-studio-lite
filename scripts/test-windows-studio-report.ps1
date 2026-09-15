$ErrorActionPreference = 'Stop'
# Execute the production PID collection and finalization, without launching GUI
# or asking questions. Compatible with Windows PowerShell 5.1 and PowerShell 7.
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $PSScriptRoot 'check-windows-studio.ps1'), [ref]$tokens, [ref]$errors)
if ($errors) { throw $errors[0] }
$mainTry = @($ast.EndBlock.Statements | Where-Object { $_ -is [Management.Automation.Language.TryStatementAst] })
if ($mainTry.Count -ne 1) { throw 'Expected one acceptance try/finally' }
$pidBlock = @($mainTry[0].Body.Statements | Where-Object {
  $_ -is [Management.Automation.Language.IfStatementAst] -and $_.Extent.Text.StartsWith('if (Test-Path -LiteralPath $launchedPidFile)')
})
if ($pidBlock.Count -ne 1) { throw 'Missing production PID collection' }
$finalization = ($mainTry[0].Finally.Statements | ForEach-Object { $_.Extent.Text }) -join "`n"
$record = $ast.Find({ param($node)
  $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Record'
}, $true)
Invoke-Expression $record.Extent.Text
function Assert($condition, $message) { if (-not $condition) { throw $message } }
$runDir = Join-Path ([IO.Path]::GetTempPath()) ('studio-report-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $runDir | Out-Null
$launchedPidFile = Join-Path $runDir 'isolated-launched-pids.txt'
$identity = [pscustomobject]@{version='0.2.0-beta.2'; files=@([pscustomobject]@{file='test.zip';sha256=('a'*64)})}
$ExpectedDpiPercent = 100; $candidateJsonSha256 = 'b'*64
$checkedFileHashes = @(); $exeSha256 = 'c'*64; $templateSha256 = 'd'*64
$templateExpectedSha256 = $templateSha256; $restartScript = Join-Path $runDir 'restart-isolated.ps1'
try {
  # Real Get-Content strings carry provider metadata in Windows PowerShell 5.1.
  # Check the PID types BEFORE deep serialization to avoid reproducing the OOM.
  [IO.File]::WriteAllLines($launchedPidFile, [string[]]@("$PID", "$PID", '2147483647'))
  $recordedLaunchPids = @(); $runningRecordedPids = @()
  Invoke-Expression $pidBlock[0].Extent.Text
  Assert ($recordedLaunchPids.Count -eq 2) 'PID list must be deduplicated'
  foreach ($value in $recordedLaunchPids) {
    Assert ($value -is [int]) 'Recorded PID must be an integer, not a provider-enriched string'
    Assert ($null -eq $value.PSObject.Properties['PSDrive']) 'Provider metadata leaked into PID'
  }
  Assert ($recordedLaunchPids -contains $PID) 'Live PID lost'
  Assert ($runningRecordedPids.Count -eq 1 -and $runningRecordedPids[0] -eq $PID) 'Live process detection changed'
  $checks = @()
  1..7 | ForEach-Object { Record "manual-$_" 'incomplete' 'Not performed' }
  $clock = [Diagnostics.Stopwatch]::StartNew()
  Invoke-Expression $finalization
  $clock.Stop()
  $result = Join-Path $runDir 'result.json'
  Assert (Test-Path -LiteralPath $result) 'result.json was not written'
  Assert ((Get-Item -LiteralPath $result).Length -lt 20000) 'Report unexpectedly expanded'
  Assert ($clock.Elapsed.TotalSeconds -lt 10) 'Report serialization took too long'
  $saved = [IO.File]::ReadAllText($result) | ConvertFrom-Json
  Assert ($saved.overall -eq 'incomplete') 'Unperformed manual checks must not pass'
  Assert ($saved.checks.Count -eq 7) 'Manual check evidence lost'
  Assert ($saved.recordedLaunchPids[0] -eq $PID) 'PID evidence not saved'
  Record 'test-failure' 'fail' 'Synthetic execution failure'
  Invoke-Expression $finalization
  $saved = [IO.File]::ReadAllText($result) | ConvertFrom-Json
  Assert ($saved.overall -eq 'fail') 'Failure must dominate incomplete'
  [IO.File]::WriteAllText($launchedPidFile, '')
  $recordedLaunchPids = @(); $runningRecordedPids = @()
  Invoke-Expression $pidBlock[0].Extent.Text
  Assert ($recordedLaunchPids.Count -eq 0 -and $runningRecordedPids.Count -eq 0) 'Empty PID file must stay empty'
  Invoke-Expression $finalization
  $saved = [IO.File]::ReadAllText($result) | ConvertFrom-Json
  Assert ($saved.recordedLaunchPids -is [array] -and $saved.recordedLaunchPids.Count -eq 0) 'Empty PID array changed shape'
  foreach ($invalid in @('not-a-pid', '0', '-1', '2147483648')) {
    [IO.File]::WriteAllText($launchedPidFile, $invalid)
    $rejected = $false
    try { Invoke-Expression $pidBlock[0].Extent.Text } catch { $rejected = $true }
    Assert $rejected 'Invalid PID was silently ignored'
  }
  Write-Host "PASS: real PID collection and report finalization ($($PSVersionTable.PSVersion)); $($clock.ElapsedMilliseconds) ms"
} finally { Remove-Item -LiteralPath $runDir -Recurse -Force }
