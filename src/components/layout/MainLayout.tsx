import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LuMoon, LuSun } from '@/components/icons/lucideLocal';
import { useAuthStore } from '../../store/authStore';
import { isPathAllowed } from '@/lib/pageAccess';
import { isPathAllowedForTechnician } from '@/lib/access';
import { useMontageIsWorkspace } from '@/lib/useMontageWorkspace';
import { useThemeStore } from '../../store/themeStore';
import {
    Briefcase01 as FundProjectionScreenOutlined,
    // Verkauf trägt die steigende Kurve (Nutzerwunsch 15.08.2026) — der Koffer
    // bleibt den Projekten.
    TrendUp01 as SalesIcon,
    Building02 as BankOutlined,
    Building03 as ContactsOutlined,
    Calendar as CalendarOutlined,
    Clock as ClockCircleOutlined,
    Columns02 as AppearanceIcon,
    SwitchHorizontal01 as SwapOutlined,
    LogOut01 as LogoutOutlined,
    Menu02 as MenuOutlined,
    Package as InboxOutlined,
    // Produktion (19.09.2026) — die Fabrik.
    Factory as ProductionIcon,
    ListChecks as TasksModuleIcon,
    // Buchhaltung (16.09.2026) — der Beleg.
    Receipt as AccountingIcon,
    Plus as PlusOutlined,
    Settings01 as SettingOutlined,
    Truck01 as CarOutlined,
    User01 as UserOutlined,
    Building05 as TeamOutlined,
    Home01 as HomeOutlined,
    XClose as CloseOutlined,
} from '../icons/antIconCompat';
import {
    ADMIN_PERMISSION_NAMES,
    PERMISSION_TO_MODULE,
    isMenuSectionEnabled,
    isModuleKeyEnabled,
    isPermissionModuleEnabled,
    menuSectionModule,
    moduleForPath,
} from '../../lib/moduleCatalog';
import { useModuleAccess } from '../../lib/useEnabledModules';
import { useGuardedNavigate } from '../../store/navGuardStore';
import { useBackNavTracker } from '../../lib/backNav';
import { hrefFor, isModifiedClick } from '../../lib/navLink';
import { NotificationCenter } from './NotificationCenter';
import { AppSidebar, SIDEBAR_RAIL_WIDTH, SIDEBAR_SLIM_WIDTH, type QuickCreateItem } from './AppSidebar';
import { TopModuleNav } from './TopModuleNav';
import { BottomModuleNav } from './BottomModuleNav';
import { QuickBackButton } from './QuickBackButton';
import { RailBackButton } from './RailBackButton';
import { RequestsAppsMenu } from './RequestsAppsMenu';
import { TenantSwitcher } from './TenantSwitcher';
import { WorkspaceTabsProvider, WorkspaceTabLauncher, WorkspaceTabStrip } from './WorkspaceTabs';
import { SplitViewProvider, useSplitView, SPLIT_PANE_WINDOW_NAME } from './SplitViewContext';
import { SplitViewToggle } from './SplitViewToggle';
import { SecondaryPane } from './SecondaryPane';
import { PrimaryPane } from './PrimaryPane';
import { PaneErrorBoundary } from './PaneErrorBoundary';
import { NOTIFICATIONS_CHANGED_EVENT, notificationApi, type NotificationDto } from '../../lib/api/notifications';
import { fetchHeaderCounts } from '../../lib/api/headerCounts';
import { afterPageSettled } from '../../lib/utils/onIdle';
import { LanguageSwitcher } from '../ui-shared/LanguageSwitcher';
import { InstallAppButton } from '../ui-shared/InstallAppButton';
import { PersonAvatar } from '../ui-shared/PersonAvatar';
import { MailComposeHost } from '../mail/MailComposeHost';
import { WhatsNewHost } from '../updates/WhatsNewHost';
import { OutlookMark } from '../icons/OutlookMark';
import { TaskMark } from '../icons/TaskMark';
import { ToolbarSymbol } from '../icons/ToolbarSymbol';
import { SAMPLE_QUOTE_ITEM_ID, newestQuotePath } from '../updates/sampleQuote';
import { DAILY_REPORT_OPEN_EVENT } from '../../pages/tasks/components/dailyReport/dailyReportEvents';

const LazyReminderToasts = React.lazy(() =>
    import('../../pages/crm/components/ReminderToasts').then((module) => ({ default: module.ReminderToasts })),
);

/** Ambient, minute-granularity reminders must not compete with route LCP. */
const DeferredReminderToasts = () => {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const timerId = window.setTimeout(() => setReady(true), 4_000);
        return () => window.clearTimeout(timerId);
    }, []);

    if (!ready) return null;
    return (
        <React.Suspense fallback={null}>
            <LazyReminderToasts />
        </React.Suspense>
    );
};

const LazyDailyReportPrompt = React.lazy(() =>
    import('../../pages/tasks/components/dailyReport/DailyReportPrompt').then((module) => ({ default: module.DailyReportPrompt })),
);

/**
 * Gün sonu raporu (hafta içi 16:00) — wie die Erinnerungen erst nach dem ersten
 * Bild. Ein Klick auf «Gün sonu raporu» davor hängt es SOFORT ein; die
 * Anforderung wartet in dailyReportEvents.ts, bis das Fenster sie abholt
 * (16.09.2026, Samet: «tek tıkta açılmalı ama bazen açılmıyor»).
 */
const DeferredDailyReportPrompt = () => {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const timerId = window.setTimeout(() => setReady(true), 4_000);
        const now = () => setReady(true);
        window.addEventListener(DAILY_REPORT_OPEN_EVENT, now);
        return () => {
            window.clearTimeout(timerId);
            window.removeEventListener(DAILY_REPORT_OPEN_EVENT, now);
        };
    }, []);

    if (!ready) return null;
    return (
        <React.Suspense fallback={null}>
            <LazyDailyReportPrompt />
        </React.Suspense>
    );
};

const LazyTaskTimerDock = React.lazy(() =>
    import('../../pages/tasks/components/timerDock/TaskTimerDock').then((module) => ({ default: module.TaskTimerDock })),
);

const TASKS_MODULE_PERMISSIONS = ['tasks.view', 'tasks.manage', 'tasks.delete'];

/** Çalışan görev (15.09.2026): das kleine Fenster unten mit der laufenden Aufgabe — auf jeder Seite, nach dem ersten Bild. */
const DeferredTaskTimerDock = () => {
    const canUse = useAuthStore((state) => state.isAuthenticated
        && (state.isSystemAdmin || state.permissions.some((permission) => TASKS_MODULE_PERMISSIONS.includes(permission))));
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!canUse || ready) return undefined;
        return afterPageSettled(() => setReady(true), { minMs: 800, maxMs: 5_000 });
    }, [canUse, ready]);

    if (!ready || !canUse) return null;
    return (
        <React.Suspense fallback={null}>
            <LazyTaskTimerDock />
        </React.Suspense>
    );
};

/* ── Menü Tipleri ── */
/** `module`: explicit module tag for leaves that belong to a different module
    than their section (e.g. fieldwork pages inside the projects group). */
type MenuLeaf = {
    key: string;
    label: string;
    permission?: string;
    module?: string;
    /** Nur für die Administratorrolle (`Role.isSystemAdmin`). */
    adminOnly?: boolean;
    /** Recht ODER Administratorrolle — für Rechte, die die Administratorrolle
        erst beim nächsten Öffnen der Berechtigungen in ihre Rolle geschrieben
        bekommt (Zwei-Faktor, 15.09.2026). */
    permissionOrAdmin?: string;
    /** Eigenes Zeichen vor dem Namen (siehe AppSidebar). */
    icon?: (props: { size?: number; className?: string }) => React.JSX.Element;
};
type MenuIcon = React.ComponentType<any>;
type ModuleLauncherItem = {
    id: string;
    label: string;
    path: string;
    icon: MenuIcon;
    group: string;
    cardClassName?: string;
    iconClassName?: string;
    keywords?: string;
    permission?: string;
    feature?: 'projects';
};
type MenuSection =
    | { type: 'single'; key: string; path: string; label: string; icon: MenuIcon; feature?: 'projects' }
    | { type: 'group'; key: string; label: string; icon: MenuIcon; items: MenuLeaf[]; feature?: 'projects' };

const MENU_SECTIONS: MenuSection[] = [
    {
        type: 'single',
        key: '/',
        path: '/',
        label: 'nav.home',
        icon: HomeOutlined,
    },
    // Mesai (/attendance) is hidden from the menu while the page is reworked.
    // The route still resolves for anyone opening the URL directly.
    {
        type: 'single',
        key: '/calendar',
        path: '/calendar',
        label: 'nav.calendar',
        icon: CalendarOutlined,
    },
    // Personalmodul (Neubau 16.08.2026). Rollenverwaltung steht NICHT hier
    // (Vorgabe 14.08.2026): Stufen und Personentyp setzt die Berechtigungsseite
    // (Einstellungen → Berechtigungen). Die Route /roles bleibt als
    // Admin-Notausgang erreichbar, nur ohne Menüeintrag.
    {
        type: 'group',
        key: 'personel',
        label: 'nav.personnel',
        icon: TeamOutlined,
        /* VIER EINTRÄGE (Vorgabe 26.08.2026): Personalliste, Stempeluhr,
           Arbeitszeiterfassung, Anträge.

           WAS WEGFIEL UND WOHIN: «Detail-Rapport» und «Buchhaltungs-Rapport»
           sind in der Arbeitszeiterfassung aufgegangen — sie zeigten dieselben
           Stempelungen einmal je Tag und einmal je Person, und die neue Seite
           kann beides (aufgeklappt bzw. zusammengefasst). Die «Schichtplanung»
           ist eine EINSTELLUNG und steht jetzt unter Einstellungen → Module →
           Personal, neben Feiertagen und Urlaubsanspruch.

           «Anträge» war DREIMAL im Menü (stellen / freigeben / buchen). Das ist
           EIN Eintrag mit Reitern, denn es waren immer dieselben Zeilen.

           Alle alten Adressen leiten weiter — siehe appPageRoutes.tsx. */
        items: [
            { key: '/personnel', label: 'nav.personnelList' },
            // Stempeluhr: der Tabletbildschirm. Kein Recht davor — wer sich
            // anmelden kann, darf die Uhr aufmachen; gestempelt wird ohnehin
            // nur mit einem gültigen QR-Ausweis.
            { key: '/personnel/terminal', label: 'nav.personnelTerminal' },
            { key: '/personnel/time-records', label: 'nav.personnelTimeRecords', permission: 'attendance.read' },
            // Anträge stellt jede Person; die Reiter darin blenden sich nach
            // Rolle selbst ein.
            { key: '/personnel/requests', label: 'nav.personnelRequests' },
        ],
    },
    {
        type: 'group',
        key: 'crm',
        label: 'nav.crm',
        icon: ContactsOutlined,
        /* VIER EINTRÄGE, MEHR NICHT (10.09.2026, Vorgabe Samet).
           Das Menü führt nur noch, was eine eigene LISTE ist:

             Kunden        wen wir kennen
             Anfragen      wer uns erreichen will, aber noch niemand ist
             Kommunikation was mit einem Kunden besprochen wurde
             Aktivitäten   was im Haus geschehen ist

           WOHIN DER REST GING — keine Seite wurde gelöscht, alle Adressen
           antworten weiter:
             • Aufgaben und Postfach stehen im APPS-ZEICHEN im Kopf
               («verschieben wir die Aufgaben und die E-Mails in den
               Apps-Bereich; nehmen wir sie aus dem Seitenmodul heraus»).
             • Ansprechpartner (/crm/contacts) sind Teil der Kundenakte —
               dort werden sie gepflegt, ein zweiter Menüpunkt daneben war eine
               Doppelung.
             • Erinnerungen (/crm/reminders) und Schnellerfassung
               (/crm/quick-entry) sind Handgriffe, keine Bereiche: sie werden
               aus Kommunikation und Aufgaben heraus bedient.
             • Checklisten (/crm/forms) hängen an Auftrag und Montage —
               ihr Menüeintrag steht darum in der Gruppe Projekte.

           Wer eine dieser Adressen als Lesezeichen hat, kommt weiterhin an —
           und die Rollentabelle führt sie unverändert (siehe pageCatalog.ts). */
        items: [
            // Genel Bakış (/crm/overview) is hidden from the menu while the
            // dashboard is reworked; the route itself still resolves.
            { key: '/crm/customers', label: 'nav.customerList', permission: 'crm.customers.view' },
            { key: '/crm/enquiries', label: 'nav.crmEnquiries', permission: 'crm.customers.view' },
            { key: '/crm/communication', label: 'nav.crmCommunication', permission: 'crm.customers.view' },
            { key: '/crm/activities', label: 'nav.crmActivities', permission: 'crm.customers.view' },
        ],
    },
    // Verkauf (2026-08-14): Angebote und Aufträge sind aus dem CRM
    // herausgelöst — CRM führt die Kundenbeziehung, Verkauf die Abschlüsse.
    {
        type: 'group',
        key: 'sales',
        label: 'nav.sales',
        icon: SalesIcon,
        items: [
            { key: '/sales/quotes', label: 'nav.tenderManagement', permission: 'tenders.view' },
            // OSP (04.09.2026): Offertanfragen der Offitec Selection Platform.
            { key: '/sales/osp', label: 'nav.salesOsp', permission: 'tenders.view' },
            { key: '/sales/orders', label: 'nav.myOrders', permission: 'crm.customers.view' },
            // Zusatzaufträge / Nachträge (05.09.2026): alle NT-Belege in einer
            // Liste, neben den Aufträgen — jeder mit eigenem PDF.
            { key: '/sales/addon-orders', label: 'nav.addonOrders', permission: 'crm.customers.view' },
        ],
    },
    // Buchhaltung (16.09.2026, Schritt 5): die Rechnungen wohnen an EINER
    // Stelle. Verkauf und Projekte zeigen nur noch den Stand und führen
    // hierher; die alten Adressen unter /sales/invoices leiten weiter.
    {
        type: 'group',
        key: 'accounting',
        label: 'nav.accounting',
        icon: AccountingIcon,
        items: [
            { key: '/accounting/invoices', label: 'nav.outgoingInvoices', permission: 'billing.view', module: 'billing' },
            // «Zu verrechnen» (17.09.2026, Schritt 7).
            { key: '/accounting/to-bill', label: 'nav.toBill', permission: 'billing.view', module: 'billing' },
        ],
    },
    {
        type: 'group',
        key: 'projects',
        label: 'nav.projects',
        feature: 'projects',
        icon: FundProjectionScreenOutlined,
        items: [
            { key: '/projects', label: 'nav.projectManagement', permission: 'projects.view' },
            /* Checklisten (/crm/forms): die Listen, die Monteur und
               Projektleiter ausfüllen — mit dem CRM-Menü auf vier Einträge
               verlor der Bereich seinen Eintrag, obwohl die Seiten weiter
               antworten. Er steht hier, weil die Checklisten an Auftrag,
               Projekt und Montage hängen; die Adresse bleibt /crm/forms
               (Lesezeichen, Rollentabelle und der Schlüssel `crm.forms`
               bleiben damit unverändert gültig). */
            { key: '/crm/forms', label: 'nav.crmForms', permission: 'projects.view' },
        ],
    },
    {
        // Produktion (19.09.2026): Produktionsaufträge — Projekte, Aufträge und
        // ihre Geräte gegen die bestätigten Lieferantenbestellungen.
        type: 'group',
        key: 'production',
        label: 'nav.production',
        icon: ProductionIcon,
        items: [
            { key: '/production/orders', label: 'nav.productionOrders', permission: 'production.view' },
            { key: '/production/lines', label: 'nav.productionLines', permission: 'production.view' },
            { key: '/production/panels', label: 'nav.panels', permission: 'panels.view' },
        ],
    },
    {
        type: 'group',
        key: 'inventory',
        label: 'nav.inventory',
        icon: InboxOutlined,
        items: [
            { key: '/inventory/articles', label: 'nav.articles', permission: 'inventory.view' },
            { key: '/inventory/stock', label: 'nav.stock', permission: 'inventory.view' },
            { key: '/inventory/orders', label: 'nav.inventoryOrders', permission: 'inventory.view' },
            { key: '/inventory/suppliers', label: 'nav.suppliers', permission: 'inventory.view' },
        ],
    },
    {
        // Görevler (13.09.2026): eigenständiges Aufgabenmodul — die Seiten der Leitung
        // (Freigaben, Kişiler) stehen in den Reitern des Moduls, nicht hier: das
        // Rollenpaket gibt Seiten frei, keine Stufen (siehe visibleMenuSections).
        type: 'group',
        key: 'tasksModule',
        label: 'nav.tasksModule',
        icon: TasksModuleIcon,
        items: [
            { key: '/tasks', label: 'nav.tasksModuleList', permission: 'tasks.view' },
            // 13.09.2026 (Samet): Administratorrolle sieht alles, alle anderen nur Görevler + Sohbet.
            { key: '/tasks/board', label: 'nav.tasksModuleBoard', permission: 'tasks.view', adminOnly: true },
            { key: '/tasks/approvals', label: 'nav.tasksModuleApprovals', permission: 'tasks.view', adminOnly: true },
            { key: '/tasks/people', label: 'nav.tasksModulePeople', permission: 'tasks.view', adminOnly: true },
            { key: '/tasks/chat', label: 'nav.tasksModuleChat', permission: 'tasks.view' },
            { key: '/tasks/reports', label: 'nav.tasksModuleReports', permission: 'tasks.view', adminOnly: true },
        ],
    },
    {
        type: 'group',
        key: 'logistics',
        label: 'nav.logistics',
        icon: CarOutlined,
        items: [
            { key: '/logistics/shipments', label: 'nav.shipments', permission: 'logistics.view' },
            { key: '/logistics/shipments/new', label: 'nav.newShipment', permission: 'logistics.manage' },
        ],
    },

    {
        type: 'group',
        key: 'maintenance',
        label: 'nav.maintenance',
        icon: CalendarOutlined,
        items: [
            { key: '/maintenance', label: 'nav.maintenanceDashboard', permission: 'maintenance.contracts.manage' },
            { key: '/maintenance/contracts', label: 'nav.contracts', permission: 'maintenance.contracts.manage' },
            { key: '/maintenance/tasks', label: 'nav.maintenanceTasks', permission: 'maintenance.contracts.manage' },
            { key: '/maintenance/tasks?view=reports', label: 'nav.maintenanceReports', permission: 'maintenance.reports.manage' },
            { key: '/maintenance/regie', label: 'nav.regie', permission: 'regie.calls.manage' },
        ],
    },

    {
        type: 'group',
        key: 'settings',
        label: 'nav.settings',
        icon: SettingOutlined,
        items: [
            { key: '/settings/pdf', label: 'nav.pdfSettings' },
            // Berechtigungen (Personen, Modulstufen) — Admin-Fläche wie die
            // Firmenkategorien; Erinnerungen stehen allen offen (Speichern ist
            // serverseitig geschützt).
            { key: '/settings/authorization', label: 'nav.authorizationSettings', permission: 'roles.manage', module: 'administration' },
            // Moduleinstellungen (Erinnerungen je Modul) — module
            // 'administration': sichtbar/erreichbar auch, wenn die
            // Firmenkategorie das settings-Modul nicht führt (wie die
            // Firmenkategorien selbst) — Speichern bleibt serverseitig gegated.
            { key: '/settings/modules', label: 'nav.moduleSettings', module: 'administration' },
            // Mail and checklists are project features (their routes sit behind
            // the project-module guard), so the leaves follow the projects module.
            { key: '/settings/mail', label: 'nav.mailSettings', permission: 'mail.manage', module: 'projects' },
            // Company categories map companies onto module bundles: an admin
            // surface that no category may hide (module 'administration').
            { key: '/settings/company-categories', label: 'nav.companyCategories', permission: 'roles.manage', module: 'administration' },
            // Firmenübertragungen (19.09.2026): aus welchen Firmen die Produktion
            // ihre Projekte liest — Verwaltungsfläche wie die Firmenkategorien.
            { key: '/settings/company-transfers', label: 'nav.companyTransfers', permission: 'roles.manage', module: 'administration' },
            /* Upload (Vorgabe 17.08.2026): der Stammdatenimport der IT sitzt
               NUR hier — die frühere eigene Modulgruppe oben ist entfernt.
               Modul 'administration' wie die Firmenkategorien daneben, damit
               eine Firmenkategorie ohne settings-Modul die IT nicht aussperrt;
               ein RECHT steht bewusst nicht davor (die IT trägt selten die
               Lagerrolle), die Hürde ist das Kennwort der Schleuse. */
            { key: '/settings/upload', label: 'nav.upload', module: 'administration' },
            /* Zwei-Faktor (Aegis) neu einrichten (15.09.2026): nicht für alle —
               die Rollenzeile «Einstellungen → Zwei-Faktor» gibt die Seite frei
               (pageAccess), das Recht deckt Konten ohne Stufenkarte ab. */
            { key: '/settings/two-factor', label: 'nav.twoFactorSettings', module: 'administration', permissionOrAdmin: 'security.mfa.view' },
        ],
    },
];

const MODULE_LAUNCHER_ITEMS: ModuleLauncherItem[] = [
    {
        id: 'create-tender',
        label: 'nav.quickActionsGroup.newTender',
        path: '/sales/quotes/new',
        icon: PlusOutlined,
        group: 'nav.moduleGroups.quickAction',
        cardClassName: 'border-sky-200/60 bg-sky-50/70 text-sky-950 shadow-sky-900/5 hover:bg-sky-100/80',
        iconClassName: 'text-sky-600',
        keywords: 'yeni teklif teklif olustur crm new tender offer verkauf sales',
        permission: 'tenders.manage',
    },
    {
        id: 'crm-quick-entry',
        label: 'nav.crmQuickEntry',
        path: '/crm/quick-entry',
        icon: PlusOutlined,
        group: 'nav.moduleGroups.quickAction',
        cardClassName: 'border-teal-200/60 bg-teal-50/70 text-teal-950 shadow-teal-900/5 hover:bg-teal-100/80',
        iconClassName: 'text-teal-600',
        keywords: 'schnellerfassung telefonnotiz notiz aufgabe erinnerung quick entry call note task reminder',
        permission: 'crm.customers.view',
    },
    {
        id: 'add-project',
        label: 'nav.projectManagement',
        path: '/projects',
        icon: FundProjectionScreenOutlined,
        group: 'nav.moduleGroups.quickAction',
        cardClassName: 'border-violet-200/60 bg-violet-50/70 text-violet-950 shadow-violet-900/5 hover:bg-violet-100/80',
        iconClassName: 'text-violet-600',
        keywords: 'yeni proje proje ekle proje yonetimi project management',
        permission: 'projects.view',
        feature: 'projects',
    },
    {
        id: 'sales-orders',
        label: 'nav.myOrders',
        path: '/sales/orders',
        icon: BankOutlined,
        group: 'nav.moduleGroups.sales',
        cardClassName: 'border-indigo-200/60 bg-indigo-50/70 text-indigo-950 shadow-indigo-900/5 hover:bg-indigo-100/80',
        iconClassName: 'text-indigo-600',
        keywords: 'satis siparisi siparis order my orders',
        permission: 'crm.customers.view',
    },
    {
        id: 'customers',
        label: 'nav.customerList',
        path: '/crm/customers',
        icon: ContactsOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'musteri musteri listesi crm customers',
        permission: 'crm.customers.view',
    },
    /* SEIT DEM 10.09.2026 führt das CRM-Menü nur noch vier Listen; Postfach und
       Aufgaben wohnen im Apps-Zeichen, Ansprechpartner/Erinnerungen/
       Schnellerfassung/Checklisten sind Teil ihrer Seiten. Damit KEINE dieser
       Seiten unauffindbar wird, stehen sie hier im Starter — die Suche im Menü
       findet sie unter ihrem Namen wie zuvor. */
    {
        id: 'crm-enquiries',
        label: 'nav.crmEnquiries',
        path: '/crm/enquiries',
        icon: ContactsOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'anfrage anfragen anfrageformular formular enquiry enquiries request talep',
        permission: 'crm.customers.view',
    },
    {
        id: 'crm-activities',
        label: 'nav.crmActivities',
        path: '/crm/activities',
        icon: ContactsOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'aktivitaet aktivitaeten verlauf zeitleiste activities timeline aktiviteler',
        permission: 'crm.customers.view',
    },
    {
        id: 'crm-mail',
        label: 'nav.crmMail',
        path: '/crm/mail',
        icon: OutlookMark,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'postfach mail email e-mail posteingang inbox nachrichten posta',
        permission: 'crm.customers.view',
    },
    {
        id: 'crm-tasks',
        label: 'nav.crmTasks',
        path: '/crm/tasks',
        icon: TaskMark,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'aufgabe aufgaben pendenzen tasks gorevler',
        permission: 'crm.customers.view',
    },
    {
        id: 'crm-contacts',
        label: 'nav.crmContacts',
        path: '/crm/contacts',
        icon: ContactsOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'ansprechpartner kontakte contacts yetkili kisiler',
        permission: 'crm.customers.view',
    },
    {
        id: 'crm-reminders',
        label: 'nav.crmReminders',
        path: '/crm/reminders',
        icon: ContactsOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'erinnerung erinnerungen reminders hatirlatmalar',
        permission: 'crm.customers.view',
    },
    {
        id: 'crm-forms',
        label: 'nav.crmForms',
        path: '/crm/forms',
        icon: ContactsOutlined,
        group: 'nav.moduleGroups.crm',
        cardClassName: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-950 shadow-emerald-900/5 hover:bg-emerald-100/80',
        iconClassName: 'text-emerald-600',
        keywords: 'checkliste checklisten formulare vorlagen forms checklists kontrol listeleri',
        permission: 'crm.customers.view',
    },
    {
        id: 'tenders',
        label: 'nav.tenderManagement',
        path: '/sales/quotes',
        icon: SalesIcon,
        group: 'nav.moduleGroups.sales',
        cardClassName: 'border-amber-200/60 bg-amber-50/70 text-amber-950 shadow-amber-900/5 hover:bg-amber-100/80',
        iconClassName: 'text-amber-600',
        keywords: 'teklifler teklif yonetimi crm tenders offers',
        permission: 'tenders.view',
    },
    {
        id: 'inventory',
        label: 'nav.inventory',
        path: '/inventory/articles',
        icon: InboxOutlined,
        group: 'nav.moduleGroups.inventory',
        cardClassName: 'border-cyan-200/60 bg-cyan-50/70 text-cyan-950 shadow-cyan-900/5 hover:bg-cyan-100/80',
        iconClassName: 'text-cyan-600',
        keywords: 'stok urunler malzeme depo inventory stock products',
        permission: 'inventory.view',
    },
    {
        id: 'production',
        label: 'nav.production',
        path: '/production/orders',
        icon: ProductionIcon,
        group: 'nav.moduleGroups.inventory',
        cardClassName: 'border-sky-200/60 bg-sky-50/70 text-sky-950 shadow-sky-900/5 hover:bg-sky-100/80',
        iconClassName: 'text-sky-600',
        keywords: 'uretim uretim siparisleri cihaz maliyet production produktion auftraege geraete kosten',
        permission: 'production.view',
    },
    {
        id: 'tasksModule',
        label: 'nav.tasksModule',
        path: '/tasks',
        icon: TasksModuleIcon,
        group: 'nav.moduleGroups.tasks',
        cardClassName: 'border-blue-200/60 bg-blue-50/70 text-blue-950 shadow-blue-900/5 hover:bg-blue-100/80',
        iconClassName: 'text-blue-600',
        keywords: 'gorevler gorev pano kontrol listesi sayac tasks board checklist aufgaben',
        permission: 'tasks.view',
    },
    {
        id: 'maintenance',
        label: 'nav.maintenance',
        path: '/maintenance',
        icon: CalendarOutlined,
        group: 'nav.moduleGroups.maintenance',
        cardClassName: 'border-rose-200/60 bg-rose-50/70 text-rose-950 shadow-rose-900/5 hover:bg-rose-100/80',
        iconClassName: 'text-rose-600',
        keywords: 'bakim bakim panosu randevu sozlesme maintenance',
        permission: 'maintenance.contracts.manage',
    },
    {
        id: 'regie',
        label: 'nav.regie',
        path: '/maintenance/regie',
        icon: ClockCircleOutlined,
        group: 'nav.moduleGroups.maintenance',
        cardClassName: 'border-fuchsia-200/60 bg-fuchsia-50/70 text-fuchsia-950 shadow-fuchsia-900/5 hover:bg-fuchsia-100/80',
        iconClassName: 'text-fuchsia-600',
        keywords: 'regie ariza operasyon servis cagri',
        permission: 'regie.calls.manage',
    },
    {
        id: 'employees',
        label: 'nav.employeeList',
        path: '/employees',
        icon: TeamOutlined,
        group: 'nav.moduleGroups.personnel',
        cardClassName: 'border-lime-200/60 bg-lime-50/70 text-lime-950 shadow-lime-900/5 hover:bg-lime-100/80',
        iconClassName: 'text-lime-600',
        keywords: 'personel calisan ekip rol employees staff',
    },
];

/** True when this window is the split view's secondary-pane iframe — render a
    bare shell (no header/sidebar) and skip app-chrome side effects. */
const IS_SPLIT_PANE = typeof window !== 'undefined' && window.name === SPLIT_PANE_WINDOW_NAME;
const NAVIGATION_MODE_KEY = 'offitec:navigation-mode';
type NavigationMode = 'sidebar' | 'top' | 'bottom';

/* ── DER EIGENE RAHMEN DER GERÄTESEITE (24.09.2026, Vorgabe Samet) ─────────
   «Bütün sidebar ikonları küçülecek … üst tab olmayacak, şimşek gidecek, +
   gidecek, çift ekran gidecek, tenant seçimi gidecek; takvim zaten sidebarda
   var; bildirim, dil, profil küçülsün ve sidebar'a eklensin — üst barda bir
   şey kalmayacak. Sadece bu ürün sayfasına özel.»
   Auf dieser EINEN Adresse zeichnet der Rahmen keine Kopfleiste, keine Reiter
   und kein Dock, sondern die schmale Leiste (`AppSidebar variant="slim"`) mit
   Glocke, Sprache und Profil unten — in jeder Navigationsart, auch auf dem
   Telefon. Alles andere bleibt, wie es war. */
const DEVICE_FOCUS_PATH = /^\/production\/orders\/[^/]+\/devices\/[^/]+\/?$/;
const isDeviceFocusPath = (pathname: string): boolean => DEVICE_FOCUS_PATH.test(pathname);

/* ── İç Layout ── */
const MainLayoutInner: React.FC = () => {
    const navigate = useNavigate();
    // Menu / tab switches use this so leaving a tender with unsaved changes prompts
    // to save first; direct `navigate` stays for programmatic redirects.
    const guardedNavigate = useGuardedNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation();

    // Hält fest, von welcher Seite aus die angezeigte geöffnet wurde — der
    // Zurück-Pfeil der Marke geht dann einen echten Verlaufsschritt und die
    // Liste kommt mit Suchbegriff und Scrollhöhe zurück (lib/backNav.ts).
    useBackNavTracker();

    const { user, logout, permissions, pageAccess, tenants, selectedTenantId, isSystemAdmin } = useAuthStore();
    const { splitMode, isSplit, secondaryPath, secondaryCurrentPath, exitSplit, openSecondary } = useSplitView();
    const { isDarkMode, toggleTheme } = useThemeStore();

    const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
    // Sidebar is the default and remains the unchanged primary layout. The
    // alternative is an explicit per-browser preference exposed in the
    // profile menu; older installations have no key and therefore stay on the
    // sidebar automatically.
    const [navigationMode, setNavigationMode] = useState<NavigationMode>(() => {
        if (typeof window === 'undefined') return 'sidebar';
        const stored = window.localStorage.getItem(NAVIGATION_MODE_KEY);
        return stored === 'top' || stored === 'bottom' ? stored : 'sidebar';
    });
    const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationDto[]>([]);
    // Server-side unread total for the active company — the fetched list is
    // capped, so counting it locally undercounts the badge.
    const [unreadCount, setUnreadCount] = useState(0);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
    const [useNativeTouchDrawer, setUseNativeTouchDrawer] = useState(() => typeof window !== 'undefined'
        && Capacitor.isNativePlatform()
        && (navigator.maxTouchPoints > 0 || window.matchMedia('(any-pointer: coarse)').matches));
    /* WO DAS DOCK STEHEN DARF (Vorgabe Samet, 21.09.2026: «iPad'de de bu alt
       tab çıkabilsin»). Nicht mehr «Desktop oder gar nicht»: gefragt ist die
       FLÄCHE, nicht der Zeiger. Ein iPad im Hochformat (820 × 1180) und im
       Querformat trägt die Kapsel bequem; ein Telefon fällt durch, quer
       (844 × 390) an der Höhe, hochkant an der Breite — dort bleibt es bei
       Kopfleiste und Schublade. */
    const [isDockViewport, setIsDockViewport] = useState(() => typeof window !== 'undefined'
        && window.matchMedia('(min-width: 700px) and (min-height: 600px)').matches);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const pageScrollRef = useRef<HTMLDivElement>(null);
    const primaryRoute = location.pathname + location.search;
    const [primaryLocation, setPrimaryLocation] = useState({
        entryPath: primaryRoute,
        currentPath: primaryRoute,
    });
    const primaryCurrentPath = primaryLocation.entryPath === primaryRoute
        ? primaryLocation.currentPath
        : primaryRoute;
    const reportPrimaryLocation = useCallback((path: string) => {
        setPrimaryLocation((current) => (
            current.entryPath === primaryRoute && current.currentPath === path
                ? current
                : { entryPath: primaryRoute, currentPath: path }
        ));
    }, [primaryRoute]);
    // Effective module set (company category ∩ the role's package) — shared with
    // the dashboard tiles so the sidebar and Home can never disagree.
    const { projectModuleEnabled, packageModules, enabledModules } = useModuleAccess();
    /* Ist dieses Konto ein Monteur? Dann ist der Montagebildschirm die ganze
       Anwendung: kein Menue, kein Schnellzugriff, keine Bueroseite ueber die
       Adresszeile. DIESELBE Frage wie im MontageGuard und in der Bruecke
       ('/' -> /montage) -- ein einziger Ausdruck, sonst schieben sich die
       Weiterleitungen gegenseitig hin und her. */
    const isTechnicianWorkspace = useMontageIsWorkspace();
    const visibleMenuSections = useMemo(() => {
        // Ein Monteur hat kein Menue: sein Arbeitsplatz ist der eine rote
        // Bildschirm, und der traegt seine Wege selbst (die vier Kacheln).
        if (isTechnicianWorkspace) return [];
        return MENU_SECTIONS.flatMap((section): MenuSection[] => {
            if (section.feature === 'projects' && !projectModuleEnabled) return [];
            if (section.type === 'single') {
                return isMenuSectionEnabled(section.key, enabledModules) ? [section] : [];
            }
            // A leaf with its own module tag follows that module (fieldwork pages
            // live inside the projects/maintenance groups); untagged leaves follow
            // the section's module. Empty groups disappear entirely.
            const sectionEnabled = isMenuSectionEnabled(section.key, enabledModules);
            const sectionModule = menuSectionModule(section.key);
            const items = section.items.flatMap((item): MenuLeaf[] => {
                const visible = item.module
                    ? isModuleKeyEnabled(item.module, enabledModules)
                    : sectionEnabled;
                if (!visible) return [];
                if (item.adminOnly && !isSystemAdmin) return [];
                if (item.permissionOrAdmin && !isSystemAdmin && !permissions.includes(item.permissionOrAdmin)) return [];
                // Seitenrechte der Rolle (17.08.2026): steht die Seite im
                // Katalog und gibt die Rolle sie nicht frei, verschwindet der
                // Eintrag. Seiten ausserhalb des Katalogs bleiben unberührt.
                if (!isPathAllowed(pageAccess, item.key)) return [];
                // The role's package decides which pages a person sees — the
                // role's permissions then only matter inside
                // the page. So a leaf whose module is in the package shows even
                // without the permission. Admin pages (roles.manage & co.) never bypass.
                const leafModule = item.module ?? sectionModule;
                if (packageModules && leafModule && packageModules.has(leafModule)
                    && item.permission && !ADMIN_PERMISSION_NAMES.has(item.permission)) {
                    return [{ ...item, permission: undefined }];
                }
                return [item];
            });
            if (!items.length) return [];
            return [{ ...section, items }];
        });
    }, [projectModuleEnabled, enabledModules, packageModules, pageAccess, isTechnicianWorkspace, isSystemAdmin, permissions]);
    /* Seitenwächter (17.08.2026): eine gesperrte Seite darf auch über die
       Adresszeile nicht aufgehen. Ohne Regeln (leere Karte) greift nichts —
       siehe lib/pageAccess.ts. Der Server bleibt die eigentliche Schranke.

       AUSNAHME Montage: dort entscheidet `MontageGuard` allein (montageRoutes
       → useMontageIsWorkspace). Der Technikerarbeitsplatz steht auch Rollen
       offen, deren Stufenkarte keine Zeile «Montage» trägt — Altrollen etwa,
       die der Server aus ihren Rechten zurückrechnet. Prüfte dieser Wächter
       mit, würfe er genau die wieder hinaus, die der MontageGuard eben
       hereingelassen hat, und die Brücke ('/' → /montage) schickte sie sofort
       zurück: die Person landete auf der Startseite statt auf ihrem roten
       Arbeitsplatz. */
    useEffect(() => {
        /* Monteure zuerst: fuer sie IST der Arbeitsplatz die Anwendung, also
           fuehrt jede fremde Adresse dorthin zurueck -- nicht auf '/', denn
           die Startseite schickte sie nur wieder hierher. Die Stufenkarte
           taugt hier nicht als Schranke: der Server rechnet Altrollen ihre
           Karte aus den Rechten zurueck, und `projects.view` oeffnet neben der
           Montage auch die Projektliste des Bueros. */
        if (isTechnicianWorkspace) {
            if (isPathAllowedForTechnician(location.pathname, pageAccess)) return;
            navigate('/montage', { replace: true });
            return;
        }
        if (location.pathname.startsWith('/montage')) return;
        if (isPathAllowed(pageAccess, location.pathname)) return;
        navigate('/', { replace: true });
    }, [location.pathname, navigate, pageAccess, isTechnicianWorkspace]);

    const moduleLauncherItems = useMemo(() => {
        // Suche und Schnellzugriff in der Kopfzeile waren der zweite Weg ins
        // Buero -- fuer einen Monteur bleiben beide leer.
        if (isTechnicianWorkspace) return [];
        return MODULE_LAUNCHER_ITEMS.filter((item) => {
            const featureEnabled = item.feature !== 'projects' || projectModuleEnabled;
            if (!featureEnabled || !isPermissionModuleEnabled(item.permission, enabledModules)) return false;
            if (!isPathAllowed(pageAccess, item.path)) return false;
            if (!item.permission || permissions.includes(item.permission)) return true;
            // Same package bypass as the sidebar: the role's package grants
            // the page, the role's permissions govern actions inside it.
            const moduleKey = PERMISSION_TO_MODULE.get(item.permission);
            return Boolean(packageModules && moduleKey && packageModules.has(moduleKey)
                && !ADMIN_PERMISSION_NAMES.has(item.permission));
        });
    }, [permissions, projectModuleEnabled, enabledModules, packageModules, pageAccess, isTechnicianWorkspace]);
    const activeLocale = useMemo(() => {
        const language = i18n.resolvedLanguage || i18n.language || 'tr';
        if (language.startsWith('de')) return 'de-DE';
        if (language.startsWith('en')) return 'en-US';
        return 'tr-TR';
    }, [i18n.language, i18n.resolvedLanguage]);
    // Quick-create actions surfaced by the sidebar three-dot button ("the new card").
    /* GANZ VORN DAS ANGEBOT (29.08.2026, Vorgabe Samet: erst «leg in die
       Schnellzugriffe einen Knopf für ein Angebot, das nicht in die Datenbank
       geht», dann «öffne ein Angebot aus unserer Standard-Angebotsseite»).
       Der Knopf öffnet also das zuletzt angelegte Angebot in der gewohnten
       Maske und legt selbst nichts an — die Bedingung von damals gilt weiter.
       Die Ankündigung nach dem Update führt am Schluss denselben Weg, um dort
       den Zurück-Pfeil zu zeigen. */
    const quickCreateItems: QuickCreateItem[] = useMemo(
        () => [
            {
                id: SAMPLE_QUOTE_ITEM_ID,
                label: t('sample.quickCreate'),
                icon: SalesIcon as MenuIcon,
            },
            ...moduleLauncherItems.slice(0, 8).map((item) => ({
                id: item.id,
                label: t(item.label),
                icon: item.icon,
                iconClassName: item.iconClassName,
            })),
        ],
        [moduleLauncherItems, t],
    );


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsProfileDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        window.localStorage.setItem(NAVIGATION_MODE_KEY, navigationMode);
    }, [navigationMode]);

    /* A table starts with the SVG's gray header band. Once that header sticks
       to the page scrollport, mark it so CSS can present it as a separate
       white card, matching the scrolled reference without changing the
       table's initial appearance. */
    useEffect(() => {
        const scroller = pageScrollRef.current;
        if (!scroller) return;

        let animationFrame = 0;
        const updateStickyTableHeaders = () => {
            animationFrame = 0;
            const scrollportTop = scroller.getBoundingClientRect().top;
            const headers = scroller.querySelectorAll<HTMLTableSectionElement>(
                'table:not([role="grid"]):not([data-unstyled-table]) > thead',
            );

            // Read every geometry value first, then update attributes. Mixing an
            // attribute write with the next geometry read forced a new layout
            // for each table.
            const measurements = Array.from(headers, (header) => {
                const table = header.closest('table');
                if (!table) return { header, isStuck: false };
                const tableRect = table.getBoundingClientRect();
                const headerHeight = header.getBoundingClientRect().height;
                return {
                    header,
                    isStuck: tableRect.top < scrollportTop
                        && tableRect.bottom > scrollportTop + headerHeight,
                };
            });
            measurements.forEach(({ header, isStuck }) => {
                header.toggleAttribute('data-scroll-stuck', isStuck);
            });
        };
        const scheduleUpdate = () => {
            if (animationFrame) return;
            animationFrame = window.requestAnimationFrame(updateStickyTableHeaders);
        };

        scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);

        return () => {
            scroller.removeEventListener('scroll', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);
            if (animationFrame) window.cancelAnimationFrame(animationFrame);
            scroller.querySelectorAll('[data-scroll-stuck]').forEach((header) => {
                header.removeAttribute('data-scroll-stuck');
            });
        };
    }, [isSplit, location.pathname, selectedTenantId]);

    useEffect(() => {
        if (!isNotificationPanelOpen) return;
        let cancelled = false;
        setNotificationsLoading(true);
        // Erst lesen, DANN auf dem Server als gelesen stempeln: die Zentrale
        // zeigt die blauen Punkte, mit denen sie aufging; das Abzeichen an der
        // Glocke fällt trotzdem sofort.
        notificationApi.list({ limit: 40 })
            .then((rows) => { if (!cancelled) setNotifications(rows); })
            .catch(() => { if (!cancelled) setNotifications([]); })
            .finally(() => {
                if (cancelled) return;
                setNotificationsLoading(false);
                void notificationApi.markAllRead().catch(() => undefined);
                setUnreadCount(0);
            });
        return () => { cancelled = true; };
    }, [isNotificationPanelOpen]);

    useEffect(() => {
        // The pane iframe shows no bell — don't duplicate the polling.
        if (!user?.id || IS_SPLIT_PANE) return;
        // Notifications belong to exactly one company: drop the previous
        // company's list/badge immediately on switch instead of letting stale
        // rows linger until (or if) the refetch lands.
        setNotifications([]);
        setUnreadCount(0);
        // The badge is useful but not render-critical. The panel fetches its own
        // list when opened, so eagerly downloading unread rows duplicated work
        // and put a slow notification endpoint in the quote's critical chain.
        // Only fetch the count, after the route has had ample time to settle.
        const refresh = () => {
            notificationApi.unreadCount()
                .then(setUnreadCount)
                .catch(() => undefined);
        };
        // The first figure rides along with the apps menu's counters — one
        // request for every header badge (lib/api/headerCounts), sent once
        // the page's own data is in.
        const cancelSettled = afterPageSettled(() => {
            fetchHeaderCounts(useAuthStore.getState().permissions.includes('crm.customers.view'))
                .then((counts) => { if (counts.unreadNotifications !== undefined) setUnreadCount(counts.unreadNotifications); })
                .catch(() => undefined);
        });
        // Der Wecker rechts meldet frische Benachrichtigungen — die Glocke zählt nach.
        window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
        return () => {
            cancelSettled();
            window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
        };
    }, [user?.id, selectedTenantId]);

    useEffect(() => {
        const mql = window.matchMedia('(max-width: 1023px)');
        const onChange = (event: MediaQueryListEvent) => {
            setIsMobile(event.matches);
            if (!event.matches) setIsMobileSidebarOpen(false);
        };
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        const mql = window.matchMedia('(min-width: 700px) and (min-height: 600px)');
        const onChange = (event: MediaQueryListEvent) => setIsDockViewport(event.matches);
        mql.addEventListener('change', onChange);
        setIsDockViewport(mql.matches);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    // Native Elo tablets are physically wide enough to cross the desktop
    // breakpoint, but their primary interaction is touch. Use the same drawer
    // as phones so it has a hamburger opener, X/backdrop close controls and
    // accordion menu rows instead of a hover-dependent desktop flyout.
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        const coarseMql = window.matchMedia('(any-pointer: coarse)');
        const sync = () => setUseNativeTouchDrawer(
            navigator.maxTouchPoints > 0 || coarseMql.matches,
        );
        coarseMql.addEventListener('change', sync);
        sync();
        return () => coarseMql.removeEventListener('change', sync);
    }, []);

    // Close the mobile drawer whenever the route changes.
    useEffect(() => {
        setIsMobileSidebarOpen(false);
    }, [location.pathname]);

    // Prevent body scroll while the mobile drawer is open.
    useEffect(() => {
        if (!isMobileSidebarOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, [isMobileSidebarOpen]);

    useEffect(() => {
        if (!projectModuleEnabled && (location.pathname.startsWith('/projects') || location.pathname === '/settings/mail' || location.pathname === '/settings/checklists')) {
            navigate('/');
        }
    }, [location.pathname, navigate, projectModuleEnabled]);

    // Company category guard: leaving a page whose module the active company's
    // category disables (e.g. after a company switch) lands back on Home.
    useEffect(() => {
        if (!enabledModules) return;
        const moduleKey = moduleForPath(location.pathname);
        if (moduleKey && !isModuleKeyEnabled(moduleKey, enabledModules)) navigate('/');
    }, [location.pathname, navigate, enabledModules]);

    const userName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    const unreadNotificationCount = unreadCount;

    const activeUrl = useMemo(() => {
        const current = location.pathname + location.search;
        const allHrefs: string[] = [];
        for (const section of visibleMenuSections) {
            if (section.type === 'single') {
                allHrefs.push(section.path);
            } else {
                section.items.forEach((item) => allHrefs.push(item.key));
            }
        }
        return allHrefs
            .filter((href) => {
                // Query-keyed entries (e.g. /maintenance/tasks?view=reports) match
                // only their exact URL; the longest-match sort below then wins over
                // the plain sibling so exactly one row carries the selection dot.
                if (href.includes('?')) return current === href;
                return href === '/' ? location.pathname === '/' : location.pathname === href || location.pathname.startsWith(`${href}/`);
            })
            .sort((a, b) => b.length - a.length)[0] ?? location.pathname;
    }, [location.pathname, location.search, visibleMenuSections]);

    /* ── Dual-screen mode ──
       While armed, picking a page from the side menu fills the secondary
       (right) pane instead of navigating; the current page stays on the left. */
    const handleSidebarNavigate = (path: string) => {
        if (splitMode && !isMobile && !focusChrome && path !== location.pathname + location.search) {
            openSecondary(path);
            return;
        }
        guardedNavigate(path);
    };

    const canSwapPanes = isSplit && !!secondaryPath;
    const handleExitSplit = () => {
        const target = primaryCurrentPath || primaryRoute;
        exitSplit();
        if (target !== primaryRoute) guardedNavigate(target);
    };

    const handleOpenSecondaryFullPage = (path: string) => {
        exitSplit();
        guardedNavigate(path);
    };

    const handleSwapPanes = () => {
        const rightPath = secondaryCurrentPath || secondaryPath;
        if (!rightPath) return;
        const leftPath = primaryCurrentPath || primaryRoute;
        guardedNavigate(rightPath);
        openSecondary(leftPath);
    };

    /* ── Pane sizing: drag the divider to give one screen more space ── */
    const SPLIT_RATIO_KEY = 'offitec:split-ratio';
    const [splitRatio, setSplitRatio] = useState(() => {
        if (typeof window === 'undefined') return 50;
        const stored = Number(window.localStorage.getItem(SPLIT_RATIO_KEY));
        return Number.isFinite(stored) && stored >= 25 && stored <= 75 ? stored : 50;
    });
    const [isResizingPanes, setIsResizingPanes] = useState(false);
    const mainRef = useRef<HTMLElement>(null);

    useEffect(() => {
        window.localStorage.setItem(SPLIT_RATIO_KEY, String(Math.round(splitRatio)));
    }, [splitRatio]);

    const startPaneResize = (event: React.PointerEvent) => {
        event.preventDefault();
        const main = mainRef.current;
        if (!main) return;
        setIsResizingPanes(true);
        const onMove = (ev: PointerEvent) => {
            const rect = main.getBoundingClientRect();
            if (!rect.width) return;
            const pct = ((ev.clientX - rect.left) / rect.width) * 100;
            setSplitRatio(Math.min(75, Math.max(25, pct)));
        };
        const onUp = () => {
            setIsResizingPanes(false);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    };

    const handleModuleSelect = (item: ModuleLauncherItem) => {
        if (item.path.startsWith('#')) return;
        guardedNavigate(item.path);
    };

    /* Ein Schnellzugriff führt entweder auf ein Angebot oder auf sein Modul —
       beide Aufrufer (Seitenleiste und Blitz) sollen sich darüber nicht je eine
       eigene Meinung bilden. Er steht HIER und nicht oben bei der Liste:
       `handleModuleSelect` wird erst an dieser Stelle angelegt, und eine
       Abhängigkeit auf etwas, das es noch nicht gibt, wirft beim Zeichnen. */
    const runQuickCreate = (id: string) => {
        if (id === SAMPLE_QUOTE_ITEM_ID) {
            // Das zuletzt angelegte Angebot in der Standard-Angebotsmaske —
            // nur ansehen, es wird nichts angelegt (updates/sampleQuote.ts).
            void newestQuotePath().then(guardedNavigate);
            return;
        }
        const item = moduleLauncherItems.find((m) => m.id === id);
        if (item) handleModuleSelect(item);
    };


    // Die Leiste ist immer schmal: das Untermenü schwebt beim Zeigen darüber
    // (kein Anheften mehr, 16.08.2026), also bleibt der Inhalt stehen.
    const visibleWidth = SIDEBAR_RAIL_WIDTH;

    // Montaj (teknisyen) ekranları panelin İÇİNDE ama yan barsız çalışır:
    // uygulama başlığı aynen kalır, sol rail ve mobil çekmece hiç çizilmez.
    const hideSidebar = location.pathname.startsWith('/montage');

    // Die Leiste selbst faellt zusaetzlich beim Monteur weg -- sein Menue ist
    // leer, eine leere Leiste waere nur eine Wand. Die WEISSE Flaeche bleibt
    // dabei am Montagebildschirm haengen (`hideSidebar`): Kalender und Profil
    // stehen weiter auf dem grauen Untergrund der Anwendung, sonst verloeren
    // ihre weissen Karten den Rand.
    const hideMenuRail = hideSidebar || isTechnicianWorkspace;
    /* Die Geräteseite der Produktion trägt ihren eigenen Rahmen (siehe
       `isDeviceFocusPath`): schmale Leiste, keine Kopfleiste. Sie sticht
       jede Navigationsart aus — Seitenleiste, Kopfmenü und Dock. */
    const focusChrome = !hideMenuRail && isDeviceFocusPath(location.pathname);
    // The alternate navigation is desktop-only. Phones and touch-first native
    // tablets keep their existing drawer, where a permanent sidebar does not
    // exist in the first place.
    const useTopModuleNavigation = !hideMenuRail
        && !focusChrome
        && navigationMode === 'top'
        && !isMobile
        && !useNativeTouchDrawer;
    /* Das Dock ersetzt Kopfleiste UND Schublade, darum hängt es weder am
       Schreibtisch-Breakpoint noch an der Touch-Erkennung — nur daran, ob die
       Kapsel überhaupt Platz hat (siehe `isDockViewport`). */
    const useBottomModuleNavigation = !hideMenuRail
        && !focusChrome
        && navigationMode === 'bottom'
        && isDockViewport;
    const showDesktopSidebar = !hideMenuRail
        && !focusChrome
        && navigationMode === 'sidebar'
        && !useNativeTouchDrawer;
    // Die geteilte Ansicht bleibt eingeschaltet, zeigt sich auf der Geräteseite
    // aber nicht — «çift ekran gidecek»; zurück auf einer anderen Seite ist sie wieder da.
    const showSplit = isSplit && !focusChrome;

    /* Die Mitteilungszentrale hängt in einem PORTAL am `body` (NotificationCenter)
       und sieht die Dock-Ansicht darum nicht. Diese Marke am Wurzelelement sagt
       es ihr: sie stellt sich dann über das Dock, statt unter eine Kopfleiste,
       die es in dieser Ansicht gar nicht gibt (styles/topNavigation.css). */
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('ofi-dock-nav', useBottomModuleNavigation);
        return () => root.classList.remove('ofi-dock-nav');
    }, [useBottomModuleNavigation]);

    /* Dasselbe für die schmale Leiste der Geräteseite: die Zentrale geht dort
       unten links neben der Glocke auf (styles/focusRail.css). */
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('ofi-focus-nav', focusChrome);
        return () => root.classList.remove('ofi-focus-nav');
    }, [focusChrome]);

    // ── Secondary-pane shell: just the page, full width of the iframe ──
    if (IS_SPLIT_PANE) {
        return (
            <div
                className="h-screen bg-[#f6f8fb] font-sans text-[#1D1D1F]"
                // Fixed bars inside pages align to the shell inset — in the pane
                // there is no sidebar, so the content column starts at 0.
                style={{ '--app-shell-inset': '0px' } as React.CSSProperties}
            >
                <div
                    ref={pageScrollRef}
                    // Marks the real scrollport so a page can freeze it while an
                    // overlay is open (see usePageScrollLock).
                    data-page-scrollport
                    // `--page-gutter` / `--page-pad-y` publish this scrollport's own
                    // padding, so a full-bleed child (e.g. the quote header) can
                    // negate it and reach the container's real edge on both axes.
                    className="h-full overflow-auto px-[var(--page-gutter)] py-[var(--page-pad-y)] [scrollbar-gutter:stable] [--page-gutter:1rem] [--page-pad-y:1rem] sm:[--page-gutter:1.25rem]"
                >
                    <PaneErrorBoundary resetKey={location.pathname + location.search}>
                        <Outlet key={selectedTenantId || user?.tenantId || 'default'} />
                    </PaneErrorBoundary>
                </div>
            </div>
        );
    }

    /* ── DIE KOPFWERKZEUGE ──────────────────────────────────────────────
       Anträge, Firma, Kalender, Glocke, Sprache, Profil. Sie stehen an
       EINER Stelle, weil sie an ZWEI Orten gebraucht werden: in der
       Kopfleiste (Seitenleisten-Ansicht) und im DOCK, wo es gar keine
       Kopfleiste mehr gibt (Vorgabe Samet, 21.09.2026: «üst bar tamamen
       kalksın … profil, bildirim, şu bu tamamen alt bara geçmesi lazım»).
       Gezeichnet werden sie beide Male gleich; das Dock gibt ihnen über
       `.ofi-mac-dock` nur sein eigenes Mass und lässt ihre Menüs nach
       OBEN aufklappen (styles/topNavigation.css). */
    /* Glocke und Profil stehen einzeln, weil die schmale Leiste der
       Geräteseite nur SIE (mit der Sprache) übernimmt — Anträge, Firma und
       Kalender bleiben dort weg (Vorgabe Samet, 24.09.2026). */
    const bellTool = (
        <button
            type="button"
            onClick={() => setIsNotificationPanelOpen((value) => !value)}
            className="ofi-hdr-ctl relative flex items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-[#e3efff] dark:hover:bg-white/10"
            aria-label={t('nav.notifications')}
            aria-expanded={isNotificationPanelOpen}
        >
            <ToolbarSymbol name="bell" />
            {unreadNotificationCount > 0 && (
                <span className="ofi-nosize absolute right-0 top-0 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white dark:ring-[#08090a]">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
            )}
        </button>
    );
    const profileTool = (
        <div className="relative" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                aria-label={t('nav.profile')}
                aria-expanded={isProfileDropdownOpen}
                className="ofi-hdr-ctl ofi-header-profile flex items-center justify-center rounded-full transition-colors hover:bg-[#e3efff]"
            >
                {user ? (
                    <PersonAvatar id={user.id} name={userName || user.email} size={focusChrome ? 24 : useTopModuleNavigation ? 22 : 30} tone="subtle" ring={false} className="ofi-nosize ofi-toolbar-avatar" />
                ) : (
                    <div className={`ofi-nosize flex items-center justify-center rounded-full bg-[#0a7aff] font-semibold text-white ring-2 ring-[#e3efff] ${focusChrome ? 'size-6 text-[10px]' : useTopModuleNavigation ? 'size-5 text-[9px]' : 'size-8 text-[12px]'}`}>
                        <UserOutlined style={{ fontSize: 14 }} />
                    </div>
                )}
            </button>

            {isProfileDropdownOpen && (
                <div className={`ofi-profile-menu absolute right-0 z-50 w-64 rounded-xl bg-primary p-1.5 shadow-lg ring-1 ring-secondary_alt animate-in fade-in slide-in-from-top-2 ${useTopModuleNavigation ? 'top-[30px]' : 'top-[48px]'}`}>
                    <div className="border-b border-secondary px-3 py-2.5">
                        <p className="text-sm font-semibold text-primary">{user?.firstName} {user?.lastName}</p>
                        <p className="mt-0.5 truncate text-xs text-tertiary">{user?.email}</p>
                    </div>
                    <button
                        onClick={() => {
                            setIsProfileDropdownOpen(false);
                            navigate('/profile');
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-brand-primary_alt hover:text-brand-secondary"
                    >
                        <UserOutlined style={{ fontSize: 13 }} className="text-slate-400" /> {t('nav.profile')}
                    </button>
                    <InstallAppButton variant="menu" />
                    <div className="my-1 border-t border-secondary" />
                    <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-tertiary">
                        {t('nav.appearance')}
                    </div>
                    <div className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-secondary">
                        <AppearanceIcon size={14} className="shrink-0 text-slate-400" />
                        <span className="flex-1 text-left">{t('nav.sidebar')}</span>
                        <div role="radiogroup" aria-label={t('nav.appearance')} className="flex items-center gap-0.5 rounded-lg bg-black/[0.045] p-0.5 dark:bg-white/[0.07]">
                            {([
                                ['sidebar', t('nav.sidebar')],
                                ['top', t('nav.topMenu')],
                                ['bottom', t('nav.bottomMenu')],
                            ] as const).map(([mode, label]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="radio"
                                    aria-label={label}
                                    title={label}
                                    aria-checked={navigationMode === mode}
                                    onClick={() => setNavigationMode(mode)}
                                    className={`grid size-7 place-items-center rounded-md transition-colors ${navigationMode === mode
                                        ? 'bg-[#0a84ff] text-white shadow-sm'
                                        : 'text-slate-500 hover:bg-white/75 hover:text-slate-800 dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white'}`}
                                >
                                    <span aria-hidden="true" className={`relative block h-3.5 w-4 rounded-[3px] border border-current ${mode === 'sidebar'
                                        ? 'after:absolute after:bottom-0.5 after:left-1 after:top-0.5 after:w-px after:bg-current'
                                        : mode === 'top'
                                            ? 'after:absolute after:left-0.5 after:right-0.5 after:top-1 after:h-px after:bg-current'
                                            : 'after:absolute after:bottom-1 after:left-0.5 after:right-0.5 after:h-px after:bg-current'}`}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary">
                        {isDarkMode
                            ? <LuSun size={13} className="text-slate-400" />
                            : <LuMoon size={13} className="text-slate-400" />}
                        <span className="flex-1 text-left">{t('common.darkMode', { defaultValue: 'Dark mode' })}</span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={isDarkMode}
                            onClick={toggleTheme}
                            aria-label={t('common.darkMode', { defaultValue: 'Dark mode' })}
                            className={`relative h-5 w-9 shrink-0 rounded-full ${isDarkMode ? 'bg-[#e6cf9e]' : 'bg-slate-300'}`}
                        >
                            <span
                                className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                        </button>
                    </div>
                    <div className="my-1 border-t border-secondary" />
                    <button
                        onClick={() => {
                            setIsProfileDropdownOpen(false);
                            logout();
                            navigate('/login');
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-error-primary transition-colors hover:bg-error-primary"
                    >
                        <LogoutOutlined style={{ fontSize: 13 }} /> {t('nav.logout')}
                    </button>
                </div>
            )}
        </div>
    );

    const headerTools = (<>
        {/* ANTRÄGE statt Suche (Vorgabe 26.08.2026): an dieser
            Stelle stand der Lupenknopf — eine ZWEITAUSGABE, denn
            dieselbe Suche steht weiterhin oben im Menü. Der Platz
            gehört jetzt dem Apps-Zeichen: es führt in die Anträge
            UND trägt den farbigen Punkt, sobald etwas auf die
            angemeldete Person wartet. Beim Monteur entfällt es
            wie alles andere Kopfwerkzeug. */}
        {!isTechnicianWorkspace && <RequestsAppsMenu />}

        {/* ── Unternehmenswahl ──────────────────────────────
            Vorgabe 28.08.2026: hier stand ein 190px breites
            Auswahlfeld mit Rahmen und getipptem Pfeil — das
            breiteste Ding im Kopf für eine Sache, die man an
            den meisten Tagen nie anfasst. Geblieben ist das
            farbige Kürzel der aktiven Firma; Name, Kategorie
            und die Wahl selbst stehen im KOPF des Menüs, das
            es öffnet (TenantSwitcher.tsx). */}
        {tenants.length > 0 && <TenantSwitcher className="mr-1 hidden sm:block" />}

        {/* Im DOCK steht der Kalender schon als Modulzeichen — ein zweites
            Kalenderfeld daneben wäre derselbe Weg zweimal. */}
        {!useTopModuleNavigation && !useBottomModuleNavigation && <div className="relative mr-1">
            <button
                type="button"
                onClick={() => navigate('/calendar')}
                /* Marke für den Rundgang der Ankündigung —
                   siehe components/updates/WhatsNewPopup.tsx. */
                data-tour="calendar"
                /* Der Kalender traegt dieselbe Scheibe wie das
                   Firmenfeld (Vorgabe 28.08.2026: «der Kalender
                   koennte wie das Firmenfeld aussehen», und
                   danach ausdruecklich «dieselbe Kante»). Auch
                   auf der offenen Kalenderseite: dort bleibt die
                   Kante genau dieselbe, nur die Fuellung wird
                   markenfarben getoent (`is-current`) — sonst
                   truege ausgerechnet der aktive Knopf einen
                   anderen Rand als sein Nachbar.
                   KEIN `rounded-full` (Vorgabe 28.08.2026: «die
                   Kante des Kalenderknopfes soll auch wie die des
                   Firmenfeldes sein»): das Firmenfeld traegt die
                   Knopfkante der Anwendung — index.css zwingt
                   JEDEM Knopf ohne diese Markierung
                   `--ofi-button-radius` (10px) mit `!important`
                   auf, und das schlaegt auch die 999px, die
                   `.ofi-tsw-btn` fuer sich notiert. Mit der
                   Markierung war der Kalender als einziger eine
                   Pille neben lauter 10px-Kanten. Ohne sie greift
                   bei beiden dieselbe Regel, und sie koennen gar
                   nicht mehr auseinanderlaufen. */
                className={`ofi-hdr-ctl ofi-hdr-ctl--wide ofi-glass-ctl inline-flex select-none items-center gap-2 px-3.5 text-[13px] font-semibold transition-colors ${
                    location.pathname.startsWith('/calendar')
                        ? 'is-current text-[#0a7aff] dark:text-[#e6cf9e]'
                        : 'text-slate-700 dark:text-slate-100'
                }`}
                aria-label={t('nav.calendar')}
                aria-current={location.pathname.startsWith('/calendar') ? 'page' : undefined}
            >
                <CalendarOutlined style={{ fontSize: 16 }} />
                <span className="hidden sm:inline">{t('nav.calendar')}</span>
            </button>
        </div>}

        {bellTool}
        <LanguageSwitcher />
        {profileTool}
    </>);

    /* Die schmale Leiste der Geräteseite (`focusChrome`): nur Glocke, Sprache
       und Profil — «bildirim küçült, dil küçük, profili küçült ve sidebar'a
       ekle». Ihr Mass und ihre Menüs nach rechts: styles/focusRail.css. */
    const focusTools = (<>
        {bellTool}
        <LanguageSwitcher />
        {profileTool}
    </>);

    return (
        <div
            // `lg:h-screen` caps the shell at the viewport so the content column
            // (the `overflow-auto` div inside <main>) is the real scrollport on
            // desktop — without it the whole body scrolled and every `sticky`
            // bar scoped to the column (e.g. TenderDetailHeader) never pinned.
            // `--app-shell-inset` / `--app-header-height` let a page pin a bar with
            // `position: fixed` flush against the content column: left edge at the
            // sidebar width (0 below lg, where the rail is hidden; otherwise the
            // 84px rail — keep in sync with SIDEBAR_RAIL_WIDTH; das Untermenü
            // schwebt darüber und zählt hier nicht mit) and top edge under the
            // fixed app header (h-16). In split view pages run inside iframes, so a
            // fixed bar stays confined to its own pane; the pane shell publishes
            // inset 0 and no header offset (see TenderDetailHeader).
            // Hell ist die Leinwand seit 09.09.2026 WEISS (refine.css zieht die
            // Klasse `bg-[#f6f8fb]` dort auf #fff; der Klassenname bleibt, weil
            // dark.css an ihm den Dunkelgrund festmacht). Kopf und Leiste
            // trennen sich von der Seite durch ihren Schatten, nicht durch Ton.
            className={`min-h-screen font-sans text-[#1D1D1F] lg:flex lg:h-screen [--app-shell-inset:0px] ${useTopModuleNavigation ? '[--app-header-height:32px]' : useBottomModuleNavigation ? '[--app-header-height:0px]' : '[--app-header-height:4rem]'} ${hideSidebar ? 'bg-white dark:bg-[#0f1114]' : 'bg-[#f6f8fb]'} ${showDesktopSidebar ? 'lg:[--app-shell-inset:84px]' : 'lg:[--app-shell-inset:0px]'}`}
            /* Geräteseite: die schmale Leiste auf jeder Breite, keine Kopfleiste. */
            style={focusChrome
                ? ({ '--app-shell-inset': `${SIDEBAR_SLIM_WIDTH}px`, '--app-header-height': '0px' } as React.CSSProperties)
                : undefined}
        >
            {/* ── Sidebar (Evernote-style rail: hover-peek, flyout side-tabs, no footer) ── */}
            {/* Dasselbe Element wird auf der Geräteseite zur schmalen Leiste —
                es bleibt stehen und wird nur schmaler. */}
            {(showDesktopSidebar || focusChrome) && <AppSidebar
                variant={focusChrome ? 'slim' : 'desktop'}
                footer={focusChrome ? focusTools : undefined}
                // Ohne Kopfleiste kein Blitz-Pfeil: der Rückweg steht in der Leiste.
                lead={focusChrome ? <RailBackButton /> : undefined}
                sections={visibleMenuSections}
                activeUrl={activeUrl}
                permissions={permissions}
                projectModuleEnabled={projectModuleEnabled}
                onNavigate={handleSidebarNavigate}
                quickCreateItems={quickCreateItems}
                onQuickCreate={(qi) => runQuickCreate(qi.id)}
            />}

            {/* ── Mobile sidebar drawer ── */}
            {!hideMenuRail && !focusChrome && <div
                className={`fixed inset-0 z-[80] ${useNativeTouchDrawer ? '' : 'lg:hidden'} ${isMobileSidebarOpen ? '' : 'pointer-events-none'}`}
                aria-hidden={!isMobileSidebarOpen}
            >
                <div
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-200 ${isMobileSidebarOpen ? 'opacity-100' : 'opacity-0'}`}
                />
                {/* Phone: a drawer that leaves a strip of the page visible to tap
                    on. Tablet (sm and up): a fixed 320px sheet — a percentage
                    would keep growing with the screen for no gain. The bottom
                    safe-area inset keeps the last menu row clear of the iOS
                    home indicator. */}
                <div
                    className={`absolute inset-y-0 left-0 flex w-[86%] max-w-[300px] flex-col bg-white shadow-2xl transition-transform duration-200 ease-out sm:w-[320px] sm:max-w-[320px] ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="flex h-14 items-center justify-between border-b border-slate-200/60 px-4">
                        <img src="/fav4.svg" alt="Offitec" width={32} height={32} decoding="async" fetchPriority="high" className="size-8" />
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={() => setIsMobileSidebarOpen(false)}
                            className="flex size-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-[#e3efff]"
                        >
                            <CloseOutlined size={18} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto py-1 pb-[env(safe-area-inset-bottom)]">
                        <AppSidebar
                            variant="mobile"
                            sections={visibleMenuSections}
                            activeUrl={activeUrl}
                            permissions={permissions}
                            projectModuleEnabled={projectModuleEnabled}
                            onNavigate={(path) => { guardedNavigate(path); setIsMobileSidebarOpen(false); }}
                            quickCreateItems={quickCreateItems}
                            onQuickCreate={(qi) => { setIsMobileSidebarOpen(false); runQuickCreate(qi.id); }}
                        />
                    </div>
                </div>
            </div>}

            {/* Platzhalter für die Leiste — feste Breite, sie wächst nicht mehr. */}
            {showDesktopSidebar && <div
                style={{ paddingLeft: visibleWidth }}
                className="invisible hidden lg:sticky lg:top-0 lg:bottom-0 lg:left-0 lg:block"
            />}

            {/* ── Ana İçerik ── */}
            <div
                className={`flex min-w-0 flex-1 flex-col ${useBottomModuleNavigation || focusChrome ? '' : useTopModuleNavigation ? 'pt-[32px]' : 'pt-16'}`}
                style={focusChrome ? { paddingLeft: SIDEBAR_SLIM_WIDTH } : undefined}
            >

                {/* Header — the top slice of the shell. Weiss wie die Seite; die
                    Kante ist der Schatten nach unten (`.ofi-topbar`, refine.css).
                    Montage keeps its own white shell.

                    IN DER DOCK-ANSICHT GIBT ES SIE NICHT (Vorgabe Samet,
                    21.09.2026: «üst bar tamamen kalksın»): dort trägt das Dock
                    unten die Module UND die Werkzeuge, und der Seiteninhalt
                    beginnt ganz oben am Fensterrand. */}
                {!useBottomModuleNavigation && !focusChrome && <header data-tour="topbar" className={`ofi-topbar fixed left-0 right-0 top-0 z-50 flex items-center justify-between ofi-shell-white ${useTopModuleNavigation ? 'ofi-topbar--compact' : 'h-16 pl-2 pr-3 sm:pr-5'} ${showDesktopSidebar ? 'lg:left-[84px]' : ''}`}>
                    {useTopModuleNavigation ? (
                        <div className="flex min-w-0 flex-1 items-center">
                            <a
                                href={hrefFor('/')}
                                aria-label="Offitec"
                                className="ofi-compact-brand shrink-0"
                                onClick={(event) => {
                                    if (isModifiedClick(event)) return;
                                    event.preventDefault();
                                    guardedNavigate('/');
                                }}
                            >
                                <img src="/fav4.svg" alt="Offitec" width={17} height={17} decoding="async" fetchPriority="high" />
                            </a>
                            <TopModuleNav
                                sections={visibleMenuSections}
                                activeUrl={activeUrl}
                                permissions={permissions}
                                projectModuleEnabled={projectModuleEnabled}
                                onNavigate={handleSidebarNavigate}
                            />
                        </div>
                    ) : <WorkspaceTabsProvider userId={user?.id}>
                        <div className="flex min-w-0 flex-1 items-center">
                            {/* Mobile drawer opener — desktop has the always-visible rail. */}
                            {!hideMenuRail && <button
                                type="button"
                                aria-label={t('nav.sidebarOpen')}
                                aria-pressed={isMobileSidebarOpen}
                                onClick={() => setIsMobileSidebarOpen((open) => !open)}
                                className={`ofi-hdr-ctl ml-1 flex shrink-0 items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-[#e3efff] ${useNativeTouchDrawer ? '' : 'lg:hidden'}`}
                            >
                                <MenuOutlined size={18} />
                            </button>}

                            {/* Brand icon — only on wide screens without the rail
                                (on the rail it sits atop it). Vorgabe Samet,
                                15.09.2026: auf dem Handy kein Zeichen — der
                                Zurück-Pfeil rückt an seinen Platz, statt mit
                                ihm über das Apps-Zeichen zu laufen. */}
                            {(hideMenuRail || useNativeTouchDrawer) && <a
                                href={hrefFor('/')}
                                aria-label="Offitec"
                                onClick={(e) => { if (isModifiedClick(e)) return; e.preventDefault(); guardedNavigate('/'); }}
                                className="ofi-hdr-ctl ml-1 mr-1 hidden shrink-0 items-center justify-center lg:flex"
                            >
                                <img src="/fav4.svg" alt="Offitec" width={32} height={32} decoding="async" fetchPriority="high" className="size-8" />
                            </a>}

                            {/* ── Header tools: quick create / back, split view, "+" tab launcher ──
                                Der BLITZ steht ganz vorn (Vorgabe 28.08.2026):
                                direkt rechts neben dem Zeichen auf der
                                Modulleiste. Auf einer Hauptseite klappt er den
                                Schnellzugriff auf, auf einer Unterseite ist er
                                der Zurück-Pfeil — dieselbe Stelle, ein Knopf,
                                der sich verwandelt (QuickBackButton).

                                Er ist zugleich das EINZIGE Kopfwerkzeug, das
                                auch der Monteur bekommt: sein roter
                                Arbeitsplatz hat Unterseiten wie jedes andere
                                Modul, und ohne den Pfeil käme er aus ihnen
                                nicht zurück. Der Blitz selbst bleibt ihm
                                verborgen — seine Schnellzugriffsliste ist
                                leer, und dann zeichnet der Knopf gar nichts.
                                Zweitfenster und Reitermenue fuehren dagegen
                                samt und sonders auf Bueroseiten, die der
                                Seitenwaechter gleich wieder schliesst. */}
                            <div className="flex shrink-0 items-center gap-1.5 pl-1 pr-2">
                                <QuickBackButton
                                    items={quickCreateItems}
                                    onSelect={(qi) => runQuickCreate(qi.id)}
                                />
                                {!isTechnicianWorkspace && <>
                                    {/* Dual-screen toggle */}
                                    <SplitViewToggle
                                        onExit={handleExitSplit}
                                        className="hidden size-9 shrink-0 lg:flex"
                                    />
                                    <WorkspaceTabLauncher className="hidden lg:block" />
                                </>}
                            </div>

                            {/* ── Middle: workspace tabs ── */}
                            <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
                                {!isTechnicianWorkspace && <WorkspaceTabStrip />}
                            </div>
                        </div>
                    </WorkspaceTabsProvider>}

                    <div className="ofi-header-tools flex shrink-0 items-center gap-1">
                        {headerTools}
                    </div>
                </header>}

                {/* DIE LUPE IST WEG (11.09.2026, Vorgabe Samet: «Entfernt die Lupe
                    aus dem Kopf»). Hier stand ein Suchfeld über der ganzen
                    Seite, das nur die MODULE durchsuchte — also dasselbe, was
                    das Apps-Zeichen daneben und das Seitenmenü ohnehin zeigen,
                    nur mit einem zusätzlichen Griff davor. Der Starter ist
                    jetzt das Apps-Feld; erreichbar war das Suchfeld zuletzt
                    ohnehin nur noch über den Kopf der Handy-Schublade. */}

                {/* Page content */}
                {/* `min-h-0` lets <main> shrink to the viewport-capped column
                    instead of growing with its content (flex min-height:auto),
                    which is what hands the scrolling to the inner column. */}
                {/* The content canvas — same colour as the header and rail, with no
                    corner or seam borders, so the whole shell is one surface. */}
                <main ref={mainRef} className={`relative flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden ${hideSidebar ? 'bg-white dark:bg-[#0f1114]' : 'bg-[#f6f8fb]'}`}>
                    <div
                        ref={pageScrollRef}
                        // See the pane branch above — lets a page freeze the scrollport.
                        data-page-scrollport
                        style={showSplit && !isMobile ? { width: `${splitRatio}%` } : undefined}
                        className={`${showSplit && !isMobile
                            ? `min-w-0 flex-1 overflow-hidden lg:flex-none lg:flex-shrink-0 lg:border-r lg:border-slate-200/70 ${isResizingPanes ? 'pointer-events-none select-none' : ''}`
                            : 'flex-1 overflow-auto px-[var(--page-gutter)] py-[var(--page-pad-y)] [scrollbar-gutter:stable] [--page-gutter:0.75rem] [--page-pad-y:1.25rem] sm:[--page-gutter:1.25rem] lg:[--page-gutter:1.25rem] lg:[--page-pad-y:1.5rem]'} ${useBottomModuleNavigation ? 'ofi-bottom-nav-scroll' : ''}`}
                    >
                        {showSplit && !isMobile ? (
                            <PrimaryPane
                                path={primaryRoute}
                                onLocationChange={reportPrimaryLocation}
                            />
                        ) : (
                            <PaneErrorBoundary resetKey={primaryRoute}>
                                <Outlet key={selectedTenantId || user?.tenantId || 'default'} />
                            </PaneErrorBoundary>
                        )}
                    </div>

                    {/* Divider: drag anywhere on the strip to resize the two screens;
                        the middle buttons swap them or drop back to single-page view
                        (the left page remains). */}
                    {showSplit && (
                        <div
                            className="absolute inset-y-0 z-30 hidden w-4 -translate-x-1/2 lg:block"
                            style={{ left: `${splitRatio}%` }}
                        >
                            <div
                                onPointerDown={startPaneResize}
                                className="absolute inset-0 cursor-col-resize transition-colors hover:bg-sky-400/15"
                            />
                            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
                                <button
                                    type="button"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={handleSwapPanes}
                                    disabled={!canSwapPanes}
                                    title={t('nav.swapPanes')}
                                    aria-label={t('nav.swapPanes')}
                                    className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-[#e3efff] hover:text-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-[#1c1d1f] dark:text-white/80 dark:hover:bg-white/10"
                                >
                                    <SwapOutlined size={14} />
                                </button>
                                <button
                                    type="button"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={handleExitSplit}
                                    title={t('nav.closeSplitView')}
                                    aria-label={t('nav.closeSplitView')}
                                    className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:bg-[#e3efff] hover:text-[#0066e0] dark:border-white/15 dark:bg-[#1c1d1f] dark:text-white/80 dark:hover:bg-white/10"
                                >
                                    <CloseOutlined size={14} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Split view is a desktop feature — the secondary pane is hidden
                        on mobile. While dragging the divider the iframe must not
                        swallow pointer events, or the drag would stick. */}
                    {showSplit && (
                        <div className={`hidden lg:block lg:min-w-0 lg:flex-1 overflow-hidden ${isResizingPanes ? 'pointer-events-none select-none' : ''}`}>
                            <SecondaryPane
                                onClose={handleExitSplit}
                                onOpenFullPage={handleOpenSecondaryFullPage}
                            />
                        </div>
                    )}
                </main>
            </div>

            {useBottomModuleNavigation && (
                <BottomModuleNav
                    sections={visibleMenuSections}
                    activeUrl={activeUrl}
                    permissions={permissions}
                    projectModuleEnabled={projectModuleEnabled}
                    onNavigate={handleSidebarNavigate}
                    /* Blitz ⇄ Zurück und der Doppelbildschirm — die beiden
                       Werkzeuge, die in der Leiste links vor den Reitern
                       standen. Die Reiterleiste selbst zieht nicht mit: ein
                       Streifen offener Seiten passt in kein Dock. */
                    lead={<>
                        <QuickBackButton items={quickCreateItems} onSelect={(qi) => runQuickCreate(qi.id)} />
                        <SplitViewToggle onExit={handleExitSplit} className="hidden lg:flex" />
                    </>}
                    tools={headerTools}
                />
            )}

            {/* Die Mitteilungszentrale (10.09.2026): eine 420px-Karte unter der
                Glocke im Mac-Kleid — Tagesgruppen, Symbolquadrate, relative
                Zeit. Das 280px-Seitenpanel (SlidePanel) davor ist abgelöst;
                die Zeilen malen aus styles/notifications.css (`.ofi-nc-*`). */}
            <NotificationCenter
                open={isNotificationPanelOpen}
                onClose={() => setIsNotificationPanelOpen(false)}
                notifications={notifications}
                loading={notificationsLoading}
                locale={activeLocale}
                onMarkAllRead={() => {
                    void notificationApi.markAllRead().catch(() => undefined);
                    setNotifications((rows) => rows.map((row) => ({ ...row, isRead: true })));
                    setUnreadCount(0);
                }}
                onOpen={async (notification) => {
                    // Freigabe-Anfragen (Aufgaben) bleiben ungelesen, bis auf der
                    // Aufgabenseite entschieden ist — der Server antwortet 409, solange
                    // die Aufgabe wartet; ist sie erledigt oder weg, geht es durch.
                    if (!notification.isRead) {
                        const read = await notificationApi.markRead(notification.id).then(() => true).catch(() => false);
                        if (read) {
                            setNotifications((rows) => rows.map((row) => row.id === notification.id ? { ...row, isRead: true } : row));
                            setUnreadCount((count) => Math.max(0, count - 1));
                        }
                    }
                    if (notification.linkUrl) {
                        setIsNotificationPanelOpen(false);
                        guardedNavigate(notification.linkUrl);
                    }
                }}
            />
        </div>
    );
};

/* ── Provider sarmalayıcı ── */
export const MainLayout: React.FC = () => (
    <SplitViewProvider>
        <MainLayoutInner />
        {/* Der Erinnerungs-Wecker hängt am Rahmen, nicht an einer Seite: er
            muss überall im Programm läuten. Im rechten Fenster der geteilten
            Ansicht NICHT — sonst liefe er zweimal und läutete doppelt. */}
        {!IS_SPLIT_PANE && <DeferredReminderToasts />}
        {/* Gün sonu raporu: auf jeder Seite, nicht doppelt in der geteilten Ansicht. */}
        {!IS_SPLIT_PANE && <DeferredDailyReportPrompt />}
        {/* Çalışan görev: die laufende Aufgabe unten, auf jeder Seite — nicht doppelt in der geteilten Ansicht. */}
        {!IS_SPLIT_PANE && <DeferredTaskTimerDock />}
        {!IS_SPLIT_PANE && <MailComposeHost />}
        {/* Das Neuigkeiten-Fenster hängt aus demselben Grund am Rahmen: es soll
            nach der Anmeldung erscheinen, gleich auf welcher Seite man landet —
            und im rechten Fenster der geteilten Ansicht NICHT, sonst stünde es
            zweimal auf dem Schirm. */}
        {!IS_SPLIT_PANE && <WhatsNewHost />}
    </SplitViewProvider>
);
