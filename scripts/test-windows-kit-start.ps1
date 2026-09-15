$ErrorActionPreference = 'Stop'
# Execute the real GUI launch setup without launching a desktop pet.
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $PSScriptRoot 'windows-kit/accept.ps1'), [ref]$tokens, [ref]$errors)
if ($errors) { throw $errors[0] }
$start = $ast.Find({ param($node)
  $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Start-TestPet'
}, $true)
if (-not $start) { throw 'Missing GUI launch function' }
$setup = @()
foreach ($statement in $start.Body.EndBlock.Statements) {
  if ($statement.Extent.Text -match '\[Diagnostics\.Process\]::Start') { break }
  $setup += $statement.Extent.Text
}
$script:testExe = (Get-Process -Id $PID).Path
$script:userData = [IO.Path]::GetTempPath()
$run = $script:userData
$script:isolatedEnv = @{ ELECTRON_RUN_AS_NODE = '1'; PET_PACK_DIR = ''; NODE_OPTIONS = ''; NODE_PATH = '' }
foreach ($inherited in @('', '1')) {
  $previous = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE')
  try {
    [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $inherited)
    Invoke-Expression ($setup -join "`n")
    if ($info.EnvironmentVariables.ContainsKey('ELECTRON_RUN_AS_NODE')) {
      throw 'GUI child still contains ELECTRON_RUN_AS_NODE; empty is not removal'
    }
    if ($script:isolatedEnv.ELECTRON_RUN_AS_NODE -ne '1') { throw 'Validation Node mode was mutated' }
    $info.Arguments = '-NoProfile -Command "if (Test-Path Env:ELECTRON_RUN_AS_NODE) { exit 9 }"'
    $child = [Diagnostics.Process]::Start($info)
    try {
      if (-not $child.WaitForExit(10000)) { $child.Kill(); throw 'Environment probe timed out' }
      if ($child.ExitCode -ne 0) { throw 'Node mode leaked into actual GUI child environment' }
    } finally { $child.Dispose() }
  } finally { [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $previous) }
}
Write-Host 'PASS: GUI child has no Node-mode variable; validation retains Node mode'
