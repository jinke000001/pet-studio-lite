import { contextBridge, ipcRenderer } from 'electron';

export interface PetSizeControlState {
  zoom: number;
  min: number;
  max: number;
  step: number;
  persistent: boolean;
}

const api = {
  getState(): Promise<PetSizeControlState> {
    return ipcRenderer.invoke('pet:size-control:state') as Promise<PetSizeControlState>;
  },
  setZoom(zoom: number): void {
    ipcRenderer.send('pet:size-control:set-zoom', zoom);
  },
  close(): void {
    ipcRenderer.send('pet:size-control:close');
  },
  onZoomChanged(callback: (zoom: number) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, zoom: number) => callback(zoom);
    ipcRenderer.on('pet:size-control:zoom-changed', listener);
    return () => ipcRenderer.removeListener('pet:size-control:zoom-changed', listener);
  },
};

contextBridge.exposeInMainWorld('petSizeControl', api);

export type PetSizeControlApi = typeof api;
