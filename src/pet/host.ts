import { BrowserWindow, Menu, screen, ipcMain } from 'electron';
import { clampBoundsToWorkArea, computeAnchoredZoomBounds, computeWorkAreaHomePosition } from '../shared/geometry';
import { normalizeZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../shared/config';
import { FlushableDebouncer } from '../shared/debounce';
import type { PetWindowPayload } from '../shared/types';
import { registerPetIpc, type PetIpcTarget } from './ipc-router';
import { buildPetContextMenu } from './menu';

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
  /** 尺寸面板 preload 脚本绝对路径。 */
  sizeControlPreloadFile: string;
  /** 尺寸面板加载地址（dev server URL 或 file:// 路径）。 */
  sizeControlRendererUrl: string;
  /** 初始位置（持久化恢复用）；不给则用屏幕右下角默认位。 */
  initialPosition?: { x: number; y: number } | null;
  /** 拖动停止后回调（运行时用来持久化位置）。 */
  onPositionChange?: (pos: { x: number; y: number; displayId: number }) => void;
  /** 缩放变化后回调（运行时持久化 zoom）。 */
  onZoomChange?: (zoom: number) => void;
  /** "自动游走"开关变化后回调（运行时持久化；预览不传 = 不写盘）。 */
  onWanderChange?: (enabled: boolean) => void;
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
  // 首次启动默认位与"回到屏幕右下角"共用同一套 workArea 几何（DIP，
  // 天然兼容多显示器与缩放；workArea 太小时夹紧贴边）。
  return computeWorkAreaHomePosition(display.workArea, size);
}

export class PetWindowHost implements PetIpcTarget {
  private win: BrowserWindow | null = null;
  private sizeWin: BrowserWindow | null = null;
  private zoom = 1;
  private wanderEnabled = true;
  private dragOrigin: { mouseX: number; mouseY: number; winX: number; winY: number } | null = null;
  private displayMetricsListener: ((event: Electron.Event, display: Electron.Display, changedMetrics: string[]) => void) | null = null;

  constructor(readonly opts: PetHostOptions) {}

  get window(): BrowserWindow | null {
    return this.win;
  }

  // --- 由全局 pet:* handler 委托调用的实例方法 -------------------------------

  getPayload(): Promise<PetWindowPayload> {
    return this.opts.getPayload();
  }

  getSizeControlState(): { zoom: number; min: number; max: number; step: number; persistent: boolean } {
    return {
      zoom: this.zoom,
      min: ZOOM_MIN,
      max: ZOOM_MAX,
      step: ZOOM_STEP,
      persistent: !!this.opts.onZoomChange,
    };
  }

  ownsSizeControlSender(senderId: number): boolean {
    return !!this.sizeWin && !this.sizeWin.isDestroyed() && this.sizeWin.webContents.id === senderId;
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
   * 入参走统一规范化：旧档 50%/75% 提升为 100%；非法/越界值忽略（保持当前缩放）。
   */
  setZoom(nextZoom: number): void {
    const normalized = normalizeZoom(nextZoom);
    if (normalized === null) return;
    this.zoom = normalized;
    if (this.win && !this.win.isDestroyed()) {
      const size = windowSizeFor(this.zoom);
      const prev = this.win.getBounds();
      const display = screen.getDisplayMatching(prev);
      const bounds = computeAnchoredZoomBounds(prev, size, display.workArea);
      // Windows 对 setSize / setPosition 两步更新会分别派发原生 move/resize，
      // DPI 边界附近可能在中间态自行修正坐标。一次 setBounds 保证尺寸与位置
      // 原子提交，不会留下“窗口可拖动但精灵已经在屏外”的透明区域。
      this.win.setBounds(bounds);
      this.win.webContents.send('pet:zoom', this.zoom);
    }
    if (this.sizeWin && !this.sizeWin.isDestroyed()) {
      this.sizeWin.webContents.send('pet:size-control:zoom-changed', this.zoom);
    }
    this.opts.onZoomChange?.(this.zoom);
  }

  /** 打开独立尺寸面板；重复点击只聚焦已有窗口。 */
  openSizeControl(): void {
    if (!this.win || this.win.isDestroyed()) return;
    if (this.sizeWin && !this.sizeWin.isDestroyed()) {
      this.sizeWin.show();
      this.sizeWin.focus();
      return;
    }

    const panelWidth = 360;
    const panelHeight = 224;
    const petBounds = this.win.getBounds();
    const workArea = screen.getDisplayMatching(petBounds).workArea;
    const preferredY = petBounds.y - panelHeight - 12;
    const x = Math.max(workArea.x, Math.min(
      Math.round(petBounds.x + petBounds.width / 2 - panelWidth / 2),
      workArea.x + workArea.width - panelWidth,
    ));
    const y = Math.max(workArea.y, Math.min(
      preferredY >= workArea.y ? preferredY : petBounds.y + petBounds.height + 12,
      workArea.y + workArea.height - panelHeight,
    ));

    const sizeWin = new BrowserWindow({
      x,
      y,
      width: panelWidth,
      height: panelHeight,
      title: '宠物尺寸',
      parent: this.win,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      backgroundColor: '#f7f5f1',
      webPreferences: {
        preload: this.opts.sizeControlPreloadFile,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.sizeWin = sizeWin;
    sizeWin.removeMenu();
    sizeWin.on('closed', () => {
      if (this.sizeWin === sizeWin) this.sizeWin = null;
    });
    sizeWin.once('ready-to-show', () => {
      if (!sizeWin.isDestroyed()) sizeWin.show();
    });
    void sizeWin.loadURL(this.opts.sizeControlRendererUrl).catch(() => {
      if (!sizeWin.isDestroyed()) sizeWin.close();
    });
  }

  closeSizeControl(): void {
    const sizeWin = this.sizeWin;
    this.sizeWin = null;
    if (sizeWin && !sizeWin.isDestroyed()) sizeWin.destroy();
  }

  /**
   * "自动游走"开关：即时生效（通知 renderer 更新开关并停止正在进行的
   * 游走），同时通过 onWanderChange 让运行时持久化用户选择。
   */
  setWanderEnabled(enabled: boolean): void {
    this.wanderEnabled = enabled;
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('pet:wander', enabled);
    }
    this.opts.onWanderChange?.(enabled);
  }

  /** "回到屏幕右下角"：由 renderer 停下游走、按 workArea 几何复位并移动。 */
  goHome(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('pet:go-home');
    }
  }

  async open(): Promise<void> {
    registerPetIpc(ipcMain, () => activeHost);
    const payload = await this.opts.getPayload();
    this.zoom = payload.config.zoom;
    this.wanderEnabled = payload.config.wanderEnabled;
    const size = windowSizeFor(this.zoom);

    const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const requestedPos = this.opts.initialPosition ?? defaultPosition(cursorDisplay, size);
    const requestedBounds = { x: requestedPos.x, y: requestedPos.y, width: size, height: size };
    const initialDisplay = screen.getDisplayMatching(requestedBounds);
    const initialBounds = clampBoundsToWorkArea(requestedBounds, initialDisplay.workArea);

    const win = new BrowserWindow({
      ...initialBounds,
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

    // Electron 的窗口坐标使用 DIP，交给 Windows 负责 100%/125%/150% 等
    // 屏幕缩放；系统缩放或 workArea 动态变化后，再按相同逻辑尺寸围绕
    // bottom-center 重新夹紧，避免窗口坐标仍合法但可见内容落出新工作区。
    this.displayMetricsListener = (_event, _display, changedMetrics) => {
      if (!changedMetrics.some((metric) => metric === 'bounds' || metric === 'workArea' || metric === 'scaleFactor')) return;
      if (!this.win || this.win.isDestroyed()) return;
      const current = this.win.getBounds();
      const display = screen.getDisplayMatching(current);
      const next = computeAnchoredZoomBounds(current, windowSizeFor(this.zoom), display.workArea);
      this.win.setBounds(next);
    };
    screen.on('display-metrics-changed', this.displayMetricsListener);

    // 位置保存走可冲刷防抖：移动停止 400ms 后落盘（体验不变）；窗口关闭时
    // flush() 立即保存待写的最终位置 —— 复位/拖动后立刻退出也不丢位置。
    const positionSaver = new FlushableDebouncer<{ x: number; y: number; displayId: number }>(
      MOVE_DEBOUNCE_MS,
      (pos) => this.opts.onPositionChange?.(pos),
    );
    win.on('move', () => {
      if (!this.win) return;
      const [px, py] = this.win.getPosition();
      const display = screen.getDisplayMatching(this.win.getBounds());
      positionSaver.trigger({ x: px, y: py, displayId: display.id });
    });

    win.on('closed', () => {
      positionSaver.flush();
      this.closeSizeControl();
      if (this.displayMetricsListener) {
        screen.removeListener('display-metrics-changed', this.displayMetricsListener);
        this.displayMetricsListener = null;
      }
      this.win = null;
      this.dragOrigin = null;
      if (activeHost === this) activeHost = null;
      this.opts.onClosed?.();
    });

    win.webContents.on('context-menu', () => {
      if (!this.win) return;
      const items = buildPetContextMenu(
        { wanderEnabled: this.wanderEnabled, closeLabel: this.opts.closeLabel ?? '👋  退出' },
        {
          onToggleWander: (enabled) => this.setWanderEnabled(enabled),
          onOpenSizeControl: () => this.openSizeControl(),
          onGoHome: () => this.goHome(),
          onInfo: () => this.opts.onInfo?.(),
          onClose: () => this.win?.close(),
        },
      );
      Menu.buildFromTemplate(items).popup({ window: this.win });
    });

    await win.loadURL(this.opts.rendererUrl);
  }

  close(): void {
    if (this.displayMetricsListener) {
      screen.removeListener('display-metrics-changed', this.displayMetricsListener);
      this.displayMetricsListener = null;
    }
    this.closeSizeControl();
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    this.dragOrigin = null;
    if (activeHost === this) activeHost = null;
  }
}
