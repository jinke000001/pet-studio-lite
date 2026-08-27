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
- Checkpoint 1 尚需用户手动确认真实拖动、托盘缩放、显示/隐藏和小尺寸视觉效果；Windows 与安装包不在本阶段证明范围内。

## 文件索引

- `决策点.md`：已确认的产品、架构和阶段决策。
- `事实.md`：基线、测试样本、哈希和验证事实。
- `待办.md`：当前未完成事项和阶段检查点。
- `../Resources/phase-0-baseline.md`：Phase 0 只读盘点证据。
- `../Resources/phase-1-macos-evidence.md`：Phase 1 自动化、真实窗口和证据边界。
- `../tasks/plan.md`：正式 PRD 与实施计划。
- `../tasks/todo.md`：可执行任务清单。
