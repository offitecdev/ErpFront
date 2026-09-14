/**
 * ── ROUTE INTENT: LOAD THE NEXT PAGE BEFORE THE CLICK ───────────────────────
 *
 * A pointer resting on a menu row, a focused link, a pressed finger: the user
 * is about to open that page. From that moment on the page's code chunk (and,
 * for a few heavy lists, its data) is fetched, so the click finds both ready
 * and the page draws at once instead of skeleton → chunk → data.
 *
 * Targets: any same-origin `<a href>` and any element carrying
 * `data-ofi-route="/path"` (menu rows are buttons, not links).
 *
 * This module knows no routes. AppRouter registers the resolver that maps a
 * path to its page components (routes/routeHelpers `preload()`), and data
 * warmers register per path pattern. Everything here is idempotent: chunks
 * load once, primed data lives 15 s (lib/axios `primeShared`).
 */

type ChunkResolver = (pathname: string) => void;

let resolveChunks: ChunkResolver | null = null;
const dataWarmers: Array<{ test: RegExp; warm: () => void }> = [];

export const registerRouteChunkResolver = (resolver: ChunkResolver) => {
    resolveChunks = resolver;
};

export const registerRouteDataWarmer = (test: RegExp, warm: () => void) => {
    dataWarmers.push({ test, warm });
};

export const preloadRoute = (path: string, { data = true }: { data?: boolean } = {}) => {
    const pathname = path.split(/[?#]/)[0] || '/';
    try {
        resolveChunks?.(pathname);
        if (data) dataWarmers.forEach((warmer) => { if (warmer.test.test(pathname)) warmer.warm(); });
    } catch {
        /* A warm-up must never break the page it runs on. */
    }
};

const intentPath = (target: EventTarget | null): string | null => {
    const node = (target as Element | null)?.closest?.('[data-ofi-route], a[href]');
    if (!node) return null;
    const route = node.getAttribute('data-ofi-route');
    if (route) return route.startsWith('/') ? route : null;
    const anchor = node as HTMLAnchorElement;
    if (anchor.target && anchor.target !== '_self') return null;
    if (anchor.hasAttribute('download')) return null;
    // Electron runs a hash router under file:// — links there read "#/path".
    if (window.location.protocol === 'file:') {
        const hash = anchor.getAttribute('href') || '';
        return hash.startsWith('#/') ? hash.slice(1) : null;
    }
    if (anchor.origin !== window.location.origin) return null;
    return anchor.pathname + anchor.search;
};

/** Hover shorter than this is a pointer sweeping past, not an intent. */
const HOVER_CHUNK_MS = 50;
/** Data costs the server a request — only for a pointer that stays. */
const HOVER_DATA_MS = 160;

let installed = false;

export const installRouteIntent = () => {
    if (installed || typeof document === 'undefined') return;
    installed = true;

    let hoverPath: string | null = null;
    let chunkTimer = 0;
    let dataTimer = 0;

    const clearHover = () => {
        window.clearTimeout(chunkTimer);
        window.clearTimeout(dataTimer);
        hoverPath = null;
    };

    document.addEventListener('pointerover', (event) => {
        if (event.pointerType === 'touch') return;
        const path = intentPath(event.target);
        if (path === hoverPath) return;
        clearHover();
        if (!path) return;
        hoverPath = path;
        chunkTimer = window.setTimeout(() => preloadRoute(path, { data: false }), HOVER_CHUNK_MS);
        dataTimer = window.setTimeout(() => preloadRoute(path), HOVER_DATA_MS);
    }, { passive: true });

    // Press and keyboard focus are commitments — warm everything immediately.
    const immediate = (event: Event) => {
        const path = intentPath(event.target);
        if (path) preloadRoute(path);
    };
    document.addEventListener('pointerdown', immediate, { passive: true, capture: true });
    document.addEventListener('focusin', immediate, { passive: true });
};
