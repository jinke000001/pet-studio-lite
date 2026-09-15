$ErrorActionPreference = 'Stop'
$productDir = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $productDir 'PetLitePet.exe'))) {
  throw '请完整解压组合成品包，再双击根目录的 01-开始验收.cmd。'
}
Write-Host 'Petdex 桌宠：自动检查 + 人工体验'
Write-Host '请先退出手动打开的桌宠。测试会自动启动两只，属于正常步骤。'
Write-Host '在 Windows 设置 → 系统 → 显示 中查看缩放比例；本工具不会修改缩放。'
do { $dpi = Read-Host '输入当前缩放比例（100、125 或 150，不带百分号）' }
while ($dpi -notin @('100', '125', '150'))
& (Join-Path $PSScriptRoot 'accept.ps1') -ProductDir $productDir -ExpectedDpiPercent ([int]$dpi)
exit $LASTEXITCODE
