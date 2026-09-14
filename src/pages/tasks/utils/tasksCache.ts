/**
 * ── LETZTER STAND JE ANSICHT (stale-while-revalidate) ───────────────────────
 *
 * Vorgabe Samet 13.09.2026: «sohbetler 1,43 s'de geliyor — 100–200 ms olmalı».
 * Der Server antwortet in 30–90 ms; die Zeit ging in der Kette verloren
 * (Seite → Bootstrap → Räume → erster Raum → Nachrichten). Darum zeigt jede
 * Ansicht beim Öffnen sofort den zuletzt gesehenen Stand und lädt parallel
 * frisch nach.
 *
 * Gehalten im Speicher und in sessionStorage (überlebt ein Neuladen des Tabs,
 * nicht das Schliessen). Schlüssel tragen die ausgewählte Firma — ein
 * Firmenwechsel sieht nie Daten der anderen Firma. Grosse Einträge werden nur im
 * Speicher gehalten.
 */

const PREFIX = 'offitec:tasks:cache:';
const MAX_STORED_CHARS = 200_000;
const memory = new Map<string, unknown>();

const tenantKey = (): string =>
    sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';

const fullKey = (key: string): string => `${PREFIX}${tenantKey()}:${key}`;

export const readTasksCache = <T>(key: string): T | null => {
    const k = fullKey(key);
    if (memory.has(k)) return memory.get(k) as T;
    try {
        const raw = sessionStorage.getItem(k);
        if (!raw) return null;
        const value = JSON.parse(raw) as T;
        memory.set(k, value);
        return value;
    } catch {
        return null;
    }
};

export const writeTasksCache = <T>(key: string, value: T): void => {
    const k = fullKey(key);
    memory.set(k, value);
    try {
        const raw = JSON.stringify(value);
        if (raw.length <= MAX_STORED_CHARS) sessionStorage.setItem(k, raw);
        else sessionStorage.removeItem(k);
    } catch {
        /* Speicher voll oder gesperrt — der Speicher im Tab reicht. */
    }
};

export const dropTasksCache = (key: string): void => {
    const k = fullKey(key);
    memory.delete(k);
    try { sessionStorage.removeItem(k); } catch { /* egal */ }
};

/** Remove every cached list variant of the selected tenant (filters included). */
export const dropTaskListCaches = (): void => {
    const prefix = `${PREFIX}${tenantKey()}:list:`;
    for (const key of [...memory.keys()]) {
        if (key.startsWith(prefix)) memory.delete(key);
    }
    try {
        for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
            const key = sessionStorage.key(index);
            if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
        }
    } catch { /* session storage is optional */ }
};
