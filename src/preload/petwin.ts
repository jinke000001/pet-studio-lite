import { contextBridge, ipcRenderer } from 'electron';
import type { PetWindowPayload } from '../shared/types';

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
  onZoomChanged(callback: (zoom: number) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, zoom: number) => callback(zoom);
    ipcRenderer.on('pet:zoom', listener);
    return () => {
      ipcRenderer.removeListener('pet:zoom', listener);
    };
  },
};

contextBridge.exposeInMainWorld('pet', api);

export type PetWindowApi = typeof api;
