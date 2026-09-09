# Kimi 独立开发任务书：Pet Studio Lite M1

你正在参加一次顺序盲测。请独立完成任务，不要读取 `/Users/jinke00001/Desktop/pet` 内的产品源码、历史实现、验收答案或未来的 `pet-codex-m1-*` 工作区。唯一允许从原项目读取的是本任务书目录中的文档。

## 1. 产品背景

最终产品面向个人自用：macOS 作为制作环境，Windows 作为优先交付平台。最终独立桌宠不得依赖 Petdex、Codex、VPN、Node.js 或 Python；用户应能解压后双击 EXE 使用。完整产品未来只保留：导入、检查、预览、配置、导出和桌宠基础互动。

本任务只是 M1，不要求完成整个产品。

## 2. 固定输入

- 仓库：`https://github.com/dylan-labs/nom-pet.git`
- 必须从提交 `10c7f136d942cc42ae5b2b4d1e3aa6d5994c455a` 开始。
- 在自己的分支 `kimi/pet-studio-lite-m1` 工作。
- 开工前记录 `git rev-parse HEAD` 和 `git status --short`。
- 先阅读仓库现有文档、配置、许可证和代码结构，沿用可用架构，不做无关重构。

## 3. M1 目标

把上游项目改造成一个完全离线、无账号和无 AI Token 要求的通用桌宠运行内核原型。它能从本地宠物包读取并验证 Petdex v1/v2 数据，在 macOS 开发环境中真实显示透明桌宠预览，并支持基础互动。

这是对未来 Windows 便携版运行内核的技术验证，不是 Windows 正式验收。

## 4. 必须交付

### A. 离线和通用化

- 默认启动路径不要求 Kimi、Codex、Petdex 登录、API Token、VPN或网络。
- 删除或绕开与本目标冲突的 Token/AI 设置入口和启动阻塞，但不要为减小工作量而隐藏错误。
- 核心模块不得写死某个角色名称、绝对路径或单个图集尺寸。

### B. Petdex 包读取与检查

- 支持目录形式的宠物包，至少包含 `pet.json` 与一张 PNG 或 WebP spritesheet。
- 支持 v1：8 列 × 9 行，单格 192×208，完整图集 1536×1872。
- 支持 v2：8 列 × 11 行，单格 192×208，完整图集 1536×2288。
- 自动识别 v1/v2；对缺文件、JSON 错误、尺寸错误、不支持版本给出清晰中文错误。
- 路径处理必须阻止包目录逃逸或任意文件读取。
- 不原地修改输入宠物包。
- 为上述规则提供自动测试。

### C. 真实预览和基础互动

- 使用本地 fixture 或程序生成的最小合法 fixture，实际启动透明、无边框、置顶桌宠窗口。
- 至少提供：拖动移动、单击触发可见动作变化、右键或托盘菜单调整缩放与退出。
- 保留渲染器隔离：main process 管理 Electron API；preload 只暴露最小且校验过的桥；renderer 不直接获得 Node 权限。
- 预览错误必须可见，不得静默白屏或自动假装成功。

### D. 工程交付

- 提供清晰的安装、开发启动、测试命令。
- 运行与本任务相关的测试、类型检查、lint 和构建；若仓库没有某项，说明事实，不要伪造。
- 对真实 Electron 窗口做一次 macOS 人工检查，并记录观察结果。
- 提交至少一个清晰、原子的 git commit；不要推送远程。
- 在仓库根目录新增 `AGENT-REPORT.md` 和 `RUN-METRICS.json`。

`AGENT-REPORT.md` 必须包含：

1. 实际完成内容。
2. 关键设计选择及理由。
3. 修改文件清单。
4. 执行过的验证命令及真实结果。
5. 人工预览观察。
6. 未完成、未验证和风险；明确写出 Windows 仍未验收。
7. 如果继续做 M2，最小下一步是什么。
8. 使用过的关键外部资料链接。

`RUN-METRICS.json` 必须是有效 JSON，并至少包含：

```json
{
  "agent": "Kimi Code",
  "agentVersion": "",
  "model": "",
  "baselineCommit": "10c7f136d942cc42ae5b2b4d1e3aa6d5994c455a",
  "startedAt": "",
  "finishedAt": "",
  "userQuestions": 0,
  "permissionPrompts": 0,
  "commandsRun": 0,
  "testRuns": 0,
  "failedTestRuns": 0,
  "commits": [],
  "knownLimitations": []
}
```

数字必须按本次会话的实际情况尽力记录；不确定就注明估算，不得编造精确数字。

## 5. 明确不做

- 不做完整 Studio 的导入向导、配置表单和导出器。
- 不做 Windows EXE、NSIS 安装器、签名、自动更新和发布。
- 不做客户素材生成、AI 对话、语音、商城、DRM、遥测或账号。
- 不继续原项目的 Phase 6 60 门验收。
- 不修改 `/Users/jinke00001/Desktop/pet`。

## 6. 完成定义

只有同时满足以下条件才可以说 M1 完成：

- 从固定提交开始且工作区可追溯。
- v1/v2 合法包通过，典型非法包被自动测试拒绝。
- 本地 fixture 能在真实 Electron 窗口中预览。
- 拖动、动作变化、缩放和退出至少各人工检查一次。
- 关键自动验证通过，失败项如实记录。
- 无 Token、账号或网络启动阻塞。
- 报告、指标和 git commit 完整。

如果受环境限制无法完成真实预览或某项验证，请交付当前可复现状态，明确写成“未验证”，不要降低标准或伪造通过。

