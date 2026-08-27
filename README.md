# 通用桌宠工作流

这是一个离线、配置驱动的 Electron 桌宠运行内核。Phase 2 已支持从本地目录、安全 ZIP 或 Petdex slug 导入 v1/v2 宠物；导入后的运行时不依赖 Codex、Petdex、VPN、账号或网络。

## 当前可运行样本

- `wukong`：Wukong v2 基准样本。
- `doraemon`：Petdex v1 兼容样本，仅供内部测试。
- `dai`：Petdex v2 测试样本。
- `jokebear-codexpet`：Petdex v2 额外兼容样本，仅供内部测试。

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
```

产品配置位于 `config/products/`。角色工作副本位于被 Git 忽略的 `local-pets/`，原始 Wukong 交付目录和 `~/.codex/pets/` 不会被运行器修改。

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

Phase 2 已完成目录/ZIP/slug 导入、不可变来源快照、安全校验、哈希清单和预览报告。Phase 3 才生成 Windows/macOS 单宠候选安装包；当前没有安装包或 Windows 验收结论。

## 验证

```bash
npm test
npm run lint
```
