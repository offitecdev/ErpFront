const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('offitecDesktop', {
  isDesktop: true,
  platform: process.platform,
});
