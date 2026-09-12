# Windows 轻量半自动验收

适用于 Pet Studio 导出的 Windows x64 **便携桌宠成品**（Petdex 或 Shimeji）。无需 Node、Python、npm、管理员权限或 AI。先完整解压成品和独立工具 ZIP，原候选不需要替换任何文件。

在工具文件夹打开 PowerShell，执行一条命令（把路径换成包含 PetLitePet.exe 的实际目录）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\accept.ps1 -ProductDir "C:\桌宠\成品" -ExpectedDpiPercent 100
```

`Bypass` 仅作用于这次 PowerShell 进程，不修改永久策略；企业策略阻止运行时请记录为受阻。当前 Windows 显示缩放必须与参数相符，可改为 125 或 150；工具不改系统设置。

工具先核对 EXE/manifest，再以成品自带 Electron 的 Node 模式执行打包的共享校验器。核验文件、配置、素材结构、素材 SHA-256、内外 manifest、产品版本、页面依赖，并复制到本次 `results-时间-随机值/test-app`。应用仅在副本和独立用户目录中运行，继承环境中的素材覆盖与 Node 注入选项被清除。完整文件列表、大小及指纹保存在 `delivery.json`。

自动项检查窗口出现、实际 DPI、第二次启动召唤、有限时的窗口消息响应、关闭单只和全部退出。原生窗口存活/响应不代表画面或交互正常。按提示实际检查显示、拖拽、菜单尺寸和自动行为，输入 `Y` 通过、`N` 失败、`B` 环境受阻、`S` 未完成；回车也算未完成。失败/受阻时补充原因。`-SkipManual` 仅供自动诊断，必需人工项会保持未完成。

报告为 `results-*/summary.txt`、`result.json`，并保留 `delivery.json`、验证 stdout/stderr、运行时日志及独立测试数据。每项更新即时保存报告，正常异常退出会补充清理结果；关闭终端或断电后，未执行项仍为未完成，但无法保证这类外部中断后的进程清理。确认测试进程结束后可以删除整个对应 results 文件夹。测试副本约占用一个成品的磁盘空间。

四态：`pass` / `fail` / `blocked` / `incomplete`。汇总优先级：失败 > 受阻 > 未完成 > 全部必需项通过。退出码分别是 0 / 1 / 2 / 3。自动交付检查限时 120 秒，窗口检查通常 15 秒，单次消息响应 500ms；超时不会算通过。

这是一台电脑、一个 DPI 档位的轻量验收，JSON 为独立 schema 1，不冒充既有 schema 3 全矩阵证据。Windows 10/11 × 100%/125%/150%、混合 DPI 跨屏、1 小时长稳仍沿用 [原验收说明](./shimeji-windows.md)。工具未实现安装器验收，因为当前成品是便携 ZIP。

Mac 已测：素材/配置规则与指纹回归、独立复制、文件缺失/替换、版本错配、符号链接、PowerShell 四态/失败/跳过/超时/摘要及 JSON 汇总。Windows PowerShell 5.1、成品 Electron Node 模式、Win32 窗口与进程归属、DPI、实际显示/交互仍需 Windows 实机确认。

开发者重建工具：`npm run build:windows-kit`，总是输出到新的独立目录和 ZIP；不会改写旧候选。开发者执行 PowerShell 测试：`pwsh -NoProfile -File scripts/test-windows-kit.ps1`，Windows 自带 PowerShell 也可执行同一脚本。

技术依据：[Electron 环境变量](https://www.electronjs.org/docs/latest/api/environment-variables)、[日志开关](https://www.electronjs.org/docs/latest/api/command-line-switches)。不支持 Node 模式的定制成品不能完成自动校验；工具不会修改 Electron fuse 或运行器接口。
