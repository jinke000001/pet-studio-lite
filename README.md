# 通用桌宠工作流

这是一个离线、配置驱动的 Electron 桌宠运行内核。当前 Phase 1 支持同一份核心代码加载 Petdex v1/v2 图集；运行时不依赖 Codex、Petdex、VPN、账号或网络。

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

## 当前能力与边界

已实现透明置顶窗口、像素图集动画、单击/双击文案、拖动方向动作、托盘显示隐藏、50%–150% 缩放、短动作、长待机、独立设置与日志目录、v1/v2 识别和状态回退。

Phase 2 才会加入正式的目录/ZIP/slug 导入器、不可变来源快照、完整安全校验、哈希清单和预览报告；Phase 3 才生成 Windows/macOS 单宠候选安装包。

## 验证

```bash
npm test
npm run lint
```
