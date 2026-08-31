# 小福猩 0.1.5 卸载器 CRC 修复证据

## 问题与结论

- 0.1.4 Windows 复验（`RETURN/windows-install-recheck-0.1.4-20260830-190659/`）终止于门 F：同版本覆盖再弹“小福猩桌宠 无法关闭”。关键新证据：0.1.0/0.1.4 卸载器直启即弹 NSIS Error “Installer integrity check has failed”，磁盘哈希全程未变，`/NCRC` 后同字节卸载成功；Defender/ASR 全时段零事件（H1 否证）。
- 根因（构建产物层面，H2 变体坐实并定位到代码）：在 macOS（Catalina+，darwin ≥ 19）上，electron-builder 26.15.3 的 `computeScriptAndSignUninstaller`（`app-builder-lib/out/targets/nsis/NsisTarget.js:337-381`）走 `UninstallerReader.exec`（`nsisUtil.js:140-222`）：把 pass-1 安装器的 exehead stub 与 makensis 内嵌的卸载数据块**直接字节拼接**为 `__uninstaller.exe`——不执行 NSIS 运行时 `WriteUninstaller` 的 unicon 补丁（NSIS `Source/exehead/exec.c` EW_WRITEUNINSTALLER），也不重算 CRC。而 NSIS 运行时自检（`Source/exehead/fileform.c` `loadHeaders`）的 CRC 覆盖 `[512, filehdrsize + length_of_all_following_data - 4)`，**包含 exehead stub 区**——拼接产物的 stub 与 makensis 预算 CRC 时假设的 stub 不一致，自检必败。上游已知问题 [electron-builder#4875](https://github.com/electron-userland/electron-builder/issues/4875)，26.15.3 仍存在。
- 这同时解释三轮症状：0.1.3/0.1.4 覆盖安装的“无法关闭”（默认 `uninstallOldVersion` 静默调用旧卸载器，CRC 自杀，5 次重试后弹窗）、0.1.0/0.1.4 官方卸载直启弹 NSIS Error、以及为何任何安全软件日志都无记录。

## 本机静态复现（macOS，不依赖 Windows）

按 `loadHeaders` 算法（CRC32/zlib，区间 `[512, firstheader偏移 + length_of_all_following_data - 4)`，存储值为区间末 4 字节）复算 0.1.4 交付物，工具 `04-evidence/verify-nsis-crc.py`：

| 对象 | firstheader flags | 计算 CRC | 存储 CRC | 结论 |
|---|---|---|---|---|
| 0.1.4 主安装器 | 0x0 | 0x228aea3c | 0x228aea3c | 一致（与 Windows 实测“安装器可运行”相符） |
| 0.1.4 内嵌卸载器（SHA-256 `167b04c4…`，与 Windows 失败卸载器逐字节相同） | 0x1 | 0x6b343ac4 | 0xc2d5a1af | **不一致 → 自检必败，静态复现 NSIS Error** |

对照实验：用 NSIS 3.0.4.1 全量原始 stub 与安装器 stub 分别替换 CRC 区间的 stub 段，均不能复现存储值——存储 CRC 对应的 stub 状态在最终产物中不存在，与 UninstallerReader 不做 CRC 修正的代码路径互为印证。

## 0.1.5 最小修复

- `build/nsis/exact-app-process-check.nsh` 顶部：`!ifdef BUILD_UNINSTALLER` → `CRCCheck off`。仅作用于卸载器编译 pass（含 makensis 内部 `__UNINSTALL__` 子编译），卸载器 firstheader 置 `FH_FLAGS_NO_CRC(4)`，`loadHeaders` 在 CRC 前跳过自检；安装器 pass 保持 CRC 开启。素材、桌宠运行逻辑、appId、EXE 名、机器级范围、安装路径身份、卸载入口身份、用户数据身份、0.1.4 全部探针与预检宏均不变；不改 node_modules，不引入签名或安全设置变更。
- `config/products/xiaofuxing.json` 版本 `0.1.4 → 0.1.5`；`test/product-profiles.test.js` 断言同步。
- 诊断与修复规划全文：`tasks/xiaofuxing-0.1.5-uninstaller-crc-repair-plan.md`（随 source ZIP 交付）。

## 本机验证

- 自动测试 77/77（版本断言已更新为 0.1.5）、lint 退出 0、`npm audit --omit=dev` 0 vulnerabilities、`source:preflight` 通过。
- electron-builder 26.15.3 / makensis 实际编译通过：`artifacts/builder-debug.yml` 第 129 行可见 `!include ".../build/nsis/exact-app-process-check.nsh"`，NSIS 安装包与 blockmap 实际产出。
- 新旧 app.asar 逐文件 diff：**仅** `config/products/xiaofuxing.json` 与 `package.json` 的版本字符串差异（0.1.4→0.1.5），其余逐字节相同。
- 批准图集 SHA-256 保持 `427a7a681110cb77d01e7878191052a9f6dd4973062577fe34b8759c0b523660`。
- macOS Apple Silicon packaged runtime：`renderer-ready` 与 `runtime-ready` 通过（`macos-runtime-verification.json`）。
- **0.1.5 安装包静态验收（verify-nsis-crc.py）**：
  - 主安装器 CRC 保持开启且一致（计算 0x28a0103e == 存储 0x28a0103e）；
  - 内嵌卸载器 firstheader flags=0x5（UNINSTALL|NO_CRC）→ 运行时跳过自检；`firstheader偏移 + length_of_all_following_data == 文件大小` 自洽；
  - 安装器与卸载器 header 块均可完整 inflate 至 `length_of_header`（结构完好，仅自检关闭）；
  - 安装器 header 含 `desktop-pet:` 探针字符串（0.1.4 取证能力保留）。

最终非覆盖候选：

`release/candidates/xiaofuxing-desktop-pet/0.1.5/candidate-20260831015730039/`

| 产物 | SHA-256 |
|---|---|
| Windows NSIS | `656f34eb63b55b0537488e30aff6e44c332672036a3bc8246d5db87aa5f17bb1` |
| Windows EXE | `17086c35ea24d30bd94afe60dab11338f108af00d1b076e14d990da6a3d20b89` |
| 双平台 app.asar | `750e0866c7f9ec692391ad996f134c8ad5d03cbeba7f3fd76e53e5dc1bbe7df0` |
| candidate-manifest.json | `787a4e23c66bac1d6560aec4bd503837d6718370aac4f34e9f17af06d52f82ca` |

## Windows 最终验收

- 2026-08-31 按计划用原 0.1.4 官方卸载器加 `/NCRC` 清除已知 CRC 损坏版本，随后完成 0.1.5 干净安装。
- installed mode 的 100%/125%/150% 冷启动、真实动态 `100%→125%→150%→100%`、透明窗口、单击/双击、左右拖动、托盘隐藏/恢复、应用内缩放和退出均通过。
- `0.1.5→0.1.5` 同版本覆盖连续执行三次均通过，未再出现“无法关闭”；0.1.5 官方卸载器不带 `/NCRC` 直启成功，同包干净重装及核心交互通过。
- Windows 输入 91/91、回传 514/514 哈希通过；最终缩放恢复 100%，精确主程序进程数 0。报告 SHA-256 为 `3b8df884a4dc1aa6929757542102ad9239adcd3bdef56c2f8abd74950a0e7c25`。
- RETURN 已非覆盖归档至 `release/windows-recheck/xiaofuxing-v1-windows-recheck-0.1.5-20260831-01/`，515 个文件与 T7 原件逐字节一致，零 `._*`/`.DS_Store`。

0.1.5 的 Windows 安装生命周期验收门已关闭；它仍是未签名内部候选，不因验收通过自动成为正式发布版。
