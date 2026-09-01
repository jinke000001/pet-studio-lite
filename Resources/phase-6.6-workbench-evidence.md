# Phase 6.6 工作台候选证据（进行中）

已生成 macOS arm64 未签名内部候选：`release/workbench-candidates/candidate-20260901083025663/artifacts/mac-arm64/桌宠制作台.app`。

- 主程序 SHA-256：`221d5695ab9eb2263b9107e4a5bb3f5780adc35963530e322673d5535e8eeae5`
- app.asar SHA-256：`842f7495eae355b39388cf470823731f7276d0eda0ba9c6b8492717ebd95636e`
- 候选 manifest 明确标注 `unsigned-internal-candidate`，Windows installed mode 为 `pending-external-return`。
- 使用隔离 userData 直接运行包内主程序，输出 `studio-ready`；随后 SIGINT 退出，进程清理。

自动门：108/108、typecheck、build、lint 通过。

Windows 独立验收交接已生成：`release/handoff/phase-6-workbench-windows-acceptance-20260901-01/`，含 PRD、执行提示词、报告模板、PowerShell RETURN 检查脚本、提交 `a0cada4` source ZIP 和 checksums；5/5 清单条目通过，`checksums.sha256` SHA-256 为 `77e0f8c49fe40901067c23298ed9bac6d362fcf0d535bc192286adf65e83eb77`。结论仅为“Windows 验收准备完成/待回传”。

剩余：完整 GUI 导入到导出复验、最终审查和 MEMORY 收口；因此 Phase 6.6 尚未关闭。
