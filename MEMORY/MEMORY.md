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
- Phase 2 的实施分支为 `feature/pet-importer`；其结论保持有效，后续 Phase 3 与 Phase 4 已分别推进并记录在下文。

## Phase 3 当前状态

- 2026-08-27 Phase 3 候选构建与 Mac 侧验证完成，实施分支为 `feature/package-factory`，Checkpoint 3 已通过。
- Wukong、Doraemon、阿岱和 JokeBear 均生成 Windows x64 `win-unpacked`、未签名 NSIS 候选安装包和 macOS Apple Silicon 未签名 `.app`；四个 macOS 应用真实启动通过。
- 自动测试 64/64、lint、npm audit、单宠 ASAR 隔离、来源/包内图集哈希和 20 个最终关键产物重新哈希通过。
- 2026-08-31 用户授权 Task 3.7 后，未复用缺失主二进制或卸载器 CRC 异常的历史候选；改用提交 `a60f3b7` 的受控源码在 Windows 本地 NTFS 原生构建四套新候选。Kimi 回传报告确认 source、win-unpacked、installed mode、100%/125%/150% 冷启动、真实动态 DPI、核心交互、官方卸载、同包重装和四产品身份隔离全部通过，Task 3.7 关闭；四套产品仍为未签名内部候选，Doraemon 与 JokeBear 不获得对外分发结论。
- 最终回传位于 `/Volumes/T7 Shield/phase-3-windows-acceptance-20260831-01/RETURN/phase-3-task3.7-windows-20260831-20260831-175125/`，Mac 侧独立复核 1352/1352 哈希通过。构建机直连 GitHub 曾出现 `ETIMEDOUT 20.205.243.166:443`，通过仅限重试命令的 `ELECTRON_MIRROR` 完成构建；该问题按用户要求保留为非阻塞网络观察项，不改永久配置或系统网络设置。

## Phase 4 当前状态

- 2026-08-27 用户确认 Phase 4 PRD，实施分支为 `feature/xiaofuxing-v2`。
- 五张小福猩素材已登记；无服装、无道具的正面完整全身图锁定为唯一身份基准，其余图片只提供姿势、情绪和侧面结构参考。
- Codex 主视觉曾获确认；首版九动作因待机手部虚影、左右跑动姿势堆叠、失败动作身份漂移和等待动作手指结构问题未获确认。2026-08-28 完成非覆盖修正版后，用户先确认七个非方向动作，随后以三段跑步 GIF 为参考确认新的 `running-right`。独立左跑因腿部不流畅被保留为历史候选，活动左跑改为八张已确认右跑帧的逐帧水平镜像并获用户确认。九种标准动作现已全部通过用户确认；批准清单位于 `runs/phase-4-xiaofuxing-v2-codex-running-ref-20260828-01/qa/standard-actions-approval.json`。用户随后确认只对齐 Petdex 网站宠物核心九状态功能，小福猩按 8×9、1536×1872 的 v1 标准包收尾，不制作四基准方向和 16 注视方向；运行器仍保留 v2 兼容。Kimi 独立候选仍保持隔离。授权状态暂记 `internal-test`，不写入或覆盖用户 Codex/Petdex 宠物目录。
- 小福猩 v1 标准包、source-mode、macOS `.app` 和 Windows x64 `win-unpacked`/未签名 NSIS 候选已完成；候选证据位于 `Resources/xiaofuxing-v1-final-evidence.md`，最终 Windows 安装生命周期验收由下述 0.1.5 回传关闭。
- 0.1.0 Windows 回传已检查：输入与回传哈希通过，但 source 路径兼容/lint/Electron 二进制门、150% 冷启动、动态 DPI 和官方卸载失败。首轮 0.1.1 复验暴露并修复 Windows ASAR 嵌套路径问题。第二轮 0.1.1 在 Windows 通过 76/76 与 150% 冷启动，但 source 真实动态 `100% -> 125% -> 150%` 在 150% 出现白窗和裁切。0.1.2 已移除动态 DPI 路径的临时边界脉冲、增加诊断和防复发测试；完整回归、Mac source/packaged runtime 和新双平台候选通过，批准素材哈希不变。新 T7 非覆盖复验包 `xiaofuxing-v1-windows-recheck-0.1.2-20260830-01/` 已完成 93/93 哈希、ZIP UTF-8、隔离解压和零元数据校验；Windows 0.1.2 动态 DPI、win-unpacked、installed、覆盖修复、卸载和重装仍待实机复验。
- 0.1.2 Windows 回传经 Mac 只读复核后不能作为小福猩代码缺陷证据：受控重试窗口标题明确为 `Wukong Desktop Pet`，因为 `npm start` 默认选择 Wukong；回传还存在目标显示器/DPI 不一致、截图未落盘、缺少小福猩产品日志以及进程清理结论冲突。原 Windows 结论仍为“不通过/未完成”，但当前不进入代码修复。已按用户确认建立非覆盖 T7 流程修正版 `xiaofuxing-v1-windows-recheck-0.1.2-20260830-02-docfix/`，强制 `npm run pet -- xiaofuxing`、产品身份日志门、同一显示器缩放证据、截图落盘、精确进程树与全量回传哈希；5/5 文档哈希通过，`checksums.sha256` SHA-256 为 `1b0cbae81f2a5d1bb1375398e33c106eb019707fcee186a658a6474b77a0a3ea`，元数据为 0；旧交付和旧 RETURN 保持不变。
- 2026-08-30 第三轮 “fixed-140521” 回传经 Mac 只读复核仍判“验收对象错误”：`source.out.log` 明确记录 `npm start`，回传错放 `-01/RETURN/`，`screenshots/` 为空，无 `returned-checksums.sha256`，结束时 `LogPixels=144` 未恢复；其“125% 白区/裁切失败”不能作为小福猩缺陷证据。经用户确认，建立非覆盖 Kimi Code 执行版 `xiaofuxing-v1-windows-recheck-0.1.2-20260830-03-kimi/`：验收门与 docfix 一致，新增执行前五项自检（`logs/00-preflight-selfcheck.log`）和 `capture-screenshot.ps1` 脚本化截图落盘（全屏 + 窗口局部），回传路径改为 `-03-kimi/RETURN/windows-recheck-0.1.2-kimi-<ts>/`；5/5 哈希通过、元数据为 0。
- 最新正确产品回传中，source 与 win-unpacked 三档冷启动及真实动态 DPI 通过；白色区域确认是透明宠物窗口叠在白色 Codex/设置窗口上的截图背景。`0.1.0 -> 0.1.2` 覆盖安装被“无法关闭”阻断；后续冲突审计在弹窗保持期间记录安装目录匹配进程 0、完整进程 348、安装器树 1、启动项/任务 0，19/19 哈希通过，因此按 NSIS 检测误判处理，不支持旧独立开发版残留冲突。
- 0.1.3 提交 `0fcc28c` 将机器级 NSIS 检测收窄为已安装主程序完整路径匹配；用户级产品、素材、运行逻辑、appId、安装范围和用户数据身份不变。77/77、lint、0 vulnerabilities、实际 NSIS 编译、双平台候选和 Mac packaged runtime 通过；最终候选为 `release/candidates/xiaofuxing-desktop-pet/0.1.3/candidate-20260830091754928/`，安装包 SHA-256 `768213571b7db9bce30fd50ed20c92582c5405fb97f7fc3227ca5ad0933bdb63`。Windows 仅余覆盖修复、installed mode、官方卸载和同包重装。
- 0.1.3 非覆盖 T7 交付已写入 `xiaofuxing-v1-windows-recheck-0.1.3-20260830-01/`：source ZIP 隔离解压与 77/77 通过，`checksums.sha256` 覆盖 108 个输入文件且 108/108 通过、自身 SHA-256 `be6434fff94632e56859d613ac25299e156bd550189e894f5473a3cb86c26135`，递归元数据 0、`RETURN/` 为空。
- 0.1.3 Windows 回传显示覆盖安装仍弹“无法关闭”，根因确诊为 electron-builder `uninstallOldVersion` 重试环（旧 0.1.0 卸载器静默执行从未成功），不是检测误判；详见 `tasks/xiaofuxing-0.1.4-nsis-repair-plan.md`。0.1.4 在 `build/nsis/exact-app-process-check.nsh` 增加 DetailPrint 探针、旧卸载器预检宏和 `customUnInstallCheck` 日志镜像，身份字段不变；77/77、lint、0 漏洞、真实 NSIS 编译和 Mac packaged runtime 通过。0.1.4 交付完成后在 Windows 暴露卸载器 CRC 根因，并由 0.1.5 取代。
- 0.1.4 Windows 复验回传（T7 `xiaofuxing-v1-windows-recheck-0.1.4-20260830-01/RETURN/`）终止于门 F：同版本覆盖再弹“无法关闭”；决定性新证据为 0.1.0/0.1.4 卸载器直启即弹 NSIS Error “Installer integrity check has failed”（磁盘哈希未变、`/NCRC` 可用、Defender 全时段零事件，H1 否证）。根因定位为 electron-builder 26.15.3 在 macOS 上的 `UninstallerReader` 拼接路径不重算卸载器 CRC（上游 #4875），本机按 NSIS `loadHeaders` 算法静态复现（0.1.4 卸载器计算 `0x6b343ac4` ≠ 存储 `0xc2d5a1af`，主安装器一致通过）。0.1.5 仅对卸载器编译加 `CRCCheck off`（firstheader flags=0x5）并升版本，探针与身份字段全保留；77/77、lint、0 漏洞、真实 NSIS 编译、Mac packaged runtime 与静态 CRC 验收通过，候选为 `release/candidates/xiaofuxing-desktop-pet/0.1.5/candidate-20260831015730039/`，安装包 SHA-256 `656f34eb63b55b0537488e30aff6e44c332672036a3bc8246d5db87aa5f17bb1`。T7 交付已就地更新为 0.1.5（91/91 哈希复核通过），修复与技术证据提交为 `a1c8e24`。详见 `tasks/xiaofuxing-0.1.5-uninstaller-crc-repair-plan.md` 与 `Resources/xiaofuxing-windows-0.1.5-uninstaller-crc-repair-evidence.md`。
- 2026-08-31 0.1.5 Windows 安装生命周期验收门已关闭：91/91 输入哈希、77/77、lint、installed mode 三档冷启动与动态 DPI、交互、三次同版本覆盖、0.1.5 官方卸载（不带 `/NCRC`）及同包重装全部通过；Mac 侧独立复核回传哈希 514/514 通过。最终系统缩放为 100%，0.1.5 保持安装，精确主程序进程数 0。RETURN 已以 515 个文件非覆盖归档到 `release/windows-recheck/xiaofuxing-v1-windows-recheck-0.1.5-20260831-01/`，与 T7 原件逐字节一致、零元数据。用户确认 Phase 4 收尾，Checkpoint 4 关闭；0.1.5 仍为未签名内部候选，不自动转为正式发布版。

## Phase 5 当前状态

- 2026-09-01 用户确认项目收尾 PRD。当前只统一状态、建立最终证据索引和采用轻量归档策略，不进入新功能、商业发布或网络配置修改。
- `README.md`、计划、任务清单、MEMORY 和两份早期候选证据已增加最终状态指针；统一收尾报告为 `Resources/project-closeout-20260901.md`。
- Task 3.7 约 3.9 GiB 完整 RETURN 继续原样保留在 T7，本机不复制大体积候选，只保存精确路径、报告/清单 SHA-256 与 1352/1352 核验说明。
- 用户已确认 Checkpoint 5A。回归结果为测试 77/77、lint、source preflight 和 npm audit 全部通过；audit 前两次受官方 Registry TLS 断开阻断，第三次未改配置重试返回 0 vulnerabilities。用户已授权只创建一个内部基线提交，不创建标签、不合并分支、不推送远端。

## 文件索引

- `决策点.md`：已确认的产品、架构和阶段决策。
- `事实.md`：基线、测试样本、哈希和验证事实。
- `待办.md`：当前未完成事项和阶段检查点。
- `../Resources/phase-0-baseline.md`：Phase 0 只读盘点证据。
- `../Resources/phase-1-macos-evidence.md`：Phase 1 自动化、真实窗口和证据边界。
- `../Resources/phase-2-import-evidence.md`：Phase 2 导入安全、三样本哈希、视觉与运行证据。
- `../Resources/phase-3-package-evidence.md`：Phase 3 四产品候选、安装包哈希、ASAR 隔离、Mac 运行与 Windows 边界证据。
- `../Resources/project-closeout-20260901.md`：Phase 1–4 与 Task 3.7 最终状态、精确 Windows 证据索引、授权边界、T7 保存策略和下一确认门。
- `/Volumes/T7 Shield/phase-3-windows-acceptance-20260831-01/`：Task 3.7 受控源码、Windows PRD/提示词、取证工具与 Kimi 最终回传；`RETURN/phase-3-task3.7-windows-20260831-20260831-175125/` 的报告与 1352/1352 哈希已复核通过。
- `../Resources/xiaofuxing-source-manifest.md`：Phase 4 小福猩五张原始素材、哈希、身份基准与使用边界。
- `../Resources/kimi-phase-4-handoff.md`：Kimi Code 独立候选目标、现状、隔离边界和首个动作。
- `../Resources/xiaofuxing-standard-actions-repair-evidence.md`：Codex 九动作修正版范围、验证、哈希和用户确认门。
- `../Resources/xiaofuxing-v1-final-evidence.md`：Phase 4 v1 标准包、运行器、双平台候选、Mac 真实窗口和 Windows 验收边界。
- `../Resources/xiaofuxing-windows-0.1.1-repair-evidence.md`：0.1.0 Windows 失败定位、0.1.1 修复范围、不变项、候选哈希和复验门。
- `../Resources/xiaofuxing-windows-0.1.2-dpi-repair-evidence.md`：0.1.1 动态 DPI 白窗回传、0.1.2 根因修复、防复发测试、候选哈希和复验门。
- `../Resources/xiaofuxing-windows-0.1.3-nsis-repair-evidence.md`：0.1.2 安装冲突审计、0.1.3 精确进程检测、候选哈希和缩小后的 Windows 复验门。
- `/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.2-20260830-02-docfix/`：0.1.2 Windows 回传 Mac 审查日志、修正版提示词、报告模板、校验脚本与新 RETURN 路径。
- `/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.3-20260830-01/`：已于 2026-08-31 删除；RETURN 回传归档于 `../runs/recheck-0.1.3-review-20260830/`（114 个文件哈希一致）。
- 2026-08-31 T7 清理归档：旧复验包 `0.1.1-20260829-03`、`0.1.1-20260829-04`、`0.1.2-20260830-01` 已删除，其 RETURN（及 -04 的文档与 `04-evidence`）逐字节归档至 `../release/windows-recheck/同名目录/`（42、27+、120 个文件哈希一致）。T7 现存：`-02-docfix`、`-03-kimi` 与当前 0.1.5 交付 `xiaofuxing-v1-windows-recheck-0.1.4-20260830-01/`。
- `/Volumes/T7 Shield/小福猩桌宠/xiaofuxing-v1-windows-acceptance-20260828-01/`：小福猩 v1 精确 Windows 验收输入、PRD、提示词、报告模板、证据与回传目录。
- `../.kimi-code/skills/xiaofuxing-phase4/SKILL.md`：Kimi Code 项目级 Phase 4 Skill。
- `../tasks/plan.md`：正式 PRD 与实施计划。
- `../tasks/todo.md`：可执行任务清单。
- `../tasks/xiaofuxing-0.1.4-nsis-repair-plan.md`：0.1.3 覆盖安装失败确诊（uninstallOldVersion 重试环）、0.1.4 修复方案和重排后的 Windows 复验顺序。
- `../tasks/xiaofuxing-0.1.5-uninstaller-crc-repair-plan.md`：0.1.4 复验 F 门复败确诊（卸载器 CRC 构建期损坏，UninstallerReader 拼接路径，上游 #4875）、0.1.5 修复方案和 Windows 复验要点。
- `../Resources/xiaofuxing-windows-0.1.5-uninstaller-crc-repair-evidence.md`：卸载器 CRC 根因、本机静态复现、0.1.5 最小修复、验证结果与候选哈希。
- `../release/handoff/xiaofuxing-v1-windows-recheck-0.1.4-20260830-01/`：0.1.4 source、win-unpacked、NSIS、修复说明、0.1.3 失败报告副本、重排后的 PRD/报告模板/Kimi 提示词；该交付后续已搬运并就地更新为 0.1.5。
- `/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.4-20260830-01/RETURN/windows-install-recheck-0.1.5-20260831-110759/WINDOWS-INSTALL-RECHECK-REPORT.md`：0.1.5 Windows A–G 安装生命周期验收报告；514/514 回传哈希已在 Mac 侧独立复核通过。
- `../release/windows-recheck/xiaofuxing-v1-windows-recheck-0.1.5-20260831-01/`：0.1.5 Windows RETURN 的本机非覆盖归档；515 个文件与 T7 原件逐字节一致，清单内 514/514 通过，目录由 `.gitignore` 保持在 Git 之外。
