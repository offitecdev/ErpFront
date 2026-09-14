/**
 * Consumes the data prefetch started by the inline script in index.html.
 *
 * That script fires the session requests (and, on a tender deep link, the
 * tender detail request) at HTML-parse time — long before the JS bundle has
 * booted — and parks the fetch promises on `window.__ofiPrefetch`. Each entry
 * is single-use: it is removed from the bag when claimed, so later refreshes
 * (tenant switch, silent re-sync) always hit the network through axios.
 *
 * Every failure path returns `null`, which tells the caller to fall back to
 * its normal axios request (which owns retry/refresh semantics).
 */

type PrefetchBag = {
    me?: Promise<Response>;
    permissions?: Promise<Response>;
    tenants?: Promise<Response>;
    tender?: { id: string; res: Promise<Response> };
    /** Route data keyed by the exact URL `getShared` will ask for (see
        index.html). `tenant` is the X-Tenant-Id the request went out with. */
    gets?: Record<string, { tenant: string; res: Promise<Response> }>;
};

const bag = (): PrefetchBag | undefined =>
    (window as { __ofiPrefetch?: PrefetchBag }).__ofiPrefetch;

const claim = async <T>(res: Promise<Response> | undefined): Promise<T | null> => {
    if (!res) return null;
    try {
        const response = await res;
        if (!response.ok) return null;
        return (await response.json()) as T;
    } catch {
        return null;
    }
};

export const takePrefetched = <T>(key: 'me' | 'permissions' | 'tenants'): Promise<T | null> => {
    const current = bag();
    const res = current?.[key];
    if (current) delete current[key];
    return claim<T>(res);
};

/**
 * A route GET the document started at parse time. Returns `null` synchronously
 * when there is none for this URL and tenant — the caller then goes to the
 * network without having waited for anything.
 */
export const takePrefetchedGet = <T>(tenant: string, url: string): Promise<T | null> | null => {
    const gets = bag()?.gets;
    const entry = gets?.[url];
    if (!entry || entry.tenant !== tenant) return null;
    delete gets![url];
    return claim<T>(entry.res);
};

export const takePrefetchedTender =<T>(id: string): Promise<T | null> => {
    const current = bag();
    const entry = current?.tender;
    if (!entry || entry.id !== id) return Promise.resolve(null);
    delete current!.tender;
    return claim<T>(entry.res);
};
