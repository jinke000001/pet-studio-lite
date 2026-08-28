# 小福猩 Phase 4 v1 收尾证据

日期：2026-08-28

## 结论

- 用户确认只对齐 Petdex 网站宠物核心九状态功能，小福猩最终按 v1 收尾；不制作四基准方向和 16 个注视方向。
- 最终标准包为 8×9、1536×1872、单格 192×208；`pet.json` 不声明 v2，运行器识别为 `spriteVersionNumber: 1`、`lookDirections: false`。
- 共享运行器的 Petdex v2 导入、校验和方向状态映射保持不变。
- Phase 4 从客户素材到双平台内部候选的链路已闭合；Windows 正式验收仍未执行。

## 非覆盖产物

- v1 收尾运行目录：`runs/phase-4-xiaofuxing-v1-final-20260828-01/`
- 项目本地标准包：`local-pets/xiaofuxing/`
- 产品配置：`config/products/xiaofuxing.json`
- 双平台候选：`release/candidates/xiaofuxing-desktop-pet/0.1.0/candidate-20260828144716973/`
- 原始素材、早期 v2 命名运行目录、批准九动作、Kimi 独立候选和 Phase 1–3 产物均未覆盖。

## 最终资产与确定性 QA

- 批准九动作 WebP 来源 SHA-256：`3a7e32bf72e9d109eb2f955ebd748ee4da21064c98a2c07f2956c9f1652a049a`
- 最终清理 WebP：1,451,526 字节，SHA-256 `427a7a681110cb77d01e7878191052a9f6dd4973062577fe34b8759c0b523660`
- `pet.json` SHA-256：`7c7f78b48e5d0cf09aa65aeb517f16da53db4b065f1fa4ae54acb15fcfa7891e`
- `qa/chroma-despill.json`：`ok: true`，alpha 保持不变，72,209 个边缘 RGB 像素完成确定性去色溢。
- `final/validation.json`：`ok: true`，8×9、v1、RGBA、零错误、零警告、透明像素 RGB 残留为 0。
- 最终联系表：`qa/contact-sheet.png`，SHA-256 `234b0bdd814dabb3e29bec8f898694ceaa1bb9661a20246045b85268eab1f719`。

## 运行与视觉验证

- 自动测试：64/64 通过；lint 通过。
- source-mode：真实 Electron 窗口为 144×156 逻辑像素；两张 Retina 捕获均为 288×312，alpha 范围 0–255。
- 两次 source-mode 捕获之间有 42,500 个像素变化，证明待机动画实际推进；日志同时出现 `renderer-ready` 和 `runtime-ready`。
- source-mode 截图：`qa/source-window-frame-a.png`、`qa/source-window-frame-b.png`。
- macOS 打包应用真实启动通过，日志来自 `app.asar/src/renderer.js`；实际窗口截图为 `qa/packaged-macos-window.png`，SHA-256 `6c7d8e8add8f626cddfdfd440c6ce62d66c07f0b0eac1945f7f84dfe7087e390`。
- 小尺寸视觉检查：角色完整、无裁切，橙色圆身、奶白脸区和实体眼睛保持批准身份，透明窗口无不透明底板。

## 候选与哈希

- macOS/Windows `app.asar` 字节一致，只包含 `config/products/xiaofuxing.json` 和 `local-pets/xiaofuxing`。
- 包内图集 SHA-256 与最终源图一致：`427a7a681110cb77d01e7878191052a9f6dd4973062577fe34b8759c0b523660`。
- Windows `win-unpacked` EXE：235,533,824 字节，SHA-256 `994374ee5f92803b3fc56e5bbfdb7d2b82bc29b1e0c28e36646d2bf4a719e872`。
- 未签名 NSIS：105,092,087 字节，SHA-256 `ab56ab9d340ba7eee189c39312706138d5c5f47b31a486d9ad3c9dae8c4b0157`。
- 候选清单 SHA-256：`cf901c148c6a3823707e0b34d0f73b4a9a922605c38ff0f3486b3d72806b999a`。

## 验收边界

- 已通过：v1 资产契约、确定性清理、图集验证、source-mode、macOS `.app`、ASAR 单宠隔离、跨平台静态哈希。
- 未通过且不得推断：Windows source、`win-unpacked` 真实运行、installed mode、卸载/重装、100%/125%/150% DPI。
- 当前安装包未签名，未来在 Windows 上运行可能出现 SmartScreen 提示；这不是正式发布版。
