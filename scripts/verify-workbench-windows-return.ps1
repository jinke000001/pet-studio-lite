param([Parameter(Mandatory=$true)][string]$ReturnRoot)
$ErrorActionPreference = 'Stop'
$required = @('WINDOWS-WORKBENCH-REPORT.md','returned-checksums.sha256')
foreach ($name in $required) { if (-not (Test-Path -LiteralPath (Join-Path $ReturnRoot $name) -PathType Leaf)) { throw "Missing $name" } }
$report = Get-Content -LiteralPath (Join-Path $ReturnRoot 'WINDOWS-WORKBENCH-REPORT.md') -Raw
foreach ($term in @('source','win-unpacked','installed mode','100%','125%','150%','动态 DPI','官方卸载','重装','最终精确进程数')) { if ($report -notmatch [regex]::Escape($term)) { throw "Report missing term: $term" } }
Write-Output 'workbench-windows-return-structure-ok'
