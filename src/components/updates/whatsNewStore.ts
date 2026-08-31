import { create } from 'zustand';

import { ALL_UPDATE_IDS, UPDATE_NOTES } from './updateNotes';

/**
 * ── WER HAT WELCHE NEUIGKEIT SCHON GESEHEN ───────────────────────────────────
 *
 * Ein winziger Speicher, den sich drei Teile teilen: der Knopf im Kopf (er
 * trägt den Punkt), der Wächter, der das Fenster nach der Anmeldung von selbst
 * öffnet, und das Fenster selbst.
 *
 * GELESEN LIEGT IM BROWSER, JE BENUTZER. Der Schlüssel trägt die Benutzer-id,
 * sonst sähe die zweite Person am selben Rechner die Mitteilung nie — sie wäre
 * für sie schon „gelesen". Ohne angemeldete Person greift ein gemeinsamer
 * Schlüssel; das ist nur der Fall, bevor das Profil geladen ist.
 *
 * Speicherzugriffe sind gekapselt: im privaten Modus wirft `localStorage`, und
 * daran darf der Kopf der Anwendung nicht scheitern — dann gilt eben alles als
 * ungelesen und das Fenster geht einmal je Sitzung auf.
 */

const KEY_PREFIX = 'offitec-updates-seen';

const storageKey = (userId: string | null) => (userId ? `${KEY_PREFIX}:${userId}` : KEY_PREFIX);

const readSeen = (userId: string | null): string[] => {
    try {
        const raw = window.localStorage.getItem(storageKey(userId));
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
        return [];
    }
};

const writeSeen = (userId: string | null, ids: string[]) => {
    try {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(ids));
    } catch {
        /* Speicher nicht verfügbar — dann eben nicht dauerhaft. */
    }
};

interface WhatsNewState {
    open: boolean;
    /** Für wen die gelesenen ids unten gelten. */
    userId: string | null;
    seen: string[];
    /** Wurde in dieser Sitzung schon von selbst geöffnet? */
    autoShown: boolean;
    /** Beim Anmelden bzw. beim Benutzerwechsel aufrufen. */
    bind: (userId: string | null) => void;
    openPanel: () => void;
    close: () => void;
    markAutoShown: () => void;
}

export const useWhatsNewStore = create<WhatsNewState>((set, get) => ({
    open: false,
    userId: null,
    seen: [],
    autoShown: false,

    bind: (userId) => {
        if (get().userId === userId) return;
        set({ userId, seen: readSeen(userId), autoShown: false, open: false });
    },

    openPanel: () => set({ open: true }),

    /* ── GELESEN IST ES ERST BEIM SCHLIESSEN (12.09.2026) ───────────────────
       Bis hierher galt schon das ÖFFNEN als gelesen. Das kostete die
       Ankündigung beim kleinsten Zwischenfall: ein F5 mitten im Rundgang, ein
       Fehltritt, der aus der Anwendung führte — und sie kam nie wieder, ohne
       den Browserspeicher von Hand zu leeren («das Fenster kommt nicht, auch
       nachdem ich die Daten gelöscht habe», Vorgabe Samet).

       Jetzt zählt der Abschluss: «Fertig», Escape, der Klick daneben, das Ende
       des Rundgangs. Wer die Anwendung mittendrin verlässt, bekommt sie beim
       nächsten Mal noch einmal — und das ist genau richtig, denn gesehen hat
       er sie dann nicht. Innerhalb einer Sitzung hält `autoShown` sie
       trotzdem bei EINEM Auftritt. */
    close: () => {
        const { userId, seen } = get();
        const next = [...new Set([...seen, ...ALL_UPDATE_IDS])];
        if (next.length !== seen.length) writeSeen(userId, next);
        set({ open: false, seen: next });
    },

    markAutoShown: () => set({ autoShown: true }),
}));

/** Die ids, die diese Person noch nie gesehen hat — neueste zuerst. */
export const selectUnseenIds = (state: WhatsNewState): string[] =>
    UPDATE_NOTES.filter((note) => !state.seen.includes(note.id)).map((note) => note.id);
