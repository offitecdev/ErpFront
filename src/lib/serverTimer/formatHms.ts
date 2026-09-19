const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Ganze Sekunden → «HH:MM:SS». Die Stunden wachsen über 99 hinaus
 * («123:04:05»), nichts wird auf Tage umgebrochen — eine Uhr, die man ablesen
 * kann, ohne zu rechnen.
 */
export const formatHms = (totalSeconds: number): string => {
    const seconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds % 60)}`;
};
