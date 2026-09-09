# Kimi M1 第二轮独立验收

## 结论

- 复验提交：`1824c91160f067b51ca1a9fe8607f271017dd72d`
- 父提交：`3ec29f6982b55d0843489e7dba661af1d3ae37ab`
- 工作区：干净，修正保持为独立提交
- 原四项 Required：**全部关闭**
- 第二轮总判定：**Request changes（新增 1 个 Critical、1 个 Required）**
- Codex 工程侧暂定分：**80/100**，不是用户最终体验分或订阅结论

## 原四项关闭证据

1. 离线范围：删除 16 个旧 main 子系统与 card/journal/onboarding renderer；fresh build 的 main bundle 从约 124 KB 降至 28 KB；启动日志不再出现 transcript/history scan、token watcher 或 LLM 请求。
2. 真实版本字段：`spriteVersionNumber`、别名冲突、声明与尺寸冲突反例均通过测试。
3. 显式目录：旧 `activePetSlug` 与 `NOM_PET` 同时存在时，`NOM_PET_DIR` 仍正确加载指定 v2 包；坏目录不回退。
4. 缩放几何：纯函数覆盖 bottom-center 与 workArea；实现使用 `screen.getDisplayMatching()` 后应用新尺寸与位置。

独立执行结果：

- `npm test`：74/74（petpack 33 + runtime 41）。
- `npm run typecheck`：通过。
- `npm run build`：通过；随后再次执行 runtime 41/41，证明结构测试检查的是新构建产物。
- `npm audit --omit=dev`：0 vulnerabilities。
- 真实 Electron：fixture-v2 加载、本地单击气泡、拖动窗口均通过；没有 token HUD 或扫描日志。
- 现场截图：`evidence/codex-repair-live.png`，SHA-256 `e6581f6472264dc927e53748f3358a28e0a3a283d518587a45aba3ca4075ad3b`。

## 新发现

### Critical：新产品继续占用上游 nom 的身份与数据目录，并破坏旧数据

实现仍使用：

- npm 名称 `nom` 与描述 `A desktop pet that eats your AI tokens.`；
- Electron `appId: com.nom.pet`、`productName: nom`；
- 设置文件 `/Users/jinke00001/.nom/state.json`；
- “打开宠物文件夹”会创建和写入 `/Users/jinke00001/.codex/pets`。

独立真实启动前，现有 `.nom/state.json` SHA-256 为 `fe6fea98…a5ef`。启动约一秒后被自动迁移为 schema 8，SHA-256 变为 `cc5de319…cc017`，旧 tokens、seal、LLM 等字段被删除。新产品不应破坏上游 nom 的用户数据，也不应在“独立于 Codex”的模式下把自己的宠物目录写到 `.codex`。

复验结束已恢复原文件，恢复后 SHA-256 再次为 `fe6fea9884e66bd0ea7e55e8105978a8fb3e50f038b8a50ae3870486e9b8a5ef`。

修复方向：建立独立产品身份和 userData 目录；`Store` 由 main 注入 `app.getPath('userData')` 或显式数据根；绝不读取、迁移或重写 `.nom/state.json`。自己的宠物目录位于新 userData 下；`.codex/pets` 最多作为只读兼容输入源。

### Required：preload 面变小，但 IPC 没有运行时验证

任务书要求最小且校验过的桥。当前 main handler 直接相信 renderer 类型：

- 独立反例 `window.nom.setWanderEnabled('not-a-boolean')` 被接受，返回的 `wanderEnabled` 实际类型为 string，并进入状态。
- 独立反例 `window.nom.setPetName({bad:true})` 使 main handler 抛出 `TypeError: trim is not a function`。
- drag begin/move 和 window move 同样在 destructure 后直接参与算术，没有先检查 finite number。

TypeScript 类型不会约束运行时 IPC。修正时应在 main 边界拒绝或忽略非法 payload，保证不崩溃、不移动窗口、不污染状态，并为 boolean、字符串长度、NaN/Infinity、缺字段和错误对象增加测试。

## 非阻断清理项

- README 顶部仍声称读取 token 用量，与当前源码不符。
- `package.json` 和本地气泡仍有“吃 token”旧品牌文案，不符合通用桌宠方向。
- `src/renderer/settings/styles.css` 留有已删除 LLM/soul 界面的死样式。

这些可与产品身份修正一并清理，不需要再单独扩大一轮。

## 使用体验观察

Kimi 对第一次评审的响应质量较高：没有争辩或降低标准，而是用一次独立提交删除大量越界代码、补齐反例和真实预览，四个指定问题确实全部关闭。第二轮暴露的问题说明它在按清单执行时很强，但对“新 fork 不得碰旧产品数据”和“TypeScript 不是运行时校验”这类未明确列出的系统边界仍需要审查者补位。

## 下一门

执行 `KIMI-REPAIR-2-PROMPT.md`。本次只处理身份/数据隔离、IPC 验证和相关旧文案，不再改动 Petdex 解析、动画或缩放算法。关闭后即可给出 M1 最终结论。

