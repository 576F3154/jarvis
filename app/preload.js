const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: (data) => ipcRenderer.invoke('save', data),
  show: () => ipcRenderer.send('show'),
  hide: () => ipcRenderer.send('hide'),
  flash: () => ipcRenderer.send('flash'),
  popup: (items) => ipcRenderer.send('popup', items),
  setBadge: (n) => ipcRenderer.send('badge', Number(n) || 0),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (on) => ipcRenderer.send('set-autostart', !!on),
  onQuickAdd: (cb) => ipcRenderer.on('quick-add', () => cb()),
  onPopupAction: (cb) => ipcRenderer.on('popup-action', (_e, a) => cb(a)),
  onPopupDismissed: (cb) => ipcRenderer.on('popup-dismissed', () => cb()),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  applyUpdate: () => ipcRenderer.send('apply-update'),
  versions: () => ipcRenderer.invoke('versions'),
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', (_e, info) => cb(info)),
  onCheckNow: (cb) => ipcRenderer.on('check-update-now', () => cb())
});
