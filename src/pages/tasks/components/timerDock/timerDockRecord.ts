import type { ActiveTimerInfo } from '@/types/tasksModule';

/**
 * ── ÇALIŞAN GÖREV: GEDÄCHTNIS DES KLEINEN FENSTERS ──────────────────────────
 *
 * 15.09.2026 (Samet): «görev başlayınca otomatik altta çıksın, uygulama
 * kapanıp açılınca da hep orada olsun, ben kapatırsam çarpıyla kapansın».
 *
 * Was das Fenster unten zeigt, steht pro Person im localStorage — nach dem
 * Neuladen, nach dem Schliessen der App und in jedem weiteren Tab steht es
 * sofort wieder da. Die Wahrheit über die Messung bleibt der Server
 * (`/tasks/timer/active`) bzw. der Store; hier steht nur:
 *   • welche Aufgabe zuletzt lief — auch nach «Durdur», zum Weitermachen,
 *   • ob sie gerade läuft,
 *   • ob das Fenster mit × geschlossen wurde. Zu bleibt es bis zum nächsten
 *     START, gleich ob hier, in einem anderen Tab oder auf dem Telefon.
 *
 * Reine Funktionen ohne React — in Node prüfbar.
 */

export interface TimerDockRecord {
    taskId: string;
    taskTitle: string;
    /** Firma der Aufgabe (leer = unbekannt). */
    tenantId: string;
    running: boolean;
    /** Beginn der zuletzt bekannten Messung (ISO) — daran erkennt das Fenster einen NEUEN Start. */
    startedAt: string | null;
    /** Mit × geschlossen: bleibt zu bis zum nächsten Start. */
    closed: boolean;
    /** Letzte Änderung (ms). */
    at: number;
}

export type DockPlace = 'left' | 'center' | 'right';

const RECORD_PREFIX = 'ofi:tasks-timer-dock:v1:';
const PLACE_KEY = 'ofi:tasks-timer-dock:place';

/**
 * Dieselbe Messung, solange die Startzeiten höchstens so weit auseinander
 * liegen: der Klick sagt den Start voraus, der Server stempelt beim Empfang.
 */
export const SAME_RUN_TOLERANCE_MS = 3_000;

export const recordKey = (userId: string): string => `${RECORD_PREFIX}${userId}`;

const isRecord = (value: unknown): value is TimerDockRecord => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<TimerDockRecord>;
    return typeof record.taskId === 'string' && record.taskId !== ''
        && typeof record.taskTitle === 'string'
        && typeof record.tenantId === 'string'
        && typeof record.running === 'boolean'
        && (record.startedAt === null || typeof record.startedAt === 'string')
        && typeof record.closed === 'boolean'
        && typeof record.at === 'number';
};

export const parseRecord = (raw: string | null): TimerDockRecord | null => {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        return isRecord(value) ? value : null;
    } catch {
        return null;
    }
};

export const readRecord = (userId: string): TimerDockRecord | null => {
    if (!userId) return null;
    try {
        return parseRecord(localStorage.getItem(recordKey(userId)));
    } catch {
        return null;
    }
};

export const writeRecord = (userId: string, record: TimerDockRecord | null): void => {
    if (!userId) return;
    try {
        if (record) localStorage.setItem(recordKey(userId), JSON.stringify(record));
        else localStorage.removeItem(recordKey(userId));
    } catch {
        /* Privater Modus: das Fenster lebt dann nur bis zum Neuladen. */
    }
};

const startMs = (iso: string | null | undefined): number | null => {
    const ms = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(ms) ? ms : null;
};

export const sameRun = (left: string | null | undefined, right: string | null | undefined): boolean => {
    const a = startMs(left);
    const b = startMs(right);
    return a !== null && b !== null && Math.abs(a - b) <= SAME_RUN_TOLERANCE_MS;
};

/**
 * Den Stand der eigenen Messung übernehmen. `active`: die laufende Messung,
 * null = es läuft nichts, undefined = unbekannt (ändert nichts).
 * Ändert sich nichts, kommt DASSELBE Objekt zurück.
 */
export const applyActiveTimer = (
    record: TimerDockRecord | null,
    active: ActiveTimerInfo | null | undefined,
    now: number,
): TimerDockRecord | null => {
    if (active === undefined) return record;
    if (active === null) {
        // Pausiert (hier, anderswo oder vom Server beendet): die Aufgabe bleibt stehen — «Durduruldu».
        return record !== null && record.running ? { ...record, running: false, at: now } : record;
    }
    if (record !== null && record.taskId === active.taskId && sameRun(record.startedAt, active.startedAt)) {
        // Dieselbe Messung: nachziehen, ein × bleibt gültig.
        const taskTitle = active.taskTitle || record.taskTitle;
        const tenantId = active.tenantId || record.tenantId;
        if (record.running && taskTitle === record.taskTitle && tenantId === record.tenantId && active.startedAt === record.startedAt) {
            return record;
        }
        return { ...record, running: true, taskTitle, tenantId, startedAt: active.startedAt, at: now };
    }
    // Ein NEUER Start — das Fenster geht (wieder) auf.
    const sameTask = record !== null && record.taskId === active.taskId;
    return {
        taskId: active.taskId,
        taskTitle: active.taskTitle || (sameTask && record !== null ? record.taskTitle : ''),
        tenantId: active.tenantId || (sameTask && record !== null ? record.tenantId : ''),
        running: true,
        startedAt: active.startedAt,
        closed: false,
        at: now,
    };
};

/** × — zu bis zum nächsten Start. */
export const closeRecord = (record: TimerDockRecord, now: number): TimerDockRecord =>
    (record.closed ? record : { ...record, closed: true, at: now });

/** Wohin das Fenster nach dem Ziehen einrastet: links, Mitte oder rechts unten. */
export const nearestPlace = (centerX: number, viewportWidth: number): DockPlace => {
    const third = viewportWidth / 3;
    if (centerX < third) return 'left';
    return centerX > third * 2 ? 'right' : 'center';
};

export const readPlace = (): DockPlace => {
    try {
        const value = localStorage.getItem(PLACE_KEY);
        return value === 'left' || value === 'center' ? value : 'right';
    } catch {
        return 'right';
    }
};

export const writePlace = (place: DockPlace): void => {
    try {
        localStorage.setItem(PLACE_KEY, place);
    } catch {
        /* nur eine Vorliebe */
    }
};
