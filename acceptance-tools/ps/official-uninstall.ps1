param(
  [Parameter(Mandatory = $true)][string]$EvidenceRoot,
  [string]$RegistrySubKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\980c4302-3a05-517b-ba38-6c71a752ed15',
  [string]$InstallRegistrySubKey = 'Software\980c4302-3a05-517b-ba38-6c71a752ed15',
  [string]$ExpectedDisplayName = '桌宠制作台 0.1.0',
  [string]$ExecutableName = 'DesktopPetStudio.exe',
  [string]$ShortcutName = '桌宠制作台.lnk',
  [int]$TimeoutSeconds = 120,
  [int]$StablePolls = 3
)

$ErrorActionPreference = 'Stop'
$evidenceDirectory = Join-Path ([IO.Path]::GetFullPath($EvidenceRoot)) 'g7-02'
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null

function Write-EvidenceJson([string]$Name, $Value) {
  $target = Join-Path $evidenceDirectory $Name
  if (Test-Path -LiteralPath $target) { throw "evidence already exists: $target" }
  $json = $Value | ConvertTo-Json -Depth 12
  [IO.File]::WriteAllText($target, "$json`r`n", (New-Object Text.UTF8Encoding($false)))
}

function Get-RegistryViewState([Microsoft.Win32.RegistryView]$View, [string]$SubKey) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $View)
  try {
    $key = $base.OpenSubKey($SubKey)
    if ($null -eq $key) { return [pscustomobject]@{ view = $View.ToString(); subKey = $SubKey; exists = $false; values = $null } }
    try {
      $values = @{}
      foreach ($name in $key.GetValueNames()) { $values[$name] = $key.GetValue($name) }
      return [pscustomobject]@{ view = $View.ToString(); subKey = $SubKey; exists = $true; values = $values }
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

function Get-RegistryState([string]$SubKey) {
  @(
    Get-RegistryViewState ([Microsoft.Win32.RegistryView]::Registry64) $SubKey
    Get-RegistryViewState ([Microsoft.Win32.RegistryView]::Registry32) $SubKey
  )
}

function Get-ExactProcesses([string]$InstallDirectory, [string]$UninstallerPath) {
  $productPath = if ($InstallDirectory) { [IO.Path]::GetFullPath((Join-Path $InstallDirectory $ExecutableName)) } else { $null }
  $processes = @(Get-CimInstance Win32_Process | Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine)
  $product = @($processes | Where-Object {
    $productPath -and $_.ExecutablePath -and [string]::Equals([IO.Path]::GetFullPath($_.ExecutablePath), $productPath, [StringComparison]::OrdinalIgnoreCase)
  })
  $uninstallerLeaf = if ($UninstallerPath) { [IO.Path]::GetFileName($UninstallerPath) } else { $null }
  $uninstallers = @($processes | Where-Object {
    $uninstallerLeaf -and (($_.ExecutablePath -and [string]::Equals([IO.Path]::GetFileName($_.ExecutablePath), $uninstallerLeaf, [StringComparison]::OrdinalIgnoreCase)) -or ($_.CommandLine -and $_.CommandLine.Contains($UninstallerPath)))
  })
  [pscustomobject]@{ product = $product; uninstallers = $uninstallers }
}

function Split-UninstallCommand([string]$CommandLine) {
  if ($CommandLine -match "[\r\n]") { throw 'UninstallString contains a line break' }
  $match = [regex]::Match($CommandLine, '^\s*"([^"]+)"\s*(.*)$')
  if (-not $match.Success) { $match = [regex]::Match($CommandLine, '^\s*(\S+)\s*(.*)$') }
  if (-not $match.Success) { throw 'unable to parse UninstallString' }
  [pscustomobject]@{ filePath = $match.Groups[1].Value; arguments = $match.Groups[2].Value }
}

$startedAt = [DateTimeOffset]::UtcNow
$initialRegistry = @(Get-RegistryState $RegistrySubKey)
$initialInstallRegistry = @(Get-RegistryState $InstallRegistrySubKey)
$registrations = @($initialRegistry | Where-Object { $_.exists -and $_.values.UninstallString })
$uninstallStrings = @($registrations | ForEach-Object { [string]$_.values.UninstallString } | Select-Object -Unique)
$displayNames = @($registrations | ForEach-Object { [string]$_.values.DisplayName } | Select-Object -Unique)
$installLocations = @($initialInstallRegistry | Where-Object { $_.exists -and $_.values.InstallLocation } | ForEach-Object { [string]$_.values.InstallLocation } | Select-Object -Unique)
if ($uninstallStrings.Count -ne 1 -or $installLocations.Count -ne 1 -or $displayNames.Count -ne 1 -or $displayNames[0] -ne $ExpectedDisplayName) {
  Write-EvidenceJson 'uninstall-log.json' ([pscustomobject]@{ status = 'failed'; reason = "official uninstall identity is missing or ambiguous"; expectedDisplayName = $ExpectedDisplayName; uninstallRegistry = $initialRegistry; installRegistry = $initialInstallRegistry; startedAt = $startedAt })
  exit 2
}

$registration = $registrations[0]
$command = Split-UninstallCommand $uninstallStrings[0]
if (-not (Test-Path -LiteralPath $command.filePath -PathType Leaf)) { throw "official uninstaller is missing: $($command.filePath)" }
if ($command.arguments -notmatch '(?i)(^|\s)/currentuser(\s|$)') { throw 'HKCU UninstallString must preserve /currentuser' }

$installDirectory = [IO.Path]::GetFullPath($installLocations[0])
$uninstallerPath = [IO.Path]::GetFullPath($command.filePath)
if (-not [string]::Equals([IO.Path]::GetDirectoryName($uninstallerPath), $installDirectory, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'official uninstaller must be inside the recorded install directory'
}
if ([IO.Path]::GetFileName($uninstallerPath) -notmatch '(?i)^Uninstall .+\.exe$') { throw 'official uninstaller filename is invalid' }
$command.filePath = $uninstallerPath
$shortcutPaths = @(Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$ShortcutName")
$process = Start-Process -FilePath $command.filePath -ArgumentList $command.arguments -PassThru -Wait
$history = @()
$deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
$consecutiveClean = 0
$lastSnapshot = $null

while ([DateTimeOffset]::UtcNow -le $deadline) {
  $registry = @(Get-RegistryState $RegistrySubKey)
  $installRegistry = @(Get-RegistryState $InstallRegistrySubKey)
  $processState = Get-ExactProcesses $installDirectory $command.filePath
  $shortcuts = @($shortcutPaths | ForEach-Object { [pscustomobject]@{ path = $_; exists = Test-Path -LiteralPath $_ } })
  $lastSnapshot = [pscustomobject]@{
    observedAt = [DateTimeOffset]::UtcNow
    uninstallerExitCode = $process.ExitCode
    registryViews = $registry
    installRegistryViews = $installRegistry
    installDirectory = $installDirectory
    installDirectoryExists = if ($installDirectory) { Test-Path -LiteralPath $installDirectory } else { $false }
    shortcutPaths = $shortcuts
    productProcesses = @($processState.product)
    uninstallerProcesses = @($processState.uninstallers)
  }
  $history += $lastSnapshot
  $clean = $process.ExitCode -eq 0 -and
    -not ($registry | Where-Object { $_.exists }) -and
    -not ($installRegistry | Where-Object { $_.exists }) -and
    -not $lastSnapshot.installDirectoryExists -and
    -not ($shortcuts | Where-Object { $_.exists }) -and
    $lastSnapshot.productProcesses.Count -eq 0 -and
    $lastSnapshot.uninstallerProcesses.Count -eq 0
  if ($clean) { $consecutiveClean++ } else { $consecutiveClean = 0 }
  if ($consecutiveClean -ge $StablePolls) { break }
  Start-Sleep -Seconds 1
}

$passed = $consecutiveClean -ge $StablePolls
$endedAt = [DateTimeOffset]::UtcNow
Write-EvidenceJson 'uninstall-log.json' ([pscustomobject]@{
  status = if ($passed) { 'passed' } else { 'failed' }
  startedAt = $startedAt
  endedAt = $endedAt
  durationMs = [int64]($endedAt - $startedAt).TotalMilliseconds
  officialUninstallString = [string]$registration.values.UninstallString
  uninstallerExitCode = $process.ExitCode
  stablePollsRequired = $StablePolls
  stablePollsObserved = $consecutiveClean
  observations = $history
})
Write-EvidenceJson 'filesystem-registry-check.json' $lastSnapshot
Write-EvidenceJson 'process-json.json' ([pscustomobject]@{ productProcesses = @($lastSnapshot.productProcesses); uninstallerProcesses = @($lastSnapshot.uninstallerProcesses) })

if ($passed) { exit 0 }
exit 1
