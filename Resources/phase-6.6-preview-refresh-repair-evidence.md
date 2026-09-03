# Phase 6.6 预览刷新缺陷修复证据（2026-09-03，-11 轮）

## 缺陷与根因

- 权威失败证据：T7 `phase-6-workbench-windows-recheck-20260902-10/RETURN/20260903-194712-supplement/`，
  overallStatus=failed，首个失败门 `S6-defect-preview-killed-by-job-ack-loop`
  （Mac 侧复核：主回传 75/75、补验 15667/15667 哈希通过）。
- 根因：`ProjectWorkspace.tsx` 任务轮询对每个未确认的历史成功任务调用
  `openProject(project.id)`；`main.js` 的 `workbench:open-project` 无条件
  `previewController.stop()`；`get-bootstrap` 恢复时不登记 `activeProjectId`。
  因此项目打开后 N 个历史成功任务的排空窗口内启动的预览被下一次轮询节拍杀死。

## 修复（提交 `e5a69ba2e0573a8cdb362d6ec6bc868c364e2d66`）

- 新增 `src/workbench/project-lifecycle.js`：集中跟踪 `activeProjectId`；仅在切换
  项目时取消旧项目任务，仅在运行中的预览属于其它项目时停止预览；同项目重开为
  无副作用只读重载。`get-bootstrap`/`create-project` 同步登记活动项目身份。
- `ProjectWorkspace.tsx` 轮询改用 `src/workbench/renderer/job-refresh.js`
  观察器：首次轮询只建基线，历史成功任务不触发项目打开；仅本会话观察到迁移为
  succeeded 的任务触发一次数据刷新；发起刷新前检查挂载状态。
- 未修改 preload/IPC 通道、权限校验、单实例锁、builder launcher、ASAR 处理与
  透明桌宠运行内核；未新增 IPC（同项目 open-project 修复后即为只读重载接口）。

## 回归测试（行为级，先红后绿）

- 新增 `test/workbench-project-lifecycle.test.js`（7 项）与
  `test/workbench-job-refresh.test.js`（5 项）。
- 红证据：对保持旧语义的抽取实现运行新测试，3 项确定性失败
  （`runs/phase-6.6-preview-refresh-repair-20260903-01/regression-red-before-fix.log`）。
- 绿证据：修复后聚焦 18/18
  （`runs/phase-6.6-preview-refresh-repair-20260903-01/regression-green-after-fix.log`）。

## Mac 真实运行验证（隔离 userData + CDP 驱动真实 renderer）

证据目录：`runs/phase-6.6-preview-refresh-repair-20260903-01/`。

- 旧代码端到端复现：基于 `c0ce641` 隔离 worktree 构建旧 renderer，含 5 个历史成功
  任务的项目启动预览后约 3 秒被静默停止（`oldcode.jsonl`：点击后 3 秒状态 stopped、
  预览子进程消失、界面按钮滞留“停止真实桌宠”——与 Windows 证据一致）。
- source 模式（`source.jsonl`）：5 个历史成功任务项目恢复后立即启动预览，存活
  ≥13 秒（12+ 轮询周期，pid 11369 稳定）；新导出任务成功后产物 1→2 且预览继续；
  切换项目正确停止旧预览；重启恢复后再启动预览存活 ≥11 秒（pid 11751）；
  显式停止生效；退出后进程清零。
- packaged 模式（`packaged.jsonl`，候选 `candidate-20260903150205539`）：同一组
  场景全部通过（pid 13699/13915）；退出后进程清零。
- UI 截图（CDP `Page.captureScreenshot`，因主机锁屏无法截取屏幕合成画面）：
  `02-workbench-preview-running-cdp.png`、`03-workbench-preview-panel-cdp.png`、
  `04-packaged-preview-running-cdp.png`（预览运行中、按钮为“停止真实桌宠”、
  联系表逐帧动画正常）。
- 缺失门说明：主机锁屏期间无法获得物理屏幕合成截图（透明窗与桌面合成画面），
  以 CDP 页面渲染截图 + 进程时间线替代；透明窗渲染能力本身由 Phase 6.2/6.3/6.6
  既有证据覆盖，本缺陷为生命周期问题。

## 质量门

- 聚焦 129/129（新增生命周期 7 + 任务刷新 5）；全量 `npm test` 234/234；
  `studio:typecheck`、`studio:build`、`lint`、`source:preflight`、
  `npm audit --omit=dev`（0 漏洞）、`git diff --check` 全部通过。

## 候选与交接

- macOS 候选：`release/workbench-candidates/candidate-20260903150205539/`
  （绑定 `e5a69ba`，worktreeClean；app.asar SHA-256
  `ba8364183787a2d1add641c2d75791a39a8a57b60be6697a8ab58a1db1b83b08`）。
- Windows x64 交叉参考候选：`release/workbench-candidates/candidate-20260903150735869/`
  （绑定 `e5a69ba`；NSIS SHA-256
  `8dcf0fc0495be5d4fb93fb45f6107c99131243f58b4c74730421b187a94c4f64`；仅静态参照）。
- 新交接：`release/handoff/phase-6-workbench-windows-recheck-20260903-11/`，
  已非覆盖复制到 T7 同名目录；9/9 输入哈希、逐字节一致性、零元数据、零符号链接、
  空 RETURN 全部通过；`checksums.sha256` SHA-256
  `62d003b7411b5dc6b8214259a822de0ef0b38b1245c679f1ee921c357debfd15`。
- Git bundle 恢复演练：全新目录克隆后 HEAD 恰为
  `e5a69ba2e0573a8cdb362d6ec6bc868c364e2d66`、工作树干净、与源码 ZIP 解压树
  逐字节一致（202 文件）。

## 状态

本地修复完成，等待新 Windows RETURN。Windows source、win-unpacked、installed mode、
DPI、S7、用户确认门均 `pending external RETURN`；Mac 独立核验新 RETURN 前不关闭
Phase 6.6。
