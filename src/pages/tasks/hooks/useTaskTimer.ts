import { useCallback } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ClosedSession, StartTimerResult } from '@/types/tasksModule';
import { useTasksModuleStore } from '../store/tasksModuleStore';
import { confirmOwnStop, dropOwnStop, recordOwnStop, type OwnStopHandle } from '../utils/ownSessions';
import { emitTasksChanged } from '../utils/taskEvents';

/**
 * Start/Pause einer Messung — überall gleich: Kopfzeile, Liste, Detail.
 *
 * SOFORT (13.09.2026, Samet: «basar basmaz direkt kullanıcıya gösterilmeli»):
 * der Zustand im Store wechselt im selben Klick, der Knopf wird nie gesperrt.
 * Die Anfragen an den Server laufen danach in EINER Warteschlange hintereinander
 * (Start → Pause → Start kommt in genau dieser Reihenfolge an). Scheitert eine,
 * holt der Store den echten Stand vom Server zurück und ein Hinweis erscheint.
 *
 * KEINE UHR (14.09.2026, Samet: «kronometre olmayacak, sadece çalışılıyor»):
 * die Anfrage trägt keinen Zeitstempel; Start und Ende einer Messung setzt
 * der Server mit seiner Empfangszeit, und «Stopp minus Start» rechnet er genau
 * einmal — beim Pausieren. Der Browser zeigt derweil nur «Çalışılıyor».
 *
 * Damit die Zahl nach dem Pausieren nie zurückfällt, merkt sich der Browser
 * jeden eigenen Stopp (ownSessions): Zeilen, deren Antwort die Messung noch
 * nicht enthält, rechnen sie dazu, bis der Server sie mitliefert.
 */

let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    pending += 1;
    const run = () => job().finally(() => { pending -= 1; });
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
};

const parseMs = (iso: string | null | undefined): number | null => {
    const ms = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(ms) ? ms : null;
};

/** Eine vom Server beendete Messung, die der Browser NICHT selbst festgehalten hatte. */
const noteServerClosed = (closed: { taskId: string; durationMs: number; discarded: boolean }, clickMs: number, serverNow: string): void => {
    const serverMs = parseMs(serverNow);
    if (serverMs === null) return;
    confirmOwnStop(recordOwnStop(closed.taskId, null, clickMs), { serverNow: serverMs, durationMs: closed.durationMs, discarded: closed.discarded });
};

/**
 * Zähler der Leiste nachziehen (Status, offene Aufgaben) — ohne die eben
 * geklickte Messung zu überschreiben: steht noch ein Klick aus oder zeigt der
 * Server dieselbe Aufgabe, bleibt der Stand des Browsers.
 */
const syncSummary = async (): Promise<void> => {
    try {
        const summary = await tasksApi.summary();
        const state = useTasksModuleStore.getState();
        state.noteServerNow(summary.serverNow);
        const local = state.activeTimer ?? null;
        const keepLocal = pending > 0 || (local?.taskId ?? null) === (summary.activeTimer?.taskId ?? null);
        state.setSummary(keepLocal ? { ...summary, activeTimer: local } : summary);
    } catch {
        /* Ein ausgefallener Zähler ist kein Grund für eine Meldung. */
    }
};

/** Steht noch ein eigener Start/Pause-Klick beim Server aus? */
export const isTimerActionPending = (): boolean => pending > 0;

/**
 * Eine frische Antwort (Liste, Detail, Pano) sagt für Aufgaben, ob MEINE
 * Messung dort läuft. Widerspricht das dem Store — auf einem anderen Gerät
 * gestartet oder pausiert —, holt der Store sofort den echten Stand, statt bis
 * zum Minutentakt einen falschen Zustand zu zeigen.
 */
export const reconcileTimerWithServer = (rows: ReadonlyArray<{ id: string; runningForMe: boolean }>): void => {
    if (pending > 0) return;
    const state = useTasksModuleStore.getState();
    if (!state.activeTimerKnown) return;
    const active = state.activeTimer?.taskId ?? null;
    if (rows.some((row) => (row.id === active) !== row.runningForMe)) void state.refreshSummary();
};

/** Läuft die eigene Messung auf dieser Aufgabe? Der Store gilt, sobald er etwas weiss (Klick, Bootstrap, Özet). */
export const selectTimerRunning = (taskId: string, fallback: boolean) =>
    (state: ReturnType<typeof useTasksModuleStore.getState>): boolean =>
        state.activeTimer !== undefined ? state.activeTimer?.taskId === taskId : fallback;

export const useTaskTimer = () => {
    const tenantId = useTasksModuleStore((state) => state.tenantKey);

    /** `onError` bekommt den Fehler eines gescheiterten Starts — das Fenster «Çalışan görev» geht bei einer Aufgabe ohne Messrecht weg. */
    const start = useCallback((taskId: string, taskTitle = '', options: { onError?: (error: unknown) => void } = {}): Promise<StartTimerResult | null> => {
        const store = useTasksModuleStore.getState();
        const previous = store.activeTimer ?? null;
        const clickMs = Date.now() + store.serverOffsetMs;
        const predictedStartedAt = new Date(clickMs).toISOString();
        // Lief eine ANDERE Aufgabe, beendet der Server sie mit diesem Start —
        // ihr Stopp steht für die Zeilen sofort fest.
        const switched: OwnStopHandle | null = previous && previous.taskId !== taskId
            ? recordOwnStop(previous.taskId, parseMs(previous.startedAt), clickMs)
            : null;
        store.setActiveTimer({ taskId, taskTitle, tenantId, startedAt: predictedStartedAt });

        return enqueue(async () => {
            try {
                const { timer, serverNow } = await tasksApi.startTimer(taskId);
                const current = useTasksModuleStore.getState();
                current.noteServerNow(serverNow, true);
                const closed = timer.switchedFrom;
                if (switched) {
                    const serverMs = parseMs(serverNow);
                    if (closed && previous && closed.taskId === previous.taskId && serverMs !== null) {
                        confirmOwnStop(switched, { serverNow: serverMs, durationMs: closed.durationMs, discarded: closed.discarded });
                    } else {
                        confirmOwnStop(switched, null);
                        if (closed) noteServerClosed(closed, clickMs, serverNow);
                    }
                } else if (closed) {
                    noteServerClosed(closed, clickMs, serverNow);
                }
                // Der Start des Servers ist die Wahrheit — aber nur für DIESEN Klick, nicht für einen späteren.
                if (current.activeTimer?.taskId === taskId && current.activeTimer.startedAt === predictedStartedAt) {
                    current.setActiveTimer({ taskId, taskTitle, tenantId, startedAt: timer.startedAt });
                }
                if (closed && !closed.discarded) {
                    toast(t('tasksModule.timer.switched', { title: closed.title }));
                }
                emitTasksChanged('timer', taskId);
                if (closed && closed.taskId !== taskId) emitTasksChanged('timer', closed.taskId);
                if (pending <= 1) void syncSummary();
                return timer;
            } catch (error) {
                if (switched) dropOwnStop(switched);
                toast.error(tasksErrorMessage(error));
                options.onError?.(error);
                void useTasksModuleStore.getState().refreshSummary();
                emitTasksChanged('timer', taskId);
                return null;
            }
        });
    }, [tenantId]);

    /** Ohne `taskId`: die eigene laufende Messung, wo immer sie läuft. */
    const pause = useCallback((taskId?: string): Promise<ClosedSession | null> => {
        const store = useTasksModuleStore.getState();
        const running = store.activeTimer ?? null;
        const clickMs = Date.now() + store.serverOffsetMs;
        const target = taskId ?? running?.taskId ?? null;
        // Erst die Anzeige, dann der Server: der Stopp steht im selben Klick fest. Kennt der
        // Store die Messung nicht (kein Bootstrap), gilt der Klick trotzdem — ohne Start.
        const handle: OwnStopHandle | null = target
            ? recordOwnStop(target, running && running.taskId === target ? parseMs(running.startedAt) : null, clickMs)
            : null;
        if (!taskId || !running || running.taskId === taskId) store.setActiveTimer(null);

        return enqueue(async () => {
            try {
                const { stopped, serverNow } = taskId
                    ? await tasksApi.pauseTimer(taskId)
                    : await tasksApi.pauseAnyTimer();
                useTasksModuleStore.getState().noteServerNow(serverNow, true);
                const serverMs = parseMs(serverNow);
                if (handle) {
                    if (stopped && stopped.taskId === target && serverMs !== null) {
                        confirmOwnStop(handle, { serverNow: serverMs, durationMs: stopped.durationMs, discarded: stopped.discarded });
                    } else {
                        // Dort lief nichts (anderes Gerät, Doppelklick) — oder etwas anderes.
                        confirmOwnStop(handle, null);
                        if (stopped) noteServerClosed(stopped, clickMs, serverNow);
                    }
                } else if (stopped) {
                    noteServerClosed(stopped, clickMs, serverNow);
                }
                emitTasksChanged('timer', stopped?.taskId ?? taskId);
                if (pending <= 1) void syncSummary();
                return stopped;
            } catch (error) {
                if (handle) dropOwnStop(handle);
                toast.error(tasksErrorMessage(error));
                void useTasksModuleStore.getState().refreshSummary();
                emitTasksChanged('timer', taskId);
                return null;
            }
        });
    }, []);

    return { start, pause };
};
