# Phase 3 单宠安装包工厂证据

日期：2026-08-27

> 后续状态（2026-09-01）：本文记录 2026-08-27 候选构建当时的 Mac 与静态证据边界。随后 Phase 3 Task 3.7 已在 Windows 原生重建四套候选并完成 source、win-unpacked、installed mode、卸载/重装和 DPI 验收；最终状态与精确回传索引见 `Resources/project-closeout-20260901.md`。本文中的“Windows 仍未验证”保留为当时结论，不代表当前状态。

## 结论

- 配置驱动的单宠构建工厂已经完成；Wukong、Doraemon、阿岱三个主样本和 JokeBear 额外兼容样本均生成 Windows x64 与 macOS Apple Silicon 内部候选。
- 四个产品使用独立 `productId`、`appId`、EXE 名、产品名和用户数据身份；实际 macOS `Info.plist` 中的 bundle ID 与版本均核对正确。
- 每个 `app.asar` 只包含一个选定产品配置和一个选定宠物包；macOS 与 Windows 的同产品 `app.asar` 字节一致，包内图集 SHA-256 与对应来源图集一致。
- 四个 macOS `.app` 均真实启动，日志出现对应身份的 packaged `renderer-ready` 与 `runtime-ready`，随后验证进程正常终止。
- Windows 只完成 Mac 侧交叉构建与静态完整性核对；source、win-unpacked 真实运行、installed mode、卸载/重装和 100%/125%/150% DPI 仍未验证。

## 最终候选目录

- Wukong：`release/candidates/wukong-desktop-pet/0.1.0/candidate-20260827122420586/`
- Doraemon：`release/candidates/doraemon-desktop-pet/0.1.0/candidate-20260827122219865/`
- 阿岱：`release/candidates/dai-desktop-pet/0.1.0/candidate-20260827122258694/`
- JokeBear：`release/candidates/jokebear-desktop-pet/0.1.0/candidate-20260827122339533/`

这些目录被 Git 忽略且不覆盖历史运行。每个目录包含 `build-config.json`、`build-request.json`、`builder.log`、`candidate-manifest.json`、`macos-runtime-verification.json`、`DELIVERY.md` 和平台产物。

## 候选身份与安装包

| 产品 | appId / bundle ID | 宠物 | NSIS 字节 | NSIS SHA-256 |
| --- | --- | --- | ---: | --- |
| Wukong | `com.jinke.desktop-pet.wukong` | `wukong` | 105524663 | `b4c5021d5bf8a94dfb19f0e9801241f1007ed4176f8bc7f7baa3b565c01d1505` |
| Doraemon | `com.jinke.desktop-pet.doraemon` | `doraemon` | 105550099 | `0e2b5d0836cd20b0c2b9786092a1b43e2b68b9ab13501779e4b2dc51d736c471` |
| 阿岱 | `com.jinke.desktop-pet.dai` | `dai` | 105492125 | `78b9fe65bde1b299bde308c649c1db5924c77551bc8393e99d7cc3ac3f328323` |
| JokeBear | `com.jinke.desktop-pet.jokebear` | `jokebear-codexpet` | 105141734 | `0ab3fe82382bf1ab360cb5a55d4e98ae5b92a8c055755ad0ac2659abde24d02b` |

## 包内资源核对

| 产品 | 来源/包内图集 SHA-256 | 同产品 macOS/Windows app.asar SHA-256 |
| --- | --- | --- |
| Wukong | `349cb1afe921058f803f51fd05e658b79d97f72fb901134fc2535091d2f3cd05` | `534a7110fe39bbd75d9967650f724b612f209b8a811106d61823c538d7f033dc` |
| Doraemon | `1af435fc385dc935522edf13cefbe994c7c078ced46463b66ad6e401f72464c8` | `b63747e263206ff3afb669d1f796dac56d0487c6fd3c0c8911540790898e1df0` |
| 阿岱 | `48865e93e681d089e9151b65e388cd23f7549b02248b76aa1fc2334f80781c7f` | `77d8178a3b88420d2a42a30b06c838ed4897dccf8abde166baf61538f7d57724` |
| JokeBear | `86662b0ad39947c5ba2b732d7626e4bbda89ecacc68d484eae75053d1f6c44c9` | `f28d58ac8eb78813035bd08a278ab5b64730e29a9a0155a698686fc42b925531` |

## 自动化与审查结果

- `npm test`：64/64 通过。
- `npm run lint`：通过。
- `npm audit --omit=optional`：0 vulnerabilities。
- 四个最终运行目录共 20 个关键产物重新读取并核对大小与 SHA-256，全部一致。
- 真实路径检查拒绝输出目录符号链接逃逸、候选运行目录逃逸和被篡改清单中的可执行文件路径逃逸。
- 代码审查覆盖正确性、可读性、架构、安全和性能；发现的两个路径边界问题已修复并增加回归测试。
- 构建工具：Node.js 24.14.0、Electron 43.4.1、electron-builder 26.15.3。

## 证据边界

- 所有安装包均未签名，可能触发 Windows SmartScreen；当前状态仅为内部候选，不可称为正式发布版。
- macOS `.app` 未签名、未公证；只生成目录候选，不生成 DMG。
- 使用 Electron 默认测试图标，尚未形成正式图标批准结论。
- Doraemon 与 JokeBear 涉及第三方 IP，只用于内部技术兼容测试，不构成分发授权。
- Windows 正式验收需使用返回的精确候选文件和 SHA-256，分别检查 source、win-unpacked、installed mode、安装/卸载/重装、交互生命周期和 100%/125%/150% 冷启动及动态 DPI。

## 官方构建配置依据

- electron-builder 通用配置：<https://www.electron.build/docs/configuration>
- Windows 配置与目标：<https://www.electron.build/docs/win>
- NSIS 配置：<https://www.electron.build/docs/nsis>
