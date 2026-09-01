# Phase 6.6 工作台候选证据（进行中）

已生成 macOS arm64 未签名内部候选：`release/workbench-candidates/candidate-20260901083025663/artifacts/mac-arm64/桌宠制作台.app`。

- 主程序 SHA-256：`221d5695ab9eb2263b9107e4a5bb3f5780adc35963530e322673d5535e8eeae5`
- app.asar SHA-256：`842f7495eae355b39388cf470823731f7276d0eda0ba9c6b8492717ebd95636e`
- 候选 manifest 明确标注 `unsigned-internal-candidate`，Windows installed mode 为 `pending-external-return`。
- 使用隔离 userData 直接运行包内主程序，输出 `studio-ready`；随后 SIGINT 退出，进程清理。

自动门：108/108、typecheck、build、lint 通过。

剩余：完整 GUI 导入到导出复验、Windows 独立交接包/checksums、最终审查和 MEMORY 收口；因此 Phase 6.6 尚未关闭。
