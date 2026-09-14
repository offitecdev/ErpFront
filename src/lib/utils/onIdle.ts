import { netActivity } from '../netActivity';

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

/**
 * Runs `task` once the page's own data has arrived: at least `minMs` after
 * the call, and only after no API request has been in flight for `quietMs`.
 * `maxMs` caps the wait so a long-polling page cannot starve the task.
 *
 * WHY NOT `onIdle`: the browser counts as idle while it WAITS for the network.
 * Measured 14.09.2026 on /projects, the header badges' idle callback fired at
 * ~220 ms — during the gap between the profile answer and the route chunk —
 * and so went out before the list's own requests (~500 ms). Badges and alert
 * decks belong after the page, not in front of it.
 */
export const afterPageSettled = (
    task: () => void,
    { minMs = 1200, quietMs = 400, maxMs = 8000 }: { minMs?: number; quietMs?: number; maxMs?: number } = {},
): (() => void) => {
    if (typeof window === 'undefined') return () => {};
    let done = false;
    let timer = 0;
    let cancelIdle: (() => void) | null = null;
    const startedAt = performance.now();

    const run = () => {
        done = true;
        // The last hop still yields to rendering work queued by the data.
        cancelIdle = onIdle(task, 1000);
    };

    const check = () => {
        if (done) return;
        const now = performance.now();
        const elapsed = now - startedAt;
        if (elapsed >= maxMs) return run();
        const quietFor = now - netActivity.lastChange();
        if (elapsed >= minMs && netActivity.inFlight() === 0 && quietFor >= quietMs) return run();
        const wait = Math.max(minMs - elapsed, netActivity.inFlight() ? 150 : quietMs - quietFor, 50);
        timer = window.setTimeout(check, Math.min(wait, maxMs - elapsed));
    };
    timer = window.setTimeout(check, Math.min(minMs, maxMs));

    return () => {
        done = true;
        window.clearTimeout(timer);
        cancelIdle?.();
    };
};
