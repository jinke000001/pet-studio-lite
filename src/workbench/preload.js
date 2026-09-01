const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbenchApi', {
  getBootstrap: () => ipcRenderer.invoke('workbench:get-bootstrap'),
  createProject: (input) => ipcRenderer.invoke('workbench:create-project', input),
  openProject: (projectId) => ipcRenderer.invoke('workbench:open-project', projectId),
  selectImport: (input) => ipcRenderer.invoke('workbench:select-import', input),
  getImportPreview: (projectId) => ipcRenderer.invoke('workbench:get-import-preview', projectId),
  startPetPreview: (projectId) => ipcRenderer.invoke('workbench:start-pet-preview', projectId),
  stopPetPreview: () => ipcRenderer.invoke('workbench:stop-pet-preview'),
  getPetPreviewStatus: () => ipcRenderer.invoke('workbench:get-pet-preview-status'),
  saveProduct: (input) => ipcRenderer.invoke('workbench:save-product', input),
  exportProject: (projectId) => ipcRenderer.invoke('workbench:export-project', projectId),
  exportStandardPackage: (projectId) => ipcRenderer.invoke('workbench:export-standard-package', projectId),
  listJobs: (projectId) => ipcRenderer.invoke('workbench:list-jobs', projectId),
  startExportJob: (projectId) => ipcRenderer.invoke('workbench:start-export-job', { projectId }),
  startCandidateJob: (input) => ipcRenderer.invoke('workbench:start-candidate-job', input),
  cancelJob: (input) => ipcRenderer.invoke('workbench:cancel-job', input),
  retryJob: (input) => ipcRenderer.invoke('workbench:retry-job', input),
});
