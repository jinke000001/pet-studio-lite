# Phase 6.6 工作台候选证据（Windows 待外部验收）

已生成 macOS arm64 未签名内部候选：`release/workbench-candidates/candidate-20260901142719184/artifacts/mac-arm64/桌宠制作台.app`。

- 来源提交：`87cdb2571af214e0f24444a5112997137f7fa5e9`
- 本轮修复：packaged 模式下 runtime entry 仍位于 `app.asar/src/main.js`，但 `spawn.cwd` 改为 `app.asar` 的真实父目录；source-mode 目录路径保持不变。
- 新增测试覆盖该行为；`npm test` 实际为 132/132。

- 主程序 SHA-256：`221d5695ab9eb2263b9107e4a5bb3f5780adc35963530e322673d5535e8eeae5`
- app.asar SHA-256：`5c057b7dcc8a6da9a30584e4511ec91274c8acc3bec2ff054add0cb2b5e95003`
- candidate-manifest SHA-256：`07f765f63172f41090bbc5236367d9adb4c08121e6ee1cdc7624bf79bc086aa4`
- 候选 manifest 明确标注 `unsigned-internal-candidate`，Windows installed mode 为 `pending-external-return`。
- 使用隔离 userData 直接运行本轮包内主程序，输出 `studio-ready` / `renderer-ready`；本轮未启动真实宠物预览子进程，因此不把旧候选的 `runtime-ready` 记录挪作本轮新候选证据。
- Doraemon v1 本地目录导入已通过并落盘安全来源摘要与导入产物。
- Computer Use 在滚动布局下未形成稳定的 GUI 预览切换/停止点击证据，本轮不宣称完整 GUI 闭环通过。

## 2026-09-02 本地最终收口（历史记录）

- 代码 checkpoint `75b3021`，记录与证据提交 `49b6592`；工作台以 Electron `app.requestSingleInstanceLock()` 为唯一权威单实例机制，文件锁仅作 fail-closed 诊断/回归。
- 三进程暂停竞态：旧实现 RED（A/B/C 均 acquired），修复后 GREEN（最多一个 acquired）；main.js 拒锁真实替身确认 store、恢复、controller、IPC、窗口均为 0。
- 候选与交接均已被后续非覆盖版本取代；请以文档末尾最新追加记录为准。
- macOS packaged smoke 未启动真实预览子进程，不证明 runtime-ready 或完整 GUI；Windows source、win-unpacked、installed mode、100/125/150% DPI、动态 DPI、卸载/重装及最终 RETURN 仍待实机。

自动门：132/132、typecheck、build、lint、source preflight、npm audit 通过。

Windows 独立验收交接已更新至非覆盖目录：`release/handoff/phase-6-workbench-windows-acceptance-20260901-06/`；T7 副本位于 `/Volumes/T7 Shield/phase-6-workbench-windows-acceptance-20260901-06/`。该交接复用已核验的 `source/pet-workbench-source-87cdb25.zip`，基线提交为 `87cdb2571af214e0f24444a5112997137f7fa5e9`，checksums SHA-256 为 `339ad968b87fdc5e7f397bfe022567c18483ac41494ae0cfb85bc46fa251ab70`；本地与 T7 的 `RETURN/` 均为空。结论仅为“Windows 验收准备完成/待回传”。

## 2026-09-02 Windows 路径修复与复验交接

- T7 06 回传只读复核确认：输入 6/6、`npm ci` 通过；Windows 原生 `npm test` 为 132 项、129 通过、3 失败，失败均为测试夹具固定 POSIX 路径/正斜杠断言。旧报告 SHA-256 为 `c452776ae8fc6baaee8ba2a45e34e30e52065b59c96d2572049ca3a239a5a510`，旧回传清单 SHA-256 为 `6766acbcc905a83ad5395d2640ddf450f86e87ba5e3b2b9710742426e651fb38`。
- 最小修复仅修改 `test/workbench-candidate.test.js` 与 `test/workbench-preview.test.js`，生产 `candidate-builder.js`、`preview-controller.js` 未修改。修复提交：`a93a2e8a0fbc121e4d7c90cb5545c256c56cccd1`。
- 本机质量门：相关测试 8/8；全量 `npm test` 132/132；studio typecheck/build、lint、source preflight、npm audit（0 vulnerabilities）、git diff --check 全部通过。
- 新 macOS arm64 候选：`release/workbench-candidates/candidate-20260901160713659/`；manifest `584ded13c3f029e13cdd2cfca9267b9cef1181eba113fef2edd81011b2ab8ef6`，app.asar `5c057b7dcc8a6da9a30584e4511ec91274c8acc3bec2ff054add0cb2b5e95003`，主程序 `221d5695ab9eb2263b9107e4a5bb3f5780adc35963530e322673d5535e8eeae5`。packaged smoke 出现 `studio-ready`/`renderer-ready`，仅代表 macOS packaged 候选通过。
- 新仓库内非覆盖交接：`release/handoff/phase-6-workbench-windows-recheck-20260902-01/`；source ZIP `4a9c79bb5c5c3926c18358770ec785982fd5c1cff2a2e2a0f706245df82674c0`，基线 `a93a2e8`，checksums `c0f147f02bb4c675966bdb8cf8c11a0eb6976ae8286127f566bf5d91d055d7e2`，6/6 输入通过、LF/UTF-8、排除自身、RETURN 为空。
- T7 06 及其 RETURN 未修改；新交接未写入 T7。Windows source、win-unpacked、installed mode、DPI、导入预览、卸载/重装仍待新的 Windows RETURN，Phase 6.6 不提前关闭。

## 2026-09-02 实例锁 Windows EPERM 修复

## 2026-09-02 独立复审收口（75b3021）

- checkpoint：`75b30212bbcfa401a9c60df498101b5fd1f39554`，仅包含本轮实例锁、main 拒锁边界、验证器对抗测试、记录和 RED 证据；未 push/merge/tag。
- 聚焦验证：实例锁 37/37、工作台 shell 6/6、Windows RETURN 验证器 33/33；全量 `npm test` 200/200，typecheck/build/lint/source preflight/audit(0 vulnerabilities)/diff-check 全部通过。
- 三进程暂停回归先以旧实现得到 RED（A/B/C 均 acquired），修复后 GREEN（最多一个 acquired）。工作台改用 Electron `app.requestSingleInstanceLock()` 为唯一权威锁；文件锁不参与工作台权威判定。
- 新 macOS arm64 候选：`release/workbench-candidates/candidate-20260902064710422/`，manifest SHA-256 `4528e47243d8941b9af3017e5e8e0287b9fee87a721c27d84986542e7560a146`，app.asar SHA-256 `1a047e3b92afd849510220833699393f73c17c3fc4e77861862116db211282f7`。隔离 smoke：`runs/phase-6.6-instance-lock-smoke-20260902-04/`，包含 native lock acquired、studio-ready、renderer-ready、第二实例 denied、退出和无锁残留；未启动真实宠物预览，不宣称 runtime-ready。
- 新仓库内非覆盖交接：`release/handoff/phase-6-workbench-windows-recheck-20260902-04/`；绑定提交 `75b3021`，source ZIP SHA-256 `361db0d3f28df027d54590b98e797dad3e77af64cc268b53c9af0e057cd5aef0`，checksums SHA-256 `ce4711564bb5ea3168e5fa022444b7a4b36bb9959b4186bcb9838d063b97be4c`，6/6 校验通过，单一 ZIP 顶层、UTF-8/LF、零 AppleDouble/.DS_Store、零符号链接、空 RETURN；未写入 T7。
- `-03` 与历史交接保持不变；Windows source、win-unpacked、installed mode、100/125/150% DPI、动态 DPI、完整 GUI、卸载/重装和最终 RETURN 仍待 Windows 实机执行。

- T7 `-01` 回传（`RETURN/20260902-092429/`，Windows 验收失败）确诊：Windows 对已有符号链接 `fs.openSync(lockPath, 'wx')` 返回 EPERM，`src/workbench/instance-lock.js` 只处理 EEXIST，受控“工作台实例锁不安全”错误无法触发。
- 修复（D-027 临时授权，仅 `src/workbench/instance-lock.js` 与 `test/workbench-instance-lock.test.js`）：EPERM 仅在 `lstatSync` 证明锁路径为不安全对象（符号链接、非普通文件、超 1024 字节）时转换为受控错误；路径不存在或无法证明不安全时原样重抛原始 EPERM。fail-closed 不变，不读取符号链接目标，不删除不安全锁。
- 新增 4 个确定性 EPERM 回归测试（stub `fs.openSync`，try/finally 恢复）；聚焦 6/6、全量 136/136、typecheck/build/lint/source preflight/npm audit（0 vulnerabilities）/diff check 全部通过，日志位于 `logs/phase-6.6-instance-lock-repair-*.txt`。
- directory-importer 偶发 rename EPERM 保留为观察项，不在本轮修复范围。

### 修复提交与 macOS 候选（Task A/B）

- 修复提交：`5ac85289aa1dbb47f65b2afca05b792cb8c6550b`（`fix(workbench): handle Windows EPERM for unsafe instance locks`），提交后工作区干净。
- 新 macOS arm64 未签名内部候选：`release/workbench-candidates/candidate-20260902020633351/`；manifest 绑定提交 `5ac8528`，`worktreeClean: true`，`windowsInstalledMode: pending-external-return`。
- candidate-manifest.json SHA-256：`355dc11a4ddd89aed1d4657e0c4aa50617d8a7471d26b3df8035b92f30eae2a7`；主程序 SHA-256：`221d5695ab9eb2263b9107e4a5bb3f5780adc35963530e322673d5535e8eeae5`；app.asar SHA-256：`285029f38d02215b58bb62be9fcabb1d4c1b2f78decded9db8737b8ac33efd48`。
- 应用身份 `com.jinke.desktop-pet.studio` / 桌宠制作台，arm64，adhoc 未签名。
- 隔离 userData packaged smoke：`studio-start` → `single-instance-lock-acquired` → `studio-ready` → `renderer-ready` → SIGTERM 后 `studio-before-quit`；结束后精确进程数 0，实例锁文件已清理。本轮未启动真实预览桌宠，不宣称 `runtime-ready` 或完整 GUI 预览闭环通过。隔离 userData 保留于 `runs/phase-6.6-instance-lock-smoke-20260902-01/`（Git 忽略），未写入真实用户工作台目录，未递归删除。

### Windows 复验交接包 -02（Task C）

- 新非覆盖交接：`release/handoff/phase-6-workbench-windows-recheck-20260902-02/`（7 个文件，约 352K，含空 `RETURN/`）。
- source ZIP `source/pet-workbench-source-5ac8528.zip` 由 `git archive` 从提交 `5ac85289aa1dbb47f65b2afca05b792cb8c6550b` 生成：SHA-256 `3758831834ea379171c51ea4ab0ea1409ccad9ae8501e2cede16ce496f808d36`，174 个条目、单一顶层目录、零 `.DS_Store`/`._*`、零符号链接。
- `checksums.sha256` 覆盖 6 个输入（排除自身与 RETURN），UTF-8 无 BOM、LF、相对路径，自身 SHA-256 `a59f39d265c308fa8ce360ec1fa032eb4d9b72602313f05283cb6b436bf4cc4e`；macOS 侧 6/6 校验通过。
- 交接目录递归零元数据、零符号链接，`RETURN/` 为空；未写入或复制到 T7。
- Windows source、win-unpacked、installed mode、DPI、卸载/重装仍待新 RETURN，Phase 6.6 不提前关闭。

## 2026-09-02 最终 Windows 交接纠偏（-09）

- `-08` 来源链复核失败：`SOURCE-BASELINE.md` 的权威全量提交 `50d75ed711a...` 不存在；其 PRD、执行提示词和报告模板与 `-03` 对应文件逐字一致，仍要求实例锁 33/33、全量 184/184，并把文件锁描述为工作台权威锁。源码 ZIP 本身可由真实 HEAD 确定性重建，但整包不得用于 Windows 验收。
- 新本地交接：`release/handoff/phase-6-workbench-windows-recheck-20260902-09/`；T7 副本：`/Volumes/T7 Shield/phase-6-workbench-windows-recheck-20260902-09/`。
- 权威提交及 ZIP 内嵌提交：`50d75ed42d5ec955babf4a801c7bfb78a1e9a94b`；source ZIP SHA-256：`acc75d7c7ef3498065c93aa794779233c95cc3d4193801dd63cd11eea1d9b519`；checksums SHA-256：`405cf62781ce41d7b6a424f34d6083bd2649d0d58ccd4e6fb09e5e6909bcadbd`。
- 复验文档已更新为聚焦 76/76（实例锁 37、shell 6、RETURN 验证器 33）、全量 200/200，并明确 Electron `app.requestSingleInstanceLock()` 是唯一权威锁、文件锁仅作 fail-closed 诊断/回归。
- 本地与 T7 的 6/6 输入哈希均通过；ZIP 193 个文件、单一顶层、提交注释正确；文本 UTF-8 无 BOM/LF；零 AppleDouble/`.DS_Store`、零符号链接、RETURN 为空；源/目标 `rsync -nrc --delete --itemize-changes` 无差异。
- 结论仍为 Windows 验收准备完成、等待 `-09` 外部 RETURN。不得用本轮 macOS/静态证据宣布 Windows source、win-unpacked、installed mode、DPI、完整 GUI、卸载或重装通过。

## 2026-09-02/03 `-09` RETURN 根因修复与 `-10` 交接

### 回传复核（只读）

- `-09` RETURN（`/Volumes/T7 Shield/phase-6-workbench-windows-recheck-20260902-09/RETURN/20260902-172428/`）：`returned-checksums.sha256` 68/68 通过；验证器重跑仅 `status:overall` 预期失败（`overallStatus=failed`），无其他证据破损。
- 首个失败门 `G5-04-candidate-export-source`：应用内候选构建报 `Unknown argument: C:\...\electron-builder\out\cli\cli.js`。
- 另有 win-unpacked 预览 `spawn ... ENOENT`（cwd 落进 `app.asar`）与 `evidence/validator-output.txt` 自引用时序两处确定性问题。历史 RETURN 全程只读，未修改。

### 根因与修复链（提交顺序即层级顺序）

1. `25f5779`：新增仓库内 `src/workbench/builder-launcher.js`。Electron-as-Node 子进程中 `process.versions.electron` 存在且 `process.defaultApp` 为空，yargs 17 `hideBin` 只裁 argv[0]，把 cli 路径留作多余位置参数；launcher 在进入 electron-builder 前把 `process.argv` 规范化为与 hideBin 裁剪一致的形态。launcher 校验 CLI 路径必须等于受控 builderRoot 内的固定位置。同提交修复 packaged 预览 cwd（`resolvePreviewSpawnCwd` 在任何 stat 之前按 basename `app.asar` 判定并返回真实父目录，runtime entry 仍为 `app.asar/src/main.js`）与验证器流程（新增 `--output`，拒绝 RETURN 内路径，validator 输出不再进入 checksum 闭环）。
2. `7effcfa`：launcher 内设 `process.noAsar = true`。Electron-as-Node 子进程的 ASAR 补丁仍拦截对 `default_app.asar` 的写入（dist 模板解包后 electron-builder 覆写该文件），报 `Invalid package`；探针证实仅当目标已存在时触发。
3. `8d696ad`：候选 `files` 映射中 `{from: <abs>/package.json, to: 'package.json'}` 文件型 from 永远不会被 electron-builder 的 AppFileWalker 遍历，app.asar 缺 package.json 导致 sanity check 失败；改为 `{ from: buildAssetsRoot, to: '.', filter: ['package.json'] }`，真实 electron-builder 复现验证通过。
4. `e4eb38c`、`fe6905b`：工作台打包进程内读取候选 `app.asar`（ASAR 检查器 `inspectPackagedAsar` 与 manifest `hashFile`）被 ASAR 补丁拦截为 `ENOENT,  not found in .../app.asar`；两处同步读局部 `process.noAsar` 开关（try/finally 恢复），不全局关闭（`main.js` 仍依赖 asar 读渲染入口）。

### 回归与质量门

- RED→GREEN：launcher 真实 Electron+yargs argv 集成测试（含根因对照）、真实 `app.asar` 目录夹具预览 cwd、packaged builderRoot 协议、构建失败/取消证据、验证器 `--output` 与冻结后篡改失败、ASAR 检查器与 manifest 在真实 Electron 子进程内运行。
- 聚焦 117/117（实例锁 37、shell 6、验证器 36、launcher 8、预览 7、候选构建 9、ASAR 检查 6、构建计划 8）、全量 222/222、typecheck/build/lint/preflight/audit(0 vulnerabilities)/diff-check 全部通过。

### macOS 候选与 packaged smoke（`candidate-20260902153954972`，绑定 `fe6905b`，worktreeClean）

- 隔离 userData 位于 `~/Desktop/pet-studio-smoke-20260902`（注意：userData 置于 /tmp 会触发 electron-builder 系统路径防护，smoke 环境约束，非产品缺陷）。
- 启动：`studio-start packaged=true` → `single-instance-lock-acquired` → `studio-ready` → `renderer-ready`（app.asar 内渲染入口）；第二实例 `single-instance-lock-denied` 并退出。
- 导入 ZIP 宠物包（xiaofuxing，authorized）→ 项目界面正常显示；packaged 真实桌宠预览启动（预览 `runtime-ready product=studio-preview-7cc104 pet=xiaofuxing`）并停止，预览进程清零。
- 应用内 macOS 候选构建成功：builder 日志 0 次 `Unknown argument`、0 次 `Invalid package`，生成完整 `candidate-manifest.json`（productId、embedded selector、atlas 哈希与源一致、双产物 SHA-256）。
- 正常退出 `studio-before-quit`，精确进程数 0。
- 证据目录：`release/workbench-candidates/candidate-20260902153954972/smoke/`（studio/preview/构建日志、manifest、截图、哈希清单 `smoke-hashes.txt` 不含自身）。
- 过程中的两次应用内构建失败（ASAR 补丁写、缺 package.json）日志保留于同一 smoke 目录作为分层证据。

### Windows x64 交叉候选（仅静态参照）

- `release/workbench-candidates/candidate-20260902161102333/`，绑定 `fe6905b`、worktreeClean；`win-unpacked/DesktopPetStudio.exe` 与未签名 NSIS `desktop-pet-studio-0.1.0-x64.exe` 均已生成，builder 日志无错误。
- 该候选只证明 macOS 交叉打包链路可用，不代替 Windows 本机构建与验收。

### Windows 复验交接包 -10

- 新非覆盖目录 `release/handoff/phase-6-workbench-windows-recheck-20260902-10/`：SOURCE-BASELINE.md、PRD、执行提示词、报告模板、新版验证器、source ZIP（`pet-workbench-source-fe6905bf2.zip`，199 文件，内嵌提交 `fe6905bf22db925d8f89bf835c262f347cbf37fb`，SHA-256 `695ab3bb940c6d6d7aea7ce792e0e4b41727b4ac55576ee7a9b3944e19330f22`）与空 RETURN/。
- `checksums.sha256` 6/6 通过，自身 SHA-256 `a12323763724dd41d40ec80d6284e5c67a2cac39687d8c4f9e66dff7413a1851`；文本 UTF-8 无 BOM、LF；零 `.DS_Store`/`._*`、零符号链接。
- 解压树独立验证：`ditto` 解压（中文文件名完好）→ `npm ci` → 聚焦回归 117/117。
- 未写入或复制到 T7；`-09` 及更早交接与 RETURN 保持只读。
- Windows source、win-unpacked、installed mode、DPI、完整 GUI、卸载/重装结论全部等待 `-10` 新 RETURN；不得用本轮 macOS/静态证据宣布任何 Windows 门通过。
