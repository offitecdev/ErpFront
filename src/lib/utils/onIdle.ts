/**
 * Runs `task` once the browser is idle, falling back to a timer where
 * `requestIdleCallback` is unavailable (Safari). Returns a cancel function.
 *
 * Use this for ambient, non-blocking fetches — dashboards, alert banners,
 * secondary cost data. A fixed `setTimeout` only *delays* the request; it still
 * lands while the page is fetching what it actually needs to render, and on
 * HTTP/1.1 (six connections per origin) a handful of slow background calls will
 * hold the connections the critical requests are queued behind. Idle scheduling
 * yields until the main work is done instead.
 */
export const onIdle = (task: () => void, timeout = 2000): (() => void) => {
    if (typeof window === 'undefined') return () => {};

    if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(task, { timeout });
        return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(task, 200);
    return () => window.clearTimeout(id);
};
