# 项目 MEMORY 摘要

## 当前目标

- 建立共享桌宠运行内核，以配置和宠物包驱动多个独立桌宠。
- 支持 Petdex v1/v2 移植；v1 样本为 `doraemon`，v2 样本为 `dai` 和 `jokebear-codexpet`。
- 最后接入客户素材制作：至少一张清晰、完整、无遮挡的全身正面图，允许 AI 辅助，内部制作并分阶段由客户确认。
- 商业发布体系暂缓；当前产物只作为内部测试版或候选版。

## 当前基线

- Wukong 0.1.9 是运行体验参考基线，源码快照和 Windows 交付证据位于 `Wukong-Windows-Desktop-Pet-Handoff-20260731/Windows-Release-0.1.9-20260801/`。
- Wukong 0.1.9 自动测试 15/15、lint 和四个关键交付哈希已在 macOS 只读复核通过；历史 Windows 报告记录 source、win-unpacked、installed mode 通过，但只有 100% DPI。
- Wukong 代码仍把名称、图集路径、托盘文案和部分动作写死，不能直接作为通用运行器。

## Phase 1 当前状态

- 已建立独立 Git 项目和 `feature/shared-runtime` 分支，共享内核使用 Electron 43.4.1。
- 已实现统一 v1/v2 宠物包、产品配置、安全产品选择、WebP 尺寸/alpha 检查、透明窗口、动画、点击、拖动、托盘、缩放和长待机。
- Wukong、Doraemon、Dai、JokeBear 已用同一核心在 macOS source-mode 真实启动；自动测试 20/20、lint 和 npm audit 通过。
- 2026-08-27 用户完成真实效果测试并反馈比较满意，Checkpoint 1 已关闭；Windows 与安装包仍不在本阶段证明范围内。

## Phase 2 当前状态

- 2026-08-27 Phase 2 已完成：目录、ZIP、Petdex slug 导入与安全校验、来源快照、标准包、哈希报告、联系表和动作预览均已实现。
- 自动测试 47/47、lint、npm audit、三样本原始哈希复核、Chromium 动作预览和 Electron source-mode 启动通过；Checkpoint 2 已关闭。
- 实施分支为 `feature/pet-importer`；下一阶段为 Phase 3 单宠安装包工厂，尚未开始，也没有新的 Windows 验收或安装包结论。

## Phase 3 当前状态

- 2026-08-27 Phase 3 候选构建与 Mac 侧验证完成，实施分支为 `feature/package-factory`，Checkpoint 3 已通过。
- Wukong、Doraemon、阿岱和 JokeBear 均生成 Windows x64 `win-unpacked`、未签名 NSIS 候选安装包和 macOS Apple Silicon 未签名 `.app`；四个 macOS 应用真实启动通过。
- 自动测试 64/64、lint、npm audit、单宠 ASAR 隔离、来源/包内图集哈希和 20 个最终关键产物重新哈希通过。
- Windows 真实安装、卸载、重装和 100%/125%/150% DPI 验收仍需另行授权，Mac 侧结果不能替代该结论。

## Phase 4 当前状态

- 2026-08-27 用户确认 Phase 4 PRD，实施分支为 `feature/xiaofuxing-v2`。
- 五张小福猩素材已登记；无服装、无道具的正面完整全身图锁定为唯一身份基准，其余图片只提供姿势、情绪和侧面结构参考。
- 当前正在准备版本化 v2 制作运行目录；授权状态暂记 `internal-test`，不写入或覆盖用户 Codex/Petdex 宠物目录。
- Windows 正式验收顺延到 Phase 4 完成后统一执行，候选与正式验收状态继续分开。

## 文件索引

- `决策点.md`：已确认的产品、架构和阶段决策。
- `事实.md`：基线、测试样本、哈希和验证事实。
- `待办.md`：当前未完成事项和阶段检查点。
- `../Resources/phase-0-baseline.md`：Phase 0 只读盘点证据。
- `../Resources/phase-1-macos-evidence.md`：Phase 1 自动化、真实窗口和证据边界。
- `../Resources/phase-2-import-evidence.md`：Phase 2 导入安全、三样本哈希、视觉与运行证据。
- `../Resources/phase-3-package-evidence.md`：Phase 3 四产品候选、安装包哈希、ASAR 隔离、Mac 运行与 Windows 边界证据。
- `../Resources/xiaofuxing-source-manifest.md`：Phase 4 小福猩五张原始素材、哈希、身份基准与使用边界。
- `../tasks/plan.md`：正式 PRD 与实施计划。
- `../tasks/todo.md`：可执行任务清单。
