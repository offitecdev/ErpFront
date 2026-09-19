import type { AxiosResponse } from 'axios';

import { apiClient } from '../axios';
import { noteServerTime } from '../serverTimer/serverClock';
import type { ServerTimerDto, TimerAction, TimerStatus, TimerSubject } from '../serverTimer/timerMachine';
import type { TimerApiError } from '../serverTimer/timerStore';

/**
 * ── /timers — ZEITMESSUNG NACH ZEITSTEMPELN (14.09.2026) ─────────────────────
 *
 * Der Server hält je Gegenstand nur status · startedAt · accumulatedMs und
 * rechnet jeden Wechsel mit SEINER Uhr; hier wird weder Dauer noch ein
 * Client-Zeitstempel geschickt. Jede Antwort trägt `serverTime`; daraus misst
 * serverClock den Uhrversatz einmal und hält ihn stabil.
 */

export interface TimerEnvelope {
    timer: ServerTimerDto;
    serverTime: string;
}

export interface TimerListEnvelope {
    timers: ServerTimerDto[];
    serverTime: string;
}

/** `serverTime` unmittelbar nach Empfang gegen die Browseruhr messen. */
const timed = async <T extends { serverTime: string }>(request: () => Promise<AxiosResponse<T>>): Promise<T> => {
    const response = await request();
    noteServerTime(response.data.serverTime, Date.now());
    return response.data;
};

const timerPath = (subject: TimerSubject): string =>
    `/timers/${encodeURIComponent(subject.subjectType)}/${encodeURIComponent(subject.subjectId)}`;

export const serverTimersApi = {
    /** Stand eines Gegenstands — ohne Zeile ein IDLE-Stand, nie 404. */
    read: (subject: TimerSubject): Promise<TimerEnvelope> =>
        timed(() => apiClient.get<TimerEnvelope>(timerPath(subject))),

    /** Meine Zähler der ausgewählten Firma, z. B. `list('RUNNING')`. */
    list: (status?: TimerStatus): Promise<TimerListEnvelope> =>
        timed(() => apiClient.get<TimerListEnvelope>('/timers', { params: status ? { status } : undefined })),

    /** start | pause | resume | stop | reset; der Body enthält keine Zeit. */
    act: (subject: TimerSubject, action: TimerAction): Promise<TimerEnvelope> =>
        timed(() => apiClient.post<TimerEnvelope>(`${timerPath(subject)}/${action}`, {})),
};

interface ErrorResponseShape {
    response?: { status?: number; data?: { code?: unknown; error?: unknown } };
    message?: unknown;
}

/** `{ error, code }` des Servers → fester Code für die Oberfläche (übersetzt nach `code`, nie nach `message`). */
export const toTimerApiError = (error: unknown): TimerApiError => {
    const shape = (error ?? {}) as ErrorResponseShape;
    const response = shape.response;
    const code = typeof response?.data?.code === 'string' ? response.data.code : response ? 'HTTP_ERROR' : 'NETWORK';
    const message = typeof response?.data?.error === 'string'
        ? response.data.error
        : typeof shape.message === 'string' ? shape.message : String(error);
    return { code, message, status: typeof response?.status === 'number' ? response.status : null };
};
