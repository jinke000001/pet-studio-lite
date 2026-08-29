# 小福猩 Windows 0.1.1 修复证据

## 结论边界

- 0.1.0 的 Windows 回传结论为失败；输入与回传哈希完整，但 source、150% 冷启动、动态 DPI 和官方卸载存在失败。
- 0.1.1 已在 macOS 完成针对性修复、自动化回归、真实 source-mode 窗口和打包候选验证。
- 本文不把 macOS 或静态包体检查写成 Windows 通过；0.1.1 仍需使用精确复验包完成真实 Windows 验收。

## 修复范围

- 将 lint 改为 Node 递归枚举，消除 Windows shell 不展开 `*.js` 的问题。
- 统一 Windows/POSIX ASAR 与测试路径，并在启动 Electron 前完成产品选择和 Electron 二进制预检。
- 增加 renderer 实际首帧与 `ready-to-show` 双门禁。
- 监听 `display-metrics-changed`，按底部中心锚点恢复逻辑尺寸，并对 Windows 透明表面执行一次可恢复的 1px 重绘脉冲。
- 小福猩升至 0.1.1，保持原 appId，安装范围固定为 machine，以便修复当前 Windows 上残留的同身份 0.1.0；其他产品继续保持 user 范围。

## 不变项

- `local-pets/xiaofuxing/pet.json` SHA-256：`7c7f78b48e5d0cf09aa65aeb517f16da53db4b065f1fa4ae54acb15fcfa7891e`
- `local-pets/xiaofuxing/spritesheet.webp` SHA-256：`427a7a681110cb77d01e7878191052a9f6dd4973062577fe34b8759c0b523660`
- Petdex v1 仍为 8x9、1536x1872；九种已批准动作和运行器 v2 兼容范围未改变。
- Wukong、Doraemon、Dai、JokeBear 的版本仍为 0.1.0，安装范围仍为 user。

## 本机验证

- 主修复提交：`37738c3bd557fb580a9c78a284ed68183b493163`；Electron 显式安装补充提交：`a415251995e46c3984457812351fa264cecaf4dd`。
- 自动测试：75/75 通过，并连续 5 轮无波动；lint 通过；`npm audit --omit=optional` 为 0 vulnerabilities；`git diff --check` 通过。
- source-mode 真实窗口：出现 `renderer-ready`、`window-frame-synchronized` 和 `runtime-ready`；角色透明、完整、未裁切。
- macOS 候选：`release/candidates/xiaofuxing-desktop-pet/0.1.1/candidate-20260829060905840/`，打包运行验证通过。
- Windows 候选：`release/candidates/xiaofuxing-desktop-pet/0.1.1/candidate-20260829060759846/`。
- macOS/Windows `app.asar` 一致，SHA-256：`1f0a83b68206c1de6ffcb88a30582ce05677aeace8da0654b64b0bce3ceebedf`。
- Windows 主程序 SHA-256：`6b6824c62d248c298408b6d9f31b59e8ba36d2dfc0da4cbe06d657aa93acb387`。
- NSIS 安装包 SHA-256：`462b30d3db67e40b73a38fd4aca3bc5749baf83687592fc13d56f3ad6491f18e`。
- 7-Zip 对完整安装包及其中抽取的官方卸载器均报告 `Everything is Ok`；这只证明静态完整性，不证明 Windows 安装后的卸载成功。

## Windows 复验门

- 先核对复验包全量哈希，再执行 `npm ci`、Electron 二进制预检、75/75 测试和 lint；source 门失败即停止后续额度消耗。
- 依次验证 source、win-unpacked、installed mode 的 100%/125%/150% 冷启动和真实 100% -> 125% -> 150% -> 100% 动态 DPI。
- 使用 0.1.1 同身份安装程序修复现存 0.1.0；禁止手工删目录、注册表或绕过 NSIS 完整性检查。
- 官方卸载成功、无残留进程和干净重装完成前，不声明生命周期通过。
