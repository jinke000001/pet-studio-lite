import { contextBridge, ipcRenderer } from 'electron';
import type { ExportProgressEvent, ExportResult, ImportResult, PetdexPrepareResult, PreviewPayload, ProjectMeta, StudioState } from '../shared/types';

/**
 * 制作台窗口的窄桥。只暴露实际需要的动作；所有入参在 main 进程还会
 * 经过一层运行时校验（src/shared/ipc-validate.ts）。
 */
const api = {
  getState(): Promise<StudioState> {
    return ipcRenderer.invoke('studio:state') as Promise<StudioState>;
  },
  /** 弹出系统文件选择框并导入（dir = 宠物包目录，zip = ZIP 包）。 */
  importPack(kind: 'dir' | 'zip'): Promise<ImportResult> {
    return ipcRenderer.invoke('studio:import', kind) as Promise<ImportResult>;
  },
  /** 下载并校验 Petdex 候选；确认前不会创建制作台项目。 */
  preparePetdexImport(command: string): Promise<PetdexPrepareResult> {
    return ipcRenderer.invoke('studio:petdex:prepare', command) as Promise<PetdexPrepareResult>;
  },
  confirmPetdexImport(token: string): Promise<ImportResult> {
    return ipcRenderer.invoke('studio:petdex:confirm', token) as Promise<ImportResult>;
  },
  cancelPetdexImport(token: string): Promise<void> {
    return ipcRenderer.invoke('studio:petdex:cancel', token) as Promise<void>;
  },
  selectProject(id: string): Promise<StudioState> {
    return ipcRenderer.invoke('studio:select', id) as Promise<StudioState>;
  },
  removeProject(id: string): Promise<StudioState> {
    return ipcRenderer.invoke('studio:remove', id) as Promise<StudioState>;
  },
  /** 重新校验项目的只读副本（检查步骤）。 */
  recheck(id: string): Promise<{ ok: boolean; errors: string[] }> {
    return ipcRenderer.invoke('studio:recheck', id) as Promise<{ ok: boolean; errors: string[] }>;
  },
  getPreviewPayload(id: string): Promise<PreviewPayload> {
    return ipcRenderer.invoke('studio:preview-payload', id) as Promise<PreviewPayload>;
  },
  updateConfig(id: string, patch: unknown): Promise<ProjectMeta> {
    return ipcRenderer.invoke('studio:config:set', id, patch) as Promise<ProjectMeta>;
  },
  startPetPreview(id: string): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('studio:preview:start', id) as Promise<{ ok: boolean; error?: string }>;
  },
  stopPetPreview(): Promise<void> {
    return ipcRenderer.invoke('studio:preview:stop') as Promise<void>;
  },
  /** 预览窗口被关闭（任何途径：按钮/宠物右键菜单/系统关闭）时回调。 */
  onPreviewClosed(callback: () => void): () => void {
    const listener = () => callback();
    ipcRenderer.on('studio:preview:closed', listener);
    return () => {
      ipcRenderer.removeListener('studio:preview:closed', listener);
    };
  },
  exportProject(id: string): Promise<ExportResult> {
    return ipcRenderer.invoke('studio:export', id) as Promise<ExportResult>;
  },
  onExportProgress(callback: (e: ExportProgressEvent) => void): () => void {
    const listener = (_: Electron.IpcRendererEvent, e: ExportProgressEvent) => callback(e);
    ipcRenderer.on('studio:export:progress', listener);
    return () => {
      ipcRenderer.removeListener('studio:export:progress', listener);
    };
  },
  /** 受控地打开导出结果所在目录（仅允许这一个受控目标）。 */
  revealExport(zipPath: string): Promise<void> {
    return ipcRenderer.invoke('studio:export:reveal', zipPath) as Promise<void>;
  },
};

contextBridge.exposeInMainWorld('studio', api);

export type StudioApi = typeof api;
