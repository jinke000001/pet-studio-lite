# Mario（Diva-Don）经典 Shimeji 兼容报告

## 结论

这套 Mario 资源可以作为 Pet Studio 的**内部测试角色**，视觉资源完整，安全转换已通过；它不能被标记为“完整行为兼容”。Pet Studio 会继续使用自己的桌面物理实现行走、坠落、拖拽投掷、应用窗口侧边攀爬和顶边落点，不会执行原包中的 JavaScript 风格动态表达式。

该角色和素材属于第三方同人内容，来源页没有提供可供 Pet Studio 对外再分发的明确许可证。因此导入和导出必须保持 `sourceLicense=unknown`、`usageMode=internal-test`、`distribution=internal-test-only`。

## 来源快照

- 目录页：<https://shimejis.xyz/directory/shimeji/mario-mario-by-diva-don>
- 页面署名：Diva-Don；原作者链接指向 DeviantArt 的 Paper Mario Shimeji 页面
- 下载日期：2026-09-11
- 原始快照：`~/Downloads/Pet Studio Sources/mario-mario-by-diva-don-shimejis-xyz-20260911.zip`
- 快照 SHA-256：`00832645d3ade738049490a4e22fee29d30507eb50c173605ee2462c3462f9d0`
- 资源：50 张 PNG、`actions.xml`、`behaviors.xml`
- `actions.xml` SHA-256：`97992fcfc43bc7265d3221285eceff9219725970fd08c7e566cabb74922a8849`
- `behaviors.xml` SHA-256：`4c72438fe11a9ab031eb6bf73c480c558daa1ca9e96ad2822f78fd3677a66816`

源快照只读保留；转换和项目导入均复制到新目录，不修改这份文件。

当前 Windows x64 内测候选：`deliverables/petlite-pet-classic-mario-mario-by-diva-don-shimejis-xyz-20260911-win-x64-20260911-222937.zip`，SHA-256 为 `cb69e62fe82cbcb357ee852d5add351e201c0cc21a6bcec2bbf60ac6791b9797`。该候选已通过 30 项 ZIP 静态核验，但尚未替代 Windows 实机视觉和交互验收。

## 当前转换结果

| 项目 | 源包 | 当前安全转换 |
| --- | ---: | ---: |
| PNG | 50 | 50 张均可读取；含 46 张标准帧和 4 张变体帧 |
| `Action` 标签 | 99 | 91 个顶层动作进入 profile |
| `Pose` | 131 | 131 个可用 Pose，引用图片全部存在 |
| `Behavior` 标签 | 57 | 8 个无外层条件的顶层行为进入 profile |
| 自动行为计划 | 经典条件树 | 0 个可安全直接执行；运行时使用 Pet Studio 通用调度器 |

动作分类结果：18 个 walk、12 个 jump、7 个 climb、5 个 fall、2 个 stand、2 个 dragged、1 个 thrown、1 个 chase-mouse，另有 43 个组合或未知动作。转换器可由这些动作生成 Petdex v1 图集；攀爬视觉行会优先选择 `BorderType="Wall"`，避免误用原包先出现的天花板爬行动作。

## 可以直接保留的体验

- Mario 的站立、行走、跳跃/坠落、拖拽/投掷和攀爬素材可进入标准图集；
- Pet Studio 的连续桌面物理负责屏幕和普通应用窗口碰撞；
- 普通应用窗口可作为平台与攀爬边缘，窗口移动或消失时宠物跟随或坠落；
- 自动游走仍可使用，但行为频率和动作串联来自 Pet Studio 的安全调度器，而不是原 XML 的完整条件树。

## 暂不兼容并留到后续的内容

- `#{...}` / `${...}` 条件、随机数、变量和坐标表达式；
- 外层 `<Condition>` 下的情境行为树和带条件的后继分支；
- 天花板悬挂/爬行、屏幕墙面攀爬与窗口底边悬挂；
- 抓取、移动或抛出其他应用窗口；
- 原 Shimeji 的拆分上限、复杂跳跃轨迹和逐 Pose anchor/velocity 语义；
- 浏览器扩展对网页 DOM 元素的互动。它与 Windows 原生窗口互动是两种不同地形接口，不能靠资源格式自动实现完全兼容。

后续扩展应按动作语义逐项映射到 Pet Studio 的受控状态机；不能为了“全兼容”直接执行第三方 XML 表达式或复用浏览器扩展权限。
