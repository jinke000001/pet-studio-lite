# 0.2.0-beta.2：Windows 在线导入清理修复

## 已确认与修复

beta.1 回传的 20 个文件均通过自带 SHA-256 校验。首个产品异常是确认导入 Boba 后，删除临时 `spritesheet.webp` 返回 EBUSY；项目导入和配置保存已完成。回传没有原脚本 `result.json`，`agent-result.json` 是补充证据，不能冒充用户确认。

在本机独立进程复现：旧 `sharp(absPath).raw().toBuffer()` 完成后，WebP 的 `sharp.cache().files.current` 为 1，`lsof` 同时显示图集的打开文件描述符和映射；PNG 为 0。已证实当前解码路径会保留源文件句柄。它解释了 Windows 删除失败的机制，但原 Windows 现场没有持锁进程取证，不能认定现场唯一持锁者。

修复让 Node `readFile` 先读取并关闭文件，再将 Buffer 交给 sharp。保留完整像素解码、尺寸交叉检查、64M 像素限制及损坏文件拒绝；没有关闭全局缓存、忽略清理错误或放宽验收。[官方缓存文档](https://sharp.pixelplumbing.com/api-utility/#cache)。

## 验证

- 新回归先在旧代码失败：WebP 解码后保留 1 个源文件，预期 0；修复后 PNG、v1 WebP、v2 WebP 立即删除及同路径损坏替换共 6/6 通过。
- `npm test`、`npm run typecheck`、`npm run typecheck:windows-kit`。
- Mac 真实 Electron 工作台最终 71/71，包含两份 WebP 项目的真实 Windows ZIP 导出；新增三轮候选预览、确认后清理、项目重新校验和取消后清理。此项 HTTP 使用确定性测试素材，界面、IPC、存储和解码均为生产代码。
- `PETDEX_REMOTE_TEST=1 npm run test:petdex-download`：9/9，包含真正从官方下载 Boba、完整解码、零缓存文件句柄和立即删除。
- beta.2 Windows ZIP 构建及静态校验见新候选的 `Mac验证证据`。Mac 结果不能替代 Windows EBUSY 原生复验。

补验曾发现测试等待时序问题：React 先隐藏候选卡片，后台删除尚未完成。测试现等待真实取消 IPC 完成后检查磁盘，最终 71/71；中间失败日志保留为 `workflow-timing-failure.log`。

## Windows 下一轮

复制整个 beta.2 候选目录到 Windows 本地磁盘，在该目录打开普通 PowerShell，运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\check-windows-studio.ps1 -CandidateDirectory . -ExpectedDpiPercent 100
```

缩放参数须与系统实际值一致。先聚焦本次失败路径：下载 Boba，确认导入，检查项目素材可读且临时 sourcePath 已删除；连续做三轮，并检查“暂不导入”后的候选清理。保留 stderr 和项目 sourcePath 的文件存在性证据。若再次 EBUSY，先记录持锁者，不手动删除现场、不重跑整个矩阵。通过后再继续本地导入、配置重启保留、桌宠预览、离线导出及导出桌宠实际运行。

由 Windows Codex 启动交互脚本时必须使用 `exec_command` 的 `tty=true`，保留输入通道；人工视觉、动画、拖动和菜单结果由用户填写。遇到输入通道丢失，不伪造 `result.json`。本地文件选择器自动化索引错误属于工具阻塞，应刷新界面状态或由用户选目录，不能计为产品失败。

本候选仍是 ZIP，Windows 安装程序需在附带 source 目录中用 Node 22.18+ 执行 `npm ci`、`npm test`、`npm run package:win`，生成独立候选。动态 DPI、多屏、60 分钟使用、安装/卸载/升级等未完成门禁仍待 Windows 实机验收。重启、重复启动、运行导出桌宠继续使用 RETURN 中的隔离启动入口，详见《双平台试用与验收.md》。

原 beta.1 候选、失败回传和用户数据均保留；beta.2 不作为已通过 Windows 验收或正式发布的版本。
