/**
 * ── MITTEILUNGEN AUF DER ANMELDESEITE ───────────────────────────────────────
 *
 * Inhalt der Mitteilungsleiste unten links (siehe `LoginNotifications.tsx`).
 *
 * DER TEXT STEHT NICHT MEHR HIER (29.08.2026). Er liegt in
 * `components/updates/updateNotes.ts` — EINE Quelle für beide Orte, an denen
 * die Anwendung ihre Neuigkeiten zeigt: diese Leiste vor der Anmeldung und das
 * Neuigkeiten-Fenster danach. Vorher stand er nur hier, und wer angemeldet
 * blieb, erfuhr von einem Update nichts.
 *
 * Diese Datei macht daraus die flache Fassung, die die Leiste braucht: Datum,
 * Titel, ein Satz, eine Liste. Die hervorgehobenen Punkte des Fensters
 * (Kacheln mit Zeichen und Weg) werden dabei zu gewöhnlichen Zeilen — vor der
 * Anmeldung gibt es keinen Weg, dem man folgen könnte.
 *
 * Die Texte sind bewusst Deutsch und nicht übersetzt: die Leiste wird vor der
 * Anmeldung gelesen (kein Benutzer, keine gespeicherte Sprache) — die
 * sanktionierte Ausnahme der i18n-Regel für diese Oberfläche.
 */

import { UPDATE_NOTES } from '@/components/updates/updateNotes';

export interface LoginNotice {
    id: string;
    /** Datum als Anzeige, z. B. „07.08.2026". */
    date: string;
    title: string;
    /** Kurzer Fliesstext unter dem Titel. */
    body?: string;
    /** Aufzählungspunkte (Release-Notizen). */
    lines?: string[];
    /** Optionaler Weblink mit eigener Beschriftung. */
    link?: { href: string; label: string };
}

export const LOGIN_NOTICES: LoginNotice[] = UPDATE_NOTES.map((note) => {
    const lines = [
        ...(note.highlights ?? []).map((highlight) => `${highlight.title}: ${highlight.text}`),
        ...(note.lines ?? []),
    ];
    return {
        id: note.id,
        date: note.date,
        title: note.title,
        body: note.intro,
        // Leer heisst „keine Liste" — sonst zeichnete die Leiste ein leeres <ul>.
        lines: lines.length > 0 ? lines : undefined,
        link: note.link,
    };
});
