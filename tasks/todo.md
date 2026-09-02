# 通用桌宠工作流任务清单

## 当前检查点

- [x] Phase 0 只读盘点完成。
- [x] Wukong 0.1.9 测试 15/15、lint 和四个关键哈希通过。
- [x] v1 `doraemon` 与 v2 `dai`、`jokebear-codexpet` 样本就绪。
- [x] PRD、项目规则和 MEMORY 已建立。
- [x] 用户确认开始 Phase 1。
- [x] 用户于 2026-08-27 确认开始 Phase 2。
- [x] 用户于 2026-08-27 确认 Phase 3 PRD 与默认构建方案。
- [x] 用户于 2026-08-27 确认 Phase 4 PRD，并批准无服装、无道具的 `307322...jpg` 作为小福猩身份基准。
- [x] 用户于 2026-08-28 确认 Phase 4 按 Petdex v1 收尾，不制作四基准方向和 16 个注视方向。
- [x] 2026-08-31 小福猩 0.1.5 Windows 安装生命周期验收通过，Phase 4 Checkpoint 4 关闭。

## Phase 1：共享运行内核

- [x] 创建独立代码基线，不修改 Wukong 交付目录。
- [x] 定义统一宠物包与产品配置。
- [x] 参数化图集、状态、名称、图标和文案。
- [x] 迁移并验证透明窗口、拖动、缩放、托盘和待机行为。
- [x] 完成 v1 状态回退与 v2 完整状态支持。
- [x] 提供真实 macOS 演示和小尺寸视觉证据。

## Phase 2：Petdex 导入

- [x] 2.1 导入契约、错误代码、版本化目录和安全限额。
- [x] 2.2 本地目录导入、不可变来源快照和失败清理。
- [x] 2.3 安全 ZIP 导入与恶意输入拒绝。
- [x] 2.4 v1/v2 自动识别、完整校验和标准化。
- [x] 2.5 联系表、动作预览和导入报告。
- [x] 2.6 内部 slug 下载适配器。
- [x] 2.7 Doraemon、阿岱和 JokeBear 端到端及离线运行验收。

## Phase 3：单宠导出

- [x] 3.1 独立产品配置、应用身份和跨产品冲突检查。
- [x] 3.2 版本化、非覆盖的单宠资源装配与构建工厂。
- [x] 3.3 Windows x64 win-unpacked 与未签名 NSIS 候选构建。
- [x] 3.4 macOS Apple Silicon 未签名 `.app` 候选构建。
- [x] 3.5 Wukong、Doraemon、阿岱三个主样本和 JokeBear 额外样本隔离验证。
- [x] 3.6 版本化清单、SHA-256 和交付说明。
- [x] 3.7a 经授权整理 Task 3.7 T7 验收交付：受控源码、历史候选审计、PRD、Windows 提示词、报告模板、工具和 36 项输入哈希均已就绪。
- [x] 3.7b Kimi 已在 Windows 原生构建四套新候选并完成 source、win-unpacked、installed mode、卸载/重装、100%/125%/150% 冷启动和真实动态 DPI 验收；T7 回传 1352/1352 哈希复核通过。
- [ ] 网络观察项：Windows 构建机直连 GitHub 曾出现 `ETIMEDOUT 20.205.243.166:443`；本轮命令级镜像重试已成功，先保留，不修改永久 npm 配置、系统代理或网络设置。

Checkpoint 3 与 Task 3.7 Windows 实机验收均已通过；四套产品保持未签名内部候选，Doraemon 与 JokeBear 仅用于内部兼容测试。

## Phase 4：客户素材制作

- [x] 4.1 五张原始素材登记、哈希与角色身份确认。
- [x] 4.2 准备版本化制作运行目录。（历史目录名保留 v2，不覆盖；最终包按 v1 输出）
- [x] 4.3 生成并由用户确认小福猩主视觉基准。
- [x] 4.4 制作、逐行验证并确认 9 种标准动作。（九行均已通过结构、独立视觉复核和用户确认；原独立左跑及失败镜像证据均已保留，批准清单已锁定）
- [x] 4.5 范围复核：四基准方向和 16 个注视方向不属于当前目标，按用户确认取消。
- [x] 4.6 组装 `1536×1872` v1 标准包和完整 QA 证据。
- [x] 4.7 通过通用运行器做 source-mode 与 macOS 真实窗口验证。
- [x] 4.8 通过 Phase 3 工厂生成小福猩双平台未签名候选。
- [x] 4.9a 生成并验证 T7 Windows 验收交付、PRD、执行提示词、报告模板和全量哈希。
- [x] 4.9b 检查 0.1.0 Windows 回传失败并完成 0.1.1 针对性修复、回归和本机候选验证。
- [x] 4.9c 检查首轮 0.1.1 回传，修复 Windows ASAR 嵌套路径提取，并生成通过 76/76 和双平台静态校验的新候选。
- [x] 4.9d 经用户确认后，将修复后的 0.1.1 非覆盖复验包写入 T7，并完成 90/90 哈希、ZIP UTF-8、隔离解压和零元数据校验。
- [x] 4.9e 检查 0.1.1 第二轮回传，定位 source 动态 150% 白窗/裁切，完成 0.1.2 动态 DPI 最小修复、防复发测试和双平台候选验证。
- [x] 4.9f 将 0.1.2 非覆盖复验包写入 T7，并完成 93/93 哈希、ZIP UTF-8、隔离解压和零元数据校验。
- [x] 4.9f-1 复核 2026-08-30 三轮 Windows 回传：全部因 `npm start` 起错产品、截图未落盘等问题判“验收对象错误”，不能作为小福猩缺陷证据；生成非覆盖 Kimi Code 执行版 `xiaofuxing-v1-windows-recheck-0.1.2-20260830-03-kimi/`（5/5 哈希、零元数据）。
- [x] 4.9g 正确产品 source 与 win-unpacked 的冷启动/动态 DPI 通过；覆盖安装冲突审计确认 NSIS 检测误判，完成 0.1.3 精确主程序路径检测、77/77 和双平台候选验证。
- [x] 4.9g-1 将 0.1.3 非覆盖安装生命周期复验包写入 T7，完成 source ZIP UTF-8/隔离解压、108/108 输入哈希和递归零元数据校验。
- [x] 4.9h 已终止：0.1.3 覆盖安装仍失败，本门由后续 4.9j/4.9k 修复与验收取代。
- [x] 4.9h-1 复核 0.1.3 Windows 回传：覆盖安装再弹“无法关闭”，确诊为 electron-builder `uninstallOldVersion` 重试环（旧 0.1.0 卸载器静默执行从未成功），非检测误判；完成 0.1.4 修复（DetailPrint 探针、旧卸载器预检宏、`customUnInstallCheck`）、77/77、lint、0 漏洞、真实 NSIS 编译、双平台候选与 Mac packaged runtime 验证。
- [x] 4.9i 组装并搬运 0.1.4 非覆盖交接包：验收顺序重排（官方卸载 0.1.0 → 干净安装 → installed mode → 同版本覆盖 → 官方卸载 → 干净重装），89/89 哈希复核通过；该交付随后按 4.9j-2 就地更新为 0.1.5。
- [x] 4.9j 已终止：0.1.4 同版本覆盖仍失败，H1 已否证并确诊为卸载器 CRC 构建期损坏，本门由 4.9k 的 0.1.5 验收取代。
- [x] 4.9j-1 复核 0.1.4 Windows 复验回传：门 F 复败，决定性证据为卸载器直启 CRC 自检失败（哈希未变、/NCRC 可用、Defender 零事件）；根因定位为 electron-builder macOS `UninstallerReader` 拼接路径不重算 CRC（上游 #4875），本机按 NSIS `loadHeaders` 算法静态复现；完成 0.1.5 修复（卸载器 `CRCCheck off`、版本 0.1.5）、77/77、lint、0 漏洞、真实 NSIS 编译、双平台候选、Mac packaged runtime 与静态 CRC 验收。
- [x] 4.9j-2 将 0.1.5 修复落回仓库（nsh/config/test/tasks 四处）并就地更新 T7 交付为 0.1.5：source ZIP、win-unpacked、安装包、证据文档与 PRD/提示词/报告模板全部刷新，91/91 哈希复核通过。
- [x] 4.9k Windows 0.1.5 安装生命周期验收通过：按计划用 `/NCRC` 卸载已知 CRC 损坏的 0.1.4，随后完成 0.1.5 干净安装、installed mode 全量、100%/125%/150% 冷启动与动态 DPI、三次同版本覆盖、0.1.5 官方卸载（不带 `/NCRC`）及同包干净重装；514/514 回传哈希复核通过，系统缩放恢复 100%，最终精确主程序进程数 0。本轮验收门关闭，0.1.5 仍为未签名内部候选。
- [x] 4.9l 将 0.1.5 Windows RETURN 非覆盖归档到 `release/windows-recheck/xiaofuxing-v1-windows-recheck-0.1.5-20260831-01/`：515 个文件与 T7 逐字节一致，清单内 514/514 通过，递归元数据为 0；Phase 4 Checkpoint 4 关闭。

## Phase 5：项目收尾

- [x] 5.1 用户确认收尾 PRD：只做状态统一、最终证据索引和轻量归档策略；不进入商业发布、新功能或网络配置修改。
- [x] 5.2 统一 README、计划、任务清单与 MEMORY 的当前完成状态，保留历史证据语境。
- [x] 5.3 新增最终项目收尾报告，记录最终能力、边界、精确证据路径、哈希和网络观察项。
- [x] 5.4 保留 T7 的 3.9 GiB Task 3.7 完整 RETURN，本机只建立轻量索引，不复制大体积候选。
- [x] 5.5 Checkpoint 5A 与完整回归通过：测试 77/77、lint、source preflight 和 npm audit 全部通过；audit 前两次网络失败保留为过程证据，第三次未改配置重试返回 0 vulnerabilities。
- [x] 5.6 最终 diff 五轴审查无阻断项；用户授权只创建一个 Git 内部基线提交，不创建标签、不合并分支、不推送远端。

商业发布体系暂缓，不属于当前任务清单。

## Phase 6：桌宠制作台 MVP

- [x] 用户确认 Phase 6 PRD 与目标模式；Codex 先执行 Phase 6.1，Kimi 在 Phase 6.5 负责视觉与展示层。
- [x] 6.1a 定义项目、步骤、任务、错误和产物契约。
- [x] 6.1b 建立版本化非覆盖项目存储，并验证创建、列出、打开和关闭后恢复。
- [x] 6.1c 新增 React + TypeScript 工作台壳层及独立、安全的 Electron 入口与最小 IPC。
- [x] 6.1d 生成 Kimi 页面/字段/状态/错误/模拟数据交接包。
- [x] 6.1e 通过新增测试、原 77 项回归、lint、前端构建和 macOS 真实启动检查。
- [x] Checkpoint 6.1 用户审查工作台基础，并统一授权继续 Phase 6.2–6.6。

### Phase 6.2：导入、检查与预览闭环

- [x] 6.2a 落盘最小 PRD，扩展兼容的项目/导入/检查/预览契约与存储测试。
- [x] 6.2b 接入主进程目录/ZIP 选择、授权状态、安全来源标识和现有导入管线。
- [x] 6.2c 保存最近成功导入，映射中文通过/警告/阻断，失败不覆盖成功状态。
- [x] 6.2d 安全展示联系表、动作动画和宠物能力，不向 renderer 暴露路径。
- [x] 6.2e 复用 runtime 启动/停止单一真实透明桌宠，并覆盖切换/退出/异常清理。
- [x] 6.2f 完成自动回归、macOS 真实闭环、审查、证据和本地 checkpoint。

Checkpoint 6.2 已完成；证据：`Resources/phase-6.2-workbench-evidence.md`。继续进入 6.3。

### Phase 6.3：产品配置与导出

- [x] 6.3a 产品表单、安全默认值、格式/保留字/身份/历史冲突检查与持久化。
- [x] 6.3b 非覆盖导出标准包和可恢复项目包，记录 manifest、来源、时间与 SHA-256。
- [x] 6.3c 复用包工厂导出 macOS/Windows 未签名候选并保持 source/packaged/installed 分层。
- [x] 6.3d 真实工作台无终端导出验证、审查、证据和本地 checkpoint。

Checkpoint 6.3 已完成；macOS 自定义 Doraemon 候选真实启动通过，Windows installed mode 保持外部验收边界。

### Phase 6.4：后台任务与恢复

- [x] 6.4a 建立 queued/running/succeeded/failed/cancelled/interrupted 持久任务与受控 worker。
- [x] 6.4b 接入导入/构建/导出进度、取消清理、失败证据、安全重试和重启中断识别。
- [x] 6.4c 增加任务历史、产物定位、项目复制、并发/重复请求/切换/退出控制。
- [x] 6.4d 接入 Petdex slug 与在线/离线状态，本地能力不受网络失败影响。
- [x] 6.4e 完成响应性、恢复、清理、审查、证据和本地 checkpoint。

Checkpoint 6.4 已完成；任务恢复只在启动时执行一次，轮询不会误中断运行任务。

### Phase 6.5：Kimi 视觉收口与 Codex 集成

- [x] 6.5a 在 6.4 工作区干净后更新真实状态交接包并调用本机 Kimi Code。
- [x] 6.5b 审查 Kimi diff，确认只修改 renderer 展示层并接入真实数据。
- [x] 6.5c 覆盖主流程页面与空/加载/任务/错误/离线/恢复状态。
- [x] 6.5d 完成键盘、焦点、label、错误关联、reduced-motion 和 920 宽度响应式收口。
- [x] 6.5e 完成审查、证据和本地 checkpoint；Kimi 会话 rate limit 不影响已生成改动，Codex 独立复验通过。

### Phase 6.6：质量门与可运行软件交付

- [x] 6.6a-1 只读复核 T7 06 Windows 回传，确认 132/132 基线中的 3 项失败均为 POSIX 测试路径夹具不可移植；建立 `tasks/phase-6-workbench-windows-path-repair-plan.md`。
- [x] 6.6a-2 修复两个工作台测试夹具并通过相关测试 8/8 与全量 `npm test` 132/132。
- [x] 6.6a-3 完成 typecheck、build、lint、source preflight、audit、diff check，并同步证据与 MEMORY。
- [ ] 6.6a 完整自动回归和隔离 macOS 主流程、错误、取消、离线、重复与恢复验证。
- [x] 6.6b 生成并真实启动可操作、可恢复、可导出的 macOS 工作台候选。
- [x] 6.6c 建立非覆盖 Windows 验收交接包、PRD、提示词、模板、脚本与 checksums。
- [ ] 6.6d 完成候选/manifest/哈希/包工厂检查和最终多轴代码审查，修复全部 Critical/Required。
- [x] 6.6e 生成新的非覆盖 Windows 复验交接包并完成输入哈希、ZIP UTF-8/元数据/符号链接校验。
- [x] 6.6f 同步 MEMORY、计划、待办、证据与最终报告，创建本地 checkpoint（`a93a2e8` 修复、`792113a`/`fb3967a` 证据文档），确认工作区干净；Windows installed mode 等待新 RETURN。
- [x] 6.6g-1 只读复核 T7 `-01` 回传，确诊 Windows 对已有符号链接 `openSync 'wx'` 返回 EPERM 导致实例锁不安全错误逃逸；建立 `tasks/phase-6-workbench-instance-lock-windows-repair-plan.md`。
- [x] 6.6g-2 修复 `src/workbench/instance-lock.js`：EPERM 仅在 lstat 证明不安全对象时转换受控错误，其余原样抛出；新增 4 个确定性 EPERM 回归测试，聚焦 6/6、全量 136/136 与完整质量门通过。
- [x] 6.6g-3 生成新 macOS 候选 `candidate-20260902020633351` 并完成隔离 packaged smoke（`studio-ready`/`renderer-ready`，进程清零），建立非覆盖仓库内交接包 `release/handoff/phase-6-workbench-windows-recheck-20260902-02/`（6/6 输入哈希、RETURN 为空）；未写入 T7，Windows installed mode 等待新 RETURN。

Phase 6 不改变商业发布体系暂缓结论；签名、公证、商城、支付、DRM、自动更新和正式发布仍不在当前范围。
- [x] 6.6h 实例锁深度修复（-03 轮）：linkSync 原子发布 + token 协议、三轮对抗审查、184/184 与全部质量门、候选 `candidate-20260902044902114` 隔离 smoke、非覆盖交接 `release/handoff/phase-6-workbench-windows-recheck-20260902-03/`（6/6 哈希、未写 T7）；提交 `dfb2cde`。
- [x] 6.6i `-03` Windows 全量复验取消：该交接已被后续修复取代，不再作为验收输入。
- [x] 6.6h-复审修复：原生 Electron 单实例权威锁、三进程暂停竞态回归、main.js 拒锁真实替身验证已完成；早期“当前未提交”描述已由后续 checkpoint 更正。
- [x] 6.6h-复审收口：checkpoint `75b3021`、macOS 候选 `candidate-20260902064710422` 和 `release/handoff/phase-6-workbench-windows-recheck-20260902-04/` 已生成；未写入 T7，Windows RETURN 待实机验收。
- [x] 6.6i 最终本地收口记录：代码与记录 checkpoint 已完成；候选/交接以最新 manifest 与 SOURCE-BASELINE 绑定的最终提交为准，6/6 哈希通过，未写入 T7。
- [x] 6.6j Windows 交接纠偏：`-08` 因错误全量提交哈希及旧 `-03` 文档复用而作废；新建 `phase-6-workbench-windows-recheck-20260902-09/`，更新为聚焦 76/76、全量 200/200 与 Electron 原生权威锁，并完成本地/T7 6/6 哈希和逐字节一致性校验。
- [ ] 6.6k `-09` Windows 全量复验：等待真实 Windows RETURN，通过机器验证器和 Mac 侧独立哈希复核后再关闭 Phase 6.6。
