# Phase 2 Petdex 导入与校验证据

日期：2026-08-27

## 结论

- 本地目录、安全 ZIP 和 Petdex slug 三种入口均已实现。
- Doraemon v1、Dai v2、JokeBear v2 已从 `~/.codex/pets/` 原始目录导入到版本化非覆盖目录，并由同一 Electron 内核真实启动。
- 原始 `pet.json` 和 WebP 与来源快照逐字节一致；标准包复用相同 WebP 字节。
- 导入后的包、联系表和动作预览只引用本地相对路径，运行时不需要网络。
- 本阶段只证明 macOS source-mode 与导入管线，不证明 Phase 3 安装包或 Windows 正式验收。

## 最终证据目录

- Doraemon：`imports/phase-2-evidence-v2/doraemon-d0679cdcb558/`
- Dai：`imports/phase-2-evidence-v2/dai-d774bceb6589/`
- JokeBear：`imports/phase-2-evidence-v2/jokebear-codexpet-ce8dfe920a16/`
- Petdex 真实 slug：`imports/phase-2-live-slug-v2/doraemon-eefeb8bb83b0/`

这些目录被 Git 忽略，保留本机验收产物，不作为商业授权或发布资产。

## 原始哈希与导入摘要

| 样本 | 版本 | 原始 pet.json SHA-256 | 原始 WebP SHA-256 | 导入 sourceDigest |
| --- | ---: | --- | --- | --- |
| Doraemon | 1 | `61150240c832c6f95bd5baec9e5e81ef2a63fc9b53b1f410d997bb9119773e5b` | `1af435fc385dc935522edf13cefbe994c7c078ced46463b66ad6e401f72464c8` | `b88a947ee6e17cf964f926f92c5d6b2853f0298d774c4e6d43f2c1938523c63c` |
| Dai | 2 | `da836431ce8ac7905c4a2fd19428cde1969cdd6e1fc98eefa50951faf0dfefeb` | `48865e93e681d089e9151b65e388cd23f7549b02248b76aa1fc2334f80781c7f` | `6294e2d18f28d599dfcbf33b3fef1d16a805010bff9ed68f8cab4023bae1ca12` |
| JokeBear | 2 | `0587b7e639bb07ffef73c934dc74413f9275fe19046c76321b00f620b9c37294` | `86662b0ad39947c5ba2b732d7626e4bbda89ecacc68d484eae75053d1f6c44c9` | `30a7a68124f8832b0cebc6183d85a3bb006b9aae3367bf52245da741e070e480` |

真实 Petdex slug 下载得到的 Doraemon 两个文件哈希与表中本地原始样本完全一致。

## 安全验证

- 目录：拒绝来源根/内部符号链接、非普通文件、超限文件、超限总大小、超限数量、来源外真实路径，以及直接或经符号链接嵌套到来源内的输出目录。
- ZIP：使用 `yauzl` 延迟逐条读取与实际解压尺寸核验；额外拒绝绝对路径、路径穿越、Windows 保留名、重复/大小写冲突路径、符号链接、加密条目、异常文件类型、未知压缩方式和可疑膨胀比例。
- Petdex：固定访问 `https://petdex.dev/api/manifest`；只允许一次跳转到 `https://assets.petdex.dev/manifests/petdex-vN.json`；宠物 JSON 和 WebP 只允许来自 `assets.petdex.dev`，禁止后续跳转并限制响应体大小。
- 写入：先在临时目录完成复制、哈希复核、标准化和证据生成，最后原子改名；重复导入会重新核对报告、来源快照和标准包完整性，通过后才返回 `already-imported`，不覆盖历史结果。

## 自动化结果

- `npm test`：47/47 通过。
- `npm run lint`：通过。
- `npm audit --omit=optional`：0 vulnerabilities。
- ZIP 拒绝测试覆盖路径穿越、符号链接、重复路径、加密条目和膨胀元数据。
- 导入集成测试确认标准包可由 Phase 1 `loadRuntimeInputs` 离线加载。

## 真实视觉与运行结果

- 三张联系表已在 macOS 渲染检查：Doraemon 为 8×9 共 72 格；Dai 与 JokeBear 为 8×11 共 88 格；透明背景、裁切和行映射正常。
- 三份 `preview/actions.html` 在真实 Chromium 中加载九种标准动作；Doraemon 明确显示 v1 注视回退，Dai/JokeBear 明确显示 16 个注视方向。
- Doraemon idle 的 CSS 帧位置在等待后从 `-384px 0px` 变化到 `-480px 0px`，证明动画计时推进。
- 最终三份预览控制台均为 0 errors、0 warnings。
- Electron source-mode 日志均出现对应 `runtime-ready` 与 `renderer-ready`：`doraemon`、`dai`、`jokebear-codexpet`。

## 外部协议依据

- Petdex CLI 当前将 `install <slug>` 解析为公开清单与受信资产下载，本项目复用了相同受信主机边界，但将目标改为项目隔离导入目录，避免写入用户宠物目录。
- `yauzl` 官方提供严格文件名验证、延迟条目读取和解压尺寸核验；项目在其上增加跨平台路径冲突、类型、数量、体积和膨胀比例限制。
