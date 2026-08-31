# 小福猩 0.1.4 覆盖安装复败诊断与 0.1.5 修复规划

日期：2026-08-31。输入证据：`/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.4-20260830-01/RETURN/windows-install-recheck-0.1.4-20260830-190659/`。

## 1. 结论（先行）

- 0.1.4 同版本覆盖仍弹“无法关闭”，**不是安全软件阻断（H1 否证）**，也不是 0.1.4 预检探针未执行（探针已真实运行）。
- 根因：**卸载器二进制的 NSIS CRC 自检在构建产物层面就是坏的**——磁盘字节全程未变（SHA-256 恒定）也照样弹 “Installer integrity check has failed”，`/NCRC` 跳过自检后同一字节序列可正常卸载。0.1.0 与 0.1.4 两个卸载器均如此（直启 / `$PLUGINSDIR` 静默均复现）。
- 构建层根因：在 macOS（Catalina+，darwin ≥ 19）上，electron-builder 26.15.3 的 `computeScriptAndSignUninstaller` 走 `UninstallerReader.exec` 路径（`app-builder-lib/out/targets/nsis/nsisUtil.js`），把 pass-1 安装器的 exehead stub 与 makensis 内嵌的卸载数据块**直接字节拼接**生成 `__uninstaller.exe`——既不执行 NSIS 运行时 `WriteUninstaller` 的 unicon 补丁（`Source/exehead/exec.c` EW_WRITEUNINSTALLER），也不重算 CRC。而 NSIS 运行时 CRC（`Source/exehead/fileform.c` `loadHeaders`）覆盖范围是 `[512, filehdrsize + length_of_all_following_data - 4)`——**包含 exehead stub 区**。拼接产物的 stub 与 makensis 预算 CRC 时假设的 stub 不一致 → 自检必败。上游已知问题：electron-userland/electron-builder#4875，26.15.3 仍未修复。
- 本机静态复现（不依赖 Windows）：对交付安装包内嵌卸载器（SHA-256 `167b04c4…`，与 Windows 实测失败卸载器逐字节相同）按 `loadHeaders` 算法重算 CRC：计算值 `0x6b343ac4` ≠ 存储值 `0xc2d5a1af` → 自检必败；同法核对主安装器 `0x228aea3c` == 存储值（通过，与 Windows 实测安装器可正常运行一致）。

## 2. 0.1.5 修复方案（最小增量）

原则：只关掉这个**必然误报**的卸载器自检，其余全部不变（appId、EXE 名、机器级范围、安装路径身份、卸载入口身份、用户数据身份、0.1.4 的全部探针与预检宏均保留）。

1. `build/nsis/exact-app-process-check.nsh` 顶部新增：
   ```
   !ifdef BUILD_UNINSTALLER
     CRCCheck off
   !endif
   ```
   仅作用于卸载器编译 pass（`BUILD_UNINSTALLER` 定义时，含 makensis 内部 `__UNINSTALL__` 子编译），卸载器 firstheader flags 置 `FH_FLAGS_NO_CRC(4)`，`loadHeaders` 在 CRC 前直接 break → 直启、静默、`$PLUGINSDIR` 副本均不再自检。安装器 pass（无 `BUILD_UNINSTALLER`）保持 `CRCCheck on`，安装器自检能力不变。
2. `config/products/xiaofuxing.json`：版本升 `0.1.5`；`test/product-profiles.test.js` 版本断言同步。
3. 不改 `node_modules`，不改 electron-builder，不引入签名或安全设置变更。
4. 质量门不变：`npm test` 77/77、lint、`npm audit --omit=dev` 0、electron-builder 实际编译通过、macOS 打包运行时验证通过、批准图集 SHA-256 保持 `427a7a68…3660`。

## 3. Mac 侧静态验收（新增，替代无法本机运行 Windows 卸载器的盲区）

对重建候选的安装包：

1. 7z 解出内嵌卸载器，解析 firstheader：`flags & FH_FLAGS_NO_CRC` 必须置位（期望 flags=0x5）；`length_of_all_following_data` 与文件大小自洽（`firstheader 偏移 + 长度 == 文件大小`）。
2. 主安装器按 `loadHeaders` 算法重算 CRC 必须与存储值一致（安装器 CRC 保持开启且通过）。
3. 卸载器 header 块可完整 inflate（结构完好，仅自检被关闭）。
4. 安装器 header 中可见 `desktop-pet:` 探针字符串（0.1.4 注入的取证能力保留）。

## 4. Windows 复验要点变化

- 测试机当前装的是 **0.1.4（CRC 坏卸载器）**：官方卸载 0.1.4 必弹 NSIS Error，属**已确诊的既有缺陷**，直接按偏差用同一官方卸载器加 `/NCRC` 交互卸载即可（与上轮卸载 0.1.0 同一手法），不再是新失败。
- 干净安装 0.1.5 → 同版本覆盖 0.1.5→0.1.5：预检探针调用的旧卸载器已是带 `NO_CRC` 的 0.1.5 卸载器，预期静默卸载成功、默认重试环 no-op、无“无法关闭”。
- 官方卸载 0.1.5（Windows 设置入口，不带 `/NCRC`）：必须一次通过——这是“卸载器直启可用”的正式验收门。

## 5. 最终结果

- 2026-08-31 Windows 复验通过：0.1.5 干净安装、installed mode 三档冷启动与动态 DPI、核心交互、三次同版本覆盖、官方卸载（不带 `/NCRC`）和同包重装均通过。
- Windows 输入 91/91、回传 514/514 哈希通过；系统缩放恢复 100%，最终精确主程序进程数 0。
- 回传证据非覆盖归档于 `release/windows-recheck/xiaofuxing-v1-windows-recheck-0.1.5-20260831-01/`；Phase 4 Checkpoint 4 关闭，0.1.5 保持未签名内部候选。
