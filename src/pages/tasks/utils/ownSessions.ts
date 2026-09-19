/**
 * ── EIGENE MESSUNGEN, DIE DER SERVER NOCH NICHT MITZÄHLT ────────────────────
 *
 * Vorgabe Samet (14.09.2026, abends): keine laufende Uhr mehr — «süreyi görmek
 * istiyorsanız durdurmanız gerekiyor». Die Zahl einer Aufgabe ist die Summe
 * der ABGESCHLOSSENEN Messungen des Tages, wie der Server sie liefert.
 *
 * Zwischen dem Pause-Klick und der nächsten Antwort kennt der Server die eben
 * beendete Messung aber noch nicht — und eine ältere Antwort (Zwischenspeicher,
 * eine noch laufende Anfrage) kennt sie auch danach nicht. Genau dort sprang
 * die Zahl früher zurück: erst der alte Stand, dann die richtige Summe.
 *
 * Darum merkt sich der Browser jeden eigenen Stopp: Aufgabe, Start (falls
 * bekannt), Stopp-Klick; sobald der Server antwortet, dessen Dauer und
 * Antwortzeit. Eine Antwort, die JÜNGER als die Bestätigung ist, enthält die
 * Messung — alles Ältere bekommt sie hier dazugerechnet. Keine Uhr, kein Takt:
 * die Rechnung «Stopp minus Start» geschieht genau einmal, beim Klick.
 *
 * Ohne Abhängigkeiten (kein Store, kein React): läuft auch in Node-Tests.
 */

export interface OwnStop {
    taskId: string;
    /** Start laut Browser (Serverzeit, ms) — null, wenn der Store die Messung nicht kannte. */
    startedAt: number | null;
    /** Der Pause-Klick (Serverzeit, ms). */
    stoppedAt: number;
    /** Dauer laut Server, sobald bestätigt. */
    serverMs: number | null;
    /** `serverNow` der bestätigenden Antwort — jüngere Antworten enthalten die Messung. */
    confirmedAt: number | null;
    /** Der Server hat die Messung verworfen (kürzer als das Minimum). */
    discarded: boolean;
}

export interface OwnStopHandle {
    readonly id: number;
}

/** Zwei Klicks innerhalb dieser Spanne auf dieselbe Aufgabe sind EIN Stopp (Klick + Store-Wechsel). */
const DEDUPE_MS = 1_000;
/** Der Start laut Server darf um die Netzlaufzeit vom Klick abweichen (wie `mergeActiveTimer`). */
const MATCH_TOLERANCE_MS = 5_000;
/** Spiegel von TASK_LIMITS.sessionMinMs: kürzere Messungen verwirft der Server. */
const SESSION_MIN_MS = 2_000;
const MAX_PER_TASK = 100;
const STORAGE_KEY = 'ofi:tasks:own-stops';

let nextId = 1;
let entries: Array<OwnStop & { id: number }> = [];

const startOfDay = (ms: number): number => {
    const day = new Date(ms);
    day.setHours(0, 0, 0, 0);
    return day.getTime();
};

/* ── Sitzungsspeicher: ein Neuladen des Tabs vergisst keinen Stopp ────────── */

const storage = (): Storage | null => {
    try {
        return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
        return null;
    }
};

const tenantKey = (): string => {
    try {
        return sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';
    } catch {
        return '';
    }
};

const storageKey = (): string => `${STORAGE_KEY}:${tenantKey()}`;

const persist = (): void => {
    const store = storage();
    if (!store) return;
    try {
        store.setItem(storageKey(), JSON.stringify(entries.map((entry): OwnStop => ({ taskId: entry.taskId, startedAt: entry.startedAt, stoppedAt: entry.stoppedAt, serverMs: entry.serverMs, confirmedAt: entry.confirmedAt, discarded: entry.discarded }))));
    } catch {
        /* voll oder gesperrt — der Speicher im Tab reicht */
    }
};

const restore = (): void => {
    const store = storage();
    if (!store) return;
    try {
        const raw = store.getItem(storageKey());
        if (!raw) return;
        const parsed = JSON.parse(raw) as OwnStop[];
        const dayStart = startOfDay(Date.now());
        entries = parsed
            .filter((entry) => entry && typeof entry.taskId === 'string' && Number.isFinite(entry.stoppedAt) && entry.stoppedAt >= dayStart)
            .map((entry) => ({ ...entry, id: nextId++ }));
    } catch {
        entries = [];
    }
};

restore();

/* ── Schreiben ───────────────────────────────────────────────────────────── */

/** Stopps vor dem heutigen Tag interessieren keine Tagesanzeige mehr. */
const prune = (nowMs: number): void => {
    const dayStart = startOfDay(nowMs);
    const kept = entries.filter((entry) => entry.stoppedAt >= dayStart);
    if (kept.length !== entries.length) entries = kept;
};

/** Den Pause-Klick festhalten. `startedAt` null = der Start war dem Browser nicht bekannt. */
export const recordOwnStop = (taskId: string, startedAt: number | null, stoppedAt: number): OwnStopHandle => {
    prune(stoppedAt);
    const twin = entries.find((entry) => entry.taskId === taskId && Math.abs(entry.stoppedAt - stoppedAt) <= DEDUPE_MS);
    if (twin) {
        if (twin.startedAt === null && startedAt !== null) twin.startedAt = startedAt;
        return { id: twin.id };
    }
    const entry = { id: nextId++, taskId, startedAt: Number.isFinite(startedAt as number) ? startedAt : null, stoppedAt, serverMs: null, confirmedAt: null, discarded: false };
    entries.push(entry);
    const ofTask = entries.filter((item) => item.taskId === taskId);
    if (ofTask.length > MAX_PER_TASK) {
        const oldest = ofTask[0];
        entries = entries.filter((item) => item !== oldest);
    }
    persist();
    return { id: entry.id };
};

/**
 * Antwort des Servers übernehmen. `null` = dort lief nichts (auf einem anderen
 * Gerät beendet, Doppelklick): der gemerkte Stopp ist gegenstandslos.
 */
export const confirmOwnStop = (
    handle: OwnStopHandle,
    result: { serverNow: number; durationMs: number; discarded: boolean } | null,
): void => {
    const entry = entries.find((item) => item.id === handle.id);
    if (!entry) return;
    if (!result || !Number.isFinite(result.serverNow)) {
        entries = entries.filter((item) => item !== entry);
    } else {
        entry.serverMs = Math.max(0, result.durationMs);
        entry.confirmedAt = result.serverNow;
        entry.discarded = result.discarded;
    }
    persist();
};

/** Die Anfrage ist gescheitert — der Server hat nichts beendet. */
export const dropOwnStop = (handle: OwnStopHandle): void => {
    const before = entries.length;
    entries = entries.filter((item) => item.id !== handle.id);
    if (entries.length !== before) persist();
};

/* ── Lesen ───────────────────────────────────────────────────────────────── */

export interface PendingOwnInput {
    taskId: string;
    /** Serverzeit der Antwort, aus der die Zahl stammt (ms). */
    loadedAtMs: number;
    /** Lief die eigene Messung laut dieser Antwort? */
    ownServerRunning: boolean;
    /** Ihr Start laut Antwort (ISO). */
    ownServerStartedAt?: string | null;
    /** Jetzt (Serverzeit, ms) — bestimmt den Kalendertag. */
    nowMs: number;
}

const pieceMs = (entry: OwnStop, start: number, dayStart: number): number => {
    if (entry.discarded || entry.stoppedAt <= dayStart) return 0;
    // Der Server kennt die ganze Messung, und sie liegt im Tag: seine Zahl gilt.
    if (entry.serverMs !== null && start >= dayStart) return entry.serverMs;
    const local = Math.max(0, entry.stoppedAt - Math.max(start, dayStart));
    if (entry.serverMs === null && local <= SESSION_MIN_MS) return 0;
    return local;
};

/**
 * Was zur Tageszahl einer Antwort noch DAZUKOMMT: alle eigenen Stopps, die
 * diese Antwort nicht enthalten kann —
 *  - meldet sie die Messung noch als laufend, fehlt deren Dauer sicher;
 *  - ist sie älter als die Bestätigung des Servers, fehlt die Messung ebenso;
 *  - unbestätigte Stopps fehlen immer.
 * Zurückgerechnet auf den Kalendertag von `nowMs` (wie die Antwort selbst).
 */
export const pendingOwnMs = ({ taskId, loadedAtMs, ownServerRunning, ownServerStartedAt, nowMs }: PendingOwnInput): number => {
    const dayStart = startOfDay(nowMs);
    const serverStart = ownServerRunning && ownServerStartedAt ? Date.parse(ownServerStartedAt) : NaN;
    let sum = 0;
    for (const entry of entries) {
        if (entry.taskId !== taskId) continue;
        if (entry.confirmedAt !== null && Number.isFinite(loadedAtMs) && loadedAtMs >= entry.confirmedAt) continue;
        const matches = ownServerRunning
            && (entry.startedAt === null || !Number.isFinite(serverStart) || Math.abs(entry.startedAt - serverStart) <= MATCH_TOLERANCE_MS);
        const start = matches && Number.isFinite(serverStart) ? serverStart : entry.startedAt;
        if (start === null || !Number.isFinite(start)) continue;
        sum += pieceMs(entry, start, dayStart);
    }
    return sum;
};

/** Gibt es heute eigene Stopps an dieser Aufgabe (für eine Zeile, die der Server noch nicht führt)? */
export const hasOwnStops = (taskId: string, nowMs: number): boolean => {
    const dayStart = startOfDay(nowMs);
    return entries.some((entry) => entry.taskId === taskId && entry.stoppedAt >= dayStart && !entry.discarded);
};

/** Nur für Tests. */
export const resetOwnStops = (): void => {
    entries = [];
    persist();
};
