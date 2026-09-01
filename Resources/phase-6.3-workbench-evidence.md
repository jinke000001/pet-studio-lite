# Phase 6.3 工作台证据

Phase 6.3 已完成产品配置、标准包、可恢复项目包和双平台未签名候选的工作台接入。

## 实现结果

- 产品配置校验产品名、语义化版本、productId、appId、executableName、artifactName 和不重复的 mac/win 目标。
- 标准包与项目包进入项目内 `workspace/exports/` 的随机化版本目录；标准包逐文件记录大小与 SHA-256，项目包包含 `project.json` 与当前标准宠物包。
- 候选构建作为独立 `build` 后台任务执行，只读取当前项目最近成功导入的版本化标准包；ASAR 门确认只含一个产品 profile、一个宠物包且图集哈希一致。
- `unknown`、`internal-test` 可导出内部标准包/项目包，但候选构建按钮禁用，主进程也以 `DISTRIBUTION_NOT_AUTHORIZED` 拒绝绕过。
- macOS 与 Windows 候选证据分层；Windows `installedMode`、100%/125%/150% DPI 始终保持 `unverified`，Mac 构建不能提升该结论。
- 候选子进程注册真实取消回调；同一项目的重复导出/构建创建新目录，不覆盖历史证据。

## 自动验证

- 定向工作台测试：35/35 通过（含产品导出、授权门、单宠打包、非覆盖、build 任务类型和运行中取消回调）。
- `npm run studio:typecheck`、`npm run studio:build`、`npm run lint`、`git diff --check` 通过。
- Phase 6.3 checkpoint 前完整 `npm test` 结果记录在本阶段提交前验证日志。

## macOS 真实候选

使用隔离工作台目录导入 `local-pets/doraemon`，授权设为 `authorized`，保存独立产品身份并通过工作台候选控制器构建 macOS arm64：

- 项目：`studio-20260901-092048-5efef4`
- 候选目录：`/Users/jinke00001/Library/Caches/pet-workbench-phase63.UTQd4D/projects/studio-20260901-092048-5efef4/workspace/exports/candidate-20260901092048249-eac0a3/`
- 产品：`doraemon-workbench` / `com.jinke.doraemon.workbench` / `0.1.0`
- 图集 SHA-256：`1af435fc385dc935522edf13cefbe994c7c078ced46463b66ad6e401f72464c8`
- `app.asar` SHA-256：`3780e9f01c118ef2eaa98fcf4a190302af5893d1c7dde19065b0cad5b14000ee`
- 主程序 SHA-256：`221d5695ab9eb2263b9107e4a5bb3f5780adc35963530e322673d5535e8eeae5`

真实启动日志出现 `renderer-ready product=doraemon-workbench pet=doraemon` 与 `runtime-ready product=doraemon-workbench pet=doraemon`。启动后进程已停止。本轮新建的测试用户数据已移动到废纸篓 `~/.Trash/doraemon-workbench-phase63-20260901-1724`，未触碰现有桌宠用户数据。

## 证据边界

本轮没有执行 Windows installed mode；Windows 候选能力只可称“可构建/待 Windows 验收”。签名、公证、正式发布、商城、支付、DRM 与自动更新均未进入范围。
