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

## 2026-08-29 第二次回传与路径修复

- T7 新目录 `xiaofuxing-v1-windows-recheck-0.1.1-20260829-03/RETURN/` 含四次递进复验。前三次分别停在 Electron 下载停滞、`fetch failed` 和代理未启用 `@electron/get`；第四次在临时设置 `ELECTRON_GET_USE_PROXY=true` 后通过 `npm ci` 与 Electron 预检。
- 第四次 source 测试为 73/75；两个失败计数来自同一个 ASAR 父/子测试。叶子错误为 `config/products/sample.json was not found in this archive`，GUI、DPI、安装、卸载和重装均未执行。
- 根因：`@electron/asar` 在 Windows 使用原生反斜杠定位嵌套条目。检查器将列表条目规范化为 `/` 后，又把规范化路径直接传给 `extractFile()`。
- 修复提交：`634ed4e093d00f89f1b5a37d8f3914c415dd8ce5`。列表比较继续使用 `/`，提取前统一转换为当前平台分隔符，并新增 Windows 嵌套路径回归测试。
- 本机修复后：定向测试 5/5、完整测试 76/76、lint、`git diff --check`、`npm audit --omit=optional` 均通过。
- 新非覆盖候选：`release/candidates/xiaofuxing-desktop-pet/0.1.1/candidate-20260829124859907/`；macOS packaged runtime 出现 `renderer-ready` 与 `runtime-ready`，macOS/Windows ASAR 均只包含小福猩产品与宠物包。
- 新安装包 SHA-256：`f51539fc072a8287ff8f1e0b7cdf8c2776ec45b6ef031703aba12f68bceff6f1`。
- 新 Windows 主程序 SHA-256：`a3a8fe46ead2abd113804f816c8c5b672efe656de3752072b9b876d73fd3a961`。
- 新双平台 ASAR SHA-256：`e2af12bf6febffbce401469d03b8852baae634ccd250cf588eacb01b740fbc9c`。
- 批准 `pet.json` 与图集哈希保持不变。Windows 复验门更新为 76/76；新 T7 目录尚未写入，仍需用户确认。
