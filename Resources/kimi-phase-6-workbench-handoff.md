# Kimi Phase 6 工作台设计交接

## 目标

Kimi 在 Phase 6.5 负责桌宠制作台的页面布局、视觉语言、组件状态和展示层实现。Codex 已先建立 React + TypeScript 壳层、项目契约、安全 IPC、版本化非覆盖存储与恢复能力。Kimi 的设计必须覆盖真实状态，不做只包含理想主流程的静态页面。

当前工作名为“桌宠制作台 / Desktop Pet Studio”。第一目标用户是内部制作人员和测试人员，第一验收平台是 macOS。正式品牌名尚未确定，不把工作名设计成不可替换的品牌资产。

## 页面清单

1. 欢迎与首次使用说明：解释素材要求、内部候选边界和主流程。
2. 项目首页：最近项目、新建项目、继续上次项目、复制为新版本。
3. 导入页：本地目录、ZIP、Petdex slug 三种入口及授权状态说明。
4. 检查结果页：通过、警告、阻断问题、中文原因与下一步动作。
5. 预览页：联系表、逐动作播放、真实桌宠启动/停止和预览状态。
6. 产品信息页：名称、版本、产品 ID、应用身份和目标平台。
7. 导出页：标准包、项目包、macOS/Windows 未签名候选及证据层级。
8. 任务中心：排队、运行、成功、失败、取消、中断和安全重试。
9. 项目历史与产物页：版本、时间、SHA-256、打开目录和证据说明。

Phase 6.1 当前只实现项目首页的空状态与恢复状态；其余页面按同一信息架构逐阶段接入。

## 字段规则

| 字段 | 规则 | 展示要求 |
| --- | --- | --- |
| 项目名称 | 去除首尾空格；1–80 个可见字符 | 常驻可见标签，不把 placeholder 当标签 |
| 项目 ID | 系统生成 `studio-YYYYMMDD-HHMMSS-xxxxxx` | 可在详情中复制，不允许用户编辑或作为路径输入 |
| 步骤 | `project/import/validate/preview/product/export` | 顺序固定；必须同时显示文本状态，不能只靠颜色 |
| 步骤状态 | `pending/active/completed/blocked` | 中文分别为待开始/当前/已完成/被阻断 |
| 任务状态 | `queued/running/succeeded/failed/cancelled/interrupted` | 运行和失败都要保留进度/证据入口 |
| 授权状态 | `unknown/internal-test/authorized` | 第三方素材不得因技术成功自动显示为可分发 |
| 候选平台状态 | source、packaged、installed 分层 | macOS 或静态构建成功不能显示为 Windows installed 通过 |

创建项目接口只接受 `{ name: string }`，renderer 不提交路径。接口结果统一为 `{ ok: true, value }` 或 `{ ok: false, error: { code, message } }`。模拟数据见 `Resources/phase-6-workbench-mock-data.json`。

## 状态矩阵

| 场景 | 必须展示 | 可执行动作 |
| --- | --- | --- |
| 启动加载 | 明确的读取状态，主内容不闪成空项目 | 等待，不重复提交 |
| 首次空状态 | 主流程说明、项目名称字段、原始资产不覆盖说明 | 新建项目 |
| 已有项目 | 最近项目、当前项目、六步进度、最后保存时间 | 打开项目、新建项目 |
| 创建中 | 提交按钮禁用，名称保留 | 等待完成 |
| 可恢复错误 | 中文原因、不会覆盖/丢失的说明 | 重试或返回修改 |
| 项目文件损坏 | 明确拒绝加载，不能伪装为空项目 | 查看其他项目、定位证据（后续） |
| 无网络 | 本地项目和已导入宠物仍可用 | 仅 slug 导入提示稍后重试 |
| 减少动态效果 | 无必须依赖动画才能理解的信息 | 遵守 `prefers-reduced-motion` |

所有表单都要有真实 label、键盘焦点、禁用状态和错误关联；窗口最低 920×620，常规检查尺寸为 920×620、1180×760 和 1440×900。中文长文案不得溢出或遮挡主要动作。

## 错误示例

- `INVALID_PROJECT_NAME`：项目名称应为 1 到 80 个可见字符。动作：返回输入框修改。
- `PROJECT_EXISTS`：同一版本已存在，现有内容没有被覆盖。动作：创建新版本或打开已有项目。
- `INVALID_PROJECT_FILE`：项目文件不完整或已被修改，工作台已拒绝加载。动作：查看其他项目；不要显示内部堆栈或路径。
- `PROJECT_NOT_FOUND`：项目已不存在或位置不可用。动作：刷新项目列表。
- `WORKBENCH_ERROR`：工作台暂时无法完成此操作。动作：安全重试；不暴露 Electron/Node 内部错误。

错误不是只用红色 toast 表示；阻断错误需要标题、原因、未受影响的数据范围和明确动作。

## 职责边界

Kimi 可以修改：

- `src/workbench/renderer/` 下的 React 展示层、样式、可访问性文案和纯展示状态。
- 必要的前端展示类型，但必须保持与 `Resources/phase-6-workbench-mock-data.json` 一致。

Kimi 不修改：

- `src/workbench/contracts.js`、`project-store.js`、`main.js`、`preload.js` 的契约、安全、文件或 IPC 行为。
- `src/main.js` 现有透明桌宠 runtime、导入安全逻辑、构建逻辑、产品配置和 NSIS 修复。
- 原始素材、历史候选、RETURN、批准图集、T7 证据或用户 Codex/Petdex 宠物目录。
- 不新增任意 IPC 通道、renderer Node 权限、任意路径读写、外部 URL、网络字体或遥测。

若视觉方案需要新数据或动作，先以字段/事件提案交给 Codex，由 Codex扩展契约并补测试后再接入。最终视觉可替换当前基础样式，但不能牺牲键盘操作、焦点可见性、文本对比度、窗口缩放或减少动态效果。
