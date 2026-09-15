param(
  [Parameter(Mandatory=$true)][string]$CandidateDirectory,
  [ValidateSet(100,125,150,175,200)][int]$ExpectedDpiPercent = 100
)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw '此检查必须在 Windows 上运行。' }
$CandidateDirectory = (Resolve-Path -LiteralPath $CandidateDirectory).Path
$candidateJsonPath = Join-Path $CandidateDirectory 'candidate.json'
$candidateJsonSha256 = (Get-FileHash -LiteralPath $candidateJsonPath -Algorithm SHA256).Hash
$identity = Get-Content -LiteralPath $candidateJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($identity.platform -ne 'win32' -or $identity.arch -ne 'x64') { throw '请选择 Windows x64 工作台候选目录。' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $CandidateDirectory ("RETURN-studio-$stamp-" + [guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $runDir | Out-Null
Copy-Item -LiteralPath $candidateJsonPath -Destination (Join-Path $runDir 'candidate.snapshot.json')
$checks = @()
$checkedFileHashes = @()
$exeSha256 = $null
$templateSha256 = $null
$templateExpectedSha256 = $null
$appProcess = $null
$launchedPidFile = Join-Path $runDir 'isolated-launched-pids.txt'
$restartScript = Join-Path $runDir 'restart-isolated.ps1'
$recordedLaunchPids = @()
$runningRecordedPids = @()
function Record([string]$name, [string]$status, [string]$detail) {
  $script:checks += [pscustomobject]@{name=$name;status=$status;detail=$detail}
  Write-Host "$status : $name $detail"
}
try {
  foreach ($artifact in $identity.files) {
    if ([IO.Path]::GetFileName($artifact.file) -cne $artifact.file) { throw '候选清单包含非法文件名。' }
    $actual = (Get-FileHash -LiteralPath (Join-Path $CandidateDirectory $artifact.file) -Algorithm SHA256).Hash
    $script:checkedFileHashes += [pscustomobject]@{file=$artifact.file;expectedSha256=$artifact.sha256;actualSha256=$actual}
    if ($actual -ine $artifact.sha256) { throw "候选文件校验失败：$($artifact.file)" }
  }
  Record '候选文件 SHA-256' 'pass' $identity.version
  $zips = @($identity.files | Where-Object { $_.file.EndsWith('.zip') })
  if ($zips.Count -ne 1) { throw '候选清单应当包含一个工作台 ZIP。' }
  $appDir = Join-Path $runDir '中文路径 #1\工作台'
  Expand-Archive -LiteralPath (Join-Path $CandidateDirectory $zips[0].file) -DestinationPath $appDir
  $exe = Join-Path $appDir 'Pet Studio Lite.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw 'ZIP 中没有工作台 EXE。' }
  $exeSha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
  $versionInfo = (Get-Item -LiteralPath $exe).VersionInfo
  if ($versionInfo.ProductName -ne 'Pet Studio Lite' -or $versionInfo.ProductVersion -ne $identity.version) { throw 'EXE 身份与候选版本不符。' }
  $template = Join-Path $appDir 'resources\runtime-template\win-x64.zip'
  $templateInfo = Get-Content -LiteralPath ($template + '.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $templateSha256 = (Get-FileHash -LiteralPath $template -Algorithm SHA256).Hash
  $templateExpectedSha256 = $templateInfo.sha256
  if ($templateSha256 -ine $templateExpectedSha256) { throw '内置桌宠运行时模板校验失败。' }
  Record 'Windows 解压、EXE 身份与内置模板' 'pass' ''

  $restartBody = @'
param(
  [string]$WorkbenchExe,
  [string]$PetExe
)
$ErrorActionPreference = 'Stop'
$hasWorkbenchExe = -not [string]::IsNullOrWhiteSpace($WorkbenchExe)
$hasPetExe = -not [string]::IsNullOrWhiteSpace($PetExe)
if ($hasWorkbenchExe -and $hasPetExe) { throw 'WorkbenchExe 与 PetExe 只能选择一个。' }
$workbenchDir = Join-Path $PSScriptRoot '中文路径 #1\工作台'
if ($hasPetExe) {
  $targetExe = (Resolve-Path -LiteralPath $PetExe).Path
  if ([IO.Path]::GetFileName($targetExe) -ine 'PetLitePet.exe') { throw 'PetExe 必须指向本次导出的 PetLitePet.exe。' }
  $workingDirectory = [IO.Path]::GetDirectoryName($targetExe)
  $dataDir = Join-Path $PSScriptRoot '测试桌宠用户数据'
  $kind = '导出桌宠'
} elseif ($hasWorkbenchExe) {
  $targetExe = (Resolve-Path -LiteralPath $WorkbenchExe).Path
  if ([IO.Path]::GetFileName($targetExe) -ine 'Pet Studio Lite.exe') { throw 'WorkbenchExe 必须指向 Pet Studio Lite.exe。' }
  $workingDirectory = [IO.Path]::GetDirectoryName($targetExe)
  $dataDir = Join-Path $PSScriptRoot '测试用户数据'
  $kind = '安装版工作台'
} else {
  $targetExe = Join-Path $workbenchDir 'Pet Studio Lite.exe'
  $workingDirectory = $workbenchDir
  $dataDir = Join-Path $PSScriptRoot '测试用户数据'
  $kind = 'ZIP 工作台'
}
if (-not (Test-Path -LiteralPath $targetExe -PathType Leaf)) { throw "没有找到 $kind EXE：$targetExe" }
$logStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$stdoutPath = Join-Path $PSScriptRoot ("restart-$logStamp.stdout.log")
$stderrPath = Join-Path $PSScriptRoot ("restart-$logStamp.stderr.log")
$oldPath = $env:PATH
$electronModeWasSet = Test-Path Env:ELECTRON_RUN_AS_NODE
$oldElectronMode = $env:ELECTRON_RUN_AS_NODE
try {
  $env:PATH = ''
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $argument = '--user-data-dir="' + $dataDir + '"'
  $process = Start-Process -FilePath $targetExe -ArgumentList $argument -WorkingDirectory $workingDirectory -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  Add-Content -LiteralPath (Join-Path $PSScriptRoot 'isolated-launched-pids.txt') -Value $process.Id -Encoding Ascii
  Write-Host "已隔离启动 $kind；PID=$($process.Id)；用户数据=$dataDir"
} finally {
  $env:PATH = $oldPath
  if ($electronModeWasSet) { $env:ELECTRON_RUN_AS_NODE = $oldElectronMode } else { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
}
'@
  $utf8Bom = New-Object System.Text.UTF8Encoding($true)
  [IO.File]::WriteAllText($restartScript, $restartBody, $utf8Bom)
  Record '隔离重启入口' 'pass' 'restart-isolated.ps1（工作台与导出桌宠使用不同测试数据目录）'

  $oldPath = $env:PATH
  $electronModeWasSet = Test-Path Env:ELECTRON_RUN_AS_NODE
  $oldElectronMode = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:PATH = ''
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $dataDir = Join-Path $runDir '测试用户数据'
    $appProcess = Start-Process -FilePath $exe -ArgumentList ('--user-data-dir="' + $dataDir + '"') -WorkingDirectory $appDir -PassThru -RedirectStandardOutput (Join-Path $runDir 'stdout.log') -RedirectStandardError (Join-Path $runDir 'stderr.log')
    Add-Content -LiteralPath $launchedPidFile -Value $appProcess.Id -Encoding Ascii
  } finally {
    $env:PATH = $oldPath
    if ($electronModeWasSet) { $env:ELECTRON_RUN_AS_NODE = $oldElectronMode } else { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
  }
  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Milliseconds 250
    $appProcess.Refresh()
    if ($appProcess.HasExited) { throw "工作台提前退出，退出码 $($appProcess.ExitCode)" }
  } while ($appProcess.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline)
  if ($appProcess.MainWindowHandle -eq 0) { throw '45 秒内没有检测到工作台窗口。' }
  Record '空 PATH 启动工作台' 'pass' "PID=$($appProcess.Id)"
  Write-Host "关闭、重启和重复打开工作台时，只能使用隔离入口：powershell -NoProfile -ExecutionPolicy Bypass -File `"$restartScript`""
  Write-Host "运行安装版工作台时使用同一入口的 -WorkbenchExe `"安装路径\Pet Studio Lite.exe`""
  Write-Host "运行导出的桌宠时使用：powershell -NoProfile -ExecutionPolicy Bypass -File `"$restartScript`" -PetExe `"完整路径\PetLitePet.exe`""
  Write-Host '不要在本轮验收中直接双击工作台或导出的 EXE；隔离入口会固定测试数据目录并记录每次启动 PID。'
  Write-Host "请先在 Windows 设置确认缩放为 $ExpectedDpiPercent%。下面项目需要你实际操作；未完成请选择 s。"
  $manual = @(
    '系统显示缩放符合本次记录；窗口文字、按钮、布局正常',
    '导入一个本地 Petdex 包，检查、修改配置并保存；关闭后只用隔离入口重启，确认数据仍保留',
    '粘贴 npx petdex@latest install boba，看到候选预览后确认导入',
    '桌宠预览显示正常，动画、拖动、右键菜单和尺寸调整可用',
    '导出 Windows ZIP，断网后再次导出也成功；解压后只用隔离入口的 -PetExe 启动并检查桌宠',
    '只用同一隔离入口重复打开工作台，确认仅激活已有窗口且项目数据正常',
    '关闭隔离入口启动的工作台及测试桌宠，确认没有遗留窗口'
  )
  foreach ($item in $manual) {
    do { $answer = Read-Host "$item [p=通过 / f=失败 / s=未完成]" } while ($answer -notin @('p','f','s'))
    $status = if ($answer -eq 'p') { 'pass' } elseif ($answer -eq 'f') { 'fail' } else { 'incomplete' }
    Record $item $status '用户手动确认'
  }
  if (Test-Path -LiteralPath $launchedPidFile) {
    # Get-Content strings carry PSDrive/PSProvider metadata in Windows PS 5.1.
    # Keep only plain integers before ConvertTo-Json can traverse that graph.
    $recordedLaunchPids = @([IO.File]::ReadAllLines($launchedPidFile) | ForEach-Object {
      if ([string]::IsNullOrWhiteSpace($_)) { return }
      $recordedId = 0
      if (-not [int]::TryParse($_.Trim(), [ref]$recordedId) -or $recordedId -le 0) {
        throw 'Invalid PID in isolated-launched-pids.txt'
      }
      $recordedId
    } | Select-Object -Unique)
    foreach ($recordedId in $recordedLaunchPids) {
      $recordedProcess = Get-Process -Id $recordedId -ErrorAction SilentlyContinue
      if ($null -ne $recordedProcess -and -not $recordedProcess.HasExited) { $runningRecordedPids += $recordedId }
    }
  }
  $exitStatus = if ($runningRecordedPids.Count -eq 0) { 'pass' } else { 'incomplete' }
  $exitDetail = if ($runningRecordedPids.Count -eq 0) { '隔离入口记录的全部 PID 已退出' } else { '仍在运行的记录 PID：' + ($runningRecordedPids -join ',') }
  Record '隔离启动的工作台与桌宠进程退出' $exitStatus $exitDetail
  Record '安装、升级保留数据、卸载重装、混合 DPI 与长时间使用' 'incomplete' '需要 Windows Codex 按说明另行验证；本脚本不自动填写'
} catch {
  Record '执行错误' 'fail' $_.Exception.Message
} finally {
  $overall = if (@($checks | Where-Object status -eq 'fail').Count) { 'fail' } elseif (@($checks | Where-Object status -eq 'incomplete').Count) { 'incomplete' } else { 'pass' }
  [pscustomobject]@{
    overall=$overall; version=$identity.version; expectedDpiPercent=$ExpectedDpiPercent;
    os=[Environment]::OSVersion.VersionString; cpu=$env:PROCESSOR_IDENTIFIER;
    candidateJsonSha256=$candidateJsonSha256; candidate=$identity; checkedFileHashes=$checkedFileHashes;
    exeSha256=$exeSha256; runtimeTemplateSha256=$templateSha256; runtimeTemplateExpectedSha256=$templateExpectedSha256;
    recordedLaunchPids=$recordedLaunchPids; runningRecordedPids=$runningRecordedPids;
    checks=$checks; runDirectory=$runDir; isolatedLauncher=$restartScript; recordedAt=(Get-Date).ToString('o')
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runDir 'result.json') -Encoding UTF8
  Write-Host "结果：$overall；请保留并返回 $runDir"
  Write-Host '本脚本不会结束其他工作台或桌宠进程；如有测试窗口未关闭，请手动关闭。'
}
