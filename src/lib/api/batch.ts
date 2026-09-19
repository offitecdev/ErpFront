import { getShared } from '../axios';

/**
 * Several read endpoints in ONE round trip — `GET /batch?get=…&get=…`
 * (Erp_Backend presentation/routes/batch.routes.ts; only the paths on its
 * allow-list are accepted).
 *
 * Every API request to production costs 150–200 ms of pure latency no matter
 * how small the answer is (measured 14.09.2026), so four counters in the header
 * or the four sources of the project list are cheaper as one request.
 *
 * Each entry keeps the status and body of its own endpoint. If the server does
 * not know `/batch` yet (frontend deployed first), the entries are fetched one
 * by one — same results, just more round trips.
 */

export type BatchEntry = { status: number; body: unknown };
export type BatchResults = Record<string, BatchEntry>;

/** The exact URL for a set of GETs. index.html builds the same string for the
    parse-time prefetch — keep the encoding identical. */
export const batchUrl = (gets: string[]) =>
    `/batch?${gets.map((get) => `get=${encodeURIComponent(get)}`).join('&')}`;

let batchUnsupported = false;

const fetchOneByOne = async (gets: string[]): Promise<BatchResults> => {
    const entries = await Promise.all(gets.map(async (get): Promise<[string, BatchEntry]> => {
        try {
            const res = await getShared(get);
            return [get, { status: res.status, body: res.data }];
        } catch (error) {
            const response = (error as { response?: { status?: number; data?: unknown } }).response;
            return [get, { status: response?.status ?? 0, body: response?.data ?? null }];
        }
    }));
    return Object.fromEntries(entries);
};

/** 502 with no body = the server could not reach its own sub-request (the
    loopback inside /batch failed), not an answer of the endpoint itself. */
const isLoopFailure = (entry: BatchEntry | undefined) =>
    !entry || (entry.status === 502 && entry.body == null);

export const fetchBatch = async (gets: string[]): Promise<BatchResults> => {
    if (batchUnsupported) return fetchOneByOne(gets);
    try {
        const res = await getShared<{ results: BatchResults }>(batchUrl(gets));
        const results = res.data.results;
        const failed = gets.filter((get) => isLoopFailure(results[get]));
        if (!failed.length) return results;
        // The batch route is broken on this server: fetch those entries
        // directly, and skip /batch entirely if nothing came through.
        if (failed.length === gets.length) batchUnsupported = true;
        return { ...results, ...(await fetchOneByOne(failed)) };
    } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 404) {
            batchUnsupported = true;
            return fetchOneByOne(gets);
        }
        throw error;
    }
};

/** The body of one entry, or an axios-shaped error so existing
    `e.response?.data?.error` handlers keep showing the server's message. */
export const batchBody = <T>(results: BatchResults, get: string): T => {
    const entry = results[get];
    if (!entry || entry.status < 200 || entry.status >= 300) {
        throw Object.assign(new Error(`Request failed: ${get}`), {
            response: { status: entry?.status ?? 0, data: entry?.body ?? null },
        });
    }
    return entry.body as T;
};
