// Boot splash lifecycle. The splash itself (Offitec star + radiating waves,
// or a section's own mark when the document loads on its route — the tasks
// check, the mailbox's Outlook mark) is inline markup/CSS in index.html so it
// paints before any bundle arrives; this
// module only decides WHEN it leaves. It exists only in the HTML document, so
// it plays on full loads (fresh session, F5, new tab) and never on in-app
// route changes.

import { markSplashSeen } from './splashOnce'

declare global {
  interface Window {
    /** performance.now() when index.html's head script ran (splash start). */
    __ofiSplashT0?: number
  }
}

const SPLASH_ID = 'ofi-splash'
/** Intro (pop → star bloom / tick draw → first wave) needs about this long to read. */
const MIN_VISIBLE_MS = 1200
/** Fade-out transition length in index.html; the node is removed after it. */
const FADE_MS = 380
/** Never trap the user behind the overlay if the dismiss call is missed. */
const SAFETY_MS = 15000

/** Which mark index.html chose for this load (`html.sk-tasks` = the check,
 *  `html.sk-mail` = the Outlook mark). */
export type BootSplashVariant = 'brand' | 'check' | 'mail'

const hasDom = typeof document !== 'undefined'
const rootClasses = hasDom ? document.documentElement.classList : null
const variant: BootSplashVariant = rootClasses?.contains('sk-tasks')
  ? 'check'
  : rootClasses?.contains('sk-mail')
    ? 'mail'
    : 'brand'

// The split-view pane iframe renders a bare shell: its overlay is
// display:none from the start, so treat it as already gone.
const initialEl = hasDom ? document.getElementById(SPLASH_ID) : null
const paneShell = Boolean(rootClasses?.contains('sk-pane'))
if (initialEl && paneShell) initialEl.remove()

let dismissed = false
let gone = !initialEl || paneShell
let resolveGone: (() => void) | null = null
const gonePromise: Promise<void> = gone
  ? Promise.resolve()
  : new Promise((resolve) => { resolveGone = resolve })

// A section opening IS that section's one showing for this tab: the in-page
// SectionSplash must not play again right after it.
if (!gone && variant === 'check') markSplashSeen('tasks')
if (!gone && variant === 'mail') markSplashSeen('mail')

export const bootSplashVariant = (): BootSplashVariant => variant

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const markGone = (el: HTMLElement) => {
  el.remove()
  // The boot-time theme guess has done its job; from here `html.dark`
  // (themeStore) is the only dark-mode switch the shared splash rules read.
  document.documentElement.classList.remove('sk-dark')
  gone = true
  resolveGone?.()
  resolveGone = null
}

/** True once the boot overlay has left the DOM (or never existed). */
export const isBootSplashGone = (): boolean => gone

/** Resolves once the boot overlay has left the DOM — immediately if it never existed. */
export const whenBootSplashGone = (): Promise<void> => gonePromise

/**
 * Fade the boot splash out and drop it from the DOM. Idempotent; call once
 * the app shell has committed. Honours the minimum on-screen time so a fast
 * (cached) boot still shows the whole intro instead of a flash.
 */
export function dismissBootSplash(): void {
  if (dismissed) return
  dismissed = true
  const el = document.getElementById(SPLASH_ID)
  if (!el) return

  const startedAt = typeof window.__ofiSplashT0 === 'number' ? window.__ofiSplashT0 : 0
  const hold = prefersReducedMotion()
    ? 0
    : Math.max(0, startedAt + MIN_VISIBLE_MS - performance.now())

  globalThis.setTimeout(() => {
    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      markGone(el)
    }
    // transitionend never fires when the tab is in the background — the
    // timer is the real remover.
    el.addEventListener('transitionend', remove, { once: true })
    globalThis.setTimeout(remove, FADE_MS + 200)
    el.classList.add('is-out')
  }, hold)
}

if (hasDom) {
  globalThis.setTimeout(dismissBootSplash, SAFETY_MS)
}
