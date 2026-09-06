param([switch]$Probe, [string]$Path)
$ErrorActionPreference = 'Stop'
$root = $env:TOOL_PREFLIGHT_EVIDENCE_ROOT
if (-not $root) { $root = (Get-Location).Path }
New-Item -ItemType Directory -Force -Path (Join-Path $root 'preflight') | Out-Null
$isWindowsPlatform = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
$result = [ordered]@{ operation = 'native-file-dialog'; status = if ($isWindowsPlatform) { 'ready' } else { 'platform-unavailable' }; probe = [bool]$Probe; path = $Path }
$result | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $root 'preflight/native-file-dialog.json')
if (-not $isWindowsPlatform) { exit 2 }
