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

Windows x64 导出候选必须保持 `internal-test-only` 并通过 ZIP 静态核验；具体候选文件名和 SHA-256 在每次测试交接时单独记录，避免报告中的自引用哈希失效。静态核验不能替代 Windows 实机视觉和交互验收。

## 逐包权利审查（2026-09-11）

结论：**未获得对外再分发或商业使用许可，状态保持 `not-cleared`。** 这不阻止用户本人在受控环境中进行兼容测试，但 Pet Studio 不得把 Mario 素材放入公开安装包、角色市场、演示下载或可转售产品。

| 审查层 | 当前证据 | 判定 |
| --- | --- | --- |
| 素材来源与署名 | Shimejis.xyz 角色页署名 `Diva-Don`，并链接到其 DeviantArt 的 Paper Mario Shimeji 页面 | 来源可追溯，但署名不等于许可 |
| 包内许可证 | 只读快照仅含 50 张 PNG、`actions.xml`、`behaviors.xml`；没有 `LICENSE`、`COPYING`、README 或授权声明 | 没有可执行的再分发许可 |
| 目录站上传规则 | Shimejis.xyz FAQ 要求提交者只分享本人制作或有权分享的包并注明原作者，同时说明目录从 2026 年起允许用户直接发布且无审核队列 | 最多是上传者声明规则，不能推导出 Pet Studio 获得改编、打包或商业授权 |
| 角色知识产权 | Mario/Super Mario 属于 Nintendo 的角色与标识体系；Nintendo 的公开内容指南仅覆盖特定视频/图片分享，并明确其他 IP 使用（含 fan art）不在该指南授权范围内 | 原画作者许可本身也不足以自动解决角色 IP 的产品分发权 |
| 站点/扩展源码 | 角色页、FAQ 与站点页未提供该网站或扩展的官方源码仓库/开源许可证；搜索到的 Shimeji GitHub 项目是其他实现 | 不复制站点/扩展代码，不把第三方仓库许可证套用到本网站或 Mario 素材 |

正式解除 `not-cleared` 至少需要：

1. 能与当前快照和作者身份对应的书面授权，明确允许修改格式、嵌入 Pet Studio、再分发以及计划中的商业使用；
2. 对 Mario/Nintendo 角色权利取得适用于目标地区和分发方式的许可或专业法律确认；
3. 把授权文件、适用范围、署名要求、到期/撤销条件和素材 SHA-256 一并归档，再把包状态从 `unknown/internal-test` 改为可分发。

在以上条件完成前，网页上的“Get it”、免费使用、社区分享或作者署名都不能作为商业授权证据。可替代路线是使用 Pet Studio 自有原创角色、委托并签署完整权利转让/许可的角色，或许可证明确覆盖修改与再分发的原创素材。

审查依据：

- <https://shimejis.xyz/directory/shimeji/mario-mario-by-diva-don>
- <https://shimejis.xyz/faq>
- <https://www.nintendo.co.jp/networkservice_guideline/en/index.html>
- <https://en-americas-support.nintendo.com/app/answers/detail/a_id/55888/>

## 当前转换结果

| 项目 | 源包 | 当前安全转换 |
| --- | ---: | ---: |
| PNG | 50 | 50 张均可读取；含 46 张标准帧和 4 张变体帧 |
| `Action` 标签 | 99 | 91 个顶层动作进入 profile |
| `Pose` | 131 | 131 个可用 Pose，引用图片全部存在 |
| `Behavior` 标签 | 57 | 8 个无外层条件的顶层行为进入 profile |
| 自动行为计划 | 经典条件树 | 0 个可安全直接执行；运行时使用 Pet Studio 通用调度器 |

动作分类结果：27 个 climb（含墙面、天花板与 grab 复合动作）、17 个 sit、6 个 jump、5 个 look、5 个 walk、5 个 fall、4 个 run、2 个 crawl、2 个 stand、2 个 dragged、1 个 thrown、1 个 chase-mouse，另有 14 个未知动作。转换器可由这些动作生成 Petdex v1 图集：等待优先使用 sit，观察优先使用 look，奔跑优先使用 run，普通移动可回退到 crawl；攀爬视觉行优先选择 `BorderType="Wall"`，避免误用原包先出现的天花板爬行动作。带 Wall/Ceiling/Grab 语义的复合动作优先归入物理攀爬，不会因名称同时含有 walk/run/crawl 而进入随机地面游走。

经典包带有受控的来源格式标记。运行时把 review 映射到观察行、climbing 映射到侧墙攀爬行，避免地面思考时误播攀爬动画；普通 Petdex 包仍保持原有第 8 行 review 语义。转换时还会计算整套动画 alpha 像素的稳定并集外框并写入包元数据，运行时据此缩小碰撞范围；不采用逐帧外框，以免动作切换时角色位置抖动。

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

以上项目属于明确延期，不计入当前 Windows 基础验收：动态条件需要独立的白名单表达式解释器；天花板/窗口底边动作需要扩展地形和锚点模型；窗口操控、拆分和浏览器 DOM 互动则涉及新的权限或产品边界，不能由现阶段导入器擅自开启。不能识别的动作只保留在转换报告中，不再默认猜成 review 自动触发。

后续扩展应按动作语义逐项映射到 Pet Studio 的受控状态机；不能为了“全兼容”直接执行第三方 XML 表达式或复用浏览器扩展权限。
