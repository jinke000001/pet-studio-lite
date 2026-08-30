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
- Codex 主视觉曾获确认；首版九动作因待机手部虚影、左右跑动姿势堆叠、失败动作身份漂移和等待动作手指结构问题未获确认。2026-08-28 完成非覆盖修正版后，用户先确认七个非方向动作，随后以三段跑步 GIF 为参考确认新的 `running-right`。独立左跑因腿部不流畅被保留为历史候选，活动左跑改为八张已确认右跑帧的逐帧水平镜像并获用户确认。九种标准动作现已全部通过用户确认；批准清单位于 `runs/phase-4-xiaofuxing-v2-codex-running-ref-20260828-01/qa/standard-actions-approval.json`。用户随后确认只对齐 Petdex 网站宠物核心九状态功能，小福猩按 8×9、1536×1872 的 v1 标准包收尾，不制作四基准方向和 16 注视方向；运行器仍保留 v2 兼容。Kimi 独立候选仍保持隔离。授权状态暂记 `internal-test`，不写入或覆盖用户 Codex/Petdex 宠物目录。
- 小福猩 v1 标准包、source-mode、macOS `.app` 和 Windows x64 `win-unpacked`/未签名 NSIS 候选已完成；证据位于 `Resources/xiaofuxing-v1-final-evidence.md`。Windows 正式验收仍未执行，候选与正式验收状态继续分开。
- 0.1.0 Windows 回传已检查：输入与回传哈希通过，但 source 路径兼容/lint/Electron 二进制门、150% 冷启动、动态 DPI 和官方卸载失败。首轮 0.1.1 复验暴露并修复 Windows ASAR 嵌套路径问题。第二轮 0.1.1 在 Windows 通过 76/76 与 150% 冷启动，但 source 真实动态 `100% -> 125% -> 150%` 在 150% 出现白窗和裁切。0.1.2 已移除动态 DPI 路径的临时边界脉冲、增加诊断和防复发测试；完整回归、Mac source/packaged runtime 和新双平台候选通过，批准素材哈希不变。新 T7 非覆盖复验包 `xiaofuxing-v1-windows-recheck-0.1.2-20260830-01/` 已完成 93/93 哈希、ZIP UTF-8、隔离解压和零元数据校验；Windows 0.1.2 动态 DPI、win-unpacked、installed、覆盖修复、卸载和重装仍待实机复验。
- 0.1.2 Windows 回传经 Mac 只读复核后不能作为小福猩代码缺陷证据：受控重试窗口标题明确为 `Wukong Desktop Pet`，因为 `npm start` 默认选择 Wukong；回传还存在目标显示器/DPI 不一致、截图未落盘、缺少小福猩产品日志以及进程清理结论冲突。原 Windows 结论仍为“不通过/未完成”，但当前不进入代码修复。已按用户确认建立非覆盖 T7 流程修正版 `xiaofuxing-v1-windows-recheck-0.1.2-20260830-02-docfix/`，强制 `npm run pet -- xiaofuxing`、产品身份日志门、同一显示器缩放证据、截图落盘、精确进程树与全量回传哈希；5/5 文档哈希通过，`checksums.sha256` SHA-256 为 `1b0cbae81f2a5d1bb1375398e33c106eb019707fcee186a658a6474b77a0a3ea`，元数据为 0；旧交付和旧 RETURN 保持不变。
- 2026-08-30 第三轮 “fixed-140521” 回传经 Mac 只读复核仍判“验收对象错误”：`source.out.log` 明确记录 `npm start`，回传错放 `-01/RETURN/`，`screenshots/` 为空，无 `returned-checksums.sha256`，结束时 `LogPixels=144` 未恢复；其“125% 白区/裁切失败”不能作为小福猩缺陷证据。经用户确认，建立非覆盖 Kimi Code 执行版 `xiaofuxing-v1-windows-recheck-0.1.2-20260830-03-kimi/`：验收门与 docfix 一致，新增执行前五项自检（`logs/00-preflight-selfcheck.log`）和 `capture-screenshot.ps1` 脚本化截图落盘（全屏 + 窗口局部），回传路径改为 `-03-kimi/RETURN/windows-recheck-0.1.2-kimi-<ts>/`；5/5 哈希通过、元数据为 0。
- 最新正确产品回传中，source 与 win-unpacked 三档冷启动及真实动态 DPI 通过；白色区域确认是透明宠物窗口叠在白色 Codex/设置窗口上的截图背景。`0.1.0 -> 0.1.2` 覆盖安装被“无法关闭”阻断；后续冲突审计在弹窗保持期间记录安装目录匹配进程 0、完整进程 348、安装器树 1、启动项/任务 0，19/19 哈希通过，因此按 NSIS 检测误判处理，不支持旧独立开发版残留冲突。
- 0.1.3 提交 `0fcc28c` 将机器级 NSIS 检测收窄为已安装主程序完整路径匹配；用户级产品、素材、运行逻辑、appId、安装范围和用户数据身份不变。77/77、lint、0 vulnerabilities、实际 NSIS 编译、双平台候选和 Mac packaged runtime 通过；最终候选为 `release/candidates/xiaofuxing-desktop-pet/0.1.3/candidate-20260830091754928/`，安装包 SHA-256 `768213571b7db9bce30fd50ed20c92582c5405fb97f7fc3227ca5ad0933bdb63`。Windows 仅余覆盖修复、installed mode、官方卸载和同包重装。

## 文件索引

- `决策点.md`：已确认的产品、架构和阶段决策。
- `事实.md`：基线、测试样本、哈希和验证事实。
- `待办.md`：当前未完成事项和阶段检查点。
- `../Resources/phase-0-baseline.md`：Phase 0 只读盘点证据。
- `../Resources/phase-1-macos-evidence.md`：Phase 1 自动化、真实窗口和证据边界。
- `../Resources/phase-2-import-evidence.md`：Phase 2 导入安全、三样本哈希、视觉与运行证据。
- `../Resources/phase-3-package-evidence.md`：Phase 3 四产品候选、安装包哈希、ASAR 隔离、Mac 运行与 Windows 边界证据。
- `../Resources/xiaofuxing-source-manifest.md`：Phase 4 小福猩五张原始素材、哈希、身份基准与使用边界。
- `../Resources/kimi-phase-4-handoff.md`：Kimi Code 独立候选目标、现状、隔离边界和首个动作。
- `../Resources/xiaofuxing-standard-actions-repair-evidence.md`：Codex 九动作修正版范围、验证、哈希和用户确认门。
- `../Resources/xiaofuxing-v1-final-evidence.md`：Phase 4 v1 标准包、运行器、双平台候选、Mac 真实窗口和 Windows 验收边界。
- `../Resources/xiaofuxing-windows-0.1.1-repair-evidence.md`：0.1.0 Windows 失败定位、0.1.1 修复范围、不变项、候选哈希和复验门。
- `../Resources/xiaofuxing-windows-0.1.2-dpi-repair-evidence.md`：0.1.1 动态 DPI 白窗回传、0.1.2 根因修复、防复发测试、候选哈希和复验门。
- `../Resources/xiaofuxing-windows-0.1.3-nsis-repair-evidence.md`：0.1.2 安装冲突审计、0.1.3 精确进程检测、候选哈希和缩小后的 Windows 复验门。
- `/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.2-20260830-02-docfix/`：0.1.2 Windows 回传 Mac 审查日志、修正版提示词、报告模板、校验脚本与新 RETURN 路径。
- `/Volumes/T7 Shield/小福猩桌宠/xiaofuxing-v1-windows-acceptance-20260828-01/`：小福猩 v1 精确 Windows 验收输入、PRD、提示词、报告模板、证据与回传目录。
- `../.kimi-code/skills/xiaofuxing-phase4/SKILL.md`：Kimi Code 项目级 Phase 4 Skill。
- `../tasks/plan.md`：正式 PRD 与实施计划。
- `../tasks/todo.md`：可执行任务清单。
