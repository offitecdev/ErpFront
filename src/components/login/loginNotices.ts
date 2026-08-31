/**
 * ── MITTEILUNGEN AUF DER ANMELDESEITE ───────────────────────────────────────
 *
 * Inhalt der Mitteilungsleiste unten links (siehe `LoginNotifications.tsx`).
 * Neueste zuerst. Jede Mitteilung hat eine feste `id`; der Browser merkt sich
 * gelesene ids, deshalb bekommt jede neue Mitteilung eine NEUE id (Datum im
 * Namen) und erscheint dann einmal von selbst.
 *
 * Die Texte sind bewusst Deutsch und nicht übersetzt: die Leiste wird vor der
 * Anmeldung gelesen (kein Benutzer, keine gespeicherte Sprache) — die
 * sanktionierte Ausnahme der i18n-Regel für diese Oberfläche.
 */

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

export const LOGIN_NOTICES: LoginNotice[] = [
    {
        /* Die Mitteilung vom 18.08.2026 wurde in diese hier ÜBERNOMMEN (Vorgabe
           Samet, 19.08.2026): beide Tage gingen zusammen live, deshalb steht in
           der Leiste EINE Mitteilung vom 19.08.2026 — zuerst das Neue dieses
           Tages, darunter unverändert die Punkte des 18.08.2026. */
        id: 'update-2026-08-19',
        date: '19.08.2026',
        title: 'Update vom 19.08.2026',
        body: 'Rapporte, Abrechnung und Projektübersicht im neuen Kleid — mit allem vom 18.08.2026.',
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
        body: 'Profil, Personal und Berechtigungen erneuert.',
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
        body: 'Das neue CRM-Modul ist da.',
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
        body: 'Liveschaltung: 20:15 Uhr — enthaltene Verbesserungen:',
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
        body: 'Der Web-Prototyp der Produktion ist verfügbar.',
        link: { href: 'https://prototip.offitec.ch/', label: 'Produktionsprototyp ansehen' },
    },
];
