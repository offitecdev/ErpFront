import type { MouseEvent } from 'react';

/**
 * Helpers for turning in-app nav controls into real `<a href>` anchors so the
 * browser offers "Open in new tab" (right-click), and honours middle-click and
 * Ctrl/Cmd/Shift-click — while a plain left-click still navigates within the SPA
 * (through the unsaved-changes guard). Buttons with `onClick={navigate(...)}`
 * cannot do any of this because they expose no URL.
 */

// The app mounts a HashRouter when served from `file:` (Electron) and a
// BrowserRouter otherwise — mirror that here so the href matches the router.
const isHashRouter = typeof window !== 'undefined' && window.location.protocol === 'file:';

/** The browser href for an in-app route (hash-prefixed under the Electron build). */
export const hrefFor = (path: string): string => {
    if (!path) return path;
    if (!isHashRouter) return path;
    return `#${path.startsWith('/') ? '' : '/'}${path}`;
};

/**
 * True when a click on an anchor should be left to the browser to open a new
 * tab / window (modifier keys or a non-primary button) rather than intercepted
 * for in-app navigation. Middle-clicks open a new tab natively and never reach
 * `onClick`, but the button check keeps us safe if that ever changes.
 */
export const isModifiedClick = (e: MouseEvent): boolean =>
    e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
