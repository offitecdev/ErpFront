/**
 * ── DIE SERVERUHR IM BROWSER ─────────────────────────────────────────────────
 *
 * Jede Antwort der Zähler-API trägt `serverTime`. Daraus wird der Versatz
 * Server − Browser bei Antwortempfang bestimmt und dann FESTGEHALTEN: die Uhr des
 * Rechners darf Minuten danebenliegen, die Anzeige zählt trotzdem wie der
 * Server — und springt nie, weil kein späterer Messwert (andere Laufzeit,
 * andere Last, 50–300 ms Streuung) sie verschiebt. Genau dieses Nachstellen
 * bei jeder Antwort liess die Uhren im Görevler-Modul vor- und zurückspringen.
 * Nur eine ECHTE Änderung (Rechneruhr gestellt: > 1,5 s) wird übernommen.
 *
 * Gemerkt in localStorage: nach F5 und in jedem Tab gilt derselbe Versatz —
 * die erste Anzeige steht sofort richtig, und zwei Tabs zählen gleich.
 */

const STORAGE_KEY = 'ofi:server-clock';
const RESET_THRESHOLD_MS = 1500;

interface StoredOffset {
    offsetMs: number;
    measuredAt: number;
}

let offsetMs = 0;
let measured = false;
const listeners = new Set<() => void>();

const hasStorage = (): boolean => typeof localStorage !== 'undefined';

const readStored = (): void => {
    if (!hasStorage()) return;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<StoredOffset>;
        if (typeof parsed.offsetMs === 'number' && Number.isFinite(parsed.offsetMs)) {
            offsetMs = parsed.offsetMs;
            measured = true;
        }
    } catch {
        /* Unlesbar oder gesperrt — dann misst die erste Antwort. */
    }
};

const writeStored = (): void => {
    if (!hasStorage()) return;
    try {
        const stored: StoredOffset = { offsetMs, measuredAt: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
        /* Speicher voll oder gesperrt — der Wert im Tab reicht. */
    }
};

readStored();

/**
 * Eine Antwort mit `serverTime` einarbeiten. Der Server stempelt unmittelbar
 * vor dem Senden; deshalb wird gegen die Empfangszeit des Browsers gemessen.
 */
export const noteServerTime = (serverTimeIso: string, receivedAtMs: number = Date.now()): void => {
    const server = Date.parse(serverTimeIso);
    if (!Number.isFinite(server)) return;
    const sample = server - receivedAtMs;
    if (measured && Math.abs(sample - offsetMs) <= RESET_THRESHOLD_MS) return;
    offsetMs = sample;
    measured = true;
    writeStored();
    listeners.forEach((listener) => listener());
};

/** «Jetzt» nach der Serveruhr (ms seit Epoche). */
export const serverNow = (): number => Date.now() + offsetMs;

/** Versatz Server − Browser in ms (0, solange nie gemessen). */
export const clockOffsetMs = (): number => offsetMs;

export const isClockMeasured = (): boolean => measured;

/** Wird nur bei einer ECHTEN Änderung des Versatzes gerufen. */
export const subscribeServerClock = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/** Nur für Tests: Versatz vergessen. */
export const resetServerClockForTests = (): void => {
    offsetMs = 0;
    measured = false;
    if (hasStorage()) {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* egal */ }
    }
};
