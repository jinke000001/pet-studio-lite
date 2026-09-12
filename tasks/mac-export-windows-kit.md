# Mac 修复与轻量 Windows 验收（2026-09-12）

- [x] 阶段一：修复导出未重新校验素材、manifest 可能使用旧指纹的问题。独立快照先校验配置/完整像素解码，再核对导入哈希，打包前拒绝变化。
- [x] 回归覆盖正常副本、已修改 JSON、非法配置、截断图集、复制期间变化；npm test、typecheck、build 通过（Mac）。
- [x] 阶段二：独立便携验收工具；复用现有素材/配置规则与原生窗口检查，生成四态摘要和 JSON。

基线：5798d35；独立分支 fix/mac-export-and-windows-kit。原 deliverables 和 Windows 候选未改动。Windows 实机结果仍待验。

阶段一提交：4695a41。另用独立 fixture 实际走完 Windows ZIP 导出（Mac 打包），解压后经新工具核验 33 个交付文件；未覆盖既有成品。

阶段二验证：Node 素材/配置/版本/缺文件/链接/复制回归通过；Mac PowerShell 7.4.6 四态、失败、跳过、子进程与窗口超时、进程归属/PID 复用、JSON/摘要测试通过；非 Windows 入口确实输出 blocked。Electron Node 模式核验现有 Mario 候选 33 个文件通过，隔离 userData 实测通过。typecheck、工具 TypeScript strict 检查、工作台/运行时构建及工具 ZIP 逐文件核验通过。

Windows 待验：PowerShell 5.1，成品 Node 模式，原生窗口枚举/消息响应、进程创建时间与清理、DPI、人工显示/拖拽/菜单/运动；既有双系统/DPI/混合屏/长稳矩阵仍待验。操作见 docs/acceptance/windows-light-kit.md。
