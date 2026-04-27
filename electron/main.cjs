const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');
const ipGuard = require('./ip-guard.cjs');
const encryptedStorage = require('./encrypted-storage.cjs');
const usageTracker = require('./usage-tracker.cjs');

const isDev = process.env.ELECTRON_DEV === 'true';
const DIST_PATH = path.join(__dirname, '..', 'dist');

let mainWindow = null;

// Register custom protocol BEFORE app is ready (required by Electron)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function createWindow() {
  // Inicia no tamanho de uma calculadora real (fachada). Quando o usuário
  // ativa o trigger secreto, o renderer chama `app:reveal` via IPC e a
  // janela cresce para o tamanho normal do app.
  mainWindow = new BrowserWindow({
    width: 340,
    height: 560,
    minWidth: 320,
    minHeight: 500,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Calculadora',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Use custom protocol — acts like a real HTTP server.
    // Carrega na raiz "/" (não "/index.html") para que o React Router
    // case com a rota "/" da Calculadora (fachada). Carregar com
    // "/index.html" faria pathname = "/index.html" e cairia no fallback
    // dentro do ProtectedRoute → redirect para /login (bug v1.4.15).
    mainWindow.loadURL('app://bundle/');
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`Failed to load: ${code} — ${desc}`);
    if (isDev) {
      // Dev server probably not started yet — retry in 2s
      setTimeout(() => mainWindow.loadURL('http://localhost:5173'), 2000);
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// --- IPC Handlers ---

ipcMain.handle('ip:check', async (_event, { supabaseUrl, supabaseKey }) => {
  return ipGuard.checkIpWhitelist(supabaseUrl, supabaseKey);
});

ipcMain.handle('ip:getCurrent', async () => {
  return ipGuard.getCurrentIp();
});

ipcMain.handle('machine:getId', () => {
  return usageTracker.getMachineId();
});

ipcMain.handle('storage:encrypt', (_event, { name, data }) => {
  return encryptedStorage.encryptAndSave(name, data);
});

ipcMain.handle('storage:decrypt', (_event, { name }) => {
  return encryptedStorage.loadAndDecrypt(name);
});

ipcMain.handle('storage:delete', (_event, { name }) => {
  return encryptedStorage.deleteEncrypted(name);
});

// --- App Reveal: expande a janela ao sair da fachada Calculadora ---
ipcMain.handle('app:reveal', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setFullScreenable(true);
  mainWindow.setMinimumSize(1024, 700);
  mainWindow.setSize(1400, 900);
  mainWindow.center();
  return true;
});

// Volta para o tamanho de calculadora (logout / exit)
ipcMain.handle('app:hide', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setMinimumSize(320, 500);
  mainWindow.setSize(340, 560);
  mainWindow.setResizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setFullScreenable(false);
  mainWindow.center();
  return true;
});

// --- Updater IPC (manual check/download/install) ---

let updaterState = {
  status: 'idle', // idle | checking | available | not-available | downloading | downloaded | error
  version: null,
  currentVersion: null,
  progress: 0,
  error: null,
};

function broadcastUpdaterStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', updaterState);
  }
}

ipcMain.handle('update:check', async () => {
  updaterState.currentVersion = app.getVersion();
  if (isDev) {
    updaterState = { ...updaterState, status: 'error', error: 'Updater desativado em modo desenvolvimento' };
    return updaterState;
  }
  try {
    updaterState = { ...updaterState, status: 'checking', error: null };
    broadcastUpdaterStatus();
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.updateInfo) {
      updaterState = { ...updaterState, status: 'not-available' };
    }
    return updaterState;
  } catch (err) {
    updaterState = { ...updaterState, status: 'error', error: err.message || String(err) };
    broadcastUpdaterStatus();
    return updaterState;
  }
});

ipcMain.handle('update:quitAndInstall', () => {
  if (updaterState.status === 'downloaded') {
    autoUpdater.quitAndInstall(false, true);
  }
});

ipcMain.handle('update:getStatus', () => {
  updaterState.currentVersion = app.getVersion();
  return updaterState;
});

// --- App Lifecycle ---

app.whenReady().then(async () => {
  // Register protocol handler for production — serves dist/ files with SPA fallback
  if (!isDev) {
    protocol.handle('app', (request) => {
      let { pathname } = new URL(request.url);
      // Decode URI components (e.g. %20 → space)
      pathname = decodeURIComponent(pathname);

      const filePath = path.join(DIST_PATH, pathname);

      // If file exists, serve it; otherwise serve index.html (SPA routing)
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return net.fetch(pathToFileURL(filePath).toString());
      }
      return net.fetch(pathToFileURL(path.join(DIST_PATH, 'index.html')).toString());
    });
  }

  // IP check on startup
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

    if (supabaseUrl && supabaseKey) {
      const result = await ipGuard.checkIpWhitelist(supabaseUrl, supabaseKey);
      if (!result.allowed) {
        dialog.showErrorBox(
          'Acesso Negado',
          `Seu IP (${result.ip}) não está autorizado a usar este aplicativo.\nContate o administrador.`
        );
        app.quit();
        return;
      }
    }
  } catch (err) {
    console.error('IP check on startup failed:', err.message);
  }

  createWindow();

  // ── Auto-updater (produção apenas) ────────────────────────
  if (!isDev) {
    const log = require('electron-log');
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      updaterState = { ...updaterState, status: 'checking', error: null };
      broadcastUpdaterStatus();
    });

    autoUpdater.on('update-available', (info) => {
      console.log(`[updater] Nova versão disponível: ${info.version}`);
      updaterState = { ...updaterState, status: 'downloading', version: info.version, progress: 0, error: null };
      broadcastUpdaterStatus();
      if (mainWindow) mainWindow.webContents.send('update:available', info.version);
    });

    autoUpdater.on('update-not-available', (info) => {
      updaterState = { ...updaterState, status: 'not-available', version: info.version, error: null };
      broadcastUpdaterStatus();
    });

    autoUpdater.on('download-progress', (p) => {
      updaterState = { ...updaterState, status: 'downloading', progress: Math.round(p.percent) };
      broadcastUpdaterStatus();
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[updater] Update baixado: ${info.version}`);
      updaterState = { ...updaterState, status: 'downloaded', version: info.version, progress: 100 };
      broadcastUpdaterStatus();
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualização disponível',
        message: `A versão ${info.version} foi baixada. O app será reiniciado para aplicar a atualização.`,
        buttons: ['Reiniciar agora', 'Depois'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('[updater] Erro ao verificar atualizações:', err.message);
      updaterState = { ...updaterState, status: 'error', error: err.message || String(err) };
      broadcastUpdaterStatus();
    });

    // Verifica atualizações 5s após iniciar (e depois a cada 4h)
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
