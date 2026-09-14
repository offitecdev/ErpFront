/**
 * ── DIE NEUIGKEITEN DER ANWENDUNG (eine Quelle für zwei Orte) ────────────────
 *
 * Hier steht, was sich geändert hat — einmal geschrieben, an zwei Stellen
 * gelesen:
 *
 *   • VOR der Anmeldung: die Mitteilungsleiste unten links auf der
 *     Anmeldeseite (`components/login/LoginNotifications.tsx`). Sie holt sich
 *     die flache Fassung über `toLoginNotices()`.
 *   • NACH der Anmeldung: die Ankündigung, die beim ersten Besuch nach einem
 *     Update EINMAL von selbst aufgeht (`WhatsNewPopup.tsx`). Sie zeigt nur die
 *     NEUESTE Mitteilung und hat kein Zeichen im Kopf — «das Fenster soll
 *     einfach einmal kommen» (Vorgabe Samet, 29.08.2026).
 *
 * Bis zum 29.08.2026 stand dieser Inhalt nur in `loginNotices.ts` und damit nur
 * VOR der Anmeldung — wer angemeldet blieb, erfuhr von einem Update nichts.
 *
 * DIE TEXTE SIND DEUTSCH UND WERDEN NICHT ÜBERSETZT (Vorgabe Samet,
 * 29.08.2026: «das Update vom 29. August soll nur auf Deutsch sein»). Es ist
 * dieselbe sanktionierte Ausnahme, die die Anmeldeseite schon trägt: eine
 * Release-Notiz ist redaktioneller Inhalt, keine Programmoberfläche. Was das
 * Fenster selbst beschriftet — Titel, Knöpfe, «Öffnen» — läuft dagegen ganz
 * normal über i18n (`updates.*`).
 *
 * EINE NEUE MITTEILUNG BEKOMMT EINE NEUE `id`. Gelesene ids liegen im Browser;
 * eine unbekannte id ist der einzige Grund, aus dem das Fenster von selbst
 * aufgeht. Neueste zuerst.
 */

/** Bestimmt Zeichen und Farbe der Kachel im Neuigkeiten-Fenster. */
export type UpdateAccent =
    | 'apps'
    | 'calendar'
    | 'sales'
    | 'invoice'
    | 'mail'
    | 'tasks'
    | 'people'
    | 'inventory'
    | 'project'
    /* Seit dem 09.09.2026 — die Zeichen des Apple-Fensters (UpdateWindow). */
    | 'security'
    | 'orders'
    | 'ai'
    | 'design'
    | 'camera'
    | 'general';

/** Eine hervorgehobene Neuerung — sie bekommt eine eigene Kachel. */
export interface UpdateHighlight {
    accent: UpdateAccent;
    title: string;
    text: string;
    /** Interner Weg; er steht als Knopf an der Kachel. */
    to?: string;
}

/**
 * ── EINE STATION DES RUNDGANGS (29.08.2026) ─────────────────────────────────
 *
 * Der Rundgang ist NICHT die Liste der Neuerungen (Vorgabe Samet: «nur davon
 * sprechen, dass die Schnellzugriffe und die Vor-/Zurück-Knöpfe zu Apps und
 * Kalender gewandert sind — nicht von den Dingen, die wir ohnehin zeigen»).
 * Er führt ausschliesslich an die Stellen im KOPF, die sich unter der Hand
 * verschoben haben; alles Übrige steht im Prospekt und bleibt dort.
 *
 * `target` ist ein CSS-Wähler auf die echte Stelle in der Oberfläche; die
 * Marken stehen als `data-tour="…"` in `layout/MainLayout.tsx` und
 * `layout/RequestsAppsMenu.tsx`. Treffen mehrere Elemente, wird ihre
 * gemeinsame Fläche ausgeleuchtet — beim Apps-Feld sind das der Knopf UND das
 * aufgeklappte Feld darunter.
 */
export interface TourStop {
    accent: UpdateAccent;
    title: string;
    text: string;
    target: string;
    /** Klappt das Apps-Feld im Kopf auf, damit der Kegel es zeigen kann. */
    opensAppsMenu?: boolean;
    /** Nennt die vier Programme mit ihren Zeichen im Hinweis. */
    showApps?: boolean;
    /**
     * ÜBUNGSSTATION (29.08.2026, Vorgabe Samet). Die Station öffnet beim
     * Betreten ein Angebot in der Standard-Angebotsmaske — angelegt wird
     * nichts — und bittet dann, den Zurück-Pfeil zu drücken. Sie hat deshalb KEINEN «Weiter»-Knopf: an seiner Stelle steht
     * ein Pfeil, der auf die Stelle zeigt, die gedrückt werden soll — gemacht
     * wird es in der Oberfläche, nicht in einem Fenster. Verlässt man die
     * Angebotsseite, ist die Ankündigung zu Ende.
     */
    opensSampleQuote?: boolean;
}

/**
 * Welches ECHTE Programmzeichen eine App-Kachel trägt. Es sind dieselben
 * Zeichen, die im Kopf und im Menü stehen (Outlook-Kachel, Aufgaben-Haken, das
 * Apps-Karo) — ein Prospekt zeigt das Zeichen, das man danach sucht, und nicht
 * eine zweite Zeichnung davon.
 */
export type AppMark = 'apps' | 'mail' | 'tasks' | 'requests' | 'reminders' | 'calendar' | 'sales';

/** Eine App, die diese Mitteilung ankündigt — Zeichen, Name, ein Halbsatz. */
export interface UpdateApp {
    mark: AppMark;
    name: string;
    hint: string;
    to?: string;
}

export interface UpdateNote {
    id: string;
    /** Anzeigedatum, z. B. „29.08.2026". */
    date: string;
    title: string;
    /** Schlagwort im Kopf des Fensters — sonst steht dort „Neu". */
    badge?: string;
    /** Ein Satz unter dem Titel. */
    intro?: string;
    /** Überschrift über der App-Reihe; fehlt sie, steht dort keine. */
    appsTitle?: string;
    /** Die angekündigten Programme, mit ihren echten Zeichen. */
    apps?: UpdateApp[];
    /** Die grossen Punkte, je als Kachel mit Zeichen. */
    highlights?: UpdateHighlight[];
    /** Die Stationen des Rundgangs durch die echte Oberfläche. */
    tour?: TourStop[];
    /** Der Rest — eine ruhige Liste unter den Kacheln. */
    lines?: string[];
    /** Optionaler Weblink mit eigener Beschriftung. */
    link?: { href: string; label: string };
}

export const UPDATE_NOTES: UpdateNote[] = [
    {
        /* 13.09.2026 (Vorgabe Samet): «Görev ve sipariş modülleri eklendi» — EIN
           Blatt nach der Anmeldung (UpdateWindow) und EINE kleine Karte auf der
           Anmeldeseite (LoginUpdateCard). Die früheren Mitteilungen und das alte
           Fenster sind entfernt. */
        id: 'update-2026-09-13',
        date: '13.09.2026',
        badge: 'Neue Module',
        title: 'Update vom 13.09.2026',
        intro: 'Zwei neue Module: Aufgaben und Bestellungen.',
        highlights: [
            {
                accent: 'tasks',
                title: 'Aufgaben',
                to: '/tasks',
                text: 'Aufgaben mit Checklisten, Zeitmessung per Start und Pause, Dateien, Kommentaren und Chat. Teammitglieder stellen Aufgabenanträge, die Leitung gibt frei; Rapporte je Person täglich oder wöchentlich als PDF.',
            },
            {
                accent: 'orders',
                title: 'Bestellungen',
                to: '/inventory/orders',
                text: 'Lieferantenbestellungen von der Preisanfrage bis zur Bestellung — Belege per Foto, PDF oder Einfügen übernehmen und als sauberes PDF an den Lieferanten senden.',
            },
        ],
    },
];

/** Alle ids — „alles gelesen" heisst: diese Menge liegt im Speicher. */
export const ALL_UPDATE_IDS = UPDATE_NOTES.map((note) => note.id);
