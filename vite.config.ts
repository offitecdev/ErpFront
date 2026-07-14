import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig(({ mode }) => ({
  // Web (nginx) needs an absolute base so assets resolve to /assets/... on
  // deep routes after a refresh. Electron loads via file:// and needs a
  // relative base. Desktop builds pass `--mode electron`.
  base: mode === 'electron' ? './' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    // Hot Module Replacement is on by default so the dev server (`npm run dev`)
    // live-updates the browser on every save. Set VITE_DISABLE_HMR=true to
    // turn it off (e.g. for environments where the HMR websocket can't connect).
    hmr: process.env.VITE_DISABLE_HMR !== 'true',
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
          // Do not force PDF/QR libraries into manual chunks. Those groups formed
          // cross-chunk cycles with the app runtime, turning otherwise dynamic PDF
          // imports into eager TenderDetail dependencies. Rollup's natural chunks
          // keep them behind the export/dashboard interactions that use them.
          // antd is intentionally NOT forced into a single chunk. Doing so made
          // the shell's ConfigProvider import drag the entire antd bundle onto
          // the critical path. Letting Rollup split it keeps only the shell's
          // antd deps eager; per-page components load with their lazy routes.
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
}))
