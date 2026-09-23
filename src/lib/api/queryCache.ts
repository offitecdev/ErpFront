import { apiClient } from '../axios';

/**
 * ── LESEN, BEVOR DAS NETZ ANTWORTET (14.09.2026) ────────────────────────────
 *
 * Gemessen am Produktivrechner: jede Anfrage kostet 150–200 ms reine Strecke,
 * egal wie klein die Antwort ist. Auswahllisten (Produkte, Kontakte,
 * Empfänger, Mitarbeitende) fragten trotzdem bei JEDEM Öffnen neu und zeigten
 * bis zur Antwort einen Ladezustand.
 *
 * Dieser Speicher antwortet sofort mit dem, was er schon hat
 * (stale-while-revalidate): ist der Eintrag frisch, bleibt es dabei; ist er
 * alt, wird er trotzdem gezeigt und im Hintergrund erneuert. Gleichzeitige
 * Abrufe desselben Schlüssels teilen sich EINE Anfrage.
 *
 * GÜLTIGKEIT: jede erfolgreiche Schreibanfrage über `apiClient` markiert die
 * Einträge der betroffenen Bereiche als alt (dieselbe Zuordnung wie der Server,
 * Erp_Backend ResponseCacheMiddleware). Gezeigt werden sie weiter, beim
 * nächsten Lesen aber neu geholt. Der Firmenwechsel steckt im Schlüssel.
 *
 * NICHT für `getShared` (axios.ts) — der hat seine eigene Einmal-Logik.
 */

type Entry = {
    value?: unknown;
    fetchedAt: number;
    /** Durch eine Schreibanfrage als alt markiert. */
    invalid: boolean;
    /** Steigt bei jeder Ungültigmachung — Zeitstempel wären in derselben Millisekunde gleich. */
    invalidations: number;
    tags: string[];
    inFlight?: Promise<unknown>;
    listeners: Set<(value: unknown) => void>;
};

export type QueryOptions = {
    /** Solange gilt eine Antwort ohne Rückfrage (Standard 60 s). */
    freshMs?: number;
    /** Solange darf eine alte Antwort noch sofort gezeigt werden (Standard 10 min). */
    staleMs?: number;
    /** Bereiche, deren Schreibanfragen den Eintrag alt machen (z. B. `catalog`). */
    tags?: string[];
};

const MAX_ENTRIES = 400;
const store = new Map<string, Entry>();

const tenantKey = () => {
    try {
        return sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';
    } catch {
        return '';
    }
};

const fullKey = (key: string) => `${tenantKey()}|${key}`;

const touch = (key: string, entry: Entry) => {
    store.delete(key);
    store.set(key, entry);
    if (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next();
        if (!oldest.done) store.delete(oldest.value);
    }
};

const entryFor = (key: string, tags: string[]): Entry => {
    let entry = store.get(key);
    if (!entry) {
        entry = { fetchedAt: 0, invalid: true, invalidations: 0, tags, listeners: new Set() };
        store.set(key, entry);
    }
    return entry;
};

const isFresh = (entry: Entry, freshMs: number) =>
    entry.value !== undefined && !entry.invalid && Date.now() - entry.fetchedAt < freshMs;

const isUsable = (entry: Entry, staleMs: number) =>
    entry.value !== undefined && Date.now() - entry.fetchedAt < staleMs;

const revalidate = <T>(key: string, entry: Entry, fetcher: () => Promise<T>): Promise<T> => {
    if (entry.inFlight) return entry.inFlight as Promise<T>;
    const invalidationsAtStart = entry.invalidations;
    const request = fetcher()
        .then((value) => {
            // Eine Schreibanfrage, die WÄHREND des Abrufs kam, gewinnt: die
            // Antwort wird gezeigt, bleibt aber als alt markiert.
            const invalidatedMeanwhile = entry.invalidations !== invalidationsAtStart;
            entry.value = value;
            entry.fetchedAt = Date.now();
            entry.invalid = invalidatedMeanwhile;
            touch(key, entry);
            entry.listeners.forEach((listener) => listener(value));
            return value;
        })
        .finally(() => {
            entry.inFlight = undefined;
        });
    entry.inFlight = request;
    return request;
};

/** Sofort vorhandener Wert (auch alt) oder `undefined`. */
export const peekQuery = <T>(key: string, options: QueryOptions = {}): T | undefined => {
    const entry = store.get(fullKey(key));
    if (!entry || !isUsable(entry, options.staleMs ?? 600_000)) return undefined;
    return entry.value as T;
};

/** Wie `peekQuery`, sagt aber auch, ob der Wert noch ohne Rückfrage gilt. */
export const peekQueryState = <T>(
    key: string,
    options: QueryOptions = {},
): { value: T; fresh: boolean } | undefined => {
    const entry = store.get(fullKey(key));
    if (!entry || !isUsable(entry, options.staleMs ?? 600_000)) return undefined;
    return { value: entry.value as T, fresh: isFresh(entry, options.freshMs ?? 60_000) };
};

/**
 * Wert holen: frisch → aus dem Speicher; alt, aber brauchbar → aus dem Speicher
 * und im Hintergrund erneuern; sonst warten.
 */
export const cachedQuery = <T>(key: string, fetcher: () => Promise<T>, options: QueryOptions = {}): Promise<T> => {
    const { freshMs = 60_000, staleMs = 600_000, tags = [] } = options;
    const k = fullKey(key);
    const entry = entryFor(k, tags);
    if (isFresh(entry, freshMs)) return Promise.resolve(entry.value as T);
    if (isUsable(entry, staleMs)) {
        void revalidate(k, entry, fetcher).catch(() => undefined);
        return Promise.resolve(entry.value as T);
    }
    return revalidate(k, entry, fetcher);
};

/**
 * Für Auswahllisten: `onValue` kommt SOFORT mit dem gespeicherten Wert (auch
 * einem alten, dann `fresh = false`) und — ist er nicht frisch — ein zweites
 * Mal mit der Antwort des Servers. Rückgabe hebt die zweite Meldung auf (die
 * Liste ist zu oder die Eingabe hat sich geändert). Fehler landen in `onError`.
 */
export const readQuery = <T>(
    key: string,
    fetcher: () => Promise<T>,
    options: QueryOptions,
    onValue: (value: T, fresh: boolean) => void,
    onError?: (error: unknown) => void,
): (() => void) => {
    let active = true;
    const state = peekQueryState<T>(key, options);
    if (state) onValue(state.value, state.fresh);
    if (!state?.fresh) {
        refreshQuery(key, fetcher, options)
            .then((value) => { if (active) onValue(value, true); })
            .catch((error) => { if (active) onError?.(error); });
    }
    return () => { active = false; };
};

/** Immer das Netz fragen (Ergebnis landet im Speicher). */
export const refreshQuery = <T>(key: string, fetcher: () => Promise<T>, options: QueryOptions = {}): Promise<T> => {
    const k = fullKey(key);
    return revalidate(k, entryFor(k, options.tags ?? []), fetcher);
};

export const invalidateTags = (tags: string[]): void => {
    if (!tags.length) return;
    const wanted = new Set(tags);
    store.forEach((entry) => {
        if (entry.tags.some((tag) => wanted.has(tag))) {
            entry.invalid = true;
            entry.invalidations += 1;
        }
    });
};

/* ── Schreibanfragen machen Bereiche alt ─────────────────────────────────── */

/** Dieselbe Zuordnung wie Erp_Backend `WRITE_NAMESPACES`. */
const WRITE_TAGS: Record<string, string[]> = {
    // Wortgleich mit WRITE_NAMESPACES im Server: die Lieferantenbestellung
    // trägt die Produktionszuordnung und die bestätigten Zeilen.
    inventory: ['catalog', 'production'],
    production: ['production'],
    articles: ['catalog'],
    tenders: ['catalog', 'customers', 'tender', 'calendar'],
    'sales-orders': ['catalog', 'customers', 'tender', 'calendar'],
    'addon-orders': ['catalog', 'tender'],
    billing: ['catalog', 'customers', 'tender'],
    'delivery-reports': ['catalog', 'tender', 'calendar'],
    maintenance: ['catalog', 'calendar'],
    regie: ['catalog', 'calendar'],
    projects: ['catalog', 'customers', 'tender', 'calendar', 'tasks'],
    logistics: ['catalog', 'calendar'],
    osp: ['catalog', 'tender'],
    settings: ['catalog', 'settings', 'tender', 'calendar', 'tasks'],
    customers: ['customers', 'tender', 'calendar'],
    crm: ['customers', 'tender', 'calendar', 'tasks'],
    enquiries: ['customers'],
    forms: ['customers'],
    meetings: ['calendar', 'tasks'],
    booking: ['calendar'],
    calendar: ['settings', 'calendar'],
    tasks: ['tasks'],
    files: ['tender', 'catalog', 'calendar', 'tasks'],
    'signature-requests': ['tender', 'calendar'],
    fx: ['tender'],
    employees: ['staff', 'settings', 'access', 'tender', 'calendar', 'tasks'],
    personnel: ['staff', 'calendar', 'tasks'],
    roles: ['staff', 'settings', 'access'],
    'role-templates': ['staff', 'settings', 'access'],
    'module-profiles': ['settings', 'access'],
    tenants: ['staff', 'settings', 'access', 'customers', 'catalog', 'tender', 'calendar', 'tasks'],
};

export const tagsForMutationUrl = (url: string): string[] => {
    const path = url.split('?')[0]?.replace(/^https?:\/\/[^/]+/, '') ?? '';
    const segment = path.replace(/^.*\/api\/v1/, '').split('/').filter(Boolean)[0] ?? '';
    return WRITE_TAGS[segment] ?? [];
};

const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

apiClient.interceptors.response.use((response) => {
    // Darf NIE werfen: andere Abfangstellen (netActivity) warten auf jede Antwort.
    try {
        markStale(response.config.method, response.config.url);
    } catch {
        /* Speicher bleibt dann einfach bis zur Lebensdauer stehen */
    }
    return response;
});

function markStale(rawMethod: string | undefined, rawUrl: string | undefined): void {
    const method = (rawMethod ?? 'get').toLowerCase();
    if (!MUTATING.has(method)) return;
    const url = rawUrl ?? '';
    // An-/Abmelden (auch Zwei-Faktor, Firmenwechsel über die Anmeldung): die
    // Antworten gehörten der vorigen Person — der Schlüssel kennt nur die Firma.
    // Der stille Token-Refresh zählt nicht dazu.
    if (/(^|\/)auth\/(login|logout|mfa|qr-login)/.test(url.split('?')[0] ?? '')) store.clear();
    else invalidateTags(tagsForMutationUrl(url));
}
