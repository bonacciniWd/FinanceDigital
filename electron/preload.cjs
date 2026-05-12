const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Zoom inicial: respeita preferência salva (localStorage) ou 0.9 padrão.
// webFrame é o caminho correto no Electron (sem espaço vazio como CSS zoom).
const ZOOM_KEY = 'app:zoomFactor';
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.6;
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(z) || 0.9));

try {
  const saved = parseFloat(localStorage.getItem(ZOOM_KEY) || '');
  webFrame.setZoomFactor(clampZoom(isNaN(saved) ? 0.9 : saved));
} catch {
  webFrame.setZoomFactor(0.9);
}

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
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update:status', (_event, state) => callback(state)),

  // Auto-updater manual controls
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  getUpdateStatus: () => ipcRenderer.invoke('update:getStatus'),
  quitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),

  // Window facade (Calculadora trigger)
  appReveal: () => ipcRenderer.invoke('app:reveal'),
  appHide: () => ipcRenderer.invoke('app:hide'),

  // WhatsApp Web em janela interna (não usa app/whatsapp instalado)
  openWhatsApp: (phone, message) =>
    ipcRenderer.invoke('whatsapp:open', { phone, message }),
  closeAllWhatsApp: () => ipcRenderer.invoke('whatsapp:closeAll'),

  // Zoom da janela (webFrame). Persistido em localStorage pelo renderer.
  getZoomFactor: () => webFrame.getZoomFactor(),
  setZoomFactor: (factor) => {
    const z = clampZoom(factor);
    webFrame.setZoomFactor(z);
    try { localStorage.setItem(ZOOM_KEY, String(z)); } catch {}
    return z;
  },
});
