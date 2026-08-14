import { StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import { initI18n } from './i18n'
import './store/themeStore' // applies persisted light/dark theme before first paint
import { initInstallPrompt } from './lib/pwa/installPrompt'
import { registerServiceWorker } from './lib/pwa/registerServiceWorker'
import App from './App.tsx'

// PWA: capture `beforeinstallprompt` before any component mounts (the browser
// fires it once, very early), then install the service worker after load.
initInstallPrompt()
registerServiceWorker()

// Start translations and the app together. Protected routes paint their
// loading shell while the profile and locale chunks resolve, so waiting here
// only serialized profile/tender requests behind i18n and delayed LCP.
void initI18n().catch(() => undefined)

// The build makes the app stylesheet non-render-blocking (see the async-css
// plugin in vite.config): it ships as media="print" plus a preload, and the
// boot skeleton in index.html carries the first paint. Mounting React before
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

// Two animation frames guarantee the browser composites the boot skeleton
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
      </StrictMode>,
    )
  })
})
