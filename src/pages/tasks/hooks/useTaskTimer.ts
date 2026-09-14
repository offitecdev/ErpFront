import { useCallback } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ClosedSession, StartTimerResult } from '@/types/tasksModule';
import { useTasksModuleStore } from '../store/tasksModuleStore';
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
 * Die Uhr läuft ab dem Klick: die Startzeit des Servers ersetzt die des Browsers
 * nur, wenn sie deutlich abweicht — sonst spränge sie um die Netzlaufzeit zurück.
 */

const CLOCK_TOLERANCE_MS = 5_000;

let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    pending += 1;
    const run = () => job().finally(() => { pending -= 1; });
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
};

/**
 * Zähler der Leiste nachziehen (Status, offene Aufgaben) — ohne die eben
 * geklickte Uhr zu überschreiben: steht noch ein Klick aus oder zeigt der
 * Server dieselbe Aufgabe, bleibt die Uhr des Browsers.
 */
const syncSummary = async (): Promise<void> => {
    try {
        const summary = await tasksApi.summary();
        const state = useTasksModuleStore.getState();
        state.noteServerNow(summary.serverNow);
        const local = state.bootstrap?.summary.activeTimer ?? null;
        const keepLocal = pending > 0 || (local?.taskId ?? null) === (summary.activeTimer?.taskId ?? null);
        state.setSummary(keepLocal ? { ...summary, activeTimer: local } : summary);
    } catch {
        /* Ein ausgefallener Zähler ist kein Grund für eine Meldung. */
    }
};

/** Läuft die eigene Messung auf dieser Aufgabe? Der Store gilt, sobald er geladen ist. */
export const selectTimerRunning = (taskId: string, fallback: boolean) =>
    (state: ReturnType<typeof useTasksModuleStore.getState>): boolean =>
        state.bootstrap ? state.bootstrap.summary.activeTimer?.taskId === taskId : fallback;

export const useTaskTimer = () => {
    const tenantId = useTasksModuleStore((state) => state.tenantKey);

    const start = useCallback((taskId: string, taskTitle = ''): Promise<StartTimerResult | null> => {
        const store = useTasksModuleStore.getState();
        const clickedAt = Date.now() + store.serverOffsetMs;
        store.setActiveTimer({ taskId, taskTitle, tenantId, startedAt: new Date(clickedAt).toISOString() });

        return enqueue(async () => {
            try {
                const { timer, serverNow } = await tasksApi.startTimer(taskId);
                const state = useTasksModuleStore.getState();
                state.noteServerNow(serverNow);
                const current = state.bootstrap?.summary.activeTimer;
                // Nur übernehmen, wenn inzwischen nicht schon wieder etwas anderes geklickt wurde.
                if (current?.taskId === taskId) {
                    const serverStart = Date.parse(String(timer.startedAt));
                    const localStart = Date.parse(current.startedAt);
                    if (Number.isFinite(serverStart) && Math.abs(serverStart - localStart) > CLOCK_TOLERANCE_MS) {
                        state.setActiveTimer({ ...current, startedAt: String(timer.startedAt) });
                    }
                }
                if (timer.switchedFrom && !timer.switchedFrom.discarded) {
                    toast(t('tasksModule.timer.switched', { title: timer.switchedFrom.title }));
                }
                emitTasksChanged('timer', taskId);
                if (pending <= 1) void syncSummary();
                return timer;
            } catch (error) {
                toast.error(tasksErrorMessage(error));
                void useTasksModuleStore.getState().refreshSummary();
                emitTasksChanged('timer', taskId);
                return null;
            }
        });
    }, [tenantId]);

    /** Ohne `taskId`: die eigene laufende Messung, wo immer sie läuft. */
    const pause = useCallback((taskId?: string): Promise<ClosedSession | null> => {
        const store = useTasksModuleStore.getState();
        const running = store.bootstrap?.summary.activeTimer ?? null;
        if (!taskId || running?.taskId === taskId) store.setActiveTimer(null);

        return enqueue(async () => {
            try {
                const { stopped, serverNow } = taskId ? await tasksApi.pauseTimer(taskId) : await tasksApi.pauseAnyTimer();
                useTasksModuleStore.getState().noteServerNow(serverNow);
                emitTasksChanged('timer', stopped?.taskId ?? taskId);
                if (pending <= 1) void syncSummary();
                return stopped;
            } catch (error) {
                toast.error(tasksErrorMessage(error));
                void useTasksModuleStore.getState().refreshSummary();
                emitTasksChanged('timer', taskId);
                return null;
            }
        });
    }, []);

    return { start, pause };
};
