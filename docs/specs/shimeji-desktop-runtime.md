# Spec: Shimeji 桌面运行时

## Objective

在现有 Pet Studio Lite 中增加可导出为 Windows x64 便携 ZIP 的 Shimeji 桌面运行时。宠物可以在工作区底部和普通应用窗口上行走、攀爬、坠落、被拖拽和投掷；后续逐步兼容经典 Shimeji 动作与行为配置。工作台预览与导出产物必须使用同一套行为核心。

运行时支持通过右键菜单或再次启动程序召唤同角色分身，最多 8 只。关闭当前宠物与退出全部宠物是两个明确操作；工作室预览仍保持单宠物，避免改变制作流程。

## First Vertical Slice

第一批只建立可验证的桌面地形核心：

1. 把工作区底边和外部应用窗口转换为可行走平台与可攀爬边缘；
2. 宠物下落时落到最先撞到的平台，而不是穿透窗口；
3. 宠物走到窗口侧边时进入攀爬；
4. 攀爬目标移动时跟随，目标消失时立即坠落；
5. 所有坐标输入都拒绝 `NaN`、无穷值和无效尺寸。

这个增量只实现平台无关的纯 TypeScript 核心。Windows 窗口枚举、渲染器接线和角色动画分别作为后续增量，避免用 macOS 模拟结果冒充 Windows 验收。

## Tech Stack

- Electron 32、React 18、TypeScript 5.6；
- 现有 Electron 主进程负责透明窗口和 IPC；
- `src/shared/` 保存可在 Node 中确定性测试的 Shimeji 状态机与几何；
- Windows 原生窗口桥输出经过验证的窗口快照，不允许 renderer 直接调用系统 API；
- 不引入网络、账号、遥测或 AI 依赖。

## Source Strategy

- 经典动作语义与旧包兼容：Shimeji-ee / Shimeji-Desktop；
- Electron/TypeScript 状态机参考：Desktop Virtual Buddy（MIT）；
- Win32 窗口边界以 Microsoft 文档为准；
- GPL-3.0 或没有明确许可证的仓库只用于黑盒行为对照，不复制源码。

详细来源、固定版本与许可边界见 `docs/third-party/shimeji-sources.md`。

## Commands

```bash
npm run test:shimeji
npm test
npm run typecheck
npm run build
npm run build:pet
```

`build` 与 `build:pet` 必须串行执行，因为它们会使用相关输出目录。

## Project Structure

```text
src/shared/shimeji/       纯行为、物理、地形和配置编译
src/pet/                  Electron 桌宠宿主与 Windows 桥编排
src/renderer/pet/         动画与用户交互
scripts/test-shimeji.mts  独立 Shimeji 逻辑回归测试
native/                   后续 Windows 原生 sidecar（不在第一增量内）
```

## Code Style

状态推进必须是显式输入输出，不读取全局时间或随机数：

```ts
const next = advanceDesktopActor(actor, environment, deltaMs);
```

Windows 原生数据进入共享核心前必须完成运行时校验。窗口句柄作为字符串传递，避免 64 位句柄经过 JavaScript `number` 丢失精度。

## Testing Strategy

- 单元测试：固定窗口矩形和时间步，验证碰撞、攀爬、目标移动/消失和坏输入；
- 集成测试：后续以假窗口桥驱动 Electron host，验证 IPC 生命周期；
- Windows 实机：Windows 10/11，100%/125%/150% DPI，单屏/混合 DPI 双屏；
- 长稳测试：窗口反复移动、最小化、关闭及一小时运行，无悬挂宠物、重复监听器或持续增长的进程。

## Boundaries

- Always：保留原始宠物包和历史导出；外部窗口只读探测；预览与导出共用核心；所有外部代码记录来源和许可证。
- Ask first：移动、最小化或关闭其他应用窗口；加入需要管理员权限或辅助功能权限的能力；改变产品授权方式。
- Never：控制管理员/受保护窗口；在运行时下载或执行远程代码；复制 GPL 或无许可证源码；用 macOS 静态测试宣称 Windows 动态行为通过。

## Success Criteria

- 普通应用窗口可成为稳定的平台和攀爬边缘；
- 窗口移动、缩放、最小化或关闭时，宠物不会留在无效坐标；
- 宠物不会越过匹配显示器的工作区；
- 多只宠物并存时 payload、拖拽、尺寸面板与关闭命令按发送窗口隔离；
- 召唤达到 8 只后不再创建窗口，关闭单只不会退出其余宠物；
- 导出的 ZIP 无需 Node.js、Java、Rust 或浏览器即可运行；
- 自动测试、真实 Electron 预览和 Windows 原生验收全部有独立证据。

## Open Questions

- “搬动整个应用窗口”暂不进入默认范围；先完成只读地形互动。
- 传统 Shimeji XML 表达式的兼容子集在导入器阶段单独冻结，禁止直接执行原始表达式。

## Classic Import Compatibility

- 接受单角色目录或 ZIP 中的 `actions.xml`、`behaviors.xml`（兼容 `behavior.xml`）与 PNG 帧；
- XML 使用固定上限与白名单语义解析，拒绝 DTD、实体、路径逃逸和动态表达式；
- 动作引用递归解析为状态帧，图片统一缩放并透明合成到 8×9 标准图集；
- 转换包可携带经过校验的 `contentInsets`，其值来自整套动画 alpha 并集并以源单格像素表示；旧包缺省时继续按完整单格碰撞；
- 经典包识别 `stand / sit / look / walk / run / crawl / jump / fall / dragged / thrown / climb` 等安全视觉语义，并将 review 与 climbing 分配到不同图集行；普通 Petdex 包的既有行语义保持不变；
- 不猜测包含多个角色或重复同名图片的目录，要求用户直接选择单个角色；
- 生成包保留安全编译后的 `classicProfile`，授权状态保持 `unknown`，不得因转换自动取得分发权利。
