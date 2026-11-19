const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pop', {
  onItems: (cb) => ipcRenderer.on('items', (_e, items) => cb(items)),
  act: (id, act, mins) => ipcRenderer.send('popup-action', { id: String(id), act: String(act), mins: Number(mins) || 0 }),
  dismiss: () => ipcRenderer.send('popup-dismiss'),
  size: (h) => ipcRenderer.send('popup-size', Math.ceil(Number(h) || 0))
});
