const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  getRuntime: () => ipcRenderer.invoke('pet:get-runtime'),
  getSettings: () => ipcRenderer.invoke('pet:get-settings'),
  setScale: (scale) => ipcRenderer.invoke('pet:set-scale', scale),
  dragStart: () => ipcRenderer.invoke('pet:drag-start'),
  dragStop: () => ipcRenderer.send('pet:drag-stop'),
  hide: () => ipcRenderer.send('pet:hide'),
  quit: () => ipcRenderer.send('pet:quit'),
  onUserActivity(callback) {
    if (typeof callback !== 'function') return () => {};
    const handler = () => callback();
    ipcRenderer.on('pet:user-activity', handler);
    return () => ipcRenderer.removeListener('pet:user-activity', handler);
  },
});
