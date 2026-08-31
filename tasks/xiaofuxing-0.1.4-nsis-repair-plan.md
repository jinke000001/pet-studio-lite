# 小福猩 0.1.3 覆盖安装失败诊断与 0.1.4 修复规划

日期：2026-08-30。输入证据：`runs/recheck-0.1.3-review-20260830/`（原 T7 路径 `/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.3-20260830-01/RETURN/windows-install-recheck-0.1.3-20260830-174153/` 已于 2026-08-31 删除，工作区副本与原件 114 个文件哈希一致）。

## 1. 结论（先行）

- 0.1.3 的"无法关闭"弹窗**不是**运行检测误判，也不是 0.1.3 新增精确路径检测的失败。
- 弹窗来自 electron-builder 26.15.3 内置模板 `installUtil.nsh` 的 `uninstallOldVersion` **重试环**（第 219 行）：覆盖安装时，安装器把旧版（0.1.0）卸载器复制到 `$PLUGINSDIR\old-uninstaller.exe` 并 `ExecWait` 静默执行；**退出码非 0 连续 5 次后**弹出 `appCannotBeClosed`（"无法关闭"，重试/取消）。
- 也就是说：0.1.2 修复 DPI、0.1.3 修复检测逻辑，都没有碰到真正断的环节——**旧 0.1.0 卸载器在被静默调用时根本没有成功执行**。0.1.3 的自定义检测宏只替换 `CHECK_APP_RUNNING`，管不到 `uninstallOldVersion` 的错误处理。

## 2. 证据链

| 证据 | 内容 | 指向 |
|---|---|---|
| 弹窗截图 | 标题"小福猩桌宠 安装"，正文 `appCannotBeClosed`，按钮 重试/取消，背后进度条已进入"正在安装" | 安装 Section 内、检测之后的阶段 |
| `failure-exact-process-query.csv` | 0 字节，弹窗时精确主程序进程数 0 | 排除"真的有应用在跑" |
| `install-before-files.csv` vs `install-after-failure-files.csv` | 79 行逐字节相同，**旧卸载器一个文件都没删** | 旧卸载器死于 Section 开始之前 |
| 失败前后文件清单中 | **无任何 uninstall.log / install.log** | 旧卸载器连 `un.onInit`（`SetOutPath` + `LogSet on`）都没执行到，大概率进程未能启动或启动即被杀 |
| 时间线 | 安装器进程 17:51:17 启动，弹窗 17:54:16，约 2.5–3 分钟 | 符合"5 次静默卸载尝试 × 每次若干秒 + Sleep 1000"的重试环耗时 |
| 0.1.2 冲突审计（上一轮） | 默认前缀检测时同样 0 进程、同样弹窗 | 两轮检测逻辑不同、症状相同 → 病灶不在检测 |
| `install-before-uninstall-entries.json` | `InstallLocation=null`，卸载串为 `"C:\Program Files\XiaofuxingDesktopPet\Uninstall XiaofuxingDesktopPet.exe" /allusers` | 会走 `GetFileParent` 回退，路径本身可解析，不是阻断点 |

## 3. 根因假设与区分方法

- **H1（主假设）**：Windows 安全策略（Defender ASR"阻止不符合条件的可执行文件运行"、SmartScreen 对子进程不弹窗直接拦、或企业 WDAC 策略）阻断/秒杀了从 `%TEMP%` 启动的**未签名** `old-uninstaller.exe`。主安装器能跑是因为用户交互启动时过了 SmartScreen；子进程没有这个机会。弹窗时进程树中无任何卸载器子进程、无日志文件，均支持此假设。
- **H2（次假设）**：复制到 `%TEMP%` 失败 → 走 `TryInPlace` 就地运行旧卸载器 → 0.1.0 卸载器内置的**默认前缀检测**匹配到它自己（`GetProcessInfo` 只对文件名等于 `XiaofuxingDesktopPet.exe` 才跳过，`Uninstall XiaofuxingDesktopPet.exe` 不跳过）→ `KILL_PROCESS` 自杀 → 非 0 退出 ×5。此路径会在 INSTDIR 留下空 uninstall.log，与"无日志"证据相悖，故降为次假设。

区分证据（下一轮 Windows 复验必须采集，全部只读）：
1. `Get-MpPreference` 的 ASR 规则状态；
2. `Microsoft-Windows-Windows Defender/Operational` 日志中 2026-08-30 17:50–17:55 的 **1121/1122（ASR 阻止/审计）** 与 1116/1117（检测）事件；
3. 0.1.4 安装器新增 DetailPrint 探针输出（详见第 4 节）——预检直接运行旧卸载器并记录退出码，可当场区分"起不来"还是"起来了但自杀"。

## 4. 0.1.4 修复方案（macOS 侧）

原则：不再只改检测，而是把"旧卸载器执行"这个黑盒变成**先预检、有日志、可区分**的环节；同时保持身份（appId、安装路径、卸载入口、用户数据）完全不变。

1. `build/nsis/exact-app-process-check.nsh`：
   - 在现有 `customCheckAppRunning` 各分支加 `DetailPrint` 探针（目标路径、退出码、走向），不改变现有语义。
   - 新增 `desktopPetPreUninstallOldVersion` 宏（`!ifndef BUILD_UNINSTALLER` 保护，仅安装器），在 `customCheckAppRunning` 末尾插入：读取 `${UNINSTALL_REGISTRY_KEY}` 的 UninstallString（与 electron-builder 同一个键），复制旧卸载器到 `$PLUGINSDIR`，用与 `installUtil.nsh` 完全相同的参数 `/S /KEEP_APP_DATA /allusers --updated _?=$installationDir` 预执行一次，`DetailPrint` 退出码并复查卸载入口：
     - 预检成功（入口消失）→ 后续 `uninstallOldVersion` 读不到入口直接返回，**重试环与弹窗不再触发**；
     - 预检失败 → 只记录证据，**不改变默认流程**（不新增失败面）。
   - 新增 `customUnInstallCheck` 宏：逐字镜像 `handleUninstallResult` 默认逻辑（IfErrors → DetailPrint 后 Return；`$R0 != 0` → MessageBox + SetErrorLevel 2 + Quit），仅追加 `DetailPrint` 记录 `$R0` 与错误标志，捕获"用户点取消后安装继续"这类隐态。
2. `config/products/xiaofuxing.json`：版本升 `0.1.4`，其余身份字段不变。
3. 质量门不变：`npm test` 77/77、lint、`npm audit --omit=dev` 0、electron-builder 实际编译通过、macOS 打包运行时 `renderer-ready`/`runtime-ready` 通过、批准图集 SHA-256 保持 `427a7a68…3660`。
4. 产物按既有规范生成 `release/candidates/xiaofuxing-desktop-pet/0.1.4/candidate-<时间戳>/`，并组装新的 T7 交接包（含新版 PRD、报告模板、Windows 提示词、checksums）。

## 5. Windows 复验重排（解决"0.1.0 旧卸载器不可控"）

0.1.0 只在测试机上存在、从未对外发布，其卸载器字节不可变。因此验收顺序重排为：

1. **先做官方交互式卸载 0.1.0**（双击官方卸载入口，非 `/S`）——这本身就是 PRD 要求的"官方卸载"门，顺手清掉不可控变量；卸载后核对目录、快捷方式、卸载入口、进程全部清零。
2. 干净安装 0.1.4 → 单一 `小福猩桌宠 0.1.4` 卸载入口 → installed mode 全量（100%/125%/150% 冷启动、真实动态 DPI、透明/无白窗/无裁切、单击双击、拖动、托盘、应用内缩放、退出后进程数 0）。
3. **同版本覆盖**：在已装 0.1.4 上再次运行 0.1.4 安装包——此时旧卸载器是带精确路径检测的 0.1.4 卸载器，H2 类自杀在逻辑上不可能；若仍弹"无法关闭"，则 H1（安全软件阻断）坐实，收集 Defender 事件日志作为最终结论。
4. 官方卸载 0.1.4 → 清理核查 → 同包干净重装 → 冒烟。
5. 恢复系统缩放，回传证据与哈希。

 contingency：若 H1 坐实（企业安全策略阻断未签名临时卸载器），在当前"不签名、不改安全设置"的边界下，覆盖安装门在该测试机上不可自动通过；记录为已知限制，验收以"官方卸载 + 干净重装"链路为准，签名引入后再复测覆盖链路。

## 6. 执行入口

- macOS 修复与构建：`runs/recheck-0.1.3-review-20260830/KIMI-CODE-PROMPT-MACOS-0.1.4.md`
- Windows 复验：`runs/recheck-0.1.3-review-20260830/KIMI-CODE-PROMPT-WINDOWS-0.1.4-RECHECK.md`（由 macOS 侧打包进新 T7 交接包）
