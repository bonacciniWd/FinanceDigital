const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Aplica zoom 0.9 via webFrame (correto no Electron, sem espaço vazio)
webFrame.setZoomFactor(0.9);

// Marca que estamos no Electron para desativar CSS zoom
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('electron-app');
});

contextBridge.exposeInMainWorld('electronAPI', {
  // IP Guard
  checkIpWhitelist: (supabaseUrl, supabaseKey) =>
    ipcRenderer.invoke('ip:check', { supabaseUrl, supabaseKey }),
  getCurrentIp: () => ipcRenderer.invoke('ip:getCurrent'),

  // Machine ID
  getMachineId: () => ipcRenderer.invoke('machine:getId'),

  // Encrypted Storage
  encryptAndSave: (name, data) =>
    ipcRenderer.invoke('storage:encrypt', { name, data }),
  loadAndDecrypt: (name) =>
    ipcRenderer.invoke('storage:decrypt', { name }),
  deleteEncrypted: (name) =>
    ipcRenderer.invoke('storage:delete', { name }),

  // Auto-updater events
  onUpdateAvailable: (callback) =>
    ipcRenderer.on('update:available', (_event, version) => callback(version)),
});
