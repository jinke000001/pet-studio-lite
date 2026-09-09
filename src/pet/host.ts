import { BrowserWindow, Menu, screen, ipcMain } from 'electron';
import { computeAnchoredZoomBounds } from '../shared/geometry';
import { ZOOM_LEVELS, ZOOM_MIN, ZOOM_MAX } from '../shared/config';
import type { PetWindowPayload } from '../shared/types';
import { registerPetIpc, type PetIpcTarget } from './ipc-router';

/**
 * 桌宠窗口宿主：工作室预览与导出的独立运行时共用，保证"预览到的就是
 * 用户拿到的"。差异（持久化、信息弹窗）通过 options 注入。
 *
 * pet:* 是进程级全局 IPC 通道（见 ./ipc-router.ts）：整个进程只注册一次，
 * handler 委托给"当前活动宿主"（activeHost）。因此反复 打开→关闭→再打开
 * 预览、或切换项目后再打开，都不会重复注册 handler（重复注册会让
 * Electron 抛 "second handler" 错误，这正是上一版预览只能开一次的根因）。
 */

export interface PetHostOptions {
  /** 拉取初始化数据（精灵配置 + 图集 data URL + 运行时配置）。 */
  getPayload: () => Promise<PetWindowPayload>;
  /** preload 脚本绝对路径。 */
  preloadFile: string;
  /** 加载地址（dev server URL 或 file:// 路径）。 */
  rendererUrl: string;
  /** 初始位置（持久化恢复用）；不给则用屏幕右下角默认位。 */
  initialPosition?: { x: number; y: number } | null;
  /** 拖动停止后回调（运行时用来持久化位置）。 */
  onPositionChange?: (pos: { x: number; y: number; displayId: number }) => void;
  /** 缩放变化后回调（运行时持久化 zoom）。 */
  onZoomChange?: (zoom: number) => void;
  /** "关于 / 信息"菜单项回调。 */
  onInfo?: () => void;
  /** 最后一个菜单项文案（运行时 = 退出；工作室预览 = 关闭预览）。 */
  closeLabel?: string;
  /** 窗口关闭回调。 */
  onClosed?: () => void;
}

/** 当前接收 pet:* 消息的宿主（每个进程同一时刻只有一个桌宠窗口）。 */
let activeHost: PetWindowHost | null = null;

export const PET_WIN_BASE_SIZE = 200;
const MOVE_DEBOUNCE_MS = 400;

function windowSizeFor(zoom: number): number {
  return Math.round(PET_WIN_BASE_SIZE * zoom);
}

function defaultPosition(display: Electron.Display, size: number): { x: number; y: number } {
  const { width, height } = display.workAreaSize;
  return {
    x: display.bounds.x + width - size - 32,
    y: display.bounds.y + height - size - 32,
  };
}

export class PetWindowHost implements PetIpcTarget {
  private win: BrowserWindow | null = null;
  private zoom = 1;
  private dragOrigin: { mouseX: number; mouseY: number; winX: number; winY: number } | null = null;

  constructor(readonly opts: PetHostOptions) {}

  get window(): BrowserWindow | null {
    return this.win;
  }

  // --- 由全局 pet:* handler 委托调用的实例方法 -------------------------------

  getPayload(): Promise<PetWindowPayload> {
    return this.opts.getPayload();
  }
  dragBegin(p: { x: number; y: number } | null): void {
    if (!this.win || !p) return;
    const [winX, winY] = this.win.getPosition();
    this.dragOrigin = { mouseX: p.x, mouseY: p.y, winX, winY };
  }

  dragMove(p: { x: number; y: number } | null): void {
    if (!this.win || !this.dragOrigin || !p) return;
    this.win.setPosition(
      Math.round(this.dragOrigin.winX + (p.x - this.dragOrigin.mouseX)),
      Math.round(this.dragOrigin.winY + (p.y - this.dragOrigin.mouseY)),
    );
  }

  dragEnd(): void {
    this.dragOrigin = null;
  }

  getBoundsInfo(): { win: { x: number; y: number; w: number; h: number }; workArea: { x: number; y: number; width: number; height: number } } | null {
    if (!this.win) return null;
    const [x, y] = this.win.getPosition();
    const [w, h] = this.win.getSize();
    const wa = screen.getDisplayMatching(this.win.getBounds()).workArea;
    return { win: { x, y, w, h }, workArea: { x: wa.x, y: wa.y, width: wa.width, height: wa.height } };
  }

  moveTo(x: number, y: number): void {
    if (!this.win) return;
    const wa = screen.getDisplayMatching(this.win.getBounds()).workArea;
    const [w, h] = this.win.getSize();
    this.win.setPosition(
      Math.max(wa.x, Math.min(Math.round(x), wa.x + wa.width - w)),
      Math.max(wa.y, Math.min(Math.round(y), wa.y + wa.height - h)),
    );
  }

  /**
   * 缩放：保持窗口 bottom-center 锚点，夹紧到当前匹配显示器 workArea，
   * 并通知 renderer 同步缩放精灵（窗口与渲染尺寸一致）。
   */
  setZoom(nextZoom: number): void {
    if (!Number.isFinite(nextZoom)) return;
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));
    if (this.win && !this.win.isDestroyed()) {
      const size = windowSizeFor(this.zoom);
      const prev = this.win.getBounds();
      const display = screen.getDisplayMatching(prev);
      const bounds = computeAnchoredZoomBounds(prev, size, display.workArea);
      this.win.setSize(bounds.width, bounds.height);
      this.win.setPosition(bounds.x, bounds.y);
      this.win.webContents.send('pet:zoom', this.zoom);
    }
    this.opts.onZoomChange?.(this.zoom);
  }

  async open(): Promise<void> {
    registerPetIpc(ipcMain, () => activeHost);
    const payload = await this.opts.getPayload();
    this.zoom = payload.config.zoom;
    const size = windowSizeFor(this.zoom);

    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const pos = this.opts.initialPosition ?? defaultPosition(cursorDisplay, size);

    const win = new BrowserWindow({
      width: size,
      height: size,
      x: pos.x,
      y: pos.y,
      transparent: true,
      frame: false,
      hasShadow: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.opts.preloadFile,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.win = win;
    activeHost = this;

    win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    win.on('move', () => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        moveTimer = null;
        if (!this.win) return;
        const [px, py] = this.win.getPosition();
        const display = screen.getDisplayMatching(this.win.getBounds());
        this.opts.onPositionChange?.({ x: px, y: py, displayId: display.id });
      }, MOVE_DEBOUNCE_MS);
    });

    win.on('closed', () => {
      if (moveTimer) { clearTimeout(moveTimer); moveTimer = null; }
      this.win = null;
      this.dragOrigin = null;
      if (activeHost === this) activeHost = null;
      this.opts.onClosed?.();
    });

    win.webContents.on('context-menu', () => {
      if (!this.win) return;
      const items: Electron.MenuItemConstructorOptions[] = [
        {
          label: '🔍  缩放',
          submenu: ZOOM_LEVELS.map((z) => ({
            label: `${Math.round(z * 100)}%`,
            type: 'radio' as const,
            checked: Math.abs(this.zoom - z) < 0.001,
            click: () => this.setZoom(z),
          })),
        },
        { type: 'separator' },
        { label: 'ℹ️  关于这只宠物', click: () => this.opts.onInfo?.() },
        { label: this.opts.closeLabel ?? '👋  退出', accelerator: 'CmdOrCtrl+Q', click: () => win.close() },
      ];
      Menu.buildFromTemplate(items).popup({ window: this.win });
    });

    await win.loadURL(this.opts.rendererUrl);
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    this.dragOrigin = null;
    if (activeHost === this) activeHost = null;
  }
}
