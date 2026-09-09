/**
 * 应用窗口生命周期策略（纯函数，Node 可测）。
 * macOS 习惯：关闭主窗口后应用保留在 Dock/菜单栏，点 Dock 图标重新打开；
 * Windows/Linux 习惯：关闭最后窗口即退出。
 */
export function shouldQuitOnAllWindowsClosed(platform: NodeJS.Platform | string): boolean {
  return platform !== 'darwin';
}

/** 可被 activate 决策操作的最小窗口接口（Electron BrowserWindow 满足它）。 */
export interface ActivatableWindow {
  isDestroyed(): boolean;
  show(): void;
  focus(): void;
}

export type ActivateAction = 'recreate' | 'focus';

/**
 * macOS activate（点 Dock 图标）时制作台窗口的决策。
 *
 * 判断只基于制作台窗口本身，而不是全部 BrowserWindow 数量：
 * 桌宠预览窗口可能还开着，此时制作台已关闭（studioWindow 为 null 或已销毁），
 * 必须重新创建制作台并保留预览；制作台存在则 show + focus。
 *
 * createWindow 只在需要重建时调用一次，由调用方保证同步完成窗口创建，
 * 因此连续触发 activate 不会重复建窗。
 */
export function handleActivate<W extends ActivatableWindow>(
  studioWindow: W | null,
  createWindow: () => W,
): { action: ActivateAction; window: W } {
  if (!studioWindow || studioWindow.isDestroyed()) {
    return { action: 'recreate', window: createWindow() };
  }
  studioWindow.show();
  studioWindow.focus();
  return { action: 'focus', window: studioWindow };
}
