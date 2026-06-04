import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    hmr: process.env.VITE_ENABLE_HMR === 'true',
  },
  build: {
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter(
          (dep) =>
            !dep.includes('vendor-pdf') &&
            !dep.includes('vendor-scanner') &&
            !dep.includes('vendor-qr') &&
            !dep.includes('html2canvas')
        ),
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const normalizedId = id.replace(/\\/g, '/');
          if (
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-dom/') ||
            normalizedId.includes('/node_modules/react-router-dom/')
          ) {
            return 'vendor-react';
          }
          if (normalizedId.includes('/node_modules/qrcode.react/')) {
            return 'vendor-qr';
          }
          if (normalizedId.includes('/node_modules/jspdf/') || normalizedId.includes('/node_modules/pdf-lib/') || normalizedId.includes('/node_modules/qrcode/')) {
            return 'vendor-pdf';
          }
          if (normalizedId.includes('/node_modules/antd/') || normalizedId.includes('/node_modules/@ant-design/')) {
            return 'vendor-antd';
          }
          if (normalizedId.includes('/node_modules/html5-qrcode/')) {
            return 'vendor-scanner';
          }
          if (normalizedId.includes('/node_modules/lucide-react/') || normalizedId.includes('/node_modules/sonner/') || normalizedId.includes('/node_modules/radix-ui/')) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
