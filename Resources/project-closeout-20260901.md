# 通用桌宠工作流项目收尾报告

日期：2026-09-01

## 结论

- Phase 1–4 与 Phase 3 Task 3.7 的目标均已完成，项目进入 Phase 5 文档收尾和只维护状态。
- 共享运行内核、安全导入、单宠构建工厂、小福猩 Petdex v1 客户素材链路，以及五个产品范围内的 Windows 验收均已有证据。
- 小福猩 0.1.5、Wukong 0.1.0、Doraemon 0.1.0、阿岱 0.1.0 和 JokeBear 0.1.0 都保持未签名内部候选状态；验收通过不等于正式发布。
- Doraemon 与 JokeBear 涉及第三方 IP，只用于内部技术兼容测试，不构成对外分发授权。

## 当前源码与工具链

- 当前工作分支：`feature/xiaofuxing-v2`。
- 收尾修改前 HEAD：`5dc269628f818cd7757cb05d8405f3f9b558e279`；本报告与配套状态文档将随用户授权的内部基线提交归档，不创建标签。
- Task 3.7 Windows 受控源码基线：`a60f3b7`。
- Node.js 下限：22.12.0；Electron：43.4.1；electron-builder：26.15.3；yauzl：3.4.0。
- 核心入口：`npm run pet -- <selector>`、`npm run import-pet -- ...`、`npm run build-pet -- ...`。

## 已完成能力

| 范围 | 完成状态 | 当前边界 |
| --- | --- | --- |
| Phase 1 共享运行内核 | 完成 | 离线、配置驱动，支持 v1/v2、透明窗口、交互、托盘与缩放 |
| Phase 2 安全导入 | 完成 | 支持目录、ZIP、Petdex slug；导入后离线运行；来源不可变、输出非覆盖 |
| Phase 3 单宠构建工厂 | 完成 | Windows x64 NSIS/`win-unpacked` 与 macOS Apple Silicon `.app`；均未签名 |
| Phase 3 Task 3.7 | 完成 | 四产品 Windows source、unpacked、installed、三档与动态 DPI、卸载/重装全部通过 |
| Phase 4 小福猩 v1 | 完成 | 8×9、1536×1872、九种标准动作；不制作 v2 注视方向 |
| 商业发布体系 | 未进入 | 签名、公证、商城、自动更新、DRM 和正式品牌发布继续暂缓 |

## 小福猩最终验收证据

- 版本：0.1.5，未签名内部候选。
- T7 报告：`/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.4-20260830-01/RETURN/windows-install-recheck-0.1.5-20260831-110759/WINDOWS-INSTALL-RECHECK-REPORT.md`。
- T7 回传清单：同目录 `returned-checksums.sha256`。
- 本机非覆盖归档：`release/windows-recheck/xiaofuxing-v1-windows-recheck-0.1.5-20260831-01/RETURN/windows-install-recheck-0.1.5-20260831-110759/`。
- 报告 SHA-256：`3b8df884a4dc1aa6929757542102ad9239adcd3bdef56c2f8abd74950a0e7c25`。
- 回传清单 SHA-256：`d7f4249145dac8c2a283f050b0e74fb3b84083f7cc31eba6bf43aaeb19d25085`。
- 回传核验：清单内 514/514 通过；本机归档共 515 个文件，与 T7 原件逐字节一致。
- 验收范围：installed mode、100%/125%/150% 冷启动、真实动态 DPI、核心交互、三次同版本覆盖、官方卸载和同包重装。

## Phase 3 Task 3.7 最终验收证据

- T7 完整回传：`/Volumes/T7 Shield/phase-3-windows-acceptance-20260831-01/RETURN/phase-3-task3.7-windows-20260831-20260831-175125/`。
- 最终报告：回传目录下 `reports/WINDOWS-ACCEPTANCE-REPORT.md`。
- 报告 SHA-256：`89ac50916a372282be090e715717ae1fc78870b6e2465d14a7f426462b2574e7`。
- 回传清单 SHA-256：`d0e7e31fafef892e5edc36c5d618e78f6f2ab3e7c2c89054188eb57f9d1caed9`。
- 回传核验：`returned-checksums.sha256` 共 1352 项。UTF-8 BOM 使标准 Mac `shasum -c` 将首行视为格式异常；其余 1351 项批量通过，首项去除 BOM 后单独核验通过，合计 1352/1352。
- 验收范围：Wukong、Doraemon、阿岱和 JokeBear 的 Windows 原生构建、source、`win-unpacked`、installed mode、100%/125%/150% 冷启动、真实动态 `100%→125%→150%→100%`、核心交互、官方卸载、同包重装与身份隔离。
- 最终 Windows 状态：系统缩放恢复 100%，四产品保持安装且已退出，四个精确主程序进程均为 0。

## 证据保存策略

- Task 3.7 完整 RETURN 约 3.9 GiB，当前原样保留在 T7，未移动、未修改、未覆盖。
- 2026-08-31 规划时 Mac 数据卷仅约 16 GiB 可用，不额外复制 3.9 GiB 候选与截图；本仓库只保存本报告中的路径、SHA-256 和核验方法。
- T7 当前是 Task 3.7 的完整证据主副本。若需要抵御单盘损坏，应复制到另一块外置盘并重新做全量哈希，不应挤占当前 Mac 空间。
- 小福猩 0.1.5 RETURN 已有本机逐字节归档；历史失败 RETURN、批准素材和旧候选继续保留，不清理。

## 已知观察项

- Windows 构建机直连 GitHub 曾出现 `connect ETIMEDOUT 20.205.243.166:443`。
- Wukong 首次直连成功；Doraemon、阿岱和 JokeBear 首轮失败后，仅在重试命令临时设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 并成功。
- 未修改源码、npm 永久配置、系统代理或网络设置。该事件不影响 Task 3.7 的通过结论，当前只保留观察；仅在后续原生构建再次复现时核查。

## 使用与维护边界

- 已导入宠物运行时不依赖 Codex、Petdex、VPN、账户或网络；Petdex slug 获取阶段仍需要网络。
- 每个新宠物或新版本都必须生成新的非覆盖导入、候选和证据目录，不能继承本轮 Windows 验收结论。
- 未取得商业授权的第三方角色不得改为 `authorized`，也不得对外分发。
- Windows/macOS 安装包均未签名，可能触发系统安全提示；本项目没有建立商业发布资格。
- 原始素材、用户 Codex/Petdex 宠物目录、历史候选、RETURN 和批准版本保持不可变。

## Phase 5 后续确认门

1. 用户已于 2026-09-01 审查并确认 Checkpoint 5A。
2. 完整回归已完成：`npm test` 77/77、`npm run lint`、`npm run source:preflight` 和 `npm audit --omit=dev` 全部通过。
3. audit 前两次曾因 npm Registry TLS 建连前断开而失败；2026-09-01 再次重试成功并返回 `found 0 vulnerabilities`，未修改任何网络或 npm 配置。
4. 用户已授权只创建一个内部基线提交；不创建标签、不合并分支、不推送远端。

## 2026-09-01 回归执行记录

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `npm test` | 通过 | 77/77，fail 0 |
| `npm run lint` | 通过 | 退出码 0 |
| `npm run source:preflight` | 通过 | Electron executable `ok: true` |
| `npm audit --omit=dev` | 通过 | 前两次因 Registry TLS 建连前断开失败；第三次重试退出码 0，`found 0 vulnerabilities` |

只读诊断确认 npm registry 仍为官方地址、npm `proxy`/`https-proxy` 未配置、`strict-ssl=true`；独立 TLS 请求可完成，npm audit 前两次失败、第三次成功。未修改 `.npmrc`、registry、代理、永久镜像或系统网络设置。第二次 npm 调试日志为 `/Users/jinke00001/.npm/_logs/2026-09-01T00_14_45_836Z-debug-0.log`。

当前结论是四项回归全部通过。用户已授权将本组收尾文档作为一个内部基线提交；标签、分支合并和远端推送不在本次操作范围。
