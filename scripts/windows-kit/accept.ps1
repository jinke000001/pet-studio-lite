param(
  [string]$ProductDir = $PSScriptRoot,
  [ValidateSet(100,125,150)][int]$ExpectedDpiPercent = 100,
  [switch]$SkipManual
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'core.ps1')
$run = Join-Path $PSScriptRoot ('results-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $run | Out-Null
$script:owned = @{}
$checks = @('platform','delivery','launch','dpi','second-instance','window-response','visual','drag','menu-size','motion','single-close','exit','cleanup') | ForEach-Object { New-Check $_ }
$report = [ordered]@{
  schemaVersion = 1; tool = 'petstudio-light-acceptance'; scope = 'single-machine-single-dpi'
  startedAt = (Get-Date).ToString('o'); productDir = [IO.Path]::GetFullPath($ProductDir)
  expectedDpiPercent = $ExpectedDpiPercent; overall = 'incomplete'; checks = @($checks)
  toolSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Record([string]$Id, [string]$Status, [string]$Detail) {
  $item = $checks | Where-Object { $_.id -eq $Id }
  $item.status = $Status; $item.detail = $Detail
  Save-KitReport $report $run
  Write-Host "[$Status] $Id : $Detail"
}
function Start-TestPet {
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $script:testExe; $info.UseShellExecute = $false
  $info.Arguments = '--user-data-dir="' + $script:userData + '" --enable-logging=file --log-file="' + (Join-Path $run 'runtime.log') + '"'
  foreach ($key in $script:isolatedEnv.Keys) { $info.EnvironmentVariables[$key] = $script:isolatedEnv[$key] }
  $info.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = ''
  $process = [Diagnostics.Process]::Start($info)
  try {
    $entry = @{ id = $process.Id; ticks = [Math]::Floor($process.StartTime.ToUniversalTime().Ticks / 10000) }
    $script:owned[$entry.id] = $entry
  } catch { if (-not $process.HasExited) { throw } }
  return $process
}
$active = 'platform'
Save-KitReport $report $run
try {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    Record 'platform' 'blocked' '仅 Windows 可执行原生窗口验收；本次未执行'
    throw 'BLOCKED: 请在 Windows 10/11 执行'
  }
  $os = Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 5
  $report['os'] = @{ caption = $os.Caption; version = $os.Version; build = $os.BuildNumber; architecture = $os.OSArchitecture }
  if ([int]$os.BuildNumber -lt 10240 -or $os.Caption -notmatch 'Windows (10|11)' -or -not [Environment]::Is64BitOperatingSystem) { throw 'BLOCKED: 需要 64 位 Windows 10/11' }
  Record 'platform' 'pass' "$($os.Caption) build $($os.BuildNumber)"
  . (Join-Path $PSScriptRoot 'native.ps1')
  $active = 'delivery'
  $source = [IO.Path]::GetFullPath($ProductDir)
  $sourceExe = Join-Path $source 'PetLitePet.exe'
  $manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $report['productVersion'] = $manifest.productVersion
  $report['sourceExeSha256'] = (Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash.ToLowerInvariant()
  $report['sourceManifestSha256'] = (Get-FileHash -LiteralPath (Join-Path $source 'manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
  $integrity = Get-Content -LiteralPath (Join-Path $source 'runtime-integrity.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($integrity.executable.sha256 -ne $report.sourceExeSha256 -or $integrity.manifestSha256 -ne $report.sourceManifestSha256) { throw '交付文件指纹不匹配，停止启动' }
  $copy = Join-Path $run 'test-app'; $script:userData = Join-Path $run 'test-user-data'
  $script:isolatedEnv = @{ ELECTRON_RUN_AS_NODE = '1'; NODE_OPTIONS = ''; NODE_PATH = ''; PET_PACK_DIR = ''; APPDATA = (Join-Path $run 'appdata'); LOCALAPPDATA = (Join-Path $run 'localappdata') }
  foreach ($dir in @($script:userData, $script:isolatedEnv.APPDATA, $script:isolatedEnv.LOCALAPPDATA)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $validationPath = Join-Path $run 'delivery.json'
  $arguments = (@(
    (ConvertTo-NativeArgument (Join-Path $PSScriptRoot 'validate.cjs')), '--inspect',
    (ConvertTo-NativeArgument $source), (ConvertTo-NativeArgument $copy),
    (ConvertTo-NativeArgument $validationPath),
    (ConvertTo-NativeArgument ('--user-data-dir=' + $script:userData))
  ) -join ' ')
  $validation = Invoke-BoundedProcess $sourceExe $arguments $run 'validation' 120 $script:isolatedEnv {
    param($child)
    try { $script:owned[$child.Id] = @{ id = $child.Id; ticks = [Math]::Floor($child.StartTime.ToUniversalTime().Ticks / 10000) } } catch { if (-not $child.HasExited) { throw } }
  } { [void](Get-OwnedProcesses) }
  if ($validation.timedOut) { throw 'BLOCKED: timeout: 交付检查超时（120 秒），查看 validation 日志' }
  if ($validation.exitCode -ne 0 -or -not (Test-Path -LiteralPath $validationPath)) { throw '交付检查失败，查看 validation.stderr.log；当前成品须支持 Electron Node 模式' }
  $report['delivery'] = Get-Content -LiteralPath $validationPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($report.delivery.executableSha256 -ne $report.sourceExeSha256) { throw '复制期间成品发生变化' }
  Record 'delivery' 'pass' "版本 $($manifest.productVersion)，素材/配置/页面依赖与导入指纹一致；完整文件指纹见 delivery.json"
  $script:testExe = Join-Path $copy 'PetLitePet.exe'
  $active = 'launch'
  $primary = Start-TestPet
  $one = @(Wait-KitWindows 1)
  $report['firstWindow'] = $one[0]
  if ($one[0].width -le 0 -or $one[0].height -le 0) { throw '窗口没有有效尺寸' }
  Record 'launch' 'pass' '独立测试副本出现一个可见原生窗口（不代表显示正常）'
  $active = 'dpi'
  $dpi = [int][Math]::Round($one[0].dpi / 96 * 100)
  if ($dpi -ne $ExpectedDpiPercent) { throw "BLOCKED: 实际 DPI $dpi%，本轮要求 $ExpectedDpiPercent%；调整系统缩放后重跑" }
  Record 'dpi' 'pass' "实际 DPI $dpi%"
  $active = 'second-instance'
  $second = Start-TestPet
  $two = @(Wait-KitWindows 2)
  if (@($two | Where-Object { $_.pid -ne $one[0].pid }).Count) { throw '第二次启动产生了独立主进程，未复用首个实例' }
  Record 'second-instance' 'pass' '第二次启动后出现两个可见窗口'
  $active = 'window-response'
  Start-Sleep -Seconds 2
  $two = @(Get-KitWindows)
  if ($two.Count -ne 2 -or @($two | Where-Object { -not $_.responds }).Count -gt 0) { throw '原生窗口无响应或数量异常' }
  Record 'window-response' 'pass' '两个窗口响应 WM_NULL；动画、渲染与拖拽仍需人工确认'
  $specs = @(
    @{ id = 'visual'; text = '确认两只角色均已正确显示，背景透明，无黑白框、串帧或缺图，动画持续播放' },
    @{ id = 'drag'; text = '拖拽并分别向上/左/右投掷；观察跟手、边缘接触和松手后行为，无异常跳动或丢失' },
    @{ id = 'menu-size'; text = '右键打开尺寸面板，调整 100%-300%，确认尺寸和脚底锚点；测试游走开关、复位和点击反馈，最后关闭尺寸面板，保留两只宠物' },
    @{ id = 'motion'; text = '开启自动游走确认连续运动；若是 Shimeji，把记事本底边靠近任务栏，确认侧边攀爬、顶边落点、移动跟随和最小化/关闭后坠落' }
  )
  foreach ($spec in $specs) {
    $active = $spec.id
    if ($SkipManual) { Record $active 'incomplete' '由 -SkipManual 跳过必需项'; continue }
    Write-Host "`n$($spec.text)"
    $answer = Read-Host '实际操作后填写 Y=通过 N=失败 B=环境受阻 S=未完成（回车也视为未完成）'
    $status = Convert-Answer $answer
    $note = if ($status -eq 'pass') { '操作者确认通过' } else { Read-Host '补充原因（可留空）' }
    Record $active $status $note
  }
  $active = 'single-close'
  $windows = @(Get-KitWindows)
  if ($windows.Count -ne 2) { throw '需要恰好两只宠物且尺寸面板关闭，无法验证关闭单只' }
  [void][PetKitWin32]::PostMessage([IntPtr]$windows[0].hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  $remaining = @(Wait-KitWindows 1)
  Record 'single-close' 'pass' '关闭一只后另一只窗口仍存在'
  $active = 'exit'
  [void][PetKitWin32]::PostMessage([IntPtr]$remaining[0].hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  $deadline = (Get-Date).AddSeconds(15)
  do { $left = @(Get-OwnedProcesses); if ($left.Count -eq 0) { break }; Start-Sleep -Milliseconds 250 } while ((Get-Date) -lt $deadline)
  if ($left.Count) { throw 'timeout: 关闭最后一只后 15 秒仍存在本轮进程' }
  Record 'exit' 'pass' '本轮宠物和已跟踪子进程自然退出'
} catch {
  $message = $_.Exception.Message
  $status = if ($message.StartsWith('BLOCKED:')) { 'blocked' } else { 'fail' }
  Record $active $status $message
} finally {
  try {
    if ($script:owned.Count) {
      Stop-OwnedProcesses
      Start-Sleep -Milliseconds 500
      if (@(Get-OwnedProcesses).Count) { throw '本轮进程尚未清理完成' }
    }
    Record 'cleanup' 'pass' '仅清理本轮启动并核对创建时间的进程；测试副本、独立用户数据与日志保留在报告目录'
  } catch { Record 'cleanup' 'blocked' $_.Exception.Message }
  $report['finishedAt'] = (Get-Date).ToString('o')
  Save-KitReport $report $run
  Write-Host "`n报告：$run\summary.txt 和 result.json"
}
if ($report.overall -eq 'pass') { exit 0 }
if ($report.overall -eq 'fail') { exit 1 }
if ($report.overall -eq 'blocked') { exit 2 }
exit 3
