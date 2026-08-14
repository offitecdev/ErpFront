/**
 * Stale-chunk recovery, shared by the route loader (routeHelpers) and the
 * app-wide error boundary (PaneErrorBoundary).
 *
 * Every deploy renames the hashed asset files. A tab that loaded the previous
 * build keeps lazy-importing chunks by their OLD names the moment the user
 * opens a modal or navigates — the server answers 404 and the import rejects
 * ("Failed to fetch dynamically imported module"). A one-shot reload fetches
 * the new index.html and with it the new chunk graph. The sessionStorage
 * guard stops a reload loop when the failure has a different cause; it is
 * cleared again after any chunk loads successfully.
 */

export const CHUNK_RELOAD_KEY = 'offitec:chunk-reload-attempted';

export const isChunkLoadError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error || '');
    return /Failed to fetch dynamically imported module|dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);
};

/** Reloads once for a stale-chunk error. Returns true when a reload was started. */
export const attemptChunkReload = (error: unknown): boolean => {
    if (!isChunkLoadError(error)) return false;
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    window.location.reload();
    return true;
};

export const clearChunkReloadGuard = () => {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
};
