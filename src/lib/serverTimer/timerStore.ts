import { serverNow, subscribeServerClock } from './serverClock';
import {
    elapsedMsAt,
    elapsedSecondsAt,
    idleTimer,
    predictTransition,
    type ServerTimerDto,
    type TimerAction,
    type TimerSubject,
} from './timerMachine';

/**
 * ── DER ZÄHLERSPEICHER (ausserhalb von React) ────────────────────────────────
 *
 * Ein Stand je Gegenstand für die ganze Anwendung — Liste, Detail und Leiste
 * zeigen denselben Zähler; er überlebt den Seitenwechsel (im Speicher) und F5
 * (letzter Stand in localStorage, bis der Server antwortet).
 *
 *  • DER SERVER IST DIE WAHRHEIT: jede Antwort wird übernommen. Der Klick ist
 *    eine VORHERSAGE mit denselben Regeln (timerMachine); die Antwort der
 *    LETZTEN ausstehenden Handlung ersetzt sie — frühere Antworten kennen die
 *    späteren Klicks nicht und werden übergangen. Scheitert eine Handlung,
 *    holt der Speicher den echten Stand zurück.
 *  • KEIN `count + 1`: die Sekunden werden aus startedAt + accumulatedMs und
 *    der Serveruhr gerechnet. EIN Takt für alle laufenden Zähler, gesetzt auf
 *    den nächsten Sekundenwechsel (kein Drift). Rückkehr in den Tab, Fokus,
 *    pageshow und ein neuer Uhrversatz wecken ihn sofort — ein Tab im
 *    Hintergrund friert nichts ein, er rechnet beim Aufwachen einfach nach.
 *  • Handlungen je Gegenstand in EINER Warteschlange (Start → Pause → Start
 *    kommt in genau dieser Reihenfolge an); der Knopf wird nie gesperrt.
 *
 * Ohne Anwendungsabhängigkeiten: Transport (HTTP) und Firmenschlüssel kommen
 * über `configureTimerStore` (runtime.ts) — so läuft der Speicher auch in
 * einem Node-Test mit Attrappen.
 */

export interface TimerApiError {
    /** Fester Code des Servers (TIMER_NOT_RUNNING …) oder NETWORK/HTTP_ERROR — die Oberfläche übersetzt danach. */
    code: string;
    /** Rückfallsatz des Servers — nie ungeprüft anzeigen. */
    message: string;
    status: number | null;
}

export interface TimerTransport {
    read(subject: TimerSubject): Promise<{ timer: ServerTimerDto }>;
    act(subject: TimerSubject, action: TimerAction): Promise<{ timer: ServerTimerDto }>;
}

export interface TimerStoreEnv {
    transport: TimerTransport;
    /** Ausgewählte Firma — Teil jedes Schlüssels; '' = unbekannt. */
    tenantKey: () => string;
    /** Angemeldete Person — prüft den gemerkten Stand; '' = noch unbekannt (F5, bevor die Anmeldung geladen ist). */
    ownerId: () => string;
    toError: (error: unknown) => TimerApiError;
}

/** Woher der gezeigte Stand kommt. */
export type TimerSource = 'none' | 'stored' | 'server' | 'predicted';

export interface TimerSnapshot {
    timer: ServerTimerDto;
    elapsedSeconds: number;
    source: TimerSource;
    /** Eigene Handlungen, deren Antwort noch aussteht. */
    pending: number;
    /** Die erste Antwort des Servers steht noch aus. */
    loading: boolean;
    error: TimerApiError | null;
}

export type TimerActionResult =
    | { ok: true; timer: ServerTimerDto }
    | { ok: false; error: TimerApiError };

interface TimerRecord {
    key: string;
    subject: TimerSubject;
    timer: ServerTimerDto;
    source: TimerSource;
    pending: number;
    loading: boolean;
    /** Browserzeit der letzten Serverantwort; 0 = noch nie. */
    loadedAt: number;
    error: TimerApiError | null;
    listeners: Set<() => void>;
    snapshot: TimerSnapshot | null;
    queue: Promise<unknown>;
    refreshing: Promise<void> | null;
}

/* ── Verdrahtung ────────────────────────────────────────────────────────── */

let env: TimerStoreEnv | null = null;

export const configureTimerStore = (next: TimerStoreEnv): void => {
    env = next;
};

const requireEnv = (): TimerStoreEnv => {
    if (!env) throw new Error('timerStore: configureTimerStore() wurde nicht gerufen (siehe serverTimer/runtime.ts).');
    return env;
};

/* ── Gemerkter Stand (F5) ─────────────────────────────────────────────────── */

const STORAGE_PREFIX = 'ofi:server-timer:';
const STORAGE_VERSION = 1;

interface StoredTimer {
    v: number;
    ownerId: string;
    timer: ServerTimerDto;
    savedAt: number;
}

const hasStorage = (): boolean => typeof localStorage !== 'undefined';

const readStored = (key: string): ServerTimerDto | null => {
    if (!hasStorage()) return null;
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (!raw) return null;
        const stored = JSON.parse(raw) as Partial<StoredTimer>;
        if (stored.v !== STORAGE_VERSION || !stored.timer) return null;
        const me = requireEnv().ownerId();
        // Ein anderer Mensch am selben Browser sieht nie den fremden Stand.
        if (me && stored.ownerId && stored.ownerId !== me) return null;
        return stored.timer;
    } catch {
        return null;
    }
};

const writeStored = (key: string, timer: ServerTimerDto): void => {
    if (!hasStorage()) return;
    try {
        const stored: StoredTimer = { v: STORAGE_VERSION, ownerId: requireEnv().ownerId(), timer, savedAt: Date.now() };
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(stored));
    } catch {
        /* Speicher voll oder gesperrt — der Stand im Tab reicht. */
    }
};

/* ── Einträge ───────────────────────────────────────────────────────────── */

const records = new Map<string, TimerRecord>();

const recordKey = (subject: TimerSubject): string =>
    `${requireEnv().tenantKey()}|${subject.subjectType}/${subject.subjectId}`;

const getRecord = (subject: TimerSubject): TimerRecord => {
    const key = recordKey(subject);
    const existing = records.get(key);
    if (existing) return existing;
    const stored = readStored(key);
    const record: TimerRecord = {
        key,
        subject: { subjectType: subject.subjectType, subjectId: subject.subjectId },
        timer: stored ?? idleTimer(subject),
        source: stored ? 'stored' : 'none',
        pending: 0,
        loading: false,
        loadedAt: 0,
        error: null,
        listeners: new Set(),
        snapshot: null,
        queue: Promise.resolve(),
        refreshing: null,
    };
    records.set(key, record);
    return record;
};

const adopt = (record: TimerRecord, timer: ServerTimerDto): void => {
    record.timer = timer;
    record.source = 'server';
    record.loadedAt = Date.now();
    writeStored(record.key, timer);
};

/* ── Stand für React ────────────────────────────────────────────────────── */

const buildSnapshot = (record: TimerRecord): TimerSnapshot => ({
    timer: record.timer,
    elapsedSeconds: elapsedSecondsAt(record.timer, serverNow()),
    source: record.source,
    pending: record.pending,
    loading: record.loading,
    error: record.error,
});

const sameSnapshot = (a: TimerSnapshot, b: TimerSnapshot): boolean =>
    a.timer === b.timer
    && a.elapsedSeconds === b.elapsedSeconds
    && a.source === b.source
    && a.pending === b.pending
    && a.loading === b.loading
    && a.error === b.error;

/** Dasselbe Objekt, solange sich nichts geändert hat (Vertrag von useSyncExternalStore). */
export const timerSnapshot = (subject: TimerSubject): TimerSnapshot => {
    const record = getRecord(subject);
    if (!record.snapshot) record.snapshot = buildSnapshot(record);
    return record.snapshot;
};

const emit = (record: TimerRecord): void => {
    const next = buildSnapshot(record);
    if (record.snapshot && sameSnapshot(record.snapshot, next)) return;
    record.snapshot = next;
    record.listeners.forEach((listener) => listener());
};

/* ── Der Takt ───────────────────────────────────────────────────────────── */

/* Sicherheitsabstand hinter dem Sekundenwechsel: `floor((jetzt − start) / 1000)`
   hat die neue Sekunde dann sicher erreicht; Timer feuern nie zu früh. */
const TICK_MARGIN_MS = 5;

let tickHandle: ReturnType<typeof setTimeout> | null = null;

const tickingRecords = (): TimerRecord[] => {
    const running: TimerRecord[] = [];
    records.forEach((record) => {
        if (record.listeners.size && record.timer.status === 'RUNNING') running.push(record);
    });
    return running;
};

const scheduleTick = (): void => {
    if (tickHandle !== null) {
        clearTimeout(tickHandle);
        tickHandle = null;
    }
    const running = tickingRecords();
    if (!running.length) return;
    const now = serverNow();
    // Der nächste Sekundenwechsel unter allen laufenden Zählern.
    let wait = 1000;
    for (const record of running) {
        const untilNextSecond = 1000 - (elapsedMsAt(record.timer, now) % 1000);
        if (untilNextSecond < wait) wait = untilNextSecond;
    }
    tickHandle = setTimeout(tick, wait + TICK_MARGIN_MS);
};

const tick = (): void => {
    tickHandle = null;
    tickingRecords().forEach(emit);
    scheduleTick();
};

/** Sofort nachrechnen — Rückkehr in den Tab, Fokus, neuer Uhrversatz. */
const wake = (): void => {
    records.forEach((record) => {
        if (record.listeners.size) emit(record);
    });
    scheduleTick();
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) wake();
    });
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', wake);
}
subscribeServerClock(wake);

export const subscribeTimer = (subject: TimerSubject, listener: () => void): (() => void) => {
    const record = getRecord(subject);
    record.listeners.add(listener);
    scheduleTick();
    return () => {
        record.listeners.delete(listener);
        scheduleTick();
    };
};

/* ── Laden ──────────────────────────────────────────────────────────────── */

/** Ein Stand vom Server gilt so lange als frisch (Seitenwechsel ohne neue Anfrage). */
const FRESH_MS = 15_000;

export interface RefreshOptions {
    /** Auch einen frischen Stand neu holen. */
    force?: boolean;
    /** Neu holen, wenn der Stand älter ist (Standard 15 s). */
    maxAgeMs?: number;
}

/** Den Stand vom Server holen — eine eigene ausstehende Handlung wird dabei nie überschrieben. */
export const refreshTimer = (subject: TimerSubject, options: RefreshOptions = {}): Promise<void> => {
    const record = getRecord(subject);
    if (record.refreshing) return record.refreshing;
    const maxAge = options.maxAgeMs ?? FRESH_MS;
    if (!options.force && record.loadedAt && Date.now() - record.loadedAt < maxAge) return Promise.resolve();

    if (record.loadedAt === 0) {
        record.loading = true;
        emit(record);
    }
    const run = async (): Promise<void> => {
        try {
            const { timer } = await requireEnv().transport.read(record.subject);
            // Eine eigene Handlung steht noch aus: ihre Antwort bringt den neueren Stand.
            if (record.pending === 0) adopt(record, timer);
            record.error = null;
        } catch (error) {
            record.error = requireEnv().toError(error);
        } finally {
            record.loading = false;
            record.refreshing = null;
            emit(record);
            scheduleTick();
        }
    };
    record.refreshing = run();
    return record.refreshing;
};

/** Beim Einhängen: laden, falls noch nie oder länger nicht vom Server. */
export const ensureTimer = (subject: TimerSubject): void => {
    void refreshTimer(subject);
};

/* ── Handeln ────────────────────────────────────────────────────────────── */

/**
 * start | pause | resume | stop | reset — die Anzeige wechselt im selben Klick
 * (Vorhersage), der Klickzeitpunkt (Serverzeitrahmen) reist mit, der Server
 * antwortet mit der Wahrheit. Löst nie ab: `{ ok: false, error }` statt Wurf.
 */
export const dispatchTimer = (subject: TimerSubject, action: TimerAction): Promise<TimerActionResult> => {
    const record = getRecord(subject);
    const { transport, toError } = requireEnv();
    const atMs = serverNow();

    const predicted = predictTransition(record.timer, action, atMs);
    if (predicted && predicted !== record.timer) {
        record.timer = predicted;
        record.source = 'predicted';
        writeStored(record.key, predicted);
    }
    record.pending += 1;
    record.error = null;
    emit(record);
    scheduleTick();

    const job = async (): Promise<TimerActionResult> => {
        let outcome: TimerActionResult;
        try {
            const { timer } = await transport.act(record.subject, action);
            outcome = { ok: true, timer };
        } catch (error) {
            outcome = { ok: false, error: toError(error) };
        }

        record.pending -= 1;
        const last = record.pending === 0;
        if (outcome.ok) {
            // Nur die LETZTE ausstehende Handlung übernimmt den Stand — die Antwort
            // einer früheren kennt die späteren Klicks noch nicht.
            if (last) {
                adopt(record, outcome.timer);
                record.error = null;
            }
        } else {
            // Die Wahrheit zurückholen, dann den Fehler zeigen.
            if (last) await refreshTimer(record.subject, { force: true });
            record.error = outcome.error;
        }
        emit(record);
        scheduleTick();
        return outcome;
    };

    const next = record.queue.then(job, job);
    record.queue = next.catch(() => undefined);
    return next;
};

/** Nur für Tests: alle Einträge und den Takt vergessen. */
export const resetTimerStoreForTests = (): void => {
    records.clear();
    if (tickHandle !== null) {
        clearTimeout(tickHandle);
        tickHandle = null;
    }
};
