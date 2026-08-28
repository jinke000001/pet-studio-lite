# 小福猩参考跑步候选证据

日期：2026-08-28

## 当前结论

- 非覆盖候选目录：`runs/phase-4-xiaofuxing-v2-codex-running-ref-20260828-01/`
- 用户新增三个跑步 GIF，偏好三分之四正面角度、可爱短步、小幅弹跳和清晰轮廓。
- `running-right` 内部结构和独立视觉复核通过，并于 2026-08-28 获用户确认。
- 原独立 `running-left` 因用户认为腿部动作不流畅而完整保留；活动左跑改为八张已确认右跑帧的逐帧水平镜像，帧顺序不变，通过结构与独立视觉复核，并于 2026-08-28 获用户确认。
- 九种标准动作确认门已关闭；批准清单位于 `qa/standard-actions-approval.json`。用户随后确认按 v1 收尾，该 1536×1872 图集成为最终 v1 标准包的批准来源，但本文件本身仍不是候选构建或 Windows 发布证据。
- 其余七个已确认动作行通过逐文件 `cmp` 复核，与上一修正版逐字节一致。

## 源参考登记

- `IMG_3538.GIF`：31 帧，400×400，SHA-256 `7da20910f4e889a8cfd6e407c2ab67fa96d1240ab20203418363b19ff81ccbef`
- `IMG_3539.GIF`：20 帧，400×400，SHA-256 `3693b50461af023ba57a5dcc8692a62df7fe3f8bf5f65fa8adb792c9e7d966c2`
- `IMG_3540.GIF`：15 帧，400×400，SHA-256 `201807f6288a50f6909fa97c855562b0abe1652d1c1905846d65c468a875d85f`
- 三个源文件按原始字节复制到 `references/source-gifs/`，未修改项目根目录中的用户文件。

## 右跑验证

- 候选条带：`decoded/running-right.png`
- 小尺寸循环：`qa/previews/running-right-reference.gif`
- 8/8 帧通过组件提取与结构检查；`ok: true`，零错误、零警告，所有帧边缘像素计数为零。
- 独立视觉 QA：方向明显朝屏幕右方；保持三分之四正面、双眼、奶油脸和橙色软胶身份；短步弹跳与对侧手脚交替可读；无叠影、姿势堆叠、拖影或动作特效。

## 左跑验证

- 活动候选条带：`decoded/running-left.png`
- 小尺寸循环：`qa/previews/running-left.gif`
- 用户认为独立生成的左跑腿部动作不流畅；该版本的条带、8 帧、GIF 和联系表已保存在 `baseline/`，未覆盖。
- 活动候选逐帧镜像八张已通过检查的 192×208 右跑帧，保持原帧顺序；像素比较确认 8/8 帧为精确水平镜像。
- 8/8 帧结构检查及九动作全量 `qa/review.json` 均为 `ok: true`、零错误、零警告。
- 独立视觉 QA：明确朝屏幕左方；与右跑姿势和腿部节奏逐帧对称；无反向时序、肢体切断、叠影、堆叠、拖影或其他七行退化。
- 全量检查前发现左右跑动作目录各混入一份源条带，导致帧计数为 9；源条带已移到 `frames/source-strips/`，动作目录严格保留 8 张提取帧，随后完整复核通过。
- 首次直接镜像原始生成条带时，跨槽手臂被固定槽裁切；失败版本及诊断证据已保存在 `baseline/`，活动候选不使用该结果。

## SHA-256

- `decoded/running-right.png`：`6650ac9e14239a6a5a34b4fa34f7ab3f80b53f497b6410b33d92f33aba254c01`
- `qa/previews/running-right-reference.gif`：`a4678a26cd3819e2e976670466468c077bb95fd749b1ae744b6c02dc378d41af`
- `decoded/running-left.png`：`9e89bc9b04329203f03fd34a71d959628e459fc84025ec82e4906c44672cd846`
- `qa/previews/running-left.gif`：`25def7f0b0fb87338135d0f421d576b10cddaef5b44a6f1a089245237ef48cd1`
- `final/spritesheet.webp`：`3a7e32bf72e9d109eb2f955ebd748ee4da21064c98a2c07f2956c9f1652a049a`
- `qa/contact-sheet.png`：`9c38f958f3932156b572a9e98f692a45665fb394644dc903080c6988d7656912`
- `qa/review.json`：`47e7c138b9f934185bc370b9018b1bf12a3de9229e3dfa063feb3dd9f322fb96`
- `references/running-motion/running-motion-reference.png`：`110424174a7776cf8a5189323f07ef13b09cf95b13ceeac783b23fbd7f97e6f9`

## 用户确认门

`running-right` 与镜像 `running-left` 均已获用户确认，九种标准动作确认门关闭。2026-08-28 用户确认按 Petdex v1 收尾，四个基准方向和 16 个注视方向不再属于小福猩 Phase 4 范围；共享运行器继续保留 v2 兼容。
