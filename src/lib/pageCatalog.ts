/**
 * ── SEITENKATALOG (Spiegel von Erp_Backend/src/shared/pageCatalog.ts) ────────
 *
 * Sechs aktive Module — Personal, CRM, Verkauf, Projekte, Montage, Lager — und
 * darunter die einzelnen Seiten. Je Seite EINE Stufe:
 *
 *   0 = kein Zugriff  → die Seite erscheint gar nicht
 *   1 = ansehen       → read
 *   2 = bearbeiten    → read + write
 *   3 = löschen       → read + write + delete
 *
 * `maxLevel` sagt, was die Tabelle für diese Seite überhaupt anbietet (eine
 * Auswertung kennt kein Löschen).
 *
 * WICHTIG: Der SERVER ist die Autorität — er übersetzt die Stufen in Rechte
 * und liefert die fertige Stufenkarte einer Person als `pageAccess` mit
 * (/auth/me/permissions). Diese Datei ist nur die Beschriftung der Tabelle und
 * der Abgleich des Seitenwächters. Schlüssel, Pfade und Stufen müssen mit der
 * Serverkopie gleich bleiben; die Rollenseite lädt den Katalog zusätzlich vom
 * Server (`/role-templates/catalog`) und zeigt die Serverfassung, falls die
 * beiden auseinanderlaufen.
 */

export type PageLevel = 0 | 1 | 2 | 3;

export interface CatalogPage {
    key: string;
    path: string;
    labelKey: string;
    maxLevel: PageLevel;
}

export interface CatalogModule {
    key: string;
    labelKey: string;
    pages: CatalogPage[];
}

export const PAGE_MODULES: CatalogModule[] = [
    {
        key: 'personnel',
        labelKey: 'nav.personnel',
        pages: [
            { key: 'personnel.list', path: '/personnel', labelKey: 'nav.personnelList', maxLevel: 3 },
            { key: 'personnel.terminal', path: '/personnel/terminal', labelKey: 'nav.personnelTerminal', maxLevel: 1 },
            { key: 'personnel.shiftPlan', path: '/personnel/shift-plan', labelKey: 'nav.personnelShiftPlan', maxLevel: 2 },
            { key: 'personnel.reports', path: '/personnel/reports', labelKey: 'nav.personnelDetailedReport', maxLevel: 2 },
            { key: 'personnel.accounting', path: '/personnel/accounting', labelKey: 'nav.personnelAccounting', maxLevel: 1 },
            { key: 'personnel.leaves', path: '/personnel/leaves', labelKey: 'nav.personnelLeaves', maxLevel: 3 },
            { key: 'personnel.approvals', path: '/personnel/approvals', labelKey: 'nav.personnelApprovals', maxLevel: 2 },
            { key: 'personnel.incoming', path: '/personnel/incoming', labelKey: 'nav.personnelIncoming', maxLevel: 2 },
        ],
    },
    {
        key: 'crm',
        labelKey: 'nav.crm',
        pages: [
            { key: 'crm.customers', path: '/crm/customers', labelKey: 'nav.customerList', maxLevel: 2 },
            { key: 'crm.contacts', path: '/crm/contacts', labelKey: 'nav.crmContacts', maxLevel: 2 },
            { key: 'crm.communication', path: '/crm/communication', labelKey: 'nav.crmCommunication', maxLevel: 2 },
            { key: 'crm.mail', path: '/crm/mail', labelKey: 'nav.crmMail', maxLevel: 2 },
            { key: 'crm.tasks', path: '/crm/tasks', labelKey: 'nav.crmTasks', maxLevel: 2 },
            { key: 'crm.reminders', path: '/crm/reminders', labelKey: 'nav.crmReminders', maxLevel: 2 },
            { key: 'crm.quickEntry', path: '/crm/quick-entry', labelKey: 'nav.crmQuickEntry', maxLevel: 2 },
            { key: 'crm.forms', path: '/crm/forms', labelKey: 'nav.crmForms', maxLevel: 2 },
        ],
    },
    {
        key: 'sales',
        labelKey: 'nav.sales',
        pages: [
            { key: 'sales.quotes', path: '/sales/quotes', labelKey: 'nav.tenderManagement', maxLevel: 2 },
            { key: 'sales.orders', path: '/sales/orders', labelKey: 'nav.myOrders', maxLevel: 2 },
        ],
    },
    {
        key: 'projects',
        labelKey: 'nav.projects',
        pages: [
            { key: 'projects.list', path: '/projects', labelKey: 'nav.projectManagement', maxLevel: 2 },
        ],
    },
    {
        // Technikerarbeitsplatz (/montage) - eigene Zeile, damit eine
        // Technikerrolle sie OHNE die Projektliste des Bueros bekommt. Siehe die
        // Serverkopie fuer die Rechte hinter den Stufen.
        key: 'montage',
        labelKey: 'nav.montage',
        pages: [
            { key: 'montage.workspace', path: '/montage', labelKey: 'nav.montageWorkspace', maxLevel: 2 },
        ],
    },
    {
        key: 'inventory',
        labelKey: 'nav.inventory',
        pages: [
            { key: 'inventory.articles', path: '/inventory/articles', labelKey: 'nav.articles', maxLevel: 3 },
            { key: 'inventory.stock', path: '/inventory/stock', labelKey: 'nav.stock', maxLevel: 2 },
            { key: 'inventory.orders', path: '/inventory/orders', labelKey: 'nav.inventoryOrders', maxLevel: 2 },
            { key: 'inventory.suppliers', path: '/inventory/suppliers', labelKey: 'nav.suppliers', maxLevel: 2 },
        ],
    },
];

export const ALL_PAGES: CatalogPage[] = PAGE_MODULES.flatMap((moduleDef) => moduleDef.pages);

export const TOTAL_PAGE_COUNT = ALL_PAGES.length;

/** Wie viele Seiten eine Stufenkarte überhaupt freigibt ("12 von 22 Seiten"). */
export const countGrantedPages = (levels: Record<string, PageLevel> | null | undefined): number =>
    ALL_PAGES.reduce((sum, page) => sum + ((levels?.[page.key] ?? 0) > 0 ? 1 : 0), 0);

/**
 * Menüpfad → Seitenschlüssel. Der Katalog führt die HAUPTadresse einer Seite;
 * Unteradressen (/inventory/stock/movements, /crm/forms/templates) gehören
 * derselben Seite. Deshalb wird der LÄNGSTE passende Pfad gesucht, sonst
 * schlüge '/' oder '/personnel' auf alles an.
 */
const SORTED_PAGES = [...ALL_PAGES].sort((a, b) => b.path.length - a.path.length);

export const pageKeyForPath = (path: string): string | null => {
    const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
    const match = SORTED_PAGES.find((page) => clean === page.path || clean.startsWith(`${page.path}/`));
    return match?.key ?? null;
};
