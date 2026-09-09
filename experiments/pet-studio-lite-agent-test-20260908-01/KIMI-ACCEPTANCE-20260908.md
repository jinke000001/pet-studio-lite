# Kimi M1 独立验收记录

## 结论

- 评审对象：`/Users/jinke00001/Desktop/pet-kimi-m1-20260908-01`
- 固定基线：`10c7f136d942cc42ae5b2b4d1e3aa6d5994c455a`
- Kimi 提交：`3ec29f6982b55d0843489e7dba661af1d3ae37ab`
- 工作区状态：干净，单提交，未推送
- 验收结论：**Request changes（核心原型可运行，M1 尚未正式通过）**
- Codex 工程侧暂定分：**73/100**。这不是用户体验最终分，也不能用于最终订阅结论。

## 已独立复核通过

1. 基线、分支与提交可追溯；没有修改原项目。
2. `npm test`：25/25 通过。
3. `npm run typecheck`：通过。
4. `npm run build`：通过。
5. `npm audit --omit=dev`：0 vulnerabilities。
6. 仓库确实没有 lint 配置，Kimi 没有伪造 lint 结果。
7. 真实 Petdex v1 Doraemon 校验通过，识别为 v1。
8. 真实 Petdex v2 Boba WebP 可加载并由 Chromium 解码为 1536×2288。
9. 真实 Electron 窗口中复核通过：v2 PNG 预览、单击切换动作并出现本地气泡、拖动后窗口坐标变化、坏包显示中文错误。
10. 报告明确保留“Windows 未验收”边界，没有用 macOS 冒充 Windows 结论。

现场证据：

- `evidence/codex-live-v2-before.png`，SHA-256 `b9434ca8c3fb396c22fd709f68c631b9a094e5cea40cc3ab2126d050f2db8f14`
- `evidence/codex-live-v2-after-click.png`，SHA-256 `81d860535d9abab173f8f3b2d70b70f22bd3872997762d2ecf16785e9a5b6b82`
- `evidence/codex-live-error.png`，SHA-256 `0fa34de3b5cef4e7917f849c6023c11c4521d8226a0a4e9557e7989cac4de5e9`

验收期间应用会修改 `/Users/jinke00001/.nom/state.json`；复核结束后已从只读备份恢复，恢复前后 SHA-256 均为 `fe6fea9884e66bd0ea7e55e8105978a8fb3e50f038b8a50ae3870486e9b8a5ef`。

## 必须修正的问题

### 1. 离线与范围收缩没有真正成立

严重度：Required，阻断 M1。

界面虽然移除了 AI 设置卡片，但 main process 仍启动 Claude/Codex 来源监控、近期与全量历史扫描、token 统计、日记、autonomy 和 LLM IPC。独立复核每次启动都实际输出 `history scan` 与 `lifetime reconcile`，扫描了数十到数百个 Codex 会话文件，并改写 token 状态。旧 `state.json` 若保留 `llm.enabled` 与 autonomy，隐藏的 main-process `fetch` 路径仍可能联网，而界面已没有清除配置的入口。

这与“完全离线、无 Codex 依赖”和只保留桌宠基础互动的任务边界冲突。M1 应删除这些启动链路及 renderer 订阅，或建立一个真正不可绕过的 offline runtime mode；仅隐藏设置界面不够。

证据位置：

- `src/main/index.ts:5-14` 创建旧来源与 AI 模块依赖。
- `src/main/index.ts:568-573` 无条件执行全量历史恢复。
- `src/main/index.ts:580-667` 保留 LLM 配置、测试与生成 IPC。
- `src/main/index.ts:735-798` 保留日记、token 来源监听与 autonomy heartbeat。
- `src/renderer/App.tsx:98-114` 点击仍先请求 LLM 台词。

### 2. 没有读取 Petdex 的真实版本字段

严重度：Required。

真实 Petdex v2 包使用 `spriteVersionNumber: 2`，实现只读取 `obj.version`。反例包声明 `spriteVersionNumber: 1`、实际使用 v2 图集时仍被接受，并记录 `declaredVersion: null`。因此“声明版本与尺寸交叉校验”的报告结论不完整。

修正要求：优先读取 `spriteVersionNumber`，可兼容 `version` 别名；两个字段同时存在且冲突时拒绝；增加真实字段的 v1/v2、无字段 v1、冲突和尺寸不一致测试。

证据位置：`src/main/data/petpack.ts:133-137`、`src/main/data/petpack.ts:186-190`。

### 3. `NOM_PET_DIR` 会被旧的 active slug 意外覆盖

严重度：Required。

文档把 `NOM_PET_DIR` 定义为最高优先级，但 `collectCandidates()` 只有在目录 slug 与持久化 `activePetSlug` 一致时才加入它。独立反例中，合法 Doraemon 目录加一个旧 slug 会返回“找不到指定宠物包”。这会让开发预览因为历史设置失败。

修正要求：设置了 `NOM_PET_DIR` 时始终只校验和加载该目录，不受持久化 slug 影响；坏目录仍直接显示错误。

证据位置：`src/main/data/pet-loader.ts:34-45`、`src/main/data/pet-loader.ts:144-160`。

### 4. 缩放没有保持锚点或限制在屏幕工作区

严重度：Required。

`setZoom()` 只调用 `setSize()`，没有根据旧窗口 bottom-center 重新计算位置，也没有用匹配显示器 workArea 夹紧。新用户的默认窗口靠近右下角，从 100% 放大到 200% 会向右下越出工作区；Kimi 的人工测试是在先拖到屏幕中间后进行，没有覆盖默认位置反例。

修正要求：保持 bottom-center 锚点、使用 `screen.getDisplayMatching()` 的 workArea 夹紧，窗口尺寸与 renderer 同步，并添加纯逻辑测试。

证据位置：`src/main/index.ts:222-232`。

## 报告与证据质量观察

- `assets/screenshots/m1-v2-preview.png` 能看到实际色块宠物窗口。
- `assets/screenshots/m1-error-panel.png` 本身主要显示 Kimi 的文字界面，没有清楚拍到红色错误面板；产品错误面板由本次独立 CDP 复核确认通过，并补存 `evidence/codex-live-error.png`。
- 报告同时写“本机真实水獭可加载”和“没有真实 v2 素材”，表述互相冲突。独立复核已经确认 Boba 是真实 v2 WebP 且可以解码。
- `RUN-METRICS.json` 对命令数明确标注估算，做法诚实；但版本可在用户终端查得为 Kimi Code `0.41.0`，默认模型配置为 `kimi-code/k3`。

## 暂定能力画像

Kimi 在约 40 分钟内、零用户提问的情况下完成了可运行的跨层原型，并主动提供测试、报告、提交和截图，执行速度与自主性很强。主要短板是“在旧产品上加新能力”多于“按新范围真正删除旧能力”，同时自建测试只覆盖了自己采用的字段名，没有用真实 Petdex 合同做反例。现阶段更适合作为快速原型执行者，关键合同、安全、隐私与范围收敛仍需要第二模型审查。

## 下一门

把 `KIMI-REPAIR-PROMPT.md` 原样交给原 Kimi 会话，允许它在同一分支新增一个独立修正提交。修正后重新运行相同验收；在四个 Required 问题关闭前不进入 M2，也不合并到原项目。

