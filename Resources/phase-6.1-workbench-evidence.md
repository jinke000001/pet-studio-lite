# Phase 6.1 桌宠制作台基础证据

## 完成范围

- 新增制作项目、六步状态、任务状态、错误和产物契约。
- 新增版本化、非覆盖的项目存储：创建、列出、打开、最近项目恢复、原子 JSON 写入和篡改拒绝。
- 新增独立 Electron 工作台入口 `npm run studio`；现有透明桌宠 `src/main.js` 与 `npm run pet -- <selector>` 不变。
- 新增 React 19.2.8 + TypeScript 7.0.2 + Vite 8.2.2 工作台壳层，包含空状态、项目创建、历史项目、六步进度、加载/操作错误/致命错误状态。
- 新增 Kimi 页面清单、字段规则、状态矩阵、错误示例、职责边界和契约化模拟数据。

## 安全与保留边界

- BrowserWindow：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`。
- preload 只暴露 `getBootstrap/createProject/openProject`，没有通用 `invoke`、`send` 或文件接口。
- 主进程校验 IPC sender 的精确本地 renderer URL；输入在契约/项目 ID 边界校验，renderer 不能提交路径。
- 项目 ID 不能包含绝对路径、父目录或分隔符；工作区根、`projects/` 和单项目目录拒绝符号链接。
- 项目文件限制为普通非符号链接 JSON 且最大 1 MiB；内容、身份或状态不合法时拒绝恢复。
- 现有五个桌宠、产品配置、导入/构建模块、历史候选、原始素材、批准图集、RETURN、T7 和用户 Codex/Petdex 宠物目录未修改。

## 自动验证

2026-09-01 在 macOS / Node.js 24.14.0 执行：

| 命令 | 结果 |
| --- | --- |
| `npm test` | 91/91 通过，0 fail；原 77 项保持通过，新增 14 项契约/存储/壳层/交接测试 |
| `npm run studio:typecheck` | 通过 |
| `npm run studio:build` | 通过；JS 196.25 kB / gzip 62.32 kB，CSS 4.97 kB / gzip 1.74 kB |
| `npm run lint` | 通过 |
| `npm run source:preflight` | 通过；Electron 43.4.1 可执行文件存在 |
| `npm audit` | `found 0 vulnerabilities` |

## macOS 真实运行验证

- 使用隔离的 `/tmp/pet-studio-final.tVQXTh` 作为 `DESKTOP_PET_STUDIO_USER_DATA`，没有写入真实用户工作台目录。
- Electron 真实窗口启动并输出 `studio-ready`；初始空状态、项目名称标签、禁用/启用按钮和最近项目空状态均可由 macOS 可访问性树读取。
- 创建“Phase 6.1 最终实测”成功；界面显示“已安全保存”、六步流程，`制作项目=当前`，其余五步为“待开始”。
- 在已打开项目中点击“新建制作项目”可重新进入创建表单并自动聚焦名称字段，修复了早期壳层中按钮无动作的问题。
- 完整终止 Electron 进程后用同一隔离目录重启，自动恢复“Phase 6.1 最终实测”和最近项目记录。
- 1180×760 实际窗口未见文字溢出、元素重叠或控件不可达；键盘焦点、真实 label、live region 和 `prefers-reduced-motion` 已存在。

## 审查修正

五轴审查发现并已修复：

1. 新项目 `activeStep=project` 但步骤状态曾为 `pending`；现统一为 `project=active`。
2. 单项目目录已拒绝符号链接，但 `projects/` 根仍可被替换；现工作区根、项目根和单项目目录逐层检查。
3. 操作错误曾替换整个主内容；现区分可关闭的操作错误和致命启动错误，用户可保留输入直接重试。
4. 已打开项目时“新建制作项目”曾无法找到未渲染的输入框；现显式切换创建状态并自动聚焦。

当前审查无剩余 Critical 或 Required 项。

## 证据边界与下一门

- 本轮只证明 source-mode 工作台壳层、项目创建和重启恢复，不是打包后的工作台候选。
- 尚未接入目录/ZIP 导入、校验、联系表、真实桌宠预览、产品配置、后台构建或导出；这些属于 Phase 6.2–6.4。
- Kimi 尚未执行 Phase 6.5 最终视觉收口；当前样式是可运行的工程基础。
- 没有执行 Windows 工作台 installed-mode、DPI、卸载或重装；该门保留到 Phase 6.6，不能由本轮 macOS 结果推断。
