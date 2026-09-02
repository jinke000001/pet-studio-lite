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

## 2026-09-02 本地最终收口（49b6592）

- 代码 checkpoint `75b3021`，记录与证据提交 `49b6592`；工作台以 Electron `app.requestSingleInstanceLock()` 为唯一权威单实例机制，文件锁仅作 fail-closed 诊断/回归。
- 三进程暂停竞态：旧实现 RED（A/B/C 均 acquired），修复后 GREEN（最多一个 acquired）；main.js 拒锁真实替身确认 store、恢复、controller、IPC、窗口均为 0。
- 最新候选 `release/workbench-candidates/candidate-20260902065319454/`：manifest SHA-256 `687a3a3c57b8ad7fb11b37439c4e8dcf83e130bd777af4e00649c7ba0da10511`，app.asar SHA-256 `1a047e3b92afd849510220833699393f73c17c3fc4e77861862116db211282f7`；隔离 smoke `runs/phase-6.6-instance-lock-smoke-20260902-05/` 通过 studio-start/native lock acquired/studio-ready/renderer-ready/second denied/before-quit/进程 0/无不安全锁残留。
- 最新仓库交接 `release/handoff/phase-6-workbench-windows-recheck-20260902-05/`：source ZIP SHA-256 `2f27e24719ec7fcd792d3b843239ddfad7b41bb26d2e1e37fac4c873b16139d8`，checksums SHA-256 `4087044759d373a99d4832d5754ccda2c4f592430fd711dc4dbe48a94c139ae4`，6/6 输入通过，RETURN 为空，未写入 T7。
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
