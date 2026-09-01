# Phase 6.2 工作台证据

日期：2026-09-01  
分支：`codex/phase-6-1-workbench`

## 完成范围

- 主进程原生目录/ZIP 选择器；renderer 只提交项目、来源类型和授权状态，不接触绝对路径。
- 复用既有目录与 ZIP 安全导入器，派生安全来源标识，持久化最近一次成功导入；失败导入不覆盖成功状态。
- 检查结果提供通过/警告/阻断层级、中文原因、未受影响范围和下一步动作。
- 安全展示身份、Petdex v1/v2、图集规格、alpha、方向能力、授权状态、标准动作联系表和逐帧动画。
- 真实透明桌宠预览使用项目内版本化 bundle、隔离 userData，单实例启停并在切换/退出时清理。

## 自动验证

`npm test`：104/104 通过。  
`npm run studio:typecheck`、`npm run studio:build`、`npm run lint`、`npm run source:preflight`、`git diff --check`：通过。

## macOS 真实验证

使用隔离目录 `/tmp/pet-workbench-phase62.uItI1R` 启动工作台：

1. 新建“Phase 6.2 真实验证”项目并确认重启恢复。
2. 通过原生目录选择器选择只读样本 `local-pets/doraemon`。
3. 工作台显示 `Doraemon · doraemon`、Petdex v1、8×9、192×208、alpha、9 个动作和授权警告；界面不显示绝对路径。
4. 启动真实透明桌宠，进程树显示工作台父进程和隔离预览子进程；停止后预览子进程消失。
5. 隔离预览 userData 和项目 workspace 产物已生成；原始 `local-pets` 未修改。

## v2 样本准备

`/tmp/pet-workbench-dai.XXXXXX.zip` 为从 `local-pets/dai` 复制生成的隔离 ZIP，SHA-256：`d2086b788e55ce3743388cca42717c8f9a330c063c5f40c51570dccc10b02169`。原目录未修改。该 ZIP 后续用于 v2/危险输入复验。

## 边界

Phase 6.3 产品配置与导出、6.4 后台任务、6.5 Kimi 视觉收口和 6.6 最终候选尚未开始；本证据不宣称 Phase 6 完成。Windows installed-mode 仍待独立验收。
