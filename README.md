# 通用桌宠工作流

这是一个离线、配置驱动的 Electron 桌宠运行内核。Phase 2 已支持从本地目录、安全 ZIP 或 Petdex slug 导入 v1/v2 宠物；导入后的运行时不依赖 Codex、Petdex、VPN、账号或网络。

## 项目状态

截至 2026-09-01，Phase 1–5 与 Phase 3 Task 3.7 均已完成：共享运行内核、安全导入、单宠构建工厂、小福猩 Petdex v1 客户素材链路，以及 Wukong、Doraemon、阿岱、JokeBear 四产品的 Windows source、`win-unpacked`、installed mode、卸载/重装和 100%/125%/150% DPI 验收均已关闭。当前进入 Phase 6“桌宠制作台 MVP”，从独立工作台契约、安全壳层和可恢复项目存储开始，完整计划见 [`tasks/phase-6-workbench-prd.md`](tasks/phase-6-workbench-prd.md)。

当前产物仍是未签名内部候选，不是正式发布版。Doraemon 与 JokeBear 仅用于内部技术兼容测试，不构成对外分发授权。最终状态、证据路径和关键哈希见 [`Resources/project-closeout-20260901.md`](Resources/project-closeout-20260901.md)。

## 当前可运行样本

- `wukong`：Wukong v2 基准样本。
- `doraemon`：Petdex v1 兼容样本，仅供内部测试。
- `dai`：Petdex v2 测试样本。
- `jokebear-codexpet`：Petdex v2 额外兼容样本，仅供内部测试。
- `xiaofuxing`：由客户素材流程生成并经用户确认的 Petdex v1 内部测试桌宠。

Doraemon、JokeBear 等第三方角色素材不代表已取得商业分发授权，不应随产品对外发布。

## 本地运行

先安装依赖：

```bash
npm install
```

运行默认 Wukong：

```bash
npm start
```

选择其他已配置宠物：

```bash
npm run pet -- doraemon
npm run pet -- dai
npm run pet -- jokebear-codexpet
npm run pet -- xiaofuxing
```

产品配置位于 `config/products/`。角色工作副本位于被 Git 忽略的 `local-pets/`，原始 Wukong 交付目录和 `~/.codex/pets/` 不会被运行器修改。

## 桌宠制作台（Phase 6.1）

安装依赖后启动独立工作台：

```bash
npm run studio
```

当前工作台可以创建版本化制作项目、列出历史项目并在完整重启后恢复最近项目。目录/ZIP 导入、校验、动作预览、产品配置和导出将在 Phase 6.2–6.4 接入；当前壳层不是打包候选，也没有 Windows installed-mode 验收结论。

## 导入宠物

导入结果默认写入被 Git 忽略的 `imports/`，使用内容与来源摘要生成非覆盖目录。每份结果包含原始来源快照、标准宠物包、JSON/Markdown 报告、SVG 联系表和离线动作预览。

```bash
# 本地目录
npm run import-pet -- directory --source /path/to/pet --identity sample --authorization internal-test

# ZIP
npm run import-pet -- zip --source /path/to/pet.zip --identity sample --authorization internal-test

# Petdex 公开 slug（只有这一模式需要网络）
npm run import-pet -- slug --slug dai --authorization internal-test
```

授权状态可使用 `unknown`、`internal-test` 或 `authorized`。第三方 IP 相关素材应保持 `internal-test`，不能仅因技术导入成功就改为可对外发布。

## 当前能力与边界

已实现透明置顶窗口、像素图集动画、单击/双击文案、拖动方向动作、托盘显示隐藏、50%–150% 缩放、短动作、长待机、独立设置与日志目录、v1/v2 识别和状态回退。

Phase 2 已完成目录/ZIP/slug 导入、不可变来源快照、安全校验、哈希清单和预览报告。Phase 3 已实现 Windows/macOS 单宠候选构建，并已由 Task 3.7 的 Windows 实机回传关闭四产品安装生命周期与 DPI 验收门。今后生成的新候选仍必须单独执行 Windows 验收，不能沿用本轮结论。

商业签名、macOS Developer ID、公证、自动更新、商城和正式发布体系不属于当前完成范围。

## 验证

```bash
npm test
npm run lint
```
