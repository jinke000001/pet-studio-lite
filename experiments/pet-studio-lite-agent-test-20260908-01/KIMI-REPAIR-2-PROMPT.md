# Kimi M1 第二次验收修正

继续使用：

- 工作目录：`/Users/jinke00001/Desktop/pet-kimi-m1-20260908-01`
- 分支：`kimi/pet-studio-lite-m1`
- 当前提交：`1824c91160f067b51ca1a9fe8607f271017dd72d`

先完整阅读：

`/Users/jinke00001/Desktop/pet/experiments/pet-studio-lite-agent-test-20260908-01/KIMI-ACCEPTANCE-ROUND2-20260908.md`

不要进入 M2，不要读取未来 Codex 实现，不要修改原项目。用一个新的、独立的原子提交只关闭以下两项，并顺手清理同源旧文案。

## 1. 独立产品身份与数据目录

- 不再使用 `nom` 的 package name、`com.nom.pet`、productName、窗口标题或 `~/.nom/state.json`。
- 使用明确的新身份，例如 package `pet-studio-lite-runtime`、productName `Pet Studio Lite Runtime`、稳定且不与上游冲突的 appId。
- `Store` 不自行拼接 home 目录；由 main 把 `app.getPath('userData')` 或明确的数据根注入 Store，测试直接注入临时目录，不修改 `HOME`。
- 启动时绝不读取、迁移、清除或覆盖 `/Users/jinke00001/.nom/state.json`。删除当前“旧 nom 状态 scrub”逻辑及其破坏性测试，改成“旧文件哈希保持不变”的隔离测试。
- 新产品自己的 `pets` 目录放在新 userData 下。“打开宠物文件夹”只创建该目录；`.codex/pets` 如继续兼容，只能只读，且没有该目录时完全正常。
- 更新 README、CLAUDE.md、package metadata 和界面标题。删除本地台词中的 token/烧 token 文案和已无用途的 LLM/soul CSS。

## 2. IPC 运行时校验

- main process 在使用 payload 前校验，不能依赖 TypeScript 类型。
- `setWanderEnabled` 只接受 boolean；非法值拒绝且状态不变。
- `setPetName` 只接受 string，trim 后非空并限制长度；对象/数组/null/超长输入不得让 handler 抛出未处理异常或污染状态。
- drag begin/move、window move 只接受有限数字；NaN、Infinity、缺字段和错误对象应被安全忽略或返回结构化错误。
- 尽量把校验做成纯函数或窄模块并自动测试；preload API 保持最小。

## 验证要求

- 新增测试证明新数据根与 `.nom` 隔离；在 fixture `.nom/state.json` 存在时运行 Store，原文件 SHA-256 不变。
- 新增上述非法 IPC payload 的单元或行为测试，至少覆盖错误 boolean、对象名字、NaN/Infinity 和缺失字段。
- `npm test`、`npm run typecheck`、`npm run build`、fresh build 后再次 runtime test、`npm audit --omit=dev` 全部执行。
- 真实 source-mode 启动一次，日志只显示新产品自己的数据路径/宠物加载信息；确认 `/Users/jinke00001/.nom/state.json` 前后 SHA-256 不变。
- 更新 `AGENT-REPORT.md` 与 `RUN-METRICS.json`，追加第二次返工记录，不改写前两轮历史；Windows 继续写未验收。

