const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const createMainWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'Offitec ERP',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f6f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    const currentOrigin = new URL(currentUrl).origin;
    const nextOrigin = new URL(url).origin;

    if (nextOrigin !== currentOrigin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
};

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
