import { StrictMode, startTransition, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
// Feinschliff aus der Anmeldemaske (Serifentitel, Feldkanten, Bewegung) —
// MUSS nach index.css stehen, sonst verliert er gegen dessen Formularblock.
import './styles/refine.css'
import { initI18n } from './i18n'
import './store/themeStore' // applies persisted light/dark theme before first paint
import { initInstallPrompt } from './lib/pwa/installPrompt'
import { registerServiceWorker } from './lib/pwa/registerServiceWorker'
import { installAutoColumnResize } from './lib/autoColumnResize'
import { installTableChrome } from './lib/tableChrome'
import { dismissBootSplash } from './lib/bootSplash'
import App from './App.tsx'

// PWA: capture `beforeinstallprompt` before any component mounts (the browser
// fires it once, very early), then install the service worker after load.
initInstallPrompt()
registerServiceWorker()

// Every table gets drag-resizable columns, with no per-table wiring — the
// tables that declare their own columns in React keep theirs (see
// hooks/useColumnWidths), this picks up all the rest.
installAutoColumnResize()

// index.css finds table wrappers/cards via data attributes this module keeps
// up to date — the `:has()` selectors it replaces made every style recalc walk
// the whole document (700ms+ tasks on a throttled mobile boot).
installTableChrome()

// Start translations and the app together. Protected routes paint their
// loading shell while the profile and locale chunks resolve, so waiting here
// only serialized profile/tender requests behind i18n and delayed LCP.
void initI18n().catch(() => undefined)

// The build makes the app stylesheet non-render-blocking (see the async-css
// plugin in vite.config): it ships as media="print" plus a preload, and the
// boot splash in index.html carries the first paint. Mounting React before
// the stylesheet finished would flash the whole app unstyled, so the mount
// waits for the preload — with a timeout so a broken/hanging CSS request can
// never brick the app. In dev (and Electron dev) the links don't exist and
// this resolves immediately.
const whenAppCssReady = (): Promise<void> => {
  const appCss = document.getElementById('app-css') as HTMLLinkElement | null
  const preload = document.getElementById('app-css-preload') as HTMLLinkElement | null
  if (!appCss || !preload) return Promise.resolve()

  const activate = () => { appCss.media = 'all' }
  // Already fetched (e.g. service-worker cache hit) — activate synchronously.
  if (performance.getEntriesByName(preload.href).length > 0) {
    activate()
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      activate()
      resolve()
    }
    preload.addEventListener('load', finish, { once: true })
    preload.addEventListener('error', finish, { once: true })
    globalThis.setTimeout(finish, 4000)
  })
}

// The boot splash (index.html) is a fixed overlay above #root. It leaves
// only after the app shell has actually committed — an effect runs after
// commit, whereas the transition-lane render below returns before React has
// painted anything — and after its intro has had its minimum time on screen.
function BootSplashGate() {
  useEffect(() => { dismissBootSplash() }, [])
  return null
}

// Two animation frames guarantee the browser composites the boot splash
// before React's mount work starts. Without this the first paint races the
// mount: on runs React wins, the very first frame the user (and Lighthouse's
// FCP) sees is the fully-booted app several seconds in.
const afterFirstPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

void whenAppCssReady().then(afterFirstPaint).then(() => {
  const root = createRoot(document.getElementById('root')!)
  // Transition lane: React time-slices the initial mount into ~5 ms chunks
  // instead of one long task, keeping the main thread responsive while the
  // whole shell boots (Total Blocking Time, INP).
  startTransition(() => {
    root.render(
      <StrictMode>
        <App />
        <BootSplashGate />
      </StrictMode>,
    )
  })
})
