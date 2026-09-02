# Phase 6.6 工作台实例锁 Windows EPERM 修复与复验计划

## 问题

T7 `phase-6-workbench-windows-recheck-20260902-01` 回传（`RETURN/20260902-092429/`）显示：Windows 三次全量测试与一次聚焦测试均确定性复现 `test/workbench-instance-lock.test.js` 符号链接用例失败。Windows 上对**已存在的符号链接**执行 `fs.openSync(lockPath, 'wx')`（`O_CREAT|O_EXCL`）返回 `EPERM`，而 POSIX 返回 `EEXIST`；`src/workbench/instance-lock.js` 只把 `EEXIST` 映射进安全检查路径，`EPERM` 未经处理直接逃逸为原始系统错误。

同一回传另记录一次 `directory-importer` rename EPERM 偶发失败（聚焦连续三次通过），判定为瞬时环境竞态，**不在本轮修复范围**，仅作为观察项保留。

## 成功标准

- `src/workbench/instance-lock.js` 保持 fail-closed：EPERM 只在 `lstatSync`（不跟随符号链接）明确证明锁路径为不安全对象（符号链接、非普通文件、超过 1024 字节限制）时转换为“工作台实例锁不安全。”受控错误。
- 路径不存在、lstat 无法证明对象不安全或属于其他权限错误时，原样重新抛出原始 EPERM，不掩盖真实错误。
- 不读取符号链接目标，不删除不安全锁，不降低现有安全检查；EEXIST 行为不变。
- 新增可在 macOS 确定性模拟 Windows EPERM 的回归测试（stub `fs.openSync`，try/finally 恢复），不依赖测试机平台。
- 聚焦测试 6/6、全量 `npm test` 136/136、typecheck/build/lint/source preflight/npm audit（0 vulnerabilities）/git diff --check 全部通过。
- 在干净修复提交上生成新的 macOS 候选并完成隔离 packaged smoke；不得写成 Windows installed-mode 通过。
- 生成新的仓库内非覆盖交接包 `release/handoff/phase-6-workbench-windows-recheck-20260902-02/`，不写入 T7。

## 范围

- 仅允许修改：`src/workbench/instance-lock.js`、`test/workbench-instance-lock.test.js`，以及本轮计划、日志、MEMORY、tasks 与证据文档。
- 不修改 `src/main.js`、`src/import/directory-importer.js`、renderer、产品配置、package.json/lock、node_modules 或任何历史产物。
- 用户本轮临时放宽“Kimi 只修改 renderer”的历史边界，仅授权 Kimi 修改实例锁实现、对应测试和收口证据；Codex 已独立审查安全逻辑。该授权不扩展到其他主进程、IPC、导入器或构建逻辑。

## 验证命令

- `node --test test/workbench-instance-lock.test.js`
- `npm test`
- `npm run studio:typecheck`
- `npm run studio:build`
- `npm run lint`
- `npm run source:preflight`
- `npm audit`
- `git diff --check`

日志以 `logs/phase-6.6-instance-lock-repair-*.txt` 非覆盖保存。网络瞬时失败只允许原命令重试，不修改 registry、代理、镜像或系统网络设置。

## 回滚方式

回退修复提交即可恢复原实现；新候选与新交接包均为非覆盖新目录，可单独保留或移除，不触及 T7、旧交接包或历史 RETURN。质量门失败即停止，保留日志，不生成 Windows 通过结论。

## 未验证边界

macOS 自动门与 packaged smoke 不能证明 Windows source、win-unpacked、installed mode、100%/125%/150% DPI、动态 DPI、官方卸载或同包重装；这些仅由新的 Windows RETURN 验证。directory-importer 偶发 rename EPERM 保持观察，不预判通过或失败。
