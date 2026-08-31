import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';

/**
 * ── DER WEG ZURÜCK ──────────────────────────────────────────────────────────
 *
 * Vorgabe Samet, 28.08.2026: die Seiten tragen KEINEN eigenen Zurück-Knopf
 * mehr. Er stand überall an einer anderen Stelle — mal oben rechts neben
 * "Löschen", mal als Pfeil vor dem Titel, mal als kleine unterstrichene Zeile
 * über dem Inhalt — und schob jedes Mal den eigentlichen Seiteninhalt eine
 * Zeile nach unten. Stattdessen VERWANDELT SICH DER BLITZ: der Schnellzugriff
 * ganz vorn in der Kopfleiste — gleich rechts neben dem Zeichen auf der
 * Modulleiste — wird zum Zurück-Pfeil, sobald man von einer Hauptseite auf
 * eine Unterseite geht (components/layout/QuickBackButton.tsx). Wie beim
 * Apfel- und beim Google-Vorbild trägt genau dieses eine Feld links oben immer
 * den Rückweg; die Marke bleibt dabei die Marke. Die Seite selbst beginnt
 * sofort mit ihrem Inhalt.
 *
 * Diese Datei beantwortet die eine Frage, an der alles hängt: **steht die
 * angezeigte Adresse UNTER einer Hauptseite, und unter welcher?**
 *
 *   1. `MAIN_PAGES` führt die Hauptseiten — Listen und Modulwurzeln. Auf ihnen
 *      bleibt der Blitz ein Blitz.
 *   2. `EXPLICIT_RULES` sind die wenigen Fälle, in denen der Rückweg NICHT die
 *      nächste Hauptseite darüber ist (die Angebotsauswertung gehört zum
 *      Angebot, nicht zur Angebotsliste).
 *   3. Sonst wird der Pfad Stück für Stück gekürzt; die erste Hauptseite, die
 *      dabei auftaucht, ist das Ziel.
 *
 * Was der Adresse allein nicht anzusehen ist — der Montage-Auftrag weiss erst
 * nach dem Laden, ob er zur Liste der offenen oder der abgeschlossenen
 * Montagen gehört —, meldet die Seite mit `usePageBackTarget()` selbst an.
 */

export type BackTarget = {
    /** Adresse der übergeordneten Seite. */
    to: string;
    /** i18n-Schlüssel ihres Namens — für den Kurzhinweis am Pfeil. */
    labelKey?: string;
};

/* ── 1. Die Hauptseiten ──────────────────────────────────────────────────────
   Schlüssel ist die Adresse, Wert der i18n-Schlüssel ihres Namens (leer, wo es
   keinen gibt — der Name erscheint ohnehin nur, wenn die Seite das ZIEL eines
   Rückwegs ist). Bewusst NICHT aus MENU_SECTIONS abgeleitet: das Menü führt
   auch Unterseiten (z. B. "Neue Lieferung"), und mehrere Hauptseiten stehen
   gar nicht im Menü (Aufgaben, Postfach und Checklisten wohnen im
   Apps-Zeichen, die Rapporte hängen am Projekt). */
const MAIN_PAGES: Record<string, string> = {
    '/': 'nav.home',
    '/calendar': 'nav.calendar',
    '/profile': 'nav.profile',
    '/roles': 'nav.authorizationSettings',

    '/personnel': 'nav.personnelList',
    '/personnel/terminal': 'nav.personnelTerminal',
    '/personnel/time-records': 'nav.personnelTimeRecords',
    '/personnel/requests': 'nav.personnelRequests',

    '/crm/overview': 'nav.crmOverview',
    '/crm/customers': 'nav.customerList',
    '/crm/contacts': 'nav.crmContacts',
    '/crm/enquiries': 'nav.crmEnquiries',
    '/crm/communication': 'nav.crmCommunication',
    '/crm/activities': 'nav.crmActivities',
    '/crm/mail': 'nav.crmMail',
    '/crm/tasks': 'nav.crmTasks',
    '/crm/reminders': 'nav.crmReminders',
    '/crm/quick-entry': 'nav.crmQuickEntry',
    '/crm/forms': 'nav.crmForms',
    '/crm/forms/templates': 'nav.crmFormTemplates',

    '/sales/quotes': 'nav.tenderManagement',
    '/sales/osp': 'nav.salesOsp',
    '/sales/orders': 'nav.myOrders',
    '/sales/invoices': 'nav.salesInvoices',

    '/projects': 'nav.projectManagement',
    '/services/reports': 'nav.serviceReports',

    '/inventory/articles': 'nav.articles',
    '/inventory/stock': 'nav.stock',
    '/inventory/orders': 'nav.inventoryOrders',
    '/inventory/suppliers': 'nav.suppliers',

    '/logistics/shipments': 'nav.shipments',

    '/maintenance': 'nav.maintenanceDashboard',
    '/maintenance/contracts': 'nav.contracts',
    '/maintenance/tasks': 'nav.maintenanceTasks',
    '/maintenance/regie': 'nav.regie',

    '/settings/pdf': 'nav.pdfSettings',
    '/settings/authorization': 'nav.authorizationSettings',
    '/settings/modules': 'nav.moduleSettings',
    '/settings/mail': 'nav.mailSettings',
    '/settings/company-categories': 'nav.companyCategories',
    '/settings/upload': 'nav.upload',
    '/settings/checklists': '',

    /* Der rote Montage-Arbeitsplatz ist für den Monteur die GANZE Anwendung —
       seine drei Listen sind dort Hauptseiten wie anderswo die Kundenliste. */
    '/montage': 'nav.montageWorkspace',
    '/montage/orders/active': 'montage.home.active',
    '/montage/orders/completed': 'montage.home.completed',
    '/montage/reports': 'montage.myDocuments',
};

/* ── 2. Ausnahmen ────────────────────────────────────────────────────────────
   Nur was NICHT der nächsten Hauptseite darüber gehört. */
const EXPLICIT_RULES: Array<{ test: RegExp; to: (match: RegExpMatchArray) => string; labelKey?: string }> = [
    // Die Kosten-/Margenauswertung wird AUS dem Angebot geöffnet und führt
    // dorthin zurück — nicht in die Liste, aus der das Angebot einmal kam.
    {
        test: /^\/sales\/quotes\/([^/]+)\/report$/,
        to: (match) => `/sales/quotes/${match[1]}`,
        labelKey: 'nav.tenderManagement',
    },
    // Ein Montage-Auftrag gehört zu seiner Liste. Ob das die offenen oder die
    // abgeschlossenen Montagen sind, weiss erst die geladene Seite — bis dahin
    // gilt die häufigere Herkunft (MontageOrderDetail meldet dann das genaue
    // Ziel über `usePageBackTarget` nach).
    {
        test: /^\/montage\/orders\/(?!active$|completed$)[^/]+$/,
        to: () => '/montage/orders/active',
        labelKey: 'montage.home.active',
    },
];

/** Abfrageteil weg, Schrägstrich am Ende weg — '/crm/customers/' == '/crm/customers'. */
const normalize = (pathname: string): string => {
    const clean = (pathname.split('?')[0] || '').replace(/\/+$/, '');
    return clean || '/';
};

/** Der Name einer Hauptseite — leer, wenn die Adresse keine ist. */
export const mainPageLabelKey = (path: string): string | undefined =>
    MAIN_PAGES[normalize(path)] || undefined;

/**
 * Der Rückweg für eine Adresse — oder `null`, wenn sie selbst eine Hauptseite
 * ist (dann bleibt der Knopf der Schnellzugriff).
 */
export const resolveBackTarget = (pathname: string): BackTarget | null => {
    const path = normalize(pathname);
    if (path in MAIN_PAGES) return null;

    for (const rule of EXPLICIT_RULES) {
        const match = path.match(rule.test);
        if (match) {
            const to = rule.to(match);
            return { to, labelKey: rule.labelKey || MAIN_PAGES[to] || undefined };
        }
    }

    // Stück für Stück kürzen: die LÄNGSTE passende Hauptseite gewinnt, also
    // '/maintenance/contracts' vor '/maintenance'.
    let cursor = path;
    while (cursor.includes('/') && cursor !== '/') {
        cursor = cursor.slice(0, cursor.lastIndexOf('/')) || '/';
        if (cursor in MAIN_PAGES) return { to: cursor, labelKey: MAIN_PAGES[cursor] || undefined };
    }
    return null;
};

/* ── 3. Was die Seite selbst besser weiss ────────────────────────────────────
   Ein winziger Speicher statt eines Kontexts: die Kopfleiste steht ÜBER der
   Seite im Baum, könnte einen Kontext der Seite also nie lesen. */
type BackNavState = {
    /** Angemeldetes Ziel samt Adresse, für die es gilt. */
    override: (BackTarget & { path: string }) | null;
    setOverride: (value: (BackTarget & { path: string }) | null) => void;
};

export const useBackNavStore = create<BackNavState>((set) => ({
    override: null,
    setOverride: (override) => set({ override }),
}));

/**
 * Eine Seite meldet ihren eigenen Rückweg an — für alles, was der Adresse
 * nicht anzusehen ist (der Montagerapport kommt je nach `?from=` aus den
 * Dokumenten oder aus der Auftragsliste). `null`/`undefined` bedeutet: es
 * bleibt bei dem, was `resolveBackTarget` aus der Adresse liest.
 */
export const usePageBackTarget = (target: BackTarget | null | undefined) => {
    const { pathname } = useLocation();
    const path = normalize(pathname);
    const to = target?.to || null;
    // Ohne eigene Angabe trägt der Pfeil den Namen der Zielseite, sofern sie
    // eine Hauptseite ist — «Zurück zu Meine Dokumente» statt bloss «Zurück».
    const labelKey = target?.labelKey || (to ? mainPageLabelKey(to) : undefined);

    useEffect(() => {
        if (!to) return undefined;
        const { setOverride } = useBackNavStore.getState();
        setOverride({ to, labelKey, path });
        return () => {
            // Nur die EIGENE Anmeldung zurücknehmen: beim Seitenwechsel läuft
            // das Aufräumen der alten Seite nach dem Anmelden der neuen.
            const current = useBackNavStore.getState().override;
            if (current && current.path === path && current.to === to) setOverride(null);
        };
    }, [to, labelKey, path]);
};

/** Der gültige Rückweg der angezeigten Seite (Anmeldung schlägt Adresse). */
export const useBackTarget = (): BackTarget | null => {
    const { pathname } = useLocation();
    const override = useBackNavStore((state) => state.override);
    return useMemo(() => {
        const path = normalize(pathname);
        if (override && override.path === path) return { to: override.to, labelKey: override.labelKey };
        return resolveBackTarget(path);
    }, [override, pathname]);
};

/* ── 4. Woher die Person kam ─────────────────────────────────────────────────
   Führt der Rückweg genau auf die zuletzt verlassene Seite, ist ein echter
   Verlaufsschritt das bessere Werkzeug: die Liste kommt mit ihrem Suchbegriff,
   ihrer Seitenzahl und ihrer Scrollhöhe zurück statt frisch geladen. */
let previousPath: string | null = null;
let currentPath: string | null = null;

/** Einmal im MainLayout aufgerufen — hält die zuletzt verlassene Adresse fest. */
export const useBackNavTracker = () => {
    const { pathname } = useLocation();
    const path = normalize(pathname);
    useEffect(() => {
        if (currentPath === path) return;
        previousPath = currentPath;
        currentPath = path;
    }, [path]);
};

/** Wahr, wenn `to` die Seite ist, von der aus die aktuelle geöffnet wurde. */
export const cameFrom = (to: string): boolean => previousPath === normalize(to);
