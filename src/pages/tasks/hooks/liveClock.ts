/**
 * ── EIN TAKT FÜR DAS GANZE MODUL ─────────────────────────────────────────────
 *
 * Fälligkeiten («3 dk kaldı»), «vor 5 Minuten» und ähnliche Texte hängen an
 * EINEM selbst nachziehenden `setTimeout`, der alle Abonnenten im selben Tick
 * weckt — React zeichnet sie in einem Durchgang.
 *
 * KEINE laufende Uhr mehr (14.09.2026, Samet: «canlı sayımı kaldır … kronometre
 * olmayacak»): eine laufende Messung zeigt nur «Çalışılıyor», keine Sekunden.
 * Darum gibt es hier keine Sekunden-Ausrichtung auf einen Start mehr — der
 * Takt dient den Minutenwechseln; ein Sekundentakt bleibt für den Fall möglich,
 * dass eine Anzeige ihn ausdrücklich verlangt.
 */

export type ClockQuantum = 'second' | 'minute';

/* Sicherheitsabstand hinter der Grenze: Timer feuern nie zu früh. */
const MARGIN_MS = 8;

const listeners = new Map<() => void, ClockQuantum>();
let lastTick = Date.now();
let timer: number | null = null;

const schedule = (): void => {
    const now = Date.now();
    const onlyMinutes = [...listeners.values()].every((quantum) => quantum === 'minute');
    const step = onlyMinutes ? 60_000 : 1_000;
    const wait = step - (now % step) + MARGIN_MS;
    timer = window.setTimeout(tick, wait);
};

const tick = (): void => {
    timer = null;
    const previous = lastTick;
    lastTick = Date.now();
    const minuteChanged = Math.floor(previous / 60_000) !== Math.floor(lastTick / 60_000);
    listeners.forEach((quantum, listener) => {
        if (quantum === 'second' || minuteChanged) listener();
    });
    if (listeners.size) schedule();
};

/** «Jetzt» nach der Browseruhr — solange der Takt läuft, der Stand des letzten Ticks (für alle gleich). */
export const clockNow = (): number => (timer !== null ? lastTick : Date.now());

export const subscribeClock = (listener: () => void, quantum: ClockQuantum = 'minute'): (() => void) => {
    const hadSeconds = [...listeners.values()].some((entry) => entry === 'second');
    listeners.set(listener, quantum);
    if (timer === null) {
        lastTick = Date.now();
        schedule();
    } else if (quantum === 'second' && !hadSeconds) {
        // Vom Minuten- auf den Sekundentakt wechseln: den wartenden Timer neu setzen.
        window.clearTimeout(timer);
        schedule();
    }
    return () => {
        listeners.delete(listener);
        if (!listeners.size && timer !== null) {
            window.clearTimeout(timer);
            timer = null;
        }
    };
};
