# Kimi M1 验收修正任务

请在原工作目录 `/Users/jinke00001/Desktop/pet-kimi-m1-20260908-01` 和原分支 `kimi/pet-studio-lite-m1` 上继续。先完整阅读：

`/Users/jinke00001/Desktop/pet/experiments/pet-studio-lite-agent-test-20260908-01/KIMI-ACCEPTANCE-20260908.md`

不要修改原项目 `/Users/jinke00001/Desktop/pet`，不要读取未来 Codex 实现，不要进入 M2。保留提交 `3ec29f6982b55d0843489e7dba661af1d3ae37ab`，用一个新的原子提交修正以下四项：

1. 真正移除 M1 默认运行链路中的 Claude/Codex transcript 扫描、token 监控与统计、LLM 网络调用、AI 配置 IPC、日记和 autonomy。不能只隐藏 UI；启动日志不得再出现 history scan、lifetime reconcile 或来源 watcher。现有旧状态中即使留有 LLM endpoint，也不得联网。保持任务需要的本地基础气泡即可。
2. Petdex 版本声明优先读取真实字段 `spriteVersionNumber`，兼容 `version` 别名；冲突、不支持值或声明与尺寸不一致必须拒绝并显示中文错误。
3. `NOM_PET_DIR` 为绝对最高优先级，不能被持久化 `activePetSlug` 或 `NOM_PET` 覆盖；显式目录无效时必须显示该目录错误，不能回退。
4. 缩放保持窗口 bottom-center 锚点，并夹紧在当前匹配显示器的 workArea；窗口与 renderer 尺寸同步。增加可重复的几何测试，覆盖右下角从 100% 放大到 200%。

同时补充自动测试：

- 真实字段 `spriteVersionNumber: 2` 被识别；声明 v1 配 v2 图集被拒绝；两个声明字段冲突被拒绝。
- `NOM_PET_DIR` 在旧 active slug 存在时仍加载指定目录。
- 启动/构建产物不再包含上面列出的 Token/LLM/历史扫描启动依赖，至少提供结构测试或可检查的模块边界。
- 缩放锚点与 workArea 夹紧。

完成后执行 `npm test`、`npm run typecheck`、`npm run build`、`npm audit --omit=dev` 和真实 Electron source-mode 预览。更新 `AGENT-REPORT.md` 与 `RUN-METRICS.json`，记录这是一次验收返工、增加了几次测试运行和一个修正提交；不要覆盖或美化第一次结果。Windows 继续明确写“未验收”。

