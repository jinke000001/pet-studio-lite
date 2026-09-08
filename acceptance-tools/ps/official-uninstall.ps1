param(
  [Parameter(Mandatory = $true)][string]$EvidenceRoot,
  [string]$IdentityFile,
  [string]$ProductName,
  [string]$ExpectedDisplayName,
  [string]$ExecutableName,
  [string]$ShortcutName,
  [int]$TimeoutSeconds = 120,
  [int]$StablePolls = 3,
  [int]$GracefulExitTimeoutSeconds = 60
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

function Find-UninstallRegistrations([string]$DisplayName) {
  $found = @{}
  foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
    try {
      $uninstall = $base.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall')
      if ($null -eq $uninstall) { continue }
      try {
        foreach ($name in $uninstall.GetSubKeyNames()) {
          $key = $uninstall.OpenSubKey($name)
          if ($null -eq $key) { continue }
          try {
            $values = @{}
            foreach ($valueName in $key.GetValueNames()) { $values[$valueName] = $key.GetValue($valueName) }
            if ([string]$values.DisplayName -eq $DisplayName) {
              $found[$name] = [pscustomobject]@{ view = $view.ToString(); subKeyName = $name; values = $values }
            }
          } finally { $key.Dispose() }
        }
      } finally { $uninstall.Dispose() }
    } finally { $base.Dispose() }
  }
  $found
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

# ---- 候选身份：只从本轮候选 manifest / G7-01 安装证据或显式参数取得，无任何内置默认身份 ----
$identity = @{}
if ($IdentityFile) {
  if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) { throw "identity file is missing: $IdentityFile" }
  $parsed = Get-Content -LiteralPath $IdentityFile -Raw | ConvertFrom-Json
  foreach ($name in @('productName', 'uninstallDisplayName', 'executableName', 'shortcutName', 'installLocation', 'version')) {
    if ($parsed.PSObject.Properties[$name] -and $parsed.$name) { $identity[$name] = [string]$parsed.$name }
  }
}
if ($ProductName) { $identity['productName'] = $ProductName }
if ($ExpectedDisplayName) { $identity['uninstallDisplayName'] = $ExpectedDisplayName }
if ($ExecutableName) { $identity['executableName'] = $ExecutableName }
if ($ShortcutName) { $identity['shortcutName'] = $ShortcutName }
if (-not $identity['uninstallDisplayName'] -and $identity['productName'] -and $identity['version']) { $identity['uninstallDisplayName'] = "$($identity['productName']) $($identity['version'])" }
if (-not $identity['shortcutName'] -and $identity['productName']) { $identity['shortcutName'] = "$($identity['productName']).lnk" }
$ExpectedDisplayName = $identity['uninstallDisplayName']
$ExecutableName = $identity['executableName']
$ShortcutName = $identity['shortcutName']
if (-not $ExpectedDisplayName -or -not $ExecutableName -or -not $ShortcutName) {
  Write-EvidenceJson 'uninstall-log.json' ([pscustomobject]@{ status = 'failed'; reason = 'candidate identity is incomplete: uninstallDisplayName, executableName and shortcutName are required from the candidate manifest or G7-01 install evidence'; startedAt = $startedAt })
  exit 2
}

# ---- 通过 DisplayName 发现本轮候选的真实 HKCU 注册身份，不使用固定 GUID ----
$registrations = Find-UninstallRegistrations $ExpectedDisplayName
if ($registrations.Count -ne 1) {
  Write-EvidenceJson 'uninstall-log.json' ([pscustomobject]@{ status = 'failed'; reason = "official uninstall identity is missing or ambiguous: $($registrations.Count) registration(s) for '$ExpectedDisplayName'"; expectedDisplayName = $ExpectedDisplayName; startedAt = $startedAt })
  exit 2
}
$subKeyName = @($registrations.Keys)[0]
$registration = $registrations[$subKeyName]
$RegistrySubKey = "Software\Microsoft\Windows\CurrentVersion\Uninstall\$subKeyName"
$InstallRegistrySubKey = "Software\$subKeyName"
$initialRegistry = @(Get-RegistryState $RegistrySubKey)
$initialInstallRegistry = @(Get-RegistryState $InstallRegistrySubKey)
$uninstallString = [string]$registration.values.UninstallString
$installLocations = @()
if ($registration.values.InstallLocation) { $installLocations += [string]$registration.values.InstallLocation }
$installLocations += @($initialInstallRegistry | Where-Object { $_.exists -and $_.values.InstallLocation } | ForEach-Object { [string]$_.values.InstallLocation })
$installLocations = @($installLocations | Select-Object -Unique)
if (-not $uninstallString -or $installLocations.Count -ne 1) {
  Write-EvidenceJson 'uninstall-log.json' ([pscustomobject]@{ status = 'failed'; reason = 'official uninstall identity is missing or ambiguous'; expectedDisplayName = $ExpectedDisplayName; uninstallRegistry = $initialRegistry; installRegistry = $initialInstallRegistry; startedAt = $startedAt })
  exit 2
}

$command = Split-UninstallCommand $uninstallString
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

# ---- 卸载前通过产品正常退出入口（主窗口关闭请求）关闭 installed 应用；失败记为独立生命周期失败 ----
$graceful = @()
$closeRequested = @()
$gracefulDeadline = [DateTimeOffset]::UtcNow.AddSeconds($GracefulExitTimeoutSeconds)
$requested = $false
while ([DateTimeOffset]::UtcNow -le $gracefulDeadline) {
  $snapshot = Get-ExactProcesses $installDirectory $null
  $graceful += [pscustomobject]@{ observedAt = [DateTimeOffset]::UtcNow; productProcessCount = $snapshot.product.Count }
  if ($snapshot.product.Count -eq 0) { break }
  if (-not $requested) {
    $requested = $true
    foreach ($entry in $snapshot.product) {
      if ($entry.CommandLine -and $entry.CommandLine -match '--type=') { continue }
      $proc = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
      if ($null -ne $proc) {
        $closeAccepted = $proc.CloseMainWindow()
        $closeRequested += [pscustomobject]@{ processId = $entry.ProcessId; closeMainWindowAccepted = $closeAccepted }
      }
    }
  }
  Start-Sleep -Seconds 1
}
$preUninstallProcesses = Get-ExactProcesses $installDirectory $null
if ($preUninstallProcesses.product.Count -ne 0) {
  $failedSnapshot = [pscustomobject]@{
    observedAt = [DateTimeOffset]::UtcNow
    uninstallerExitCode = $null
    registryViews = $initialRegistry
    installRegistryViews = $initialInstallRegistry
    installDirectory = $installDirectory
    installDirectoryExists = Test-Path -LiteralPath $installDirectory
    shortcutPaths = @($shortcutPaths | ForEach-Object { [pscustomobject]@{ path = $_; exists = Test-Path -LiteralPath $_ } })
    productProcesses = @($preUninstallProcesses.product)
    uninstallerProcesses = @()
  }
  Write-EvidenceJson 'uninstall-log.json' ([pscustomobject]@{
    status = 'lifecycle-failed'
    reason = 'the installed product did not exit through its normal close entry; the official uninstaller was never started'
    startedAt = $startedAt
    endedAt = [DateTimeOffset]::UtcNow
    expectedDisplayName = $ExpectedDisplayName
    officialUninstallString = $uninstallString
    gracefulExitTimeoutSeconds = $GracefulExitTimeoutSeconds
    closeMainWindowRequests = $closeRequested
    observations = $graceful
  })
  Write-EvidenceJson 'filesystem-registry-check.json' $failedSnapshot
  Write-EvidenceJson 'process-json.json' ([pscustomobject]@{ productProcesses = @($preUninstallProcesses.product); uninstallerProcesses = @() })
  exit 3
}

# ---- 只调用 HKCU 记录的官方 UninstallString 并等待卸载器真实退出 ----
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
  expectedDisplayName = $ExpectedDisplayName
  executableName = $ExecutableName
  shortcutName = $ShortcutName
  registrySubKey = $RegistrySubKey
  installRegistrySubKey = $InstallRegistrySubKey
  officialUninstallString = $uninstallString
  gracefulClose = [pscustomobject]@{ requests = $closeRequested; observations = $graceful }
  uninstallerExitCode = $process.ExitCode
  stablePollsRequired = $StablePolls
  stablePollsObserved = $consecutiveClean
  observations = $history
})
Write-EvidenceJson 'filesystem-registry-check.json' $lastSnapshot
Write-EvidenceJson 'process-json.json' ([pscustomobject]@{ productProcesses = @($lastSnapshot.productProcesses); uninstallerProcesses = @($lastSnapshot.uninstallerProcesses) })

if ($passed) { exit 0 }
exit 1
