# Phase 6 桌宠制作台 Windows 验收 PRD

## 目标

在真实 Windows installed mode 验证桌宠制作台候选的安装、启动、导入、预览、构建、恢复、卸载与重装生命周期。本包仅表示验收准备完成，未收到 Windows RETURN 前不得写“Windows 已通过”。

## 必验门

1. 输入 checksums 全部一致；source 依赖与自动回归通过。
2. source、win-unpacked、installed mode 分别启动，身份均为“桌宠制作台”。
3. 100%、125%、150% 三档冷启动与真实动态 DPI，无白窗、裁切、不可达操作或状态丢失。
4. installed mode 完成新建项目、Doraemon v1 目录导入、Dai v2 ZIP 导入、危险 ZIP 阻断、联系表、真实桌宠启停、产品配置、项目包/候选导出、任务历史和完整重启恢复。
5. 验证取消、失败、离线、重复导入/构建、项目切换和退出清理。
6. 官方卸载、同包重装、进程清理和系统缩放恢复。

## 证据边界

source 成功不证明 packaged；win-unpacked 成功不证明 installed；静态构建或 macOS 成功不证明 Windows installed mode。所有截图、日志、进程、DPI、安装/卸载和产物哈希必须回传。
