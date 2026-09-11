# Petdex 命令导入任务

- [x] 命令解析与固定进程参数
  - Acceptance：仅接受官方安装命令形态，拒绝注入与额外参数
  - Verify：`npm run test:petdex`
- [x] 候选下载、校验与确认导入 IPC
  - Acceptance：确认前无新项目，确认后导入只读副本
  - Verify：功能测试与 `npm run typecheck`
- [x] 导入页交互
  - Acceptance：状态完整、候选信息可预览、可取消或确认
  - Verify：`npm run build` 与实际 Electron 窗口检查
- [x] 全量回归
  - Acceptance：已有导入/预览/配置/导出能力不回退
  - Verify：`npm test`
