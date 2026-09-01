# Phase 6.4 工作台证据

Phase 6.4 已完成受控后台任务、恢复、离线隔离、项目复制和安全产物定位。

## 任务与恢复

- 状态：`queued`、`running`、`succeeded`、`failed`、`cancelled`、`interrupted`。
- 本地目录/ZIP 选择后仅把不透明 selection token 写入 job；绝对路径只存在主进程私有内存，不返回 renderer、不进入 job 历史。
- Petdex slug、项目包导出和双平台候选构建均走后台任务；进度、步骤、取消、失败原因和重试在任务中心展示。
- 同一项目最多一个活跃任务；项目切换取消原项目任务，工作台退出取消全部活跃任务并停止预览。
- 运行中候选取消会终止子进程，删除 partial `artifacts/` 和 `generated/`，保留 builder.log、build config 与 `build-cancelled.json`。
- 启动恢复从普通项目读取中移出，只在工作台启动显式执行一次；轮询不会把真实运行任务误记为 interrupted。
- 失败、取消或中断重试创建新 job；原 job 和失败/取消证据不覆盖。

## 在线、历史与产物

- Petdex slug 严格使用小写 kebab-case，继续复用 allowlist、限额、重定向和隔离下载适配器。
- 网络失败保持最近成功导入、本地目录/ZIP、已有预览和项目状态不变；界面明确说明仅 Petdex 操作需要网络。
- “复制为新版本”只复制当前可恢复项目状态、产品配置和最近标准包，不复制历史 job/候选；递归拒绝符号链接和特殊文件。
- “在 Finder 中定位”只从 renderer 接收项目 ID 与 artifact ID，主进程验证项目归属后定位，不返回绝对路径。

## 自动验证

- 覆盖任务结算后取消竞态、并发拒绝、退出清理、轮询不误中断、显式启动恢复、Petdex 离线隔离、项目复制、符号链接拒绝、路径不返回和取消证据清理。
- `npm test`、`npm run studio:typecheck`、`npm run studio:build`、`npm run lint`、`npm run source:preflight` 与 `git diff --check` 在 checkpoint 前执行。

## 边界

普通 `npm run pet -- <selector>`、五个现有宠物、用户宠物目录、历史候选和 Phase 1–6.3 证据未修改。网络失败不被吞掉；Windows installed mode 仍需外部验收。
