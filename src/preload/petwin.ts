import { contextBridge, ipcRenderer } from 'electron';
import type { PetWindowPayload } from '../shared/types';
import type { DesktopTerrain } from '../shared/shimeji/desktop-terrain';

/**
 * 桌宠窗口的窄桥 —— 工作室预览窗口与导出的独立桌宠运行时共用同一份
 * 桥与同一组 IPC 通道，保证预览和最终产品行为一致。
 */
const api = {
  /** 拉取初始化数据（精灵配置 + 图集 + 运行时配置）。 */
  getPayload(): Promise<PetWindowPayload> {
    return ipcRenderer.invoke('pet:payload') as Promise<PetWindowPayload>;
  },
  dragBegin(screenX: number, screenY: number): void {
    ipcRenderer.send('pet:drag:begin', { x: screenX, y: screenY });
  },
  dragMove(screenX: number, screenY: number): void {
    ipcRenderer.send('pet:drag:move', { x: screenX, y: screenY });
  },
  dragEnd(): void {
    ipcRenderer.send('pet:drag:end');
  },
  getWindowBounds(): Promise<{
    win: { x: number; y: number; w: number; h: number };
    workArea: { x: number; y: number; width: number; height: number };
  } | null> {
    return ipcRenderer.invoke('pet:window:bounds');
  },
  moveWindowTo(x: number, y: number): void {
    ipcRenderer.send('pet:window:moveTo', { x, y });
  },
  getDesktopTerrain(): Promise<DesktopTerrain | null> {
    return ipcRenderer.invoke('pet:shimeji:terrain') as Promise<DesktopTerrain | null>;
  },
  onDesktopTerrain(callback: (terrain: DesktopTerrain) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, terrain: DesktopTerrain) => callback(terrain);
    ipcRenderer.on('pet:shimeji:terrain', listener);
    return () => {
      ipcRenderer.removeListener('pet:shimeji:terrain', listener);
    };
  },
  onZoomChanged(callback: (zoom: number) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, zoom: number) => callback(zoom);
    ipcRenderer.on('pet:zoom', listener);
    return () => {
      ipcRenderer.removeListener('pet:zoom', listener);
    };
  },
  /** "自动游走"开关被右键菜单切换时回调（参数 = 新状态）。 */
  onWanderChanged(callback: (enabled: boolean) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled === true);
    ipcRenderer.on('pet:wander', listener);
    return () => {
      ipcRenderer.removeListener('pet:wander', listener);
    };
  },
  /** 右键菜单"回到屏幕右下角"回调。 */
  onGoHome(callback: () => void): () => void {
    const listener = () => callback();
    ipcRenderer.on('pet:go-home', listener);
    return () => {
      ipcRenderer.removeListener('pet:go-home', listener);
    };
  },
};

contextBridge.exposeInMainWorld('pet', api);

export type PetWindowApi = typeof api;
