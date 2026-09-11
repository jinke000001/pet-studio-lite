# Pet Studio Lite 前端视觉升级规范 ·「蓝图 Blueprint」（v3，最终方向）

> 本文件是 Kimi Code（终端）执行前端审美升级的唯一权威依据。
> 可视化样板：`mockup-v3-blueprint.html`（已完整实现本规范，含导出等待玩具，直接对照抄）。
> 验证截图：`preview-v3-idle.png`（常规界面）、`preview-v3-export-converge.png`（导出完成聚形）。
> 留档勿参照：`mockup.html`（v1 暖阳，已否决）、`mockup-v2-mint.html`（v2 薄荷，已否决）、`preview-light-*.png` / `preview-dark-config.png`。
> 样板支持 `?demo=export` 参数自动演示导出聚形流程，便于截图验收。

## 0. 执行边界（重要）

- **允许修改/新增**：`src/renderer/styles.css`、`src/renderer/pet/pet.css`、`src/renderer/App.tsx`（className / DOM 结构 / 新增导出等待玩具组件）、可新增 `src/renderer/components/GlyphField.tsx`（纯前端 Canvas 组件）。
- **禁止修改**：`src/shared/`、`src/main/`、`src/pet/host.ts`、`src/preload/` 及任何逻辑、IPC、校验代码。玩具组件只能通过 `App.tsx` 已有的 `onExportProgress` / `running` 状态拿进度，不得新增 IPC。
- **不改行为**：主题仍只跟随系统 `prefers-color-scheme`，不加手动开关；不改文案（除第 3.13 条的 eyebrow 注记为新增装饰元素）；不加网络请求；不引入新依赖。
- 完成后必须通过：`npm run typecheck`、`npm test`，`npm run dev` 实际打开，浅色与深色系统外观各截图自查。

## 1. 设计方向

「蓝图」：蓝的三层明度 + 符号点阵肌理 + 等宽注记。

- **三层明度分区**：浅蓝 `#eaf1fd`（辅助层）/ 白（主卡片）/ 深藏青 `#101f3c`（对比层），靠明度而非描边分区；
- **符号点阵**（`· - + / ( ) * ▲ K # ⬡`）是全套产品的肌理语言：左栏点网格、命令块、导出等待玩具共用；
- **等宽大写小标签**（`STEP · 03 — PREVIEW` 式）是签名细节；
- 主蓝 `#2e6be6` 是唯一强调色；克制、清爽、工程师气质。

## 2. 设计令牌（全部走 CSS 变量，组件禁止硬编码色值）

### 浅色（`:root`）

| 变量 | 值 | 用途 |
|---|---|---|
| `--bg-page` | `#f7faff` | 内容区背景（蓝白） |
| `--bg-rail` / `--bg-card` / `--bg-input` | `#ffffff` | 左栏 / 卡片 / 输入 |
| `--bg-tint` | `#eaf1fd` | 浅蓝明度层（帮助盒、序号胶囊底、选中项目行） |
| `--bg-sunken` | `#f0f5fd` | hover 底 |
| `--bg-navy` | `#101f3c` | 深藏青对比层（重点卡、命令块、点阵玩具底） |
| `--navy-text` / `--navy-text-dim` | `#dbe7ff` / `#6d84b8` | 藏青层上的文字 |
| `--text-primary` / `--text-secondary` / `--text-muted` / `--text-faint` | `#101f3c` / `#40527a` / `#7a8cb0` / `#b3c1da` | 文字阶梯 |
| `--border` / `--border-strong` / `--border-soft` | `#dce6f7` / `#c3d5f2` / `#e9f0fb` | 描边阶梯 |
| `--accent` / `--accent-hover` / `--accent-contrast` | `#2e6be6` / `#1f56c4` / `#ffffff` | 主蓝 |
| `--accent-soft` / `--accent-soft-border` | `rgba(46,107,230,.08)` / `rgba(46,107,230,.30)` | 蓝软底/描边 |
| `--ok` / `--bad` / `--pending` | `#16a06c` / `#e5484d` / `#b9c8e4` | 状态色 |
| `--notice-bg` / `--notice-border` / `--notice-bar` | `#fdf3e0` / `#ecd9a8` / `#e8a33d` | 通知条 |
| `--info-bg` / `--info-border` | 同 `--accent-soft` / `--accent-soft-border` | 信息面板 |
| `--error-*` | `#fdecea` / `#f3c0ba` / `#b3261e` / `#7a2d24` / `#ad6a5e` | 错误面板 |
| `--success-*` | `#e6f7ee` / `#b3e5c9` / `#0d7a4d` | 成功面板 |
| `--code-bg` / `--cmd-bg` / `--cmd-text` | `#e3ecfb` / `#101f3c` / `#c7d9fb` | 代码与命令块 |
| `--checker-a` / `--checker-b` | `#e8effb` / `#f7faff` | 预览棋盘格 |
| `--shadow-card` | `0 1px 2px rgba(16,31,60,.05), 0 4px 18px rgba(16,31,60,.06)` | 卡片阴影 |
| `--shadow-pop` | `0 2px 8px rgba(16,31,60,.10), 0 12px 32px rgba(16,31,60,.12)` | 浮起阴影 |
| `--shadow-accent` | `0 3px 10px rgba(46,107,230,.32)` | 蓝色选中投影 |

### 深色（`@media (prefers-color-scheme: dark)`）

| 变量 | 值 |
|---|---|
| `--bg-page` / `--bg-rail` / `--bg-card` / `--bg-tint` / `--bg-input` / `--bg-sunken` | `#0a1220` / `#0d1730` / `#12203c` / `#16263f` / `#0d1830` / `#101c36` |
| `--bg-navy` | `#060b18`（更深，保持对比层身份） |
| `--navy-text` / `--navy-text-dim` | `#dbe7ff` / `#51648f` |
| `--text-primary` / `--text-secondary` / `--text-muted` / `--text-faint` | `#e8effc` / `#aebdd9` / `#7488ad` / `#46587c` |
| `--border` / `--border-strong` / `--border-soft` | `#22365c` / `#2e4a7a` / `#1a2a4a` |
| `--accent` / `--accent-hover` / `--accent-contrast` | `#5b8cff` / `#7ba3ff` / `#0a1220` |
| `--accent-soft` / `--accent-soft-border` | `rgba(91,140,255,.12)` / `rgba(91,140,255,.38)` |
| `--ok` / `--bad` / `--pending` | `#3ddc97` / `#ff7a6b` / `#3a4f7d` |
| `--notice-*` | `rgba(255,190,92,.10)` / `rgba(255,190,92,.30)` / `#e8a33d` |
| `--error-*` | `rgba(255,105,85,.12)` / `rgba(255,105,85,.35)` / `#ff8a7a` / `#f0bcb2` / `#c98a7d` |
| `--success-*` | `rgba(61,220,151,.10)` / `rgba(61,220,151,.32)` / `#4fe3a4` |
| `--code-bg` / `--cmd-bg` / `--cmd-text` | `#1a2c50` / `#060b18` / `#b9cff7` |
| `--checker-a` / `--checker-b` | `#12203c` / `#0a1220` |
| `--shadow-card` / `--shadow-pop` / `--shadow-accent` | `0 1px 2px rgba(0,0,0,.35), 0 6px 22px rgba(0,0,0,.30)` / `0 2px 8px rgba(0,0,0,.45), 0 14px 38px rgba(0,0,0,.45)` / `0 3px 12px rgba(91,140,255,.30)` |

## 3. 组件规范

### 3.1 左栏
- 白底（深色为 `#0d1730`），保留 `border-right`；叠加**图纸点网格肌理**：`.rail::before` 用 `radial-gradient(var(--border-strong) 0.8px, transparent 0.8px)`、`background-size: 14px 14px`、`opacity: 0.35`、`pointer-events: none`。

### 3.2 品牌区
- 36×36 圆角方块（radius 11px）品牌标记：主蓝底 + 白色爪印 SVG（内联，路径见样板 `.brand-mark`），投影 `--shadow-accent`。

### 3.3 步骤导航
- 序号 32×32 圆角胶囊（radius 10px），数字用**等宽字体**；底 `--bg-tint` + 描边 `--border-strong`。
- 步骤间 2px 纵向连线（`::before`，左 25px，色 `--border-strong`）。
- 三态：当前步行底 `--accent-soft` + `inset 0 0 0 1px var(--accent-soft-border)`，胶囊填充 `--accent` + `--shadow-accent`，hint 变 `--accent`；已完成步（新增 `step--done`）胶囊 `--accent-soft` 底 + `✓`，连线变 `--accent` 45% 透明；禁用 `opacity: 0.4`。
- 「已完成」判定：步骤 index < 当前步骤 index（纯 UI 态，在 `App.tsx` 按 `STEPS` 顺序计算，不引入持久化进度）。

### 3.4 最近项目
- 标题改等宽大写注记样式（10.5px / 600 / 字距 0.14em / uppercase），文案保持「最近项目」；
- 选中行底 `--bg-tint`；版本号用等宽字体；删除按钮交互不变。

### 3.5 按钮
- 999px 药丸，字重 600（主按钮 700）；主按钮填充 `--accent` + `--shadow-accent`，hover 变 `--accent-hover`。
- 次按钮 hover 描边 + 字变 `--accent`；所有按钮 `:active` `scale(0.97)`。
- 深藏青卡上的按钮反白：透明底 + `rgba(219,231,255,.35)` 描边；primary 反相（浅底深字），见样板 `.card--navy` 规则。

### 3.6 卡片与面板
- `.card`：radius 16px + `1px solid var(--border)` + `--shadow-card`。
- 新增 `.card--navy` 深藏青对比卡，用于预览步「真实桌宠预览」卡片（全应用仅此一处）。
- `.notice`：radius 12px + 左侧 3px `--notice-bar` 重点条。
- 其余面板 radius 12px；禁止卡片套卡片。

### 3.7 检查行状态点
- 「检查中」带呼吸圆环动画（`pulse` 1.4s），`prefers-reduced-motion` 下关闭。

### 3.8 动作 chips
- 药丸形；hover 描边 + 字变 `--accent`；选中填充 `--accent` + 字重 700 + `--shadow-accent`；`:active` scale(0.96)。

### 3.9 表单
- 输入框 / 下拉 radius 12px；`:focus` 描边 `--accent` + `0 0 0 3px var(--accent-soft)` 光环；`caret-color: var(--accent)`。
- 裸 checkbox 换开关组件（42×25 轨道 + 19px 白钮 + 回弹滑动，结构见样板 `.switch`），`App.tsx` 逻辑不变。

### 3.10 预览舞台与命令行块
- 棋盘格 22px 单元 + `1px solid var(--border)` + radius 16px。
- `.cmd-line`：radius 12px，底 `--cmd-bg` 深藏青；其上的复制按钮（`.link`）用 `#8fb4ff`。
- `.help-box` 用 `--bg-tint` 浅蓝层；`.help-arrow` 用 `--accent`。

### 3.11 字体与排版
- 字体栈不变：`-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`；等宽一律 `ui-monospace, Menlo, monospace`。
- h1 22px/800/`letter-spacing:-0.015em`；h2 15px/700；`.lead` 行高 1.75、`max-width:560px`。

### 3.12 焦点可见性
- `:focus-visible`：`outline: 2px solid var(--accent); outline-offset: 2px;`（输入框除外）。

### 3.13 蓝图注记（eyebrow，新增装饰元素）
- 每个步骤页 h1 上方加一行等宽大写注记：`.eyebrow` 样式（10.5px / 字距 0.14em / uppercase / `--text-muted`）。
- 文案固定五条：`STEP · 01 — IMPORT · PETDEX PACK`、`STEP · 02 — CHECK · VALIDATION`、`STEP · 03 — PREVIEW · SPRITE & LIVE`、`STEP · 04 — CONFIG · NAME / ZOOM / BEHAVIOR`、`STEP · 05 — EXPORT · WINDOWS X64`。

## 4. 导出等待玩具：符号流点阵（GlyphField）

### 4.1 触发与位置
- 在导出步点击导出后出现（`running` 为真时挂载），位于导出按钮下方、进度日志卡片位置；导出完成后保留展示（聚形终态）+ 原有成功面板照常出现。
- 进度来源：**只用 `App.tsx` 已有的 `ExportProgressEvent` 数组**，按事件条数估算进度（`progress = 已收到事件数 / 预计总事件数`，预计总数可硬编码并在注释说明），不得新增 IPC。

### 4.2 视觉与结构
- 深藏青卡片（`.glyph-field-card`，底 `--bg-navy`，radius 16px，`--shadow-pop`），内含：
  - 头部：左侧注记 `GESTURE · WAIT · PLAY`，右侧提示「动一动鼠标，拨动点阵」（`--navy-text-dim`）；
  - Canvas（高 220px，宽随容器，`cursor: crosshair`）；
  - 底部：等宽进度标签（`EXPORTING · 36%` / `DONE · 已聚形`）+ 3px 细进度条（`#8fb4ff`）。

### 4.3 场与交互（参考实现见样板 `<script>` 末尾 IIFE，可直接移植为 React 组件）
- 字形表按密度从疏到浓：`['·','-','+','/','(',')','*','▲','K','#','⬡']`；单元格 16px；12px 等宽字体绘制。
- **基础流动场**：两层正交正弦叠加（参数见样板 `frame()`），符号随时间缓慢流动。
- **鼠标拨动**：以光标为中心的高斯隆起（σ≈42px，增益 0.55），鼠标离开画布归零。
- **聚形**：离屏 canvas 按网格分辨率画爪印（掌垫 + 4 趾椭圆，参数见样板 `buildTarget()`），采样为 0..1 目标场；随进度收敛——形内压实到高浓度字形带（`0.78 + 0.22*tv`），形外退潮（保留 10% 流动底纹）。
- **颜色**：按强度分五档（见样板 `glyphColor()`），藏青底上由暗蓝到蓝白，深浅色模式通用（卡片底色已固定藏青）。
- 兜底：容器宽度异常时 canvas 宽不小于 320px。
- `prefers-reduced-motion: reduce` 时：不启动 rAF 循环，静态绘制一帧当前状态。
- 组件卸载时必须 `cancelAnimationFrame`，不得泄漏。

## 5. 桌宠气泡（pet.css，与导出运行时共用，谨慎微调）

只升级材质，不动定位/排版逻辑（`width:max-content`、`max-width:88%`、`text-wrap:balance` 保留）：

- 气泡 radius 8px → 12px；padding 6px 10px → 7px 12px；
- 浅色底 `rgba(255,255,255,0.96)` 不变，描边改 `rgba(16,31,60,0.10)`；深色底 `rgba(18,32,60,0.96)`；
- 头部文字浅 `#101f3c` / 深 `#e8effc`，正文 `#40527a` / `#aebdd9`；
- 箭头 `::after` 颜色同步跟随气泡底色变量。

## 6. 验收清单（Kimi Code 完成后逐项自查）

1. `npm run typecheck` 与 `npm test` 全绿。
2. `npm run dev` 浅色/深色系统外观下：五步页面、藏青对比卡、错误/成功/通知面板、帮助盒展开均正常；搜旧色 `#0a84ff`、`#f6f7f9`、`#1c1c1e`、`#eceef1` 零命中。
3. 步骤栏有等宽数字胶囊 + 连线 + 已完成打勾三态；左栏有点网格肌理；每页 h1 上方有 eyebrow 注记。
4. 按钮药丸形且按压回弹；输入框聚焦蓝色光环；游走开关为新 switch 且功能正常。
5. 导出时符号流点阵出现：鼠标拨动有隆起响应；进度推进时点阵向爪印收敛；完成后保持聚形终态；离开导出步再回来无动画泄漏。
6. 与 `mockup-v3-blueprint.html` 视觉对照无结构性偏差（色板、圆角、间距、注记样式一致）；可用 `?demo=export` 对照聚形效果。
