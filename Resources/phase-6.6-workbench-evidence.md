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

自动门：132/132、typecheck、build、lint、source preflight、npm audit 通过。

Windows 独立验收交接已更新至非覆盖目录：`release/handoff/phase-6-workbench-windows-acceptance-20260901-06/`；T7 副本位于 `/Volumes/T7 Shield/phase-6-workbench-windows-acceptance-20260901-06/`。该交接复用已核验的 `source/pet-workbench-source-87cdb25.zip`，基线提交为 `87cdb2571af214e0f24444a5112997137f7fa5e9`，checksums SHA-256 为 `339ad968b87fdc5e7f397bfe022567c18483ac41494ae0cfb85bc46fa251ab70`；本地与 T7 的 `RETURN/` 均为空。结论仅为“Windows 验收准备完成/待回传”。

## 2026-09-02 Windows 路径修复与复验交接

- T7 06 回传只读复核确认：输入 6/6、`npm ci` 通过；Windows 原生 `npm test` 为 132 项、129 通过、3 失败，失败均为测试夹具固定 POSIX 路径/正斜杠断言。旧报告 SHA-256 为 `c452776ae8fc6baaee8ba2a45e34e30e52065b59c96d2572049ca3a239a5a510`，旧回传清单 SHA-256 为 `6766acbcc905a83ad5395d2640ddf450f86e87ba5e3b2b9710742426e651fb38`。
- 最小修复仅修改 `test/workbench-candidate.test.js` 与 `test/workbench-preview.test.js`，生产 `candidate-builder.js`、`preview-controller.js` 未修改。修复提交：`a93a2e8a0fbc121e4d7c90cb5545c256c56cccd1`。
- 本机质量门：相关测试 8/8；全量 `npm test` 132/132；studio typecheck/build、lint、source preflight、npm audit（0 vulnerabilities）、git diff --check 全部通过。
- 新 macOS arm64 候选：`release/workbench-candidates/candidate-20260901160713659/`；manifest `584ded13c3f029e13cdd2cfca9267b9cef1181eba113fef2edd81011b2ab8ef6`，app.asar `5c057b7dcc8a6da9a30584e4511ec91274c8acc3bec2ff054add0cb2b5e95003`，主程序 `221d5695ab9eb2263b9107e4a5bb3f5780adc35963530e322673d5535e8eeae5`。packaged smoke 出现 `studio-ready`/`renderer-ready`，仅代表 macOS packaged 候选通过。
- 新仓库内非覆盖交接：`release/handoff/phase-6-workbench-windows-recheck-20260902-01/`；source ZIP `4a9c79bb5c5c3926c18358770ec785982fd5c1cff2a2e2a0f706245df82674c0`，基线 `a93a2e8`，checksums `c0f147f02bb4c675966bdb8cf8c11a0eb6976ae8286127f566bf5d91d055d7e2`，6/6 输入通过、LF/UTF-8、排除自身、RETURN 为空。
- T7 06 及其 RETURN 未修改；新交接未写入 T7。Windows source、win-unpacked、installed mode、DPI、导入预览、卸载/重装仍待新的 Windows RETURN，Phase 6.6 不提前关闭。
