import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.offitec.erp',
  appName: 'Offitec ERP',
  webDir: 'dist',
  server: {
    // Keep the same HTTPS origin as the deployed PWA. Authentication uses
    // secure HttpOnly cookies, so a localhost/file origin would break login.
    url: 'https://demo.offitec.ch',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    zoomEnabled: false,
  },
};

export default config;
