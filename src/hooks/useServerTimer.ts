import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { formatHms } from '@/lib/serverTimer/formatHms';
import {
    dispatchTimer,
    ensureTimer,
    refreshTimer,
    subscribeTimer,
    timerSnapshot,
    type TimerActionResult,
    type TimerApiError,
    type TimerSource,
} from '@/lib/serverTimer/runtime';
import type { ServerTimerDto, TimerAction, TimerStatus, TimerSubject } from '@/lib/serverTimer/timerMachine';

/**
 * ── useServerTimer — EINE UHR, DIE DER SERVER STELLT (14.09.2026) ────────────
 *
 * Anzeige und Bedienung eines Zählers nach Zeitstempeln (Backend: /timers).
 *
 *   const timer = useServerTimer({ subjectType: 'TASK', subjectId: task.id });
 *   <span className="ofi-gv-clock">{timer.display}</span>          // «00:12:07»
 *   {timer.isRunning
 *       ? <button onClick={() => void timer.pause()}>{t('…pause')}</button>
 *       : <button onClick={() => void timer.start()}>{t('…start')}</button>}
 *
 *  • Jede Sekunde: floor((serverNow − startedAt + accumulatedMs) / 1000) —
 *    nie `count + 1`. serverNow = Date.now() + Uhrversatz, der EINMAL aus
 *    `serverTime` der Antworten gemessen und dann festgehalten wird.
 *  • Klick = sofort (Vorhersage mit den Serverregeln), Antwort = Wahrheit.
 *    Der Server speichert genau die Sekunde des Klicks — nichts springt.
 *    `pending` ist nur eine Anzeige; der Knopf wird nie gesperrt.
 *  • F5 / Seitenwechsel: der letzte Stand steht sofort da (Speicher bzw.
 *    localStorage), der Server bestätigt ihn — die Uhr läuft ohne Lücke weiter,
 *    weil sie aus dem Startzeitpunkt rechnet, nicht aus einem Zähler.
 *  • Tab im Hintergrund: nichts friert ein, beim Aufwachen wird nachgerechnet;
 *    `refreshOnFocus` holt dabei den Serverstand (zweites Gerät).
 *  • `error.code` übersetzt die Oberfläche (i18n): TIMER_NOT_RUNNING,
 *    TIMER_NOT_PAUSED, TIMER_NOT_STARTED, TIMER_COMPLETED, TIMER_CONFLICT,
 *    VALIDATION, NETWORK … — `error.message` ist nur der Rückfallsatz des Servers.
 */

export interface UseServerTimerOptions extends TimerSubject {
    /** false = weder laden noch ticken (Zeile nicht sichtbar, Kennung noch unbekannt). */
    enabled?: boolean;
    /** Beim Zurückkehren in den Tab den Stand vom Server holen (zweites Gerät). Standard: true. */
    refreshOnFocus?: boolean;
}

export interface ServerTimerHandle {
    status: TimerStatus;
    elapsedSeconds: number;
    /** «HH:MM:SS» */
    display: string;
    isIdle: boolean;
    isRunning: boolean;
    isPaused: boolean;
    isCompleted: boolean;
    /** Eine eigene Handlung wartet noch auf den Server — Anzeige, keine Sperre. */
    pending: boolean;
    /** Die erste Antwort des Servers steht noch aus (der gezeigte Stand ist der gemerkte). */
    loading: boolean;
    source: TimerSource;
    error: TimerApiError | null;
    /** Der rohe Stand (startedAt, accumulatedMs, version …). */
    timer: ServerTimerDto;
    start: () => Promise<TimerActionResult>;
    pause: () => Promise<TimerActionResult>;
    resume: () => Promise<TimerActionResult>;
    stop: () => Promise<TimerActionResult>;
    reset: () => Promise<TimerActionResult>;
    /** Den Stand vom Server holen — z. B. nach einer Meldung «auf einem anderen Gerät geändert». */
    refresh: () => Promise<void>;
}

const noop = (): void => undefined;

/** Beim Zurückkehren in den Tab gilt ein Stand nur so lange als frisch. */
const FOCUS_MAX_AGE_MS = 3000;

export const useServerTimer = ({
    subjectType,
    subjectId,
    enabled = true,
    refreshOnFocus = true,
}: UseServerTimerOptions): ServerTimerHandle => {
    const subject = useMemo<TimerSubject>(() => ({ subjectType, subjectId }), [subjectType, subjectId]);

    const subscribe = useCallback(
        (listener: () => void) => (enabled ? subscribeTimer(subject, listener) : noop),
        [subject, enabled],
    );
    const getSnapshot = useCallback(() => timerSnapshot(subject), [subject]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    useEffect(() => {
        if (enabled) ensureTimer(subject);
    }, [subject, enabled]);

    useEffect(() => {
        if (!enabled || !refreshOnFocus) return undefined;
        const onWake = (): void => {
            if (!document.hidden) void refreshTimer(subject, { maxAgeMs: FOCUS_MAX_AGE_MS });
        };
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onWake);
        return () => {
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', onWake);
        };
    }, [subject, enabled, refreshOnFocus]);

    const act = useCallback((action: TimerAction) => dispatchTimer(subject, action), [subject]);
    const refresh = useCallback(() => refreshTimer(subject, { force: true }), [subject]);

    return useMemo<ServerTimerHandle>(() => {
        const { status } = snapshot.timer;
        return {
            status,
            elapsedSeconds: snapshot.elapsedSeconds,
            display: formatHms(snapshot.elapsedSeconds),
            isIdle: status === 'IDLE',
            isRunning: status === 'RUNNING',
            isPaused: status === 'PAUSED',
            isCompleted: status === 'COMPLETED',
            pending: snapshot.pending > 0,
            loading: snapshot.loading,
            source: snapshot.source,
            error: snapshot.error,
            timer: snapshot.timer,
            start: () => act('start'),
            pause: () => act('pause'),
            resume: () => act('resume'),
            stop: () => act('stop'),
            reset: () => act('reset'),
            refresh,
        };
    }, [snapshot, act, refresh]);
};
