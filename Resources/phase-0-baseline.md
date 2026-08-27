# Phase 0 基线盘点

日期：2026-08-27

## Wukong 参考实现

参考目录：

`Wukong-Windows-Desktop-Pet-Handoff-20260731/Windows-Release-0.1.9-20260801/`

可复用经验：

- 透明、无边框、置顶且不显示任务栏的 Electron 窗口。
- Canvas 图集渲染，缩放时清屏，避免透明残影。
- renderer 识别拖动方向，main process 使用全局光标驱动窗口移动。
- 跑步动画 24 FPS，拖动间隔根据显示器刷新率限制在 4–16ms。
- 单击/双击/拖动手势分离。
- 随机短动作、2分钟打坐、8分钟休息和操作唤醒。
- 设置持久化、托盘和底部中心缩放锚点。

需要改造的硬编码：

- `src/shared.js` 直接读取 Wukong 的 `Resources/approved/sprite-manifest.json`。
- `src/renderer.js` 直接读取 `spritesheet-v2.webp`，并写死悟空气泡文案。
- `src/main.js` 写死托盘名称、192×208尺寸和 Wukong 专用环境变量。
- 构建配置写死产品名、appId、输出版本和 Windows-only 目标。
- 现有测试偏向源码正则契约，需要增加真实包校验、导入失败和渲染状态测试。

## 验证结果

- `npm test`：15/15 通过。
- `npm run lint`：通过。
- 安装包、win-unpacked EXE、app.asar、批准 WebP 与交付清单哈希一致。
- 历史 Windows 报告确认 0.1.9 installed-mode 通过；项目 MEMORY 中“尚待安装”的句子是较早状态，验收报告与发布 README 更新更晚，应以验收报告为准。

## Petdex 样本

| 样本 | 识别 | 图集 | 说明 |
| --- | --- | --- | --- |
| `doraemon` | v1 | 1536×1872 WebP | 清单标记v1，实际包无v2声明；第三方IP相关素材，仅内部测试 |
| `dai` | v2 | 1536×2288 WebP | 明确声明 `spriteVersionNumber: 2` |
| `jokebear-codexpet` | v2 | 1536×2288 WebP | 用户原计划作为v1样本，但实测明确为v2；第三方IP非官方改编，仅内部测试 |

`lulu-capybara-2` 是历史安装的v1宠物，按用户要求不再作为测试样本且未删除。所有样本原始目录保持不变，后续转换必须输出到项目内新的版本化派生目录。
