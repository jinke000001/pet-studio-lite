# Phase 6 工作台实例锁 Windows 深度修复计划（-03 轮）

## 问题

T7 `phase-6-workbench-windows-recheck-20260902-02` 回传（`RETURN/windows-workbench-recheck-20260902-02-20260902-111548/`，报告 SHA-256 以 RETURN 清单为准）确诊：权威提交 `5ac85289aa1dbb47f65b2afca05b792cb8c6550b` 的实例锁在 Windows 上 fail-open。Windows 对悬空符号链接执行 `fs.openSync(lockPath, 'wx')`（CREATE_NEW）会跟随链接并创建目标文件（本轮实测创建了 `D:\tmp`，51 字节锁记录，存证于 RETURN `automated/gate02-sideeffect-d-tmp-lock-content.bin`），锁被错误获取成功；现有 EPERM 修复只覆盖“open 失败”分支，未覆盖“open 成功但已跟随链接”分支。同时该回传的最终进程检查命令存在 PowerShell 语法错误（`environment/system-state-at-stop.log` 内 `MissingExpressionAfterOperator` ParserError），“精确进程数 0”未被证明；现有 RETURN 验证主要匹配报告关键词，无法阻止缺证据的假通过。

## 威胁模型（Phase A.1）

信任边界：锁目录（工作台 userData）以内的文件系统操作受本进程控制；锁路径本身及其目标对象不可信，可能被本地同用户进程、崩溃残留或人为放置的符号链接/junction/reparse point 污染。资产：工作台单实例语义（防止多实例并发写 userData 项目存储）、锁目录外任意路径不被创建/读写/删除、以及真实错误语义（权限与 I/O 错误不被误报为“不安全”）。攻击面：`acquireInstanceLock` 的创建/读取/恢复/释放四个文件系统动作，全部以不可信路径为操作对象。

## 滥用场景清单（Phase A.2）

1. 悬空链接：锁路径为指向不存在目标的符号链接；Windows `wx` 跟随并创建目标（本轮实测根因）。
2. 链接指向已有文件：创建/写入不得触碰目标内容与哈希。
3. junction/reparse point：锁路径为目录联接或其他 reparse point，必须拒绝而非跟随。
4. 损坏、空、超限记录：JSON 解析失败、空文件、超过 1024 字节 → fail-closed，不得当作死亡锁删除。
5. 并发启动：两个及以上真实进程同时获取，必须只有一个持有者。
6. 创建后崩溃：锁发布必须原子，不得留下半初始化记录被误判为死亡锁。
7. PID 复用：死亡 PID 被新进程复用时，ownership token 必须阻止误删/误判。
8. 获取后路径被替换：release 时锁路径已是外来对象，不得删除。
9. 释放时外来对象被放到锁路径：只有 token + pid 同时匹配才允许删除。
10. 文件系统不支持原子操作：硬链接等不可用时必须 fail-closed 并保留原始错误，不得降级为不安全实现。

## 成功标准

- 满足任务书第三节全部 10 条安全契约。
- 实例锁专项与全量测试、typecheck/build/lint/preflight/audit/diff check 全部通过，日志非覆盖保存于 `logs/`。
- 新协议在 macOS 以真实文件系统测试证明：悬空链接被拒绝且目标保持不存在；并发子进程只有一个持有者；替换对象不被释放误删。
- 新通用 RETURN 验证器以机器可读 `acceptance-state.json` 为准，夹具测试覆盖通过、缺证据、伪造 passed、错误哈希、NOT-EXECUTED 混入、进程命令失败。
- 生成新 macOS 候选（隔离 smoke）与非覆盖 `release/handoff/phase-6-workbench-windows-recheck-20260902-03/`；不复制到 T7。
- 聚焦 checkpoint commit，只含本轮文件，path-specific `git add`，不 push/merge/tag。

## 范围

允许修改：`src/workbench/instance-lock.js`、`test/workbench-instance-lock.test.js`、必要的新实例锁测试/探针、新通用 RETURN 验证脚本及其测试、本轮计划/证据/日志/MEMORY/tasks、新非覆盖候选与 `-03` 交接目录。禁止修改：`src/main.js`、renderer、preload/IPC 契约、产品/构建配置、package.json 与 lockfile、node_modules、用户宠物目录、`local-pets/`、历史候选/交接/RETURN、T7 任何文件。工作区现有 `MEMORY/MEMORY.md` 与 `MEMORY/事实.md` 未提交修改视为用户内容，只追加本轮记录，不回滚。

## 锁协议选型（Phase B 结论）

实验：`test/instance-lock-protocol-probe.js`（真实文件系统、10/10 通过，日志 `logs/phase-6-instance-lock-probe.txt`）。结论：macOS APFS 上 `linkSync(临时文件, 锁路径)` 与 `mkdirSync(锁路径)` 对悬空符号链接、指向文件/目录的符号链接、真实目录、普通文件全部返回 EEXIST，均不跟随目标叶节点，目标不产生；8 个真实子进程并发恰好 1 个发布成功。Windows 侧语义依据文档：`link(2)` 目标已存在（含悬空符号链接）即 EEXIST 且永不跟随目标；`CreateHardLinkW` 目标以任何形式存在（文件、符号链接、junction）即失败（Node 映射为 EEXIST/EPERM，两者本实现都按“锁已存在”分支处理并先 lstat 取证）。该文档假设由 `-03` Windows RETURN 的符号链接用例最终证明。

- 选择：方案 1（同目录随机临时文件完整写入 + fsync + 关闭 → `linkSync` 原子发布 → 删除自有临时文件）。记录格式扩展为 `{ pid, token, createdAt }`，token 为 128 位随机 ownership token；释放仅当 pid 与 token 同时匹配。
- 否决 1：open 前增加一次 lstat。TOCTOU：检查后、open 前路径可被替换为符号链接，Windows 仍跟随；不满足契约 1。
- 否决 2：方案 2（mkdir 目录锁）。原子性与安全性等价，但需管理目录内 owner 记录、目录树清理和“目录建成功但记录未落盘”的额外半初始化窗口，且旧版本兼容语义改动更大；不满足“最小方案”。
- 否决 3：Electron `requestSingleInstanceLock()`。改变模块边界且无法承载 token/死亡恢复/不安全对象拒绝语义，未证明不破坏工作台身份与 source/packaged 隔离。
- 兼容性：新锁是普通小文件，旧版本（5ac8528）看到它走原 EEXIST 路径：活持有者正确拒绝，死持有者按旧逻辑恢复；新版本读到无 token 的旧格式锁时按合法旧格式处理（pid 活则拒绝、死则恢复），仅释放严格要求 token 匹配（新锁必带 token）。旧版本看到新协议不会 fail-open。
- 残余风险（显式接受）：(a) 死亡锁恢复的 unlink 存在窄竞态——读取证明死亡后、删除前锁被活持有者重建，可能误删新锁；Node 无可移植的按 inode 比较删除，已通过“仅删除已验证记录 + 有限重试”收窄；(b) 记录读取采用前后双 lstat 比对（ino/size/mtime），收窄但无法在数学上消除读取期间的路径替换；(c) 不支持硬链接的文件系统上 `linkSync` 抛错，原始错误原样传播（fail-closed，工作台无法在该文件系统启动）；(d) 损坏/空/超限记录按契约 fail-closed 抛“工作台实例锁不安全。”，需要人工删除该锁文件后才能启动，这是契约 3 的有意取舍。

## 验证命令

- `node --test test/workbench-instance-lock.test.js`
- 新增并发/验证器聚焦测试
- `npm test`、`npm run studio:typecheck`、`npm run studio:build`、`npm run lint`、`npm run source:preflight`、`npm audit`、`git diff --check`

网络瞬时失败只原命令重试，不修改 registry、代理、镜像或系统网络。

## Phase D 审计结论

只读审计 `src/workbench/` 与相关测试：无“直接相关 + 高风险 + 可确定性 RED”三条件同时满足的项，本轮不做猜测性重构。记录的风险（不修复）：B-1 Windows 创建符号链接需开发者模式/特权，`-03` 提示词必须前置检查并在无权限时将验收状态写为 environment-blocked（不得跳过后宣称通过）；B-2 PID 复用时死亡锁可能误判为活锁导致拒启动，只能人工删锁，属接受的残余风险；B-3 并发子进程测试已加 30s 超时；B-4 project-store existsSync+rename TOCTOU 当前不可触发；B-5 studio.log 跟随符号链接（威胁模型内仅可追加）；B-6 不安全锁启动期裸抛静默退出（fail-closed 方向正确，缺诊断日志）；B-7 崩溃残留临时文件无 GC；B-8 preview 包发布同进程 TOCTOU（低风险）；B-9 旧测试临时目录普遍不清理（卫生问题，历史现状）；B-10 `test/workbench-workspace.test.js:30` 使用固定 `/tmp` 字面量（历史现状，不在本轮允许修改范围）。directory-importer rename EPERM 维持观察项，无确定性复现，不修复。

## 本轮结果（2026-09-02 收口）

- RED/GREEN 证据：`logs/phase-6-instance-lock-deep-RED.txt`（旧实现对 21 项矩阵 8 失败，含并发 4/6 同时持锁与 Windows 语义仿真目标被创建）、`logs/phase-6-instance-lock-deep-RED2.txt`（第一轮修复后 5 项新用例失败）、`logs/phase-6-instance-lock-deep-RED3.txt`（第二轮修复后 3 项新用例失败 + 1 项测试自身缺陷已修）、`logs/phase-6-instance-lock-deep-GREEN.txt`（最终 32/32；追加尾随分隔符用例后 33/33）。
- 对抗审查三轮：第一轮 11 项（修复 7、取舍记录 3、越界上报 1）；第二轮 6 项全部修复；第三轮无阻断/高级别发现，2 项低成本低级别项（尾随分隔符、测试 chunk 边界）已修，其余低级别残余（轮内目录替换窗口、取证 lstat 失败重抛发布错误、测试行计数已修为按行缓冲）记录于此。
- 最终质量门（日志 `logs/phase-6-gate-*.txt`）：实例锁聚焦 33/33、验证器聚焦 21/21、协议探针 10/10、`npm test` 184/184、studio:typecheck、studio:build、lint、source:preflight、`npm audit` 0 vulnerabilities（前四次遇官方 registry TLS 断开，原命令重试第五次通过，未改任何网络配置）、`git diff --check` 全部 exit 0。
- 越界上报项（未修，待用户授权）：`src/workbench/main.js` 在锁被拒后 `app.quit()` 为异步，模块级 `store.recoverInterruptedJobs()` 仍会执行，被拒的第二实例可能短暂并发读写 project store。
- macOS 门不证明 Windows；Windows source/win-unpacked/installed/DPI/卸载/重装均由 `-03` RETURN 证明。

## 回滚方式

回退 checkpoint commit 即可；新候选与 `-03` 交接均为非覆盖新目录。任何停止条件触发即保留证据停止，不生成 Windows 通过结论。

## 未验证边界

macOS 门与 packaged smoke 不证明 Windows source、win-unpacked、installed mode、DPI、卸载/重装；这些仅由 `-03` 的新 Windows RETURN 证明。directory-importer 偶发 rename EPERM 保持观察项。
