// Once-per-tab memory for the section splashes (the check animation, the
// Outlook mark of the mailbox): it plays the first time a section is entered
// in this browser tab and not again until the tab is closed. sessionStorage is
// exactly that scope — per tab, survives F5, dies with the tab. A full
// document load on the section's own route still shows the boot-level splash
// (that IS the opening); it counts as the tab's one showing (see
// bootSplash.ts).

export type SplashScope = 'tasks' | 'calendar-tasks' | 'mail'

const key = (scope: SplashScope) => `ofi_splash_seen:${scope}`

export const hasSeenSplash = (scope: SplashScope): boolean => {
  try {
    return sessionStorage.getItem(key(scope)) === '1'
  } catch {
    return false // storage unavailable (privacy mode) — show it, no harm
  }
}

export const markSplashSeen = (scope: SplashScope): void => {
  try {
    sessionStorage.setItem(key(scope), '1')
  } catch {
    /* ignore */
  }
}
