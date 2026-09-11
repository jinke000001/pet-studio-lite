# ADR-001: 多宠物按发送窗口路由

## Status

Accepted

## Date

2026-09-11

## Context

原运行时只有一个 `activeHost`。进程级 `pet:*` IPC handler 总是把消息交给最后打开的宿主；第二只宠物出现后，第一只可能读到错误 payload，拖动或缩放也可能作用到另一只。每个宿主单独注册 IPC 又会触发 Electron 的重复 handler 错误。

## Decision

- `pet:*` handler 仍然每进程只注册一次；
- 以 Electron `event.sender.id` 解析宠物窗口或尺寸面板所属的 `PetWindowHost`；
- 未登记 sender 的读请求明确失败，移动类命令静默丢弃；
- 导出运行时最多允许 8 个宿主并存；工作室预览保持单宠物；
- 右键菜单区分“关闭这只宠物”与“退出全部宠物”；再次启动已有实例等同于召唤一只；
- 只有首只宠物写入下次启动位置，临时分身不覆盖主位置。

## Alternatives Considered

### 保留全局 activeHost

无法隔离并存窗口，任何消息都可能串到最后打开的宠物，因此拒绝。

### 每只宠物启动独立进程

隔离简单，但会重复加载 Electron、增加内存与 Windows 窗口探测开销，也难以提供“退出全部”，因此拒绝。

### 每个宿主注册一套 IPC handler

Electron 的 `ipcMain.handle` 不允许同名重复注册，会恢复历史上的“第二次打开即崩溃”，因此拒绝。

## Consequences

- 一个进程内可安全承载多只宠物，共享包资源与状态存储；
- 新 IPC 必须继续从 sender 解析宿主，不能重新引入“当前活动宠物”；
- 多宠物位置目前只有主宠持久化，分身在每次运行中临时存在；
- Windows 窗口探测应进一步改为进程级共享服务，避免每只宠物各自执行系统探测。
