# 小福猩 Windows 0.1.2 动态 DPI 修复证据

## Windows 回传结论

- 0.1.1 第二轮复验的输入哈希、Windows 原生解压、Electron 预检、76/76 测试、lint 和 150% 冷启动均通过。
- source 在 Windows 设置真实动态 `100% -> 125% -> 150%` 的 150% 档出现大面积白窗和角色裁切；恢复 100% 后透明窗口恢复正常。
- 失败证据位于 T7 `xiaofuxing-v1-windows-recheck-0.1.1-20260829-04/RETURN/windows-recheck-0.1.1-20260829-223201/`。win-unpacked、installed、覆盖修复、卸载和重装因终止门未执行。

## 根因与修复

- 150% 冷启动正常而运行中切换失败，问题被限定为 Windows 透明窗口的动态 DPI 表面同步，不是图集、ASAR、安装包或冷启动首帧。
- 0.1.1 的动态 DPI 回调在稳定逻辑边界同步后，立即执行一次 `y - 1 / height + 1` 再恢复的窗口边界脉冲。Windows 150% 合成表面切换会保留错误白色区域。
- 提交 `61105b5` 从动态 DPI 路径移除边界脉冲，只保留单次稳定边界同步与 `webContents.invalidate()`；冷启动的独立重绘脉冲不变。
- 同步器把实际相关的 `bounds`、`workArea`、`scaleFactor` 传给诊断层；日志记录缩放因子和同步前后边界，便于实机复验定位。
- 回归测试明确禁止动态 DPI 回调调用 `forceWindowsTransparentWindowRepaint()`，同时验证防抖后的实际变更指标被保留。

## 版本、边界与不变项

- 小福猩候选升至 0.1.2，版本提交为 `795bd0b`；保持 `com.jinke.desktop-pet.xiaofuxing`、machine 安装范围和同一用户数据身份。
- `local-pets/xiaofuxing/pet.json` SHA-256：`7c7f78b48e5d0cf09aa65aeb517f16da53db4b065f1fa4ae54acb15fcfa7891e`。
- `local-pets/xiaofuxing/spritesheet.webp` SHA-256：`427a7a681110cb77d01e7878191052a9f6dd4973062577fe34b8759c0b523660`。
- Petdex v1 仍为 8x9、1536x1872；九种已批准动作、文案、交互和其他四个产品版本均未修改。

## 本机验证与 0.1.2 候选

- 修复前新增回归测试为 2/4 通过，两个失败分别捕获缺失的变更指标和动态 DPI 边界脉冲；修复后定向测试 4/4 通过。
- 完整测试 76/76、lint、`git diff --check` 和 `npm audit --omit=optional`（0 vulnerabilities）通过。
- macOS source-mode 真实窗口出现 `renderer-ready`、`window-frame-synchronized`、`runtime-ready`；目视检查角色完整且无裁切。
- 非覆盖候选：`release/candidates/xiaofuxing-desktop-pet/0.1.2/candidate-20260830004751025/`；macOS packaged runtime 验证通过。
- Windows 安装包 SHA-256：`ed29b2495a5e3fe7c2353a87ffb926c611b5726ffffb29cb0ba0c2ad81be2759`。
- Windows 主程序 SHA-256：`a98e1732d561cf4e2b8380409469d6e1933563bdca1fd650d13fbb87cc1bc0df`。
- macOS/Windows ASAR SHA-256：`a001da119f7a7db24bea76895f681918645dd00306e1c2fd63bd2bdcf4512deb`；两端只包含小福猩产品配置和宠物包，图集哈希与来源一致。

## 防复发验收门

- source 先执行 150% 冷启动，再把真实动态 `100% -> 125% -> 150% -> 100%` 设为安装前最早 GUI 终止门。
- 每档记录实际 DPI、窗口外部边界、`windows-display-metrics-synchronized` 日志和上下文/窗口截图。
- 只有 source 动态 DPI 通过后，才继续 win-unpacked、installed、覆盖修复、官方卸载和干净重装。
- macOS 和静态包体结果不代表 Windows 通过；0.1.2 仍是未签名内部候选。

## T7 非覆盖复验交付

- 新目录：`/Volumes/T7 Shield/xiaofuxing-v1-windows-recheck-0.1.2-20260830-01/`；旧 0.1.1 交付及回传未修改。
- source ZIP：8,764,829 字节，SHA-256 `f465ab3553823f369f130ba5ade4770b23490fd29c96f46ed5eaddb706ae068a`；109 个条目、3 个非 ASCII UTF-8 路径、0 extra 风险项、0 macOS 元数据。
- source ZIP 隔离解压后 `npm ci`、Electron 预检、76/76、lint 和 0 vulnerabilities 通过。
- `checksums.sha256` 覆盖 93 个输入文件，清单 SHA-256 `55315ec8a54120c06b82c910cb2a94e32cb857ed6ee5f05fa8f3e9073d06294a`；T7 端 93/93 重新校验通过。
- 首次 exFAT 复制生成的 104 个 AppleDouble 边车只在本次新目录内清除；最终 94 个文件、递归 `._*`/`.DS_Store` 为 0，`RETURN/` 为空。
