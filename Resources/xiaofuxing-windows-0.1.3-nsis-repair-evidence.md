# 小福猩 0.1.3 NSIS 进程检测修复证据

## 问题与结论

- 0.1.2 Windows source 与 `win-unpacked` 的 100%/125%/150% 冷启动及真实动态 `100% -> 125% -> 150% -> 100%` 已通过。
- `0.1.0 -> 0.1.2` 同身份覆盖安装被 NSIS 的“无法关闭小福猩桌宠”弹窗阻断。
- 弹窗保持期间，安装目录前缀 WMI 查询为 0，完整进程表中无小福猩进程，Run/RunOnce、启动目录和计划任务均无旧启动项；回传 19/19 哈希通过。因此按 NSIS 运行检测误判处理，而不是素材、DPI 或旧开发版残留冲突。

Windows 审计证据位于（原 T7 路径 `/Volumes/T7 Shield/...` 已于 2026-08-31 删除，以下为仓库归档位置）：

`release/windows-recheck/xiaofuxing-v1-windows-recheck-0.1.2-20260830-01/RETURN/windows-install-conflict-audit-20260830-164621/`

## 0.1.3 最小修复

- 提交：`0fcc28c`。
- 版本：`0.1.3`；appId、EXE 名、机器级安装范围、安装路径身份和用户数据身份不变。
- 新增 `build/nsis/exact-app-process-check.nsh`，机器级 NSIS 包只按 `$INSTDIR\${APP_EXECUTABLE_FILENAME}` 完整路径、`OrdinalIgnoreCase` 匹配运行进程，不再按整个安装目录前缀判断。
- 仅停止完整路径匹配的主程序，不把卸载器、`elevate.exe` 或同目录其他短暂进程视为桌宠。
- WMI 查询异常只写入安装详情，不再直接生成“桌宠仍运行”假阻断；后续文件锁与官方卸载流程仍保留实际失败保护。
- 用户级桌宠继续使用 electron-builder 默认策略；本修复不扩大到未出现该问题的产品。

## 本机验证

- 自动测试：77/77。
- lint：通过。
- `npm audit --omit=dev`：0 vulnerabilities。
- 自定义 NSIS include 已通过 electron-builder 26.15.3 / makensis 实际编译。
- macOS Apple Silicon packaged runtime：`renderer-ready` 与 `runtime-ready` 通过。
- 批准图集 SHA-256 保持：`427a7a681110cb77d01e7878191052a9f6dd4973062577fe34b8759c0b523660`。

最终非覆盖候选：

`release/candidates/xiaofuxing-desktop-pet/0.1.3/candidate-20260830091754928/`

| 产物 | SHA-256 |
|---|---|
| Windows NSIS | `768213571b7db9bce30fd50ed20c92582c5405fb97f7fc3227ca5ad0933bdb63` |
| Windows EXE | `2a6ba9c97a3208e419aafa9c0bb80d95f359be35151dc96629c17dabfee7ed1d` |
| 双平台 app.asar | `e99d224fec2a781c5f57d1ce35c21ae79e28ebb924af37913aed529d037be4dd` |
| candidate-manifest.json | `448273bcf839906e2848c4c8a8995439aac98906af0325e2e50694a629ab80af` |

## Windows 剩余验收门

0.1.3 仍是未签名内部候选。Windows 只需继续验证：

1. 当前 0.1.0 状态下执行一次 0.1.3 同身份覆盖修复安装；
2. 确认只保留一个 0.1.3 卸载入口并完成 installed-mode 核心交互；
3. 通过官方入口卸载并检查目录、快捷方式、卸载入口和残留进程；
4. 使用同一安装包干净重装并复验启动、气泡、拖动、托盘和退出。

已通过的 source 与 `win-unpacked` DPI 不重复执行。未完成以上门禁前，不得宣称 Windows 安装验收或正式发布通过。

## T7 非覆盖复验交付

- 路径：`/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.3-20260830-01/`（该 T7 目录已于 2026-08-31 删除；RETURN 回传的工作区副本位于 `runs/recheck-0.1.3-review-20260830/`，114 个文件与原件哈希一致）。
- source ZIP：8,778,864 字节，SHA-256 `e9e4d014db5f34ae9ea0a41f39aab3c10ef9decb858b155f0ee4ff17ad9f8695`；113 个条目、89 个文件、3 个非 ASCII 路径全部带 UTF-8 标记，内部元数据与不安全路径为 0。
- source ZIP 隔离解压后 `npm ci`、Electron 预检、77/77、lint 和 0 vulnerabilities 通过。
- `checksums.sha256` 覆盖 108 个输入文件，T7 端 108/108 通过；清单自身 SHA-256 为 `be6434fff94632e56859d613ac25299e156bd550189e894f5473a3cb86c26135`。
- 最终 109 个文件、499,777,536 字节，递归 `._*`/`.DS_Store` 为 0，`RETURN/` 为空；旧 0.1.2 交付和历史回传未修改。
