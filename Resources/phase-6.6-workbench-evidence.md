# Phase 6.6 工作台候选证据（Windows 待外部验收）

已生成 macOS arm64 未签名内部候选：`release/workbench-candidates/candidate-20260901142719184/artifacts/mac-arm64/桌宠制作台.app`。

- 来源提交：`87cdb2571af214e0f24444a5112997137f7fa5e9`
- 本轮修复：packaged 模式下 runtime entry 仍位于 `app.asar/src/main.js`，但 `spawn.cwd` 改为 `app.asar` 的真实父目录；source-mode 目录路径保持不变。
- 新增测试覆盖该行为；`npm test` 实际为 132/132。

- 主程序 SHA-256：`221d5695ab9eb2263b9107e4a5bb3f5780adc35963530e322673d5535e8eeae5`
- app.asar SHA-256：`5c057b7dcc8a6da9a30584e4511ec91274c8acc3bec2ff054add0cb2b5e95003`
- candidate-manifest SHA-256：`07f765f63172f41090bbc5236367d9adb4c08121e6ee1cdc7624bf79bc086aa4`
- 候选 manifest 明确标注 `unsigned-internal-candidate`，Windows installed mode 为 `pending-external-return`。
- 使用隔离 userData 直接运行包内主程序，输出 `studio-ready` / `renderer-ready`；packaged runtime smoke 记录 `renderer-ready`、`runtime-ready`、`window-frame-synchronized`，未出现 ENOTDIR。
- Doraemon v1 本地目录导入已通过并落盘安全来源摘要与导入产物。
- Computer Use 在滚动布局下未形成稳定的 GUI 预览切换/停止点击证据，本轮不宣称完整 GUI 闭环通过。

自动门：132/132、typecheck、build、lint、source preflight、npm audit 通过。

Windows 独立验收交接已更新至非覆盖目录：`release/handoff/phase-6-workbench-windows-acceptance-20260901-06/`；T7 副本位于 `/Volumes/T7 Shield/phase-6-workbench-windows-acceptance-20260901-06/`。该交接复用已核验的 `source/pet-workbench-source-87cdb25.zip`，基线提交为 `87cdb2571af214e0f24444a5112997137f7fa5e9`，checksums SHA-256 为 `339ad968b87fdc5e7f397bfe022567c18483ac41494ae0cfb85bc46fa251ab70`；本地与 T7 的 `RETURN/` 均为空。结论仅为“Windows 验收准备完成/待回传”。

剩余：完整 GUI 导入到导出复验和 Windows 实机 RETURN；因此 Phase 6.6 尚未关闭。
