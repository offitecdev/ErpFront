/**
 * ── ZEITMESSUNG NACH ZEITSTEMPELN: TYPEN UND REGELN IM BROWSER ───────────────
 *
 * Spiegel von Erp_Backend … application/services/timers/timerMachine.ts.
 * Der SERVER ist die einzige Wahrheit: er hält je Gegenstand nur
 *   status · startedAt (Beginn des laufenden Abschnitts) · accumulatedMs
 * und der Browser rechnet daraus mit der Serveruhr — nie `count + 1`.
 *
 * Die Regeln hier dienen der VORHERSAGE beim Klick: die Anzeige wechselt im
 * selben Klick, die Antwort bestätigt sie später — und weil der Server genau
 * den mitgeschickten Klickzeitpunkt speichert, springt dabei nichts.
 * Beide Fassungen müssen gleich bleiben.
 */

export const TIMER_STATUSES = ['IDLE', 'RUNNING', 'PAUSED', 'COMPLETED'] as const;
export type TimerStatus = (typeof TIMER_STATUSES)[number];

export const TIMER_ACTIONS = ['start', 'pause', 'resume', 'stop', 'reset'] as const;
export type TimerAction = (typeof TIMER_ACTIONS)[number];

export interface TimerSubject {
    /** Grossbuchstaben-Kennung des Bereichs, z. B. TASK, PROJECT, GENERIC. */
    subjectType: string;
    subjectId: string;
}

/** Der Stand, wie ihn der Server liefert (`GET/POST /timers/…`). */
export interface ServerTimerDto {
    subjectType: string;
    subjectId: string;
    status: TimerStatus;
    /** UTC-ISO — Beginn des laufenden Abschnitts, sonst null. */
    startedAt: string | null;
    /** Summe der abgeschlossenen Abschnitte in ms. */
    accumulatedMs: number;
    /** Verstrichene Zeit zum `serverTime` der Antwort — sie ALTERT; eine tickende Anzeige rechnet mit `elapsedMsAt`. */
    elapsedMs: number;
    completedAt: string | null;
    /** Zählstand der Zeile; 0 = noch keine Zeile (virtueller IDLE-Stand). */
    version: number;
}

export const idleTimer = (subject: TimerSubject): ServerTimerDto => ({
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    status: 'IDLE',
    startedAt: null,
    accumulatedMs: 0,
    elapsedMs: 0,
    completedAt: null,
    version: 0,
});

const parseMs = (iso: string | null): number | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
};

/** DIE Formel: accumulatedMs + (jetzt − startedAt) — «jetzt» nach der SERVERUHR (serverClock.serverNow()). */
export const elapsedMsAt = (timer: ServerTimerDto, serverNowMs: number): number => {
    const startedAt = timer.status === 'RUNNING' ? parseMs(timer.startedAt) : null;
    return timer.accumulatedMs + (startedAt === null ? 0 : Math.max(0, serverNowMs - startedAt));
};

/** Ganze Sekunden — EINMAL gerundet (floor), damit die Anzeige nie zurückspringt. */
export const elapsedSecondsAt = (timer: ServerTimerDto, serverNowMs: number): number =>
    Math.floor(elapsedMsAt(timer, serverNowMs) / 1000);

/**
 * Vorhersage für den Klick — dieselben Regeln wie der Server. Gibt den
 * unveränderten Stand zurück, wenn die Handlung nichts ändert (Doppelklick),
 * und null, wenn sie nach dem bekannten Stand unzulässig ist: dann entscheidet
 * der Server allein und die Anzeige bleibt, bis seine Antwort da ist.
 */
export const predictTransition = (timer: ServerTimerDto, action: TimerAction, atMs: number): ServerTimerDto | null => {
    const at = new Date(atMs).toISOString();
    const folded = elapsedMsAt(timer, atMs);
    const running = (): ServerTimerDto => ({ ...timer, status: 'RUNNING', startedAt: at, elapsedMs: folded, completedAt: null });

    switch (action) {
        case 'start':
            if (timer.status === 'RUNNING') return timer;
            if (timer.status === 'COMPLETED') return null;
            return running();

        case 'resume':
            if (timer.status === 'RUNNING') return timer;
            if (timer.status !== 'PAUSED') return null;
            return running();

        case 'pause':
            if (timer.status === 'PAUSED') return timer;
            if (timer.status !== 'RUNNING') return null;
            return { ...timer, status: 'PAUSED', startedAt: null, accumulatedMs: folded, elapsedMs: folded };

        case 'stop':
            if (timer.status === 'COMPLETED') return timer;
            if (timer.status === 'IDLE') return null;
            return { ...timer, status: 'COMPLETED', startedAt: null, accumulatedMs: folded, elapsedMs: folded, completedAt: at };

        case 'reset':
            if (timer.status === 'IDLE' && timer.accumulatedMs === 0) return timer;
            return { ...timer, status: 'IDLE', startedAt: null, accumulatedMs: 0, elapsedMs: 0, completedAt: null };
    }
};
