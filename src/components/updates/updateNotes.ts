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
        id: 'update-2026-08-29',
        date: '29.08.2026',
        badge: 'Neue Apps',
        title: 'Update vom 29.08.2026',
        intro: 'Ein neuer Kopf mit vier Programmen, ein lebendiger Kalender und im Verkauf nur noch ein einziger Beleg.',
        appsTitle: 'Die vier Programme im Kopf',
        apps: [
            { mark: 'mail', name: 'Postfach', hint: 'Firmenpostfach', to: '/crm/mail' },
            { mark: 'tasks', name: 'Aufgaben', hint: 'Meine Pendenzen', to: '/crm/tasks' },
            { mark: 'requests', name: 'Anträge', hint: 'Ferien, Homeoffice, Krankheit', to: '/personnel/requests' },
            { mark: 'reminders', name: 'Erinnerungen', hint: 'Was heute fällig ist', to: '/crm/reminders' },
        ],
        tour: [
            {
                accent: 'apps',
                title: 'Die Schnellzugriffe liegen jetzt hier',
                text: 'Postfach, Aufgaben, Anträge und Erinnerungen sind aus dem Seitenmenü in den Kopf gezogen. Das Feld klappt beim Darüberfahren auf, jede Kachel trägt ihre eigene Zahl — und der Punkt am Zeichen sagt schon vorher, dass etwas auf Sie wartet.',
                target: '[data-tour="apps"], [data-tour="apps-panel"]',
                opensAppsMenu: true,
                showApps: true,
            },
            {
                accent: 'calendar',
                title: 'Der Kalender hat seinen eigenen Knopf',
                text: 'Er steht gleich neben den Apps — ein Griff statt eines Menüwegs, von jeder Seite aus.',
                target: '[data-tour="calendar"]',
            },
            {
                accent: 'sales',
                title: 'Schnellzugriffe — und der Weg zurück',
                text: 'Der Blitz ganz links öffnet in einem Griff, was man oft braucht; neu darunter «Angebot öffnen» — es hat gerade das zuletzt angelegte Angebot in der gewohnten Maske aufgeschlagen, ohne etwas anzulegen. Und weil die Seiten selbst keinen Zurück-Knopf mehr tragen, ist derselbe Blitz jetzt der Zurück-Pfeil. Drücken Sie ihn.',
                target: '[data-tour="quickback"]',
                opensSampleQuote: true,
            },
        ],
        highlights: [
            {
                accent: 'apps',
                title: 'Vier Programme im Kopf',
                text: 'Hinter dem Apps-Zeichen in der Kopfleiste liegen Postfach, Aufgaben, Anträge und Erinnerungen. Jede Kachel trägt ihre eigene, echte Zahl vom Server, und der farbige Punkt am Zeichen sagt schon vor dem Öffnen, dass etwas auf Sie wartet.',
            },
            {
                accent: 'calendar',
                title: 'Kalender',
                to: '/calendar',
                text: 'Farbige Etiketten geben jedem Termin seine Farbe. Unterlagen und Einsatzplan gehen in einem Zug an das Team, und im Datumsfeld lässt sich das Jahr jetzt direkt wählen.',
            },
            {
                accent: 'sales',
                title: 'Verkauf',
                to: '/sales/orders',
                text: 'Ein Auftrag gilt als bestätigt, sobald er aus der Offerte eröffnet wird — die Auftragsbestätigung geht dabei von selbst an den Kunden. Der frühere rote Verkaufsausdruck ist abgeschafft: es bleibt ein Beleg, das Verkaufs-PDF im dunkelblauen Feld.',
            },
            {
                accent: 'general',
                title: 'Kopfleiste aufgeräumt',
                text: 'Die Firmenwahl ist auf ihr farbiges Kürzel geschrumpft — Name, Kategorie und die Wahl selbst stehen im Kopf des Menüs, das sie öffnet. Der Kalender steht als eigener Knopf daneben, und der Weg zurück liegt im Schnellmenü statt auf jeder einzelnen Seite.',
            },
        ],
        lines: [
            'Auswertung im Projekt als Ring mit Nabe: beim Darüberfahren wechselt das gefragte Stück die Farbe und nennt seine Quote.',
            'Personal: Liste, Stempeluhr und Arbeitszeiterfassung stehen als eigene Wege im Menü, und die Rapporte sind durchgehend filterbar.',
            'Einheitliche Fensterkanten in der ganzen Anwendung — jedes Fenster und jede Auswahlliste trägt dieselbe Rundung wie die Kundensuche im Kalender.',
            'Verkaufsbelege ohne die Zeile «Verkäufer».',
        ],
    },
    {
        /* Die Mitteilung vom 18.08.2026 wurde in diese hier ÜBERNOMMEN (Vorgabe
           Samet, 19.08.2026): beide Tage gingen zusammen live, deshalb steht in
           der Leiste EINE Mitteilung vom 19.08.2026 — zuerst das Neue dieses
           Tages, darunter unverändert die Punkte des 18.08.2026. */
        id: 'update-2026-08-19',
        date: '19.08.2026',
        title: 'Update vom 19.08.2026',
        intro: 'Rapporte, Abrechnung und Projektübersicht im neuen Kleid — mit allem vom 18.08.2026.',
        lines: [
            'Rapporte im Projekt neu geordnet: oben die Dokumente (Gesamtrapport, Abnahme-Rapport, Unterschriften), darunter „Laufend" und „Abgeschlossen" nebeneinander als Terminkarten. Geöffnet wird in einem grossen Fenster, das sich verschieben und auf Bildschirmgrösse bringen lässt.',
            'Zwei Unterschriften je Rapport: Der Techniker unterschreibt direkt im Rapport, der Kunde wie bisher — beide stehen nebeneinander auf dem PDF.',
            'Checklisten im Übergabe-Rapport: Hinzufügen, Bearbeiten und Ausfüllen laufen je in einem eigenen Fenster, die Beschreibung steht direkt unter dem Kontrollpunkt, und Ja/Nein/N.A. wird mit einem Griff gesetzt.',
            'Rapport-PDFs aufgeräumt: nummerierte Abschnitte statt gleich aussehender Titel, Datumsangaben durchgehend als 19.08.2026, Notizen in einer ruhigen Karte und klare Schlusstotale.',
            'Abrechnung erneuert: Rechnungen, Zahlungsplan und Rechnen laufen in schwebenden Fenstern, jedes Feld wird von rechts geschrieben, und die Rechnungsart (Akonto, Zwischen-, Schlussrechnung) ergibt sich von selbst aus dem Prozentsatz.',
            'Projektübersicht klarer: weisse Karten mit feinen Linien, jede Zeile führt an die Stelle, die sie beschreibt, und die Ringe zeigen beim Überfahren den Anteil, den man gerade sucht.',
            'Postfach mit Filtern: eine Zeile für Bereich (alle, Kunden, Personal, Kalender), Kunde, Person und Zeitraum — 50 Nachrichten je Seite.',
            'Firmenpostfach im System: unter CRM → E-Mail wird mit der Firmenadresse geschrieben und gelesen. Empfänger stammen ausschliesslich aus dem System, und Antworten der Kunden laufen beim passenden Kunden ein.',
            'Termine als echte Einladungen: Ein Termin lässt sich auf Knopfdruck an den Kunden senden — Outlook, Google und Apple tragen ihn direkt ein, das Team steht als Kopie dabei.',
            'Aufgaben erneuert: ein Brett aus zwei Spalten, Zeitraum von–bis, mehrere Verantwortliche je Aufgabe und Erledigen direkt über eine Karte.',
            'Terminbereich im Projekt: Er zeigt jetzt genau die Kalenderansicht — dieselben Ansichten und Fenster, beschränkt auf das Projekt und seine Aufträge.',
            'Profilbilder: Das eigene Bild ersetzt überall den Kreis mit den Initialen — im Personalbereich, in Auswahllisten und bei Terminen.',
            'Einheitliche Fenster und eine ruhige Ladeanimation beim Start: Projektdetails, Rapporte und Löschabfragen laufen auf derselben Fensterform wie die Angebotsmaske.',
        ],
    },
    {
        id: 'update-2026-08-17',
        date: '17.08.2026',
        title: 'Update vom 17.08.2026',
        intro: 'Profil, Personal und Berechtigungen erneuert.',
        lines: [
            'Profilseite: die eigenen Angaben, Zugang, Aufgaben, Termine, Besprechungen und Ferien liegen jetzt an einer Stelle.',
            'Personalmodul erneuert: Personalakte je Person, Arbeitszeiten über den persönlichen QR-Code sowie Ferien- und Homeoffice-Anträge mit klarem Weg über Vorgesetzte und Buchhaltung.',
            'Berechtigungseinstellungen: Rollenvorlagen je Modul und Seite — jede Person erhält genau eine Rolle, und Passwortänderungen laufen neu als Antrag.',
            'Produktaufnahme: 6107 Zeilen aus der Artikelliste übernommen. Die Bestände starten bei 0 und wachsen über die Lagerbewegungen.',
        ],
    },
    {
        id: 'update-2026-08-15',
        date: '15.08.2026',
        title: 'Update vom 15.08.2026',
        intro: 'Das neue CRM-Modul ist da.',
        lines: [
            'CRM erneuert: Kunden, Kontakte und Kommunikation an einem Ort.',
            'Angebote lassen sich direkt in den Verkauf übernehmen — aus dem Angebot wird mit einem Schritt ein Auftrag, Positionen und Konditionen wandern mit.',
            'Allgemeine Aufgaben: Aufgaben und Erinnerungen als eigene Bereiche, mit Fälligkeit und Zuständigkeit.',
            'Mitteilungen: Hinweise zu Angeboten, Aufgaben und Terminen laufen neu an einer Stelle zusammen.',
        ],
    },
    {
        id: 'update-2026-08-07',
        date: '07.08.2026',
        title: 'Update vom 07.08.2026',
        intro: 'Liveschaltung: 20:15 Uhr — enthaltene Verbesserungen:',
        lines: [
            'Fakturierung erneuert und Rechnungs-PDF hinzugefügt.',
            'Startseite erneuert.',
            '„Meine Aufträge" erneuert.',
            'Allgemeine Codekorrekturen.',
            'Einige fehlerhafte Formulierungen korrigiert sowie Button- und Hintergrundfarben aktualisiert.',
        ],
    },
    {
        id: 'prototype-2026-07-24',
        date: '24.07.2026',
        title: 'Produktionsprototyp Türkei',
        intro: 'Der Web-Prototyp der Produktion ist verfügbar.',
        link: { href: 'https://prototip.offitec.ch/', label: 'Produktionsprototyp ansehen' },
    },
];

/** Alle ids — „alles gelesen" heisst: diese Menge liegt im Speicher. */
export const ALL_UPDATE_IDS = UPDATE_NOTES.map((note) => note.id);
