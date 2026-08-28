# 小福猩九动作修正版候选证据

日期：2026-08-28

## 状态

> 本文件记录 2026-08-28 的第一轮修正版历史状态。左右跑后续已在非覆盖目录 `runs/phase-4-xiaofuxing-v2-codex-running-ref-20260828-01/` 重做并获用户确认；最新批准证据见 `Resources/xiaofuxing-running-reference-evidence.md`。

- 候选目录：`runs/phase-4-xiaofuxing-v2-codex-repair-20260828-01/`
- 基线目录：`runs/phase-4-xiaofuxing-v2-20260827-01/`
- 当前结论：九种标准动作修正版候选已完成结构与隔离视觉复核；用户确认 `idle`、`waving`、`jumping`、`failed`、`waiting`、`running`、`review` 可以保留，但 `running-right` 与 `running-left` 仍不满意，因此九动作整体尚未通过。
- 当时未进入：四基准方向、16 注视方向、最终图集、运行器接入、候选构建和 Windows 验收。后续用户已确认按 v1 收尾，因此方向范围取消。

## 修正范围

- 重做：`idle`、`running-right`、`running-left`、`failed`、`waiting`。
- 原样保留：`waving`、`jumping`、`running`、`review`；复制前后 SHA-256 一致。
- `running-left` 独立生成，明确禁止镜像右跑。
- 原始素材、旧候选、Kimi 候选和用户 Codex/Petdex 宠物目录均未覆盖。

## 用户问题对应结果

- 待机：双手保持单一清晰轮廓，只保留呼吸、眨眼和极小身体起伏。
- 左右跑动：每格一个完整角色，分别朝正确方向，使用独立交替步态，无姿势堆叠。
- 失败：保持正面身份、奶白脸区、眼距、身体体积和软胶材质，只以克制的低头、垂肩和难过表情表达失败。
- 等待确认：以伸手请求确认表达语义；手型为一个圆润连指手掌加一个拇指凸起，没有多指结构。

## 验证

- 五个重做动作逐行提取和组件检查均通过，无错误、无警告。
- 九行动作全量 `qa/review.json`：`ok: true`，9/9 行通过，无错误、无警告。
- 中间标准图集：1536×1872 WebP/PNG；它在本轮只用于标准动作确认，后续批准版本成为最终 v1 包的来源。
- 九份 192×208 动作 GIF 和 768×1134 联系表已生成。
- 独立视觉复核：通过；仅记录预清理阶段轻微洋红色抗锯齿边缘。最终 v1 标准包仍须单独执行透明边缘与 chroma 清理复核。
- 父级复核额外放大检查 `waiting` 原始条带与小尺寸 GIF，手型符合“手掌＋大拇指”要求。

## 关键文件与 SHA-256

- `final/spritesheet.webp`：`8af2e03dea795f653dd64b155cb0abd690f8093d765e6127a4a2cb3c0a411029`
- `final/spritesheet.png`：`f7279cbcfdad20da500c568e400f964050f03d7e1446b30a044202ad8dd8ec0e`
- `qa/contact-sheet.png`：`97d0d9f078a648b6939f023dc076cacdf008557ed119eab9fa15fc6cd139efe6`
- `qa/review.json`：`9ddbc39441bf7c6591810afe029d9bbe19f548f1441e9d4bc2e9191b5a2f06d9`

## 用户确认门

历史状态：当时用户只确认七个非方向动作。后续参考跑步修复已经完成，九种标准动作现均已获用户确认；本文件中的旧确认门已由 `Resources/xiaofuxing-running-reference-evidence.md` 关闭。
