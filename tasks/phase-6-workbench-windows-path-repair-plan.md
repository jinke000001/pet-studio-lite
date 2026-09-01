# Phase 6.6 Windows 路径可移植性修复与复验计划

## 问题

T7 06 回传在 Windows 原生 `npm test` 的终止门出现 132 项测试中 3 项失败。失败来自 `test/workbench-candidate.test.js` 与 `test/workbench-preview.test.js` 将 `/repo`、`/tmp/out`、`/application` 等 POSIX 固定路径写入夹具，并对 `path.join`、`path.resolve` 或 runtime entry 做正斜杠固定断言。`returned-checksums.sha256` 使用 CRLF，去除 CRLF 后可复核 10/10，属于清单换行可移植性问题。

## 成功标准

- 相关工作台测试和全量 `npm test` 在本机通过，保持断言强度，不按平台跳过。
- `studio:typecheck`、`studio:build`、`lint`、`source:preflight`、`npm audit`、`git diff --check` 全部通过。
- 根因记录为测试路径夹具不可移植；不修改生产路径逻辑，除非新增回归证据证明生产缺陷。
- 在干净修复提交上生成新的 macOS packaged 候选并完成 smoke，精确记录提交与 SHA-256；不得写成 Windows installed-mode 通过。
- 在仓库内生成新的非覆盖 Windows 复验交接包，source ZIP 单一顶层目录、输入 checksums 全部通过、UTF-8 中文路径/无元数据/无符号链接校验通过，并保留空 `RETURN/`。

## 范围

- 修改两个工作台测试夹具：使用 `node:path` 与 `os.tmpdir()`/本机绝对根路径构造 native fixture；期望值由 `path.join`、`path.dirname`、`path.resolve` 推导。
- 更新本轮任务、计划、MEMORY 和 Phase 6.6 证据。
- 生成新的仓库内候选与交接包，不覆盖历史候选或旧交接。

## 约束与未验证边界

- T7 `phase-6-workbench-windows-acceptance-20260901-06` 及 RETURN 只读；不写入 T7。
- 不修改用户宠物目录、五个 local-pets、批准素材、历史候选、历史 RETURN 或无关 UI/IPC/导入器/运行器/构建架构。
- macOS/static 构建不能证明 Windows source、win-unpacked、installed mode、DPI、卸载或重装；这些仅由新的 Windows RETURN 验证。
- 不升级依赖、不统一替换为正斜杠、不安装/卸载系统应用、不修改网络或 npm 永久配置。

## 初步方案

1. 保留并整合现有脏工作区文档，建立本轮待办。
2. 先运行两个相关测试确认失败，再最小修改测试夹具并复跑；随后执行完整质量门。
3. 审查 diff 后创建聚焦本地 checkpoint commit，确认工作区干净。
4. 在该提交上构建 macOS arm64 候选与隔离 packaged smoke；记录 `studio-ready`、`renderer-ready`、`runtime-ready` 门及哈希。
5. 从精确提交生成 `release/handoff/phase-6-workbench-windows-recheck-20260902-01/`，使用 LF UTF-8 checksums 和受控验证脚本，校验 ZIP 与输入清单。

## 回滚方式

代码修复仅涉及测试文件，可通过回退本轮 checkpoint commit 恢复；候选和交接包均为新建非覆盖目录，可单独保留或移除，不触及 T7 与历史产物。若质量门失败，停止后保留日志并不生成 Windows 通过结论。

