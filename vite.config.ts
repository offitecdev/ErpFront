import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// The app stylesheet is ~54 KB gzipped; as a render-blocking <head> link it
// held the first paint hostage for the whole download (mobile-throttled
// Lighthouse: FCP ≈ 6 s). The inline boot skeleton in index.html needs no
// external CSS, so the stylesheet can load out of the critical path:
//  - a high-priority preload fetches the bytes,
//  - the actual stylesheet tag starts as media="print" (non-blocking; a
//    CSP-safe trick — no inline event handlers involved),
//  - main.tsx flips media to "all" once the file is loaded and only then
//    mounts React, so the app never renders unstyled.
const asyncCssPlugin = () => ({
  name: 'offitec:async-css',
  apply: 'build' as const,
  transformIndexHtml: {
    order: 'post' as const,
    handler: (html: string) =>
      html.replace(
        /<link rel="stylesheet"([^>]*?)href="([^"]+\.css)"([^>]*?)>/g,
        (_m, pre: string, href: string, post: string) =>
          `<link rel="preload" as="style"${pre}href="${href}"${post} id="app-css-preload">` +
          `<link rel="stylesheet"${pre}href="${href}"${post} media="print" id="app-css">` +
          `<noscript><link rel="stylesheet"${pre}href="${href}"${post}></noscript>`,
      ),
  },
})

// Open Sans ships with font-display: swap, so text paints in the fallback
// (Arial) until the woff2 arrives. Preloading the three weights the UI is
// actually set in (400/600/700 upright) makes that window effectively
// invisible on a warm connection. The files are content-hashed, so the tags
// can only be written here, where the emitted bundle is known.
const fontPreloadPlugin = () => {
  let base = '/'
  return {
    name: 'offitec:font-preload',
    apply: 'build' as const,
    configResolved(config: { base: string }) { base = config.base },
    transformIndexHtml: {
      order: 'post' as const,
      handler: (html: string, ctx: { bundle?: Record<string, unknown> }) => ({
        html,
        tags: Object.keys(ctx.bundle ?? {})
          .filter((file) => /OpenSans-(Regular|Semibold|Bold)-webfont-[^/]+\.woff2$/.test(file))
          .map((file) => ({
            tag: 'link',
            // Font preloads need `crossorigin` even same-origin; without it the
            // preload is unusable for the CSS-initiated request and the file
            // downloads twice.
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href: base + file },
            injectTo: 'head-prepend' as const,
          })),
      }),
    },
  }
}

export default defineConfig(({ mode }) => ({
  // Web (nginx) needs an absolute base so assets resolve to /assets/... on
  // deep routes after a refresh. Electron loads via file:// and needs a
  // relative base. Desktop builds pass `--mode electron`.
  base: mode === 'electron' ? './' : '/',
  plugins: [react(), tailwindcss(), asyncCssPlugin(), fontPreloadPlugin()],
  server: {
    // Hot Module Replacement is on by default so the dev server (`npm run dev`)
    // live-updates the browser on every save. Set VITE_DISABLE_HMR=true to
    // turn it off (e.g. for environments where the HMR websocket can't connect).
    hmr: process.env.VITE_DISABLE_HMR !== 'true',
    // Same-origin API, exactly like production nginx (/backend/... → backend).
    // Cross-origin localhost:5173 → localhost:3000 added a CORS preflight
    // round-trip to every API call — including the ones on the LCP path.
    // `preview` inherits this proxy, so `npm run dev` (build + preview) and
    // `npm run dev:hmr` both serve the API from the page's own origin.
    proxy: {
      '/backend': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/backend/, ''),
      },
    },
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
          // react-dom, react and the router live in separate chunks on
          // purpose: one merged bundle evaluated as a single ~350 ms task
          // (mobile CPU throttle) inside the Total Blocking Time window.
          // Separate files give the main thread a yield point between evals.
          if (normalizedId.includes('/node_modules/react-dom/')) {
            return 'vendor-react-dom';
          }
          if (
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (
            normalizedId.includes('/node_modules/react-router-dom/') ||
            normalizedId.includes('/node_modules/react-router/')
          ) {
            return 'vendor-router';
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
