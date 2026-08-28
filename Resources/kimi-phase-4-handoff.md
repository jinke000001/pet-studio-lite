# Kimi Code Phase 4 独立候选交接

日期：2026-08-28

> 2026-08-28 范围更新：用户已确认小福猩按 Petdex v1 收尾，只保留九种标准动作，不制作四基准方向和 16 个注视方向。下文早期 v2 路线已由当前项目 MEMORY 和 `.kimi-code/skills/xiaofuxing-phase4/SKILL.md` 取代，历史目录保持不覆盖。

## 目标与状态

用户认为当前 Codex 生成的九种标准动作整体效果“一般”，希望 Kimi Code 从 Phase 4 主视觉开始制作一套独立候选用于并排比较。

现有 Codex 候选保留，不视为被否决或正式通过：

- 分支：`feature/xiaofuxing-v2`
- 当前记录提交：`10fd1db`
- 运行目录：`runs/phase-4-xiaofuxing-v2-20260827-01/`
- 已完成：主视觉、九种标准动作、8×9 联系表、192×208 GIF 和结构检查。
- 用户反馈：整体观感一般，未确认标准动作，没有进入四基准方向和 16 注视方向。

Kimi 的任务不是修改上述目录，而是建立新的比较候选。

## 推荐第一步

1. 在项目根目录启动 Kimi Code。
2. 调用：`/skill:xiaofuxing-phase4`
3. 先只读核对 `Resources/xiaofuxing-source-manifest.md`、五张原图哈希、Git 状态和可用图像生成工具。
4. 使用新的非覆盖目录：`runs/phase-4-xiaofuxing-v1-kimi-20260828-01/`。
5. 只生成主视觉和 `192×208` 预览，等待用户确认，不要立即生成九种动作。

## 不可覆盖范围

- `小福猩素材/` 下五张原始 JPG；
- `runs/phase-4-xiaofuxing-v2-20260827-01/`；
- `Wukong-Windows-Desktop-Pet-Handoff-20260731/`；
- `~/.codex/pets/` 与 `~/.petdex/pets/`；
- Phase 1–3 的代码、候选安装包和验证证据。

如果 Kimi 与 Codex 共用同一工作目录，不要切换分支、重置、清理或提交其他代理的改动。只有在独立 worktree 中才能自行创建 `feature/xiaofuxing-v2-kimi` 分支。

## 身份与素材

权威登记：`Resources/xiaofuxing-source-manifest.md`。

唯一身份基准是：

`小福猩素材/307322fa5ca9ee062be71a318055a043.jpg`

角色默认无服装、无道具。其他四张只能提供姿势、表情和侧面结构参考，必须排除领带、西装、领结、花和手提包。

## 输出与验收顺序

1. 主视觉原图和 `192×208` 预览，用户确认。
2. 九种标准动作逐行预览、8×9 联系表和 GIF，用户确认。
3. `1536×1872` v1 图集、`pet.json`、验证 JSON、SHA-256 和本地标准包。
4. 接入通用运行器和 Phase 3 工厂；Windows 正式验收仍在 Phase 4 完成后执行。

任何前一门未确认时，不得进入下一门。

## 工具边界

Kimi Code 支持 Agent Skills，但 Codex 版 `hatch-pet` 使用 Codex 专属 `$imagegen` 和编排约定，不能直接当作 Kimi 的可执行生成工具。

本项目提供 `.kimi-code/skills/xiaofuxing-phase4/SKILL.md` 作为 Kimi 兼容入口。它保留视觉契约和 QA 门，但要求 Kimi 在启动时自行确认真正可用的图像生成工具。如果 Kimi 会话没有该工具，应停止并说明缺口，不得用程序绘图或复制变形冒充生成结果。

确定性裁切和 QA 脚本可以只读参考 `/Users/jinke00001/.codex/skills/hatch-pet/scripts/`；不得修改其源文件。

## 已知风险

- 好看的大图在 `192×208` 下可能失去表情和动作可读性。
- 横向条带容易出现跨槽碎片；必须检查最终单格而不只看原始大图。
- `running` 表示任务处理中，不是方向跑步。
- 镜像左跑曾在 Codex 候选中产生碎片，Kimi 默认应独立生成左跑。
- Kimi 是否具备图像生成工具取决于实际会话配置；Skill 本身只提供工作流，不自动增加工具。
- Kimi/macOS 候选不能替代 Windows 正式验收。
