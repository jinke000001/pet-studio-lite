/**
 * 应用窗口生命周期策略（纯函数，Node 可测）。
 * macOS 习惯：关闭主窗口后应用保留在 Dock/菜单栏，点 Dock 图标重新打开；
 * Windows/Linux 习惯：关闭最后窗口即退出。
 */
export function shouldQuitOnAllWindowsClosed(platform: NodeJS.Platform | string): boolean {
  return platform !== 'darwin';
}
