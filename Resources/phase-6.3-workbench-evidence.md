# Phase 6.3 工作台证据（部分）

已实现产品配置安全校验、项目内持久化及非覆盖可恢复项目包导出；配置包含产品名、版本、productId、appId、executableName、artifactName 和目标平台。导出 manifest 记录来源时间、产品身份和 SHA-256。

验证：`npm run studio:typecheck`、`npm test`（104/104）、`npm run lint`、`git diff --check` 通过。

尚未完成：标准宠物包和 macOS/Windows 候选构建的完整工作台任务化接入，以及 source/packaged/installed 真实证据。因此不能关闭 Phase 6.3 或宣布 Phase 6 完成。
