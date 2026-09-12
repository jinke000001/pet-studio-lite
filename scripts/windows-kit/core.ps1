# Compatible with Windows PowerShell 5.1; platform-neutral logic is tested on Mac.
function New-Check([string]$Id) {
  return [ordered]@{ id = $Id; required = $true; status = 'incomplete'; detail = '未执行' }
}
function Get-Overall($Checks) {
  $required = @($Checks | Where-Object { $_.required })
  if ($required.Count -eq 0) { return 'incomplete' }
  if (@($required | Where-Object { $_.status -eq 'fail' }).Count) { return 'fail' }
  if (@($required | Where-Object { $_.status -eq 'blocked' }).Count) { return 'blocked' }
  if (@($required | Where-Object { $_.status -ne 'pass' }).Count) { return 'incomplete' }
  return 'pass'
}
function Convert-Answer([string]$Answer) {
  switch ($Answer.Trim().ToUpperInvariant()) {
    'Y' { return 'pass' }; 'N' { return 'fail' }; 'B' { return 'blocked' }
    default { return 'incomplete' }
  }
}
function Save-KitReport($Report, [string]$Directory) {
  $Report.overall = Get-Overall $Report.checks
  $Report['updatedAt'] = (Get-Date).ToString('o')
  $json = $Report | ConvertTo-Json -Depth 20
  $temp = Join-Path $Directory 'result.json.tmp'
  [IO.File]::WriteAllText($temp, $json, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temp -Destination (Join-Path $Directory 'result.json') -Force
  $lines = @('Pet Studio 轻量验收（仅本机本轮，不替代完整 Windows 矩阵）', "结果: $($Report.overall)")
  $lines += @($Report.checks | ForEach-Object { "[$($_.status)] $($_.id): $($_.detail)" })
  [IO.File]::WriteAllLines((Join-Path $Directory 'summary.txt'), [string[]]$lines, [Text.UTF8Encoding]::new($true))
}
function Invoke-BoundedProcess([string]$File, [string]$Arguments, [string]$Directory, [string]$Label, [int]$Seconds, [hashtable]$Environment, [scriptblock]$OnStart = {}, [scriptblock]$OnPoll = {}) {
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $File; $info.Arguments = $Arguments; $info.WorkingDirectory = $Directory
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  foreach ($key in $Environment.Keys) { $info.EnvironmentVariables[$key] = $Environment[$key] }
  $process = [Diagnostics.Process]::new(); $process.StartInfo = $info
  $timedOut = $false; $started = $false
  try {
    [void]$process.Start(); $started = $true
    & $OnStart $process
    $processId = $process.Id
    $output = $process.StandardOutput.ReadToEndAsync(); $errors = $process.StandardError.ReadToEndAsync()
    $deadline = (Get-Date).AddSeconds($Seconds)
    while (-not $process.WaitForExit(250)) {
      & $OnPoll
      if ((Get-Date) -ge $deadline) { $timedOut = $true; $process.Kill(); [void]$process.WaitForExit(5000); break }
    }
    if ($output.Wait(5000)) { [IO.File]::WriteAllText((Join-Path $Directory "$Label.stdout.log"), $output.Result) }
    if ($errors.Wait(5000)) { [IO.File]::WriteAllText((Join-Path $Directory "$Label.stderr.log"), $errors.Result) }
    return @{ pid = $processId; timedOut = $timedOut; exitCode = $(if ($process.HasExited) { $process.ExitCode } else { $null }) }
  } finally {
    # Only this Process object, never a process name or a pre-existing application.
    if ($started -and -not $process.HasExited) { $process.Kill() }
    $process.Dispose()
  }
}

function ConvertTo-NativeArgument([string]$Value) {
  # Windows CRT quoting: preserve trailing backslashes and embedded quotes.
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}
