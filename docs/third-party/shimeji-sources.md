# Shimeji 技术来源与许可清单

> 固定于 2026-09-11。正式复制代码时，应在具体文件或提交中继续保留来源说明。

| 用途 | 仓库与固定提交 | 许可证 | 使用边界 |
|---|---|---|---|
| 经典动作、行为树、XML 兼容 | `DalekCraft2/Shimeji-Desktop@dea8952` | zlib + Shimeji-ee BSD 条款 | 可以移植；保留声明并明确标注修改 |
| Electron/TypeScript 状态机、窗口平台原型 | `spyderweb47/Desktop-Virtual-buddy@4774712` | MIT | 可以选择性移植；保留 MIT 声明 |
| Win32 窗口跟踪与攀爬对照 | `ccyrene/clawd@fea00f0` | 仓库未提供明确许可证 | 只研究行为和公开 API 选择，不复制代码 |
| 跨平台兼容结果对照 | `pixelomer/Shijima-Qt@57723f1` | GPL-3.0 | 只做黑盒/格式对照，除非整个产品另行决定采用 GPL-3.0 |
| Windows API 权威依据 | Microsoft Learn | 文档条款 | 根据公开 API 独立实现 |

## 首批可复用内容

- 从 Shimeji-Desktop 提取动作名称、动作序列语义、权重和后继行为规则；
- 从 Desktop Virtual Buddy 评估 `GameLoop`、`PetStateMachine`、平台碰撞与 sprite animator 的可移植部分；
- Windows 桥独立实现 `EnumWindows`、DWM 可见边界、窗口事件和显示器/DPI 转换；
- 不搬运上述项目的角色美术、AI、截图、文件删除、网络或聊天功能。

## 官方技术依据

- `GetWindowRect`：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect
- `SetWinEventHook`：https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook
- Windows High DPI：https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows
