# beta.2-r2：Windows 测试与验收工具修订

## 回传结论

`Windows-Studio-0.2.0-beta.2-RETURN-20260915-180510` 的 55 个证据文件通过自带 SHA-256 清单校验。候选 ZIP 哈希为 `3bed32debba898189efdd46509eadca1f6174806221b31fa496f968b94765a00`。

上轮 WebP 文件句柄修复已获得 Windows 原生复验：三次 Boba 确认导入的 sourcePath 均被删除，项目图集可读，取消第四次候选后缓存为空，无 EBUSY。本地 ZIP 导入、配置重启保留、单实例、关闭工作台同时关闭预览、导出及导出桌宠运行也有本轮证据。主观体验、断网导出、DPI、多屏、长时间使用与安装生命周期仍未完成。

## 本次修复

1. **跨平台测试夹具。** `test:petdex` 原先实际执行 `#!/bin/sh` 临时脚本，在 Windows 返回 ENOENT。现仅将假 npx 的进程派发替换为当前 Node 执行一个 JavaScript 夹具；生产命令解析、固定 argv、`shell:false`、进程退出和文件输出仍真实执行，收到的四个参数仍逐一断言。没有跳过此测试，也没有让应用执行用户的命令文本。目录链接夹具使用 Windows 支持的 junction，保留链接拒绝检查。
2. **PID 序列化。** 检查脚本使用 `ReadAllLines` 读取本轮启动记录，校验为正整数并去重。报告只保存数值 PID，不再携带 `Get-Content` 的 PSDrive/PSProvider 附加属性。非法 PID 会报错，不会悄悄变成“全部退出”。
3. **结果文件回归。** 新增 `test:windows-studio-report`，直接执行原脚本的 PID 收集与 finally 序列化代码，验证实际 result.json、数值 PID、去重、空数组、存活进程检测、非法值拒绝及 fail/incomplete。测试由子进程运行，15 秒超时，不启动桌宠、不填写人工通过、不结束测试外进程。

[Microsoft 文档](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/convertto-json)注明：从 PowerShell 7.2 起，字符串扩展属性不再序列化。因此不能用 PowerShell 7 的成功替代 Windows PowerShell 5.1；本回归还在序列化前断言 PID 为纯整数，旧实现会直接失败，避免重现高内存占用。

## 已验证的范围

- Mac `npm test` 通过；修订后的 `test:petdex` 10/10，额外严格类型检查通过；工作台 typecheck 与 windows-kit typecheck 通过。
- 报告回归先在旧脚本失败，修复后用隔离的 PowerShell 7.6.6 通过，JSON 写入约 13 ms；源码使用 Windows PowerShell 5.1 可用语法。**Windows 5.1 原生执行仍待验证。**
- 工作台运行代码、依赖版本与 ZIP 未变，r2 保留 beta.2 的精确二进制哈希。此次不重新宣称 Mac GUI/Windows 安装版已验收。
- 原日志中的 npm 依赖漏洞数量已保留；本轮未进行漏洞可达性分析、`audit fix` 或依赖升级。

## Windows 最短复验路径

复制整个 r2 目录到本地磁盘，使用独立源码副本，不覆盖旧候选或其原 RETURN。在 `source` 目录打开 PowerShell，先执行 `npm ci`；成功后执行：

```powershell
npm run verify:windows-source
```

此命令依次运行完整 npm test、Windows PowerShell 5.1 报告回归、typecheck；任何一步失败都会停止。先返回该命令的完整日志，不必为了验证工具修复重跑三轮 Boba 或整套 GUI 矩阵。

源码门禁通过后，在同一源码目录执行 `npm run package:win`，生成独立安装程序和 ZIP 候选。按新 candidate.json 的哈希继续安装版验收，不把旧 ZIP 的通过记录移植为新安装版通过。

若继续当前 beta.2 ZIP 的 GUI 验收，在 r2 根目录运行修订后的 `check-windows-studio.ps1`；按实际缩放填写参数。原交互入口保持不变。由 Codex 启动时继续设置 `tty=true`，未体验的人工项填 s，结束后确认本轮 `result.json` 实际存在且大小合理。旧现场保留的 PID 已是历史快照，不能据此结束当前同号进程。
