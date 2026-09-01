const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbenchApi', {
  getBootstrap: () => ipcRenderer.invoke('workbench:get-bootstrap'),
  createProject: (input) => ipcRenderer.invoke('workbench:create-project', input),
  openProject: (projectId) => ipcRenderer.invoke('workbench:open-project', projectId),
});
