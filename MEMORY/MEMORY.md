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

## Phase 6 当前状态

### 2026-09-07 可续验状态与物理截图证据加固

- 接管 CLI 未完成改动并提交 `d77252e`、`e9678be`：子进程 `exitCode=null` 只表示仍在运行；gate 重试证据复制到唯一 attempt 目录且不覆盖历史；暂停恢复必须逐项匹配完整身份并复核既有证据哈希；finalize 只接受权威 60 门、候选哈希、缩放恢复和进程清零，并在最终状态/报告落盘后生成完整 `returned-checksums.sha256`。截图预检现在真实写入 PNG 与元数据，退出清理同时写入最终进程证据；非 Windows 保持 `platform-unavailable`。
- 全量本地质量门通过：`npm test` 243/243，`studio:typecheck`、`studio:build`、`lint`、`source:preflight`、`npm audit --omit=dev`（0 vulnerabilities）和 `git diff --check` 均通过。正式新交接为 `release/handoff/phase-6-workbench-windows-recheck-20260907-02/`，绑定 `e9678bef313bb32635bd078713f76cf43e96d862`，source ZIP SHA-256=`9699071501046919b95a4b3259e794d423a3486b8a3d9512ad734c64dd863dab`，checksums 自身 SHA-256=`3620d29d2084a5615a62a91a0798090f1efc11962010c6d8d85991f66dc43342`；31/31 输入校验通过，bundle 完整、60 门配置已绑定、v1/v2/危险 ZIP 夹具齐全、RETURN 为空、零元数据。`20260907-01` 因生成时漏传完整受控样本，仅保留为非正式尝试，不得用于 Windows。
- 本轮未写 T7。Windows source/win-unpacked/installed、真实 DPI、安装/卸载/重装和 U8 用户确认继续为 `pending external RETURN`。

### 2026-09-06 阶段 A-C Windows 验收基础设施

- 已新增版本受控、自包含 `acceptance-tools/` 与严格单一 run 状态机；阶段 A/B 聚焦提交为 `d2c6530`、`6d393fc`，审查/可复现性修复提交为 `da94a26`、`caed93e`、`64ece28`、`3f8691b`。
- 正式新交接为 `release/handoff/phase-6-workbench-windows-recheck-20260906-05/`，绑定 `3f8691b121d42d007ec7381029dac6e9384f702e`。隔离 bundle clone、source ZIP 逐文件一致、npm ci、专项 75/75、全量 238/238 与全部质量门通过；31 个交接文件 checksums 通过、无符号链接、RETURN 为空。
- 先前生成尝试 `-03-partial`、`-03`、`-04` 均保留但不作为正式输入。历史 `-02` 与 T7 完全未改；Windows source/win-unpacked/installed、真实 DPI、物理截图、安装/卸载/重装和用户确认保持 `pending external RETURN`。

### 2026-09-04 个人自用版收敛（本轮）

- Checkpoint 0 冻结：当前基线 HEAD=`51b64792c32cf012ffc3d0231d113a02c9a9fa70`，默认回归 234/234；T7 `phase-6-workbench-windows-recheck-20260903-11/RETURN/20260903-1650-partial-save/` 只读复核通过，23 个文件、回传 checksums 与本地非覆盖副本一致。该回传明确为用户中止的部分保存：7 个 G4 自动门已通过、53 个门未执行、`overallStatus=failed` 且 `firstFailedGate=null`，无实际失败门。
- Checkpoint 1 提交 `b834d75`：旧自写文件锁及 35 项回归迁移到 `diagnostics/instance-lock/`，协议探针独立命令 10/10；生产继续由 Electron `app.requestSingleInstanceLock()` 保护，新增默认回归覆盖拒锁零初始化。默认测试从 234 降至 199 是移除诊断测试，不是性能指标。
- Checkpoint 2 提交 `a26d10d`：验证器新增明确 `paused` 契约、证据有效性与续验摘要；暂停必须包含 `pauseReason`、`nextStep`、`acceptanceContractSha256`、`environmentFingerprint`，跨源码/契约/环境身份复用会被拒绝。相关验证器测试 40/40。
- Checkpoint 3 提交 `d0b9e10`：新增 `tasks/phase-6-workbench-acceptance-contract.json` 与 `scripts/workbench-acceptance-kit.js`，从实际 source ZIP 计算文件数和 SHA-256，生成清单、报告模板、提示词、计时与工具预检结构；实际 -11 source ZIP 为 182 文件，SHA-256=`eab1d9f18ccd19aab068b8ccfeef332bccc761c484d7303037e8120fc6386d9a`。
- 2026-09-04 审查修复：`44cc196` 令显式契约/环境身份对所有状态生效，并按权威 required gates 校验 paused 完整性；`3faff99` 恢复 -11 的 60 个具体门与覆盖映射，将预检改为显式驱动执行；`a9a0f72`、`c1b6980`、`d6d5c48`、`aee4f1d`、`bad4ef2` 建立精确 HEAD、source ZIP、可 clone bundle、样本哈希、自包含交接入口和 passed 候选身份硬门。旧 `-11` 和 RETURN 冻结，不继承为本轮通过证据；Windows 实机仍待执行。
- Checkpoint 4 本地验证：隔离 worktree 全量 209/209、typecheck/build/lint/preflight/diff check、audit（0 漏洞）通过；新 macOS 候选 `candidate-20260904083047328` 绑定 `d0b9e10`，app.asar 未含旧诊断目录。source 与 packaged 隔离启动/退出日志均记录 `single-instance-lock-acquired`、`studio-ready`、`renderer-ready`、`studio-before-quit`。Windows source/win-unpacked/installed、100%/125%/150% DPI、卸载/重装和用户确认仍 `pending external RETURN`。

### 2026-09-03 预览刷新缺陷修复与 `-11` 交接（当前）

- `-10` 补验 RETURN（T7 `phase-6-workbench-windows-recheck-20260902-10/RETURN/20260903-194712-supplement/`）overallStatus=failed，首个失败门 `S6-defect-preview-killed-by-job-ack-loop`：打开含历史成功任务的项目后立即启动真实预览，预览被任务刷新静默停止。
- 根因：`ProjectWorkspace.tsx` 轮询对每个未确认的历史成功任务调用 `openProject(project.id)`；`main.js` 的 `workbench:open-project` 无条件停止预览；`get-bootstrap` 不登记 `activeProjectId`。
- 修复提交 `e5a69ba2e0573a8cdb362d6ec6bc868c364e2d66`：新增 `project-lifecycle.js`（同项目重开=无副作用只读重载，仅切换项目才取消旧任务/停止它项目预览）；renderer 轮询改用 `job-refresh.js` 观察器（首次轮询只建基线，历史成功任务不再触发项目打开）。未改 IPC/权限/单实例锁/builder/ASAR/运行内核。
- 回归：新增 12 项行为测试（生命周期 7 + 任务刷新 5），3 项在旧语义下确定性失败；旧代码 `c0ce641` 端到端复现预览约 3 秒被杀；新实现 source/packaged 全场景实测通过（存活、刷新、切换、恢复、显式停止、退出清零）。聚焦 129/129、全量 234/234、全部质量门通过。证据：`Resources/phase-6.6-preview-refresh-repair-evidence.md` 与 `runs/phase-6.6-preview-refresh-repair-20260903-01/`。
- 新候选：macOS `release/workbench-candidates/candidate-20260903150205539/`、Windows 交叉参照 `candidate-20260903150735869/`（均绑定 `e5a69ba`，worktreeClean）。
- 新交接 `release/handoff/phase-6-workbench-windows-recheck-20260903-11/` 已非覆盖交付 T7 同名目录：9/9 输入哈希、逐字节一致、零元数据、零符号链接、空 RETURN；`checksums.sha256` SHA-256 `62d003b7411b5dc6b8214259a822de0ef0b38b1245c679f1ee921c357debfd15`。本轮新增 Git bundle（SHA-256 `9093e257576c586c5e9f82a7c88a4c772b21d417e3134f124898d39ce273e8b6`）恢复权威提交，Mac 演练确认 HEAD、干净工作树与 ZIP 解压树逐字节一致；Windows 侧禁止再临时 git init。S6 三模式先行、S7 补做、DPI 与用户确认门均已写入提示词。
- Windows 验收状态：`pending external RETURN`；Mac 独立核验新 RETURN 前 Phase 6.6 不关闭。

### 2026-09-02/03 `-09` RETURN 修复与 `-10` 交接（历史，RETURN 已失败）

- `-09` Windows RETURN（T7 `phase-6-workbench-windows-recheck-20260902-09/RETURN/20260902-172428/`）已复核：68/68 哈希通过、验证器仅预期失败，首个失败门 `G5-04-candidate-export-source`。
- 四层产品修复链：`25f5779`（仓库内 builder launcher 规范化 argv + 预览 app.asar cwd 按名称判定 + 验证器 `--output` 拒绝 RETURN 内路径）→ `7effcfa`（launcher `process.noAsar`）→ `8d696ad`（候选 files 映射改目录+filter）→ `e4eb38c`/`fe6905b`（工作台进程读候选 app.asar 局部关 ASAR 补丁）。聚焦 117/117、全量 222/222、全部质量门通过。
- 当前最终 macOS 候选：`release/workbench-candidates/candidate-20260902153954972/`（绑定 `fe6905b`，worktreeClean），packaged smoke 全项通过（启动、单实例拒绝、ZIP 导入、预览启停、应用内 macOS 候选构建成功、退出后进程清零），证据在候选 `smoke/` 目录。
- Windows x64 交叉参考候选：`release/workbench-candidates/candidate-20260902161102333/`（绑定 `fe6905b`；NSIS SHA-256 `d47576eebfbc3b49aa76d95887dcae40a3afe71dd3eb6b64c08822f1eaca0396`）；仅静态参照，不构成 Windows 验收。
- Windows 权威交接为本地 `release/handoff/phase-6-workbench-windows-recheck-20260902-10/`（绑定 `fe6905b`，source ZIP SHA-256 `695ab3bb940c6d6d7aea7ce792e0e4b41727b4ac55576ee7a9b3944e19330f22`，checksums SHA-256 `a12323763724dd41d40ec80d6284e5c67a2cac39687d8c4f9e66dff7413a1851`，6/6 输入通过，解压树聚焦 117/117，RETURN 为空）。
- 2026-09-03 经用户授权完成 `-10` T7 非覆盖交付：目标 `/Volumes/T7 Shield/phase-6-workbench-windows-recheck-20260902-10/` 交付前不存在；目标端 6/6 输入哈希复核通过，`checksums.sha256` 自身 SHA-256 与源一致，`diff -r` 逐字节一致，文件清单与空 RETURN 保留，递归符号链接/`.DS_Store`/`._*` 元数据为 0；T7 上 `-09` 及其他历史交接未改动。
- `-09` 及更早交接与 RETURN 保持只读。Windows source、win-unpacked、installed mode、DPI、卸载/重装仍 `pending external RETURN`，等待 `-10` 新回传。

### 2026-09-02 本地最终收口（历史）

- 历史记录：`49b6592`、`1e96e32` 分别对应早期证据更新；`dfb2cde` 仅为历史基线。`-08` 因全量提交哈希错误且复验文档过期而作废并保留。`-09` 已收到失败 RETURN 并被 `-10` 取代（见上节）。

- 2026-09-02 独立复审后历史更正：`dfb2cde` 仅代表旧基线；`-03` 交接不含后续修复，不能作为最终 Windows 输入。

- 2026-09-02 最终 Windows 交接纠偏：`-08` 的源码 ZIP 内容匹配真实 HEAD `50d75ed42d5ec955babf4a801c7bfb78a1e9a94b`，但 `SOURCE-BASELINE.md` 写入不存在的 `50d75ed711a...`，且 PRD/提示词/报告仍复用 `-03` 的 33/33、184/184 与文件锁权威描述，因此整包作废。新建非覆盖 `release/handoff/phase-6-workbench-windows-recheck-20260902-09/` 并复制至 T7 同名目录；权威提交为 `50d75ed42d5ec955babf4a801c7bfb78a1e9a94b`，source ZIP SHA-256 `acc75d7c7ef3498065c93aa794779233c95cc3d4193801dd63cd11eea1d9b519`，checksums SHA-256 `405cf62781ce41d7b6a424f34d6083bd2649d0d58ccd4e6fb09e5e6909bcadbd`，6/6 通过，源/目标逐字节一致，UTF-8/LF、零元数据、零符号链接、空 RETURN。复验契约已更新为聚焦 76/76、全量 200/200 和 Electron 原生权威锁；后续仅记录本次交付的文档提交不改变交接源码身份。

- 2026-09-02 经用户确认，已删除 T7 上被 `phase-6-workbench-windows-acceptance-20260901-06/` 取代且 RETURN 为空的旧交接包 `phase-6-workbench-windows-acceptance-20260901-05/`（约 1.5 MiB）；未触碰回收站及任何含 RETURN 的交接包。

- 2026-09-02 实例锁 Windows EPERM 修复：T7 `-01` 回传确诊 Windows 对已有符号链接 `openSync 'wx'` 返回 EPERM 导致受控错误逃逸；修复仅在 lstat 证明不安全对象时转换错误，其余 EPERM 原样抛出，fail-closed 不变。仅修改 `src/workbench/instance-lock.js` 与 `test/workbench-instance-lock.test.js`（D-027 临时授权）；聚焦 6/6、全量 136/136 与完整质量门通过，修复提交 `5ac8528`。directory-importer 偶发 rename EPERM 保留为观察项。新 macOS 候选 `release/workbench-candidates/candidate-20260902020633351/` 隔离 smoke 通过（`studio-ready`/`renderer-ready`，进程清零）；新仓库内交接 `release/handoff/phase-6-workbench-windows-recheck-20260902-02/` 6/6 输入哈希通过，未写入 T7；Windows installed mode 仍待新 RETURN。

- 2026-09-02 T7 06 Windows 回传的 3 项 npm test 失败确认为 POSIX 测试夹具不可移植；提交 `a93a2e8` 仅更新两个测试文件，132/132 与完整质量门通过。新 macOS 候选为 `release/workbench-candidates/candidate-20260901160713659/`；新仓库内 Windows 全量复验交接为 `release/handoff/phase-6-workbench-windows-recheck-20260902-01/`，未写入 T7，Windows installed mode 等待新 RETURN。
- 用户确认后，新 Windows 复验交接已复制到 T7 `/Volumes/T7 Shield/phase-6-workbench-windows-recheck-20260902-01/`，6/6 checksums 通过，RETURN 为空；Windows installed mode 仍等待该目录产生新 RETURN。

- 2026-09-01 预览 cwd 修复：`src/workbench/preview-controller.js` 在 packaged 模式下将 `app.asar` 的 spawn cwd 解析为真实父目录，同时保留 ASAR 内 `src/main.js` runtime entry；测试 132/132。提交 `87cdb2571af214e0f24444a5112997137f7fa5e9`，候选 `release/workbench-candidates/candidate-20260901142719184/`。macOS packaged runtime smoke 已记录 `studio-ready`、`renderer-ready`、`runtime-ready` 和窗口同步；完整 GUI 预览点击证据仍未收口，Windows RETURN 仍待用户完成。

- 2026-09-01 用户确认“桌宠制作台 MVP”PRD 并创建目标模式，先由 Codex 执行 Phase 6.1–6.4，Kimi 在 Phase 6.5 负责视觉与展示层，最后由 Codex 集成和验证。
- Phase 6.1 已完成：项目/步骤/任务/错误/产物契约、独立安全 Electron 壳层、React + TypeScript renderer、版本化非覆盖项目存储、关闭后恢复和 Kimi 设计交接包均已落地。
- Phase 6.2 已完成：主进程目录/ZIP 选择、授权与安全来源摘要、失败保护、检查层级、联系表/逐帧预览和隔离真实桌宠启停；104/104 回归及 macOS Doraemon 隔离实测通过。证据：`../Resources/phase-6.2-workbench-evidence.md`。
- Phase 6.3 已完成产品配置、标准包、可恢复项目包和授权受控候选构建；Doraemon 自定义 macOS 候选 packaged `renderer-ready`/`runtime-ready` 通过，Windows installed mode 保持外部门。证据：`../Resources/phase-6.3-workbench-evidence.md`。
- Phase 6.4 已完成后台导入/构建/导出、真实候选取消清理、并发/切换/退出、显式启动恢复、Petdex 离线隔离、项目复制和安全产物定位。证据：`../Resources/phase-6.4-workbench-evidence.md`。
- Phase 6.5 Kimi 视觉收口已执行：Kimi 仅修改 renderer 四个文件，Codex 完整 diff/类型/106 项回归/构建/lint 审查通过。证据：`../Resources/phase-6.5-workbench-evidence.md`。
- Phase 6.6 已生成并真实启动 macOS arm64 未签名工作台候选 `release/workbench-candidates/candidate-20260901083025663/`；108/108 回归通过，Windows installed mode 仍待外部回传。证据：`../Resources/phase-6.6-workbench-evidence.md`。
- Windows 验收交接当前位于 `release/handoff/phase-6-workbench-windows-acceptance-20260901-06/`，T7 副本位于 `/Volumes/T7 Shield/phase-6-workbench-windows-acceptance-20260901-06/`；复用 source ZIP 对应提交 `87cdb2571af214e0f24444a5112997137f7fa5e9`，checksums SHA-256 为 `339ad968b87fdc5e7f397bfe022567c18483ac41494ae0cfb85bc46fa251ab70`，RETURN 为空，仅表示验收准备完成，installed mode 待回传。旧交接包保留不变。
- 实施分支为 `codex/phase-6-1-workbench`，起点提交 `d78de60`；现有五个桌宠、历史候选、证据、原始素材、RETURN 和用户宠物目录保持不变。
- 完整 PRD 与阶段计划位于 `tasks/phase-6-workbench-prd.md`。商业发布体系继续暂缓，Phase 6 MVP 不包含 AI 动作生成、逐帧编辑、签名、公证、商城、支付、DRM 或自动更新。
- 验证为 91/91 测试、TypeScript、Vite 生产构建、lint、source preflight、npm audit 0 vulnerabilities 和 macOS 真实“新建 → 完整重启 → 恢复”；下一确认门是用户审查 Phase 6.1 后再进入 Phase 6.2。

## 2026-09-06 Phase 6.6 Windows 复验修复交付

- 针对 T7 `phase-6-workbench-windows-recheck-20260905-01` 暂停回传，验收工具改用内置 `scripts/zip-reader.js` 并修正 Windows timeout 夹具；提交 `e758f8f`、`80198bc`，本地 231/231 与全部质量门通过。新 Windows x64 候选 `release/workbench-candidates/candidate-20260906000328071/` 绑定 `80198bc`；新交接 `release/handoff/phase-6-workbench-windows-recheck-20260906-02/` 已复制至 T7 同名目录，15/15 checksums 通过。Windows 实机全量 60 门仍待新 RETURN。

## 文件索引

- `决策点.md`：已确认的产品、架构和阶段决策。
- `事实.md`：基线、测试样本、哈希和验证事实。
- `待办.md`：当前未完成事项和阶段检查点。
- `../Resources/phase-0-baseline.md`：Phase 0 只读盘点证据。
- `../Resources/phase-1-macos-evidence.md`：Phase 1 自动化、真实窗口和证据边界。
- `../Resources/phase-2-import-evidence.md`：Phase 2 导入安全、三样本哈希、视觉与运行证据。
- `../Resources/phase-3-package-evidence.md`：Phase 3 四产品候选、安装包哈希、ASAR 隔离、Mac 运行与 Windows 边界证据。
- `../Resources/project-closeout-20260901.md`：Phase 1–4 与 Task 3.7 最终状态、精确 Windows 证据索引、授权边界、T7 保存策略和下一确认门。
- `../Resources/phase-6.1-workbench-evidence.md`：Phase 6.1 完成范围、安全边界、91/91 回归、构建、macOS 真实创建/恢复与剩余证据边界。
- `../Resources/kimi-phase-6-workbench-handoff.md`：Kimi Phase 6.5 页面、字段、状态、错误、职责与不可修改边界。
- `../Resources/phase-6.6-preview-refresh-repair-evidence.md`：Phase 6.6 预览刷新缺陷（S6）根因、`e5a69ba` 修复、先红后绿回归、Mac source/packaged 实测、候选与 `-11` 交接哈希。
- `../Resources/phase-6-workbench-mock-data.json`：符合工作台契约的空状态、活动项目和错误模拟数据。
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
- `../tasks/phase-6-workbench-prd.md`：Phase 6 桌宠制作台 MVP 范围、架构、分工、Phase 6.1–6.6 计划与确认门。
- `../tasks/todo.md`：可执行任务清单。
- `../tasks/xiaofuxing-0.1.4-nsis-repair-plan.md`：0.1.3 覆盖安装失败确诊（uninstallOldVersion 重试环）、0.1.4 修复方案和重排后的 Windows 复验顺序。
- `../tasks/xiaofuxing-0.1.5-uninstaller-crc-repair-plan.md`：0.1.4 复验 F 门复败确诊（卸载器 CRC 构建期损坏，UninstallerReader 拼接路径，上游 #4875）、0.1.5 修复方案和 Windows 复验要点。
- `../Resources/xiaofuxing-windows-0.1.5-uninstaller-crc-repair-evidence.md`：卸载器 CRC 根因、本机静态复现、0.1.5 最小修复、验证结果与候选哈希。
- `../release/handoff/xiaofuxing-v1-windows-recheck-0.1.4-20260830-01/`：0.1.4 source、win-unpacked、NSIS、修复说明、0.1.3 失败报告副本、重排后的 PRD/报告模板/Kimi 提示词；该交付后续已搬运并就地更新为 0.1.5。
- `/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.4-20260830-01/RETURN/windows-install-recheck-0.1.5-20260831-110759/WINDOWS-INSTALL-RECHECK-REPORT.md`：0.1.5 Windows A–G 安装生命周期验收报告；514/514 回传哈希已在 Mac 侧独立复核通过。
- `../release/windows-recheck/xiaofuxing-v1-windows-recheck-0.1.5-20260831-01/`：0.1.5 Windows RETURN 的本机非覆盖归档；515 个文件与 T7 原件逐字节一致，清单内 514/514 通过，目录由 `.gitignore` 保持在 Git 之外。
- 2026-09-02 实例锁深度修复（-03 轮）：T7 `-02` 回传确诊 Windows 跟随悬空符号链接创建 `D:\tmp` 导致锁 fail-open；协议重写为临时文件 + `linkSync` 原子发布 + 随机 ownership token，三轮安全对抗审查全部收口。修复提交 `dfb2cde`；聚焦 33/33、全量 184/184、全部质量门通过。新 macOS 候选 `release/workbench-candidates/candidate-20260902044902114/` 隔离 smoke 通过（含第二实例拒绝、进程清零、无锁残留）。通用 Windows RETURN 验证器 `scripts/validate-windows-return.js` 已补齐伪造、缺失、不一致、越界和覆盖检查。新非覆盖交接 `release/handoff/phase-6-workbench-windows-recheck-20260902-03/` 6/6 哈希通过，未写入 T7；Windows source/win-unpacked/installed/DPI/卸载/重装全部待新 RETURN。`src/workbench/main.js` 已将 store/controller/IPC/window 初始化完全置于成功持锁后的 bootstrap 边界。
