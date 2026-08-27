# Phase 1 macOS source-mode 证据

日期：2026-08-27

## 自动验证

- `npm test`：20/20 通过。
- `npm run lint`：通过。
- `npm audit --omit=optional`：0 个已知漏洞。
- WebP 头解析器对四份本地工作副本均确认尺寸和 alpha；未依赖 Electron `nativeImage` 解码整张 WebP。

## 真实窗口验证

| 产品选择器 | 宠物包 | 版本 | 窗口 | renderer-ready | 透明截图 |
| --- | --- | --- | --- | --- | --- |
| `wukong` | `wukong` | v2 | 144×156 | 通过 | `../runs/phase-1-macos/wukong.png` |
| `doraemon` | `doraemon` | v1 | 144×156 | 通过 | `../runs/phase-1-macos/doraemon.png` |
| `dai` | `dai` | v2 | 144×156 | 通过 | `../runs/phase-1-macos/dai.png` |
| `jokebear-codexpet` | `jokebear-codexpet` | v2 | 144×156 | 通过 | `../runs/phase-1-macos/jokebear-codexpet.png` |

窗口尺寸为 75% 的逻辑尺寸；Retina PNG 是 288×312 像素，四张截图均由 `sips` 确认 `hasAlpha: yes`。系统级画面确认桌宠透明区不会形成白色矩形，但全屏截图包含用户桌面内容，因此未作为项目证据保留。

Wukong 的单击事件已通过真实界面触发，并显示产品配置中的“你好，我是悟空！”；窗口标题、宠物 ID 和产品 ID 均与所选配置一致。四个进程均已在截图后退出，没有遗留桌宠进程。

## 当前证据边界

- 自动化界面工具可以对透明窗口执行可访问性点击，但不能可靠地用屏幕坐标抓取透明 Electron 窗口，因此真实连续拖动、托盘缩放和显示/隐藏仍需用户在 Checkpoint 1 手动确认。
- 拖动方向、显示刷新间隔、缩放锚点和工作区钳制已有纯逻辑测试；这不替代真实动态观感。
- 本轮只证明 macOS source-mode 候选，不证明 Windows、安装包或商业发布资格。

## 用户验收

- 2026-08-27：用户完成 Wukong 实际操作测试并反馈“效果比较满意”，Checkpoint 1 通过。
