import path from "path"
import compression from "compression"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const backendProxy = {
  '/backend': {
    target: 'http://localhost:3000',
    changeOrigin: true,
    rewrite: (requestPath: string) => requestPath.replace(/^\/backend/, ''),
  },
}

// Lighthouse is often run against the local HMR/preview server. Production
// nginx already compresses HTML, CSS, JS and JSON; applying the same response
// middleware locally keeps those audits representative and avoids shipping the
// 20+ KiB entry document uncompressed.
const responseCompressionPlugin = () => ({
  name: 'offitec:response-compression',
  configureServer(server: { middlewares: { use: (middleware: ReturnType<typeof compression>) => void } }) {
    server.middlewares.use(compression())
  },
  configurePreviewServer(server: { middlewares: { use: (middleware: ReturnType<typeof compression>) => void } }) {
    server.middlewares.use(compression())
  },
})

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

// Open Sans uses font-display: optional: a fast/preloaded font is used on the
// first paint, while a delayed font never replaces Arial after layout and
// therefore cannot shift the quote table. Preloading the three upright weights
// used above the fold makes Open Sans win that window on normal connections.
// The files are content-hashed, so production tags are written where the final
// emitted names are known.
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
          .filter((file) => /OpenSans-(Regular|Semibold|Bold)-subset-[^/]+\.woff2$/.test(file))
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

// Deep link into a quote: the detail route's chunk group is not discovered
// until the entry bundle has been parsed, the router has matched and the
// dynamic import() runs — measured on the production build, that is ~570 ms
// before the FIRST of its ~40 files is even requested, and the heading cannot
// paint until they have all landed. The group is known at build time, so the
// document can start it at parse time instead, in parallel with the entry
// bundle. Only the STATIC import graph is preloaded: the page's lazy popups
// and PDF machinery must stay off the opening path.
//
// The quote route test must stay in step with the data prefetch in
// index.html — both answer "is this document a quote deep link?". Since
// 14.09.2026 the same mechanism serves the project list and project detail
// (measured: /projects requested its chunk group only after the profile).
const ROUTE_PRELOADS: Array<{ path: RegExp; facade: RegExp }> = [
  { path: /^\/(?:sales\/quotes|crm\/tenders)\/[^/?#]+\/?$/, facade: /pages[\\/]sales[\\/]TenderDetail\.tsx$/ },
  { path: /^\/projects\/?$/, facade: /pages[\\/]project[\\/]Projects\.tsx$/ },
  { path: /^\/projects\/[^/?#]+\/?$/, facade: /pages[\\/]project[\\/]ProjectDetail\.tsx$/ },
]

const quoteRoutePreloadPlugin = () => {
  let base = '/'
  return {
    name: 'offitec:quote-route-preload',
    apply: 'build' as const,
    configResolved(config: { base: string }) { base = config.base },
    transformIndexHtml: {
      order: 'post' as const,
      handler: (html: string, ctx: { bundle?: Record<string, any> }) => {
        const bundle = ctx.bundle
        // Electron loads over file:// with a relative base and routes behind
        // the hash; there is no deep-link document to optimise there.
        if (!bundle || base !== '/') return html

        // Everything the document already asks for is skipped — repeating it
        // would only add bytes to the HTML.
        const alreadyInHtml = new Set(
          [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1].replace(/^\//, '')),
        )
        const groups: Array<{ path: string; scripts: string[]; styles: string[] }> = []
        for (const route of ROUTE_PRELOADS) {
          const routeChunk = Object.values(bundle).find(
            (item) => item?.type === 'chunk' && route.facade.test(String(item.facadeModuleId ?? '')),
          )
          if (!routeChunk) continue
          const scripts: string[] = []
          const styles: string[] = []
          const seen = new Set<string>()
          const visit = (fileName: string) => {
            if (seen.has(fileName)) return
            seen.add(fileName)
            const chunk = bundle[fileName]
            if (!chunk) return
            if (!alreadyInHtml.has(fileName)) scripts.push(fileName)
            for (const css of chunk.viteMetadata?.importedCss ?? []) {
              if (!alreadyInHtml.has(css) && !styles.includes(css)) styles.push(css)
            }
            for (const imported of chunk.imports ?? []) visit(imported)
          }
          visit(routeChunk.fileName)
          if (scripts.length || styles.length) groups.push({ path: route.path.source, scripts, styles })
        }
        if (!groups.length) return html

        const snippet = `(function(){
  var add=function(href,rel,as){var l=document.createElement('link');l.rel=rel;if(as)l.as=as;l.crossOrigin='';l.href=${JSON.stringify(base)}+href;document.head.appendChild(l)};
  ${JSON.stringify(groups)}.forEach(function(g){
    if(!new RegExp(g.path).test(location.pathname))return;
    g.scripts.forEach(function(f){add(f,'modulepreload')});
    g.styles.forEach(function(f){add(f,'preload','style')});
  });
})();`
        return html.replace('</head>', `  <script>${snippet}</script>\n</head>`)
      },
    },
  }
}

// Production preloads use the hashed bundle names above. During development
// there is no final bundle to inspect, so inject equivalent source URLs. Vite
// serves those files directly and the browser can start the three fonts used
// on the quote page while it is still parsing the document, before fonts.css
// and the large detail module have been evaluated.
const fontDevPreloadPlugin = () => ({
  name: 'offitec:font-dev-preload',
  apply: 'serve' as const,
  transformIndexHtml: {
    order: 'pre' as const,
    handler: (html: string) => ({
      html,
      tags: ['Regular', 'Semibold', 'Bold'].map((weight) => ({
        tag: 'link',
        attrs: {
          rel: 'preload',
          as: 'font',
          type: 'font/woff2',
          crossorigin: true,
          href: `/src/assets/fonts/OpenSans-${weight}-subset.woff2`,
        },
        injectTo: 'head-prepend' as const,
      })),
    }),
  },
})

export default defineConfig(({ mode }) => ({
  // Web (nginx) needs an absolute base so assets resolve to /assets/... on
  // deep routes after a refresh. Electron loads via file:// and needs a
  // relative base. Desktop builds pass `--mode electron`.
  base: mode === 'electron' ? './' : '/',
  // ZXing (Barcode-Leser der Schnellerfassung) wird nur per dynamischem
  // import() geladen. Ohne Vorab-Bündelung findet der Dev-Server die
  // Abhängigkeit erst beim ersten Aufruf und antwortet bis zur nächsten
  // Optimierung mit 504 «Outdated Optimize Dep» — der Leser bliebe stumm.
  optimizeDeps: { include: ['@zxing/browser', '@zxing/library'] },
  plugins: [
    responseCompressionPlugin(),
    react(),
    tailwindcss(),
    asyncCssPlugin(),
    fontPreloadPlugin(),
    fontDevPreloadPlugin(),
    quoteRoutePreloadPlugin(),
  ],
  server: {
    // Hot Module Replacement is on by default so the dev server (`npm run dev`)
    // live-updates the browser on every save. Set VITE_DISABLE_HMR=true to
    // turn it off (e.g. for environments where the HMR websocket can't connect).
    hmr: process.env.VITE_DISABLE_HMR !== 'true',
    // Same-origin API, exactly like production nginx (/backend/... → backend).
    // Cross-origin localhost:5173 → localhost:3000 added a CORS preflight
    // round-trip to every API call — including the ones on the LCP path.
    proxy: backendProxy,
  },
  preview: {
    // Vite preview does not inherit `server.proxy`; keep production audits
    // same-origin without falling back to the development transform server.
    proxy: backendProxy,
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
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
}))
