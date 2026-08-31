/**
 * Frontend mirror of the backend module catalog
 * (Erp_Backend/src/shared/moduleCatalog.ts — the enforcement authority).
 * Groups the flat permission strings into user-facing modules with plain
 * read / write / delete actions, and maps each module onto the sidebar
 * sections and route prefixes it controls, so a company category ("Numara"
 * profile) can switch whole modules on/off.
 */
export type ModuleAction = 'read' | 'write' | 'delete';

export interface ModuleDefinition {
    key: string;
    labelKey: string;
    labelDefault: string;
    /** Never gated by a company category — admin tooling must stay reachable. */
    alwaysAvailable?: boolean;
    /** MENU_SECTIONS keys this module controls (hidden when module disabled). */
    menuKeys: string[];
    /** Route prefixes redirected away when the module is disabled. */
    pathPrefixes: string[];
    actions: Partial<Record<ModuleAction, string[]>>;
}

export const MODULE_ACTION_LABELS: Record<ModuleAction, { labelKey: string; labelDefault: string }> = {
    read: { labelKey: 'modules.actions.read', labelDefault: 'Okuma' },
    write: { labelKey: 'modules.actions.write', labelDefault: 'Yazma' },
    delete: { labelKey: 'modules.actions.delete', labelDefault: 'Silme' },
};

export const MODULE_CATALOG: ModuleDefinition[] = [
    {
        key: 'personnel',
        labelKey: 'nav.personnel',
        labelDefault: 'Personel',
        menuKeys: ['personel'],
        // Der Neubau (16.08.2026) lebt unter '/personnel'; die alten Adressen
        // bleiben als Weiterleitungen bestehen und deshalb auch hier gelistet.
        pathPrefixes: ['/personnel', '/employees', '/attendance-records', '/attendance-settings'],
        actions: {
            read: ['employees.view', 'attendance.read', 'leaves.read'],
            write: ['employees.create', 'employees.update', 'attendance.create', 'attendance.update', 'leaves.create', 'leaves.approve'],
            delete: ['employees.delete', 'leaves.delete'],
        },
    },
    {
        key: 'crm',
        labelKey: 'nav.crm',
        labelDefault: 'CRM',
        // "Verkauf" (Angebote/Aufträge) ist seit 2026-08-14 eine eigene
        // Menügruppe, bleibt aber IM CRM-Modul: ein neuer Modulschlüssel stünde
        // in keiner bestehenden Firmenkategorie und hätte Verkauf damit für
        // alle ausgeblendet.
        menuKeys: ['crm', 'sales'],
        pathPrefixes: ['/crm', '/sales'],
        actions: {
            read: ['crm.customers.view', 'tenders.view'],
            write: [
                'crm.customers.create', 'crm.customers.addNote', 'crm.activities.create', 'crm.documents.upload',
                'tenders.create', 'tenders.update', 'tenders.manage', 'tenders.calculate',
                'tenders.import', 'tenders.export', 'tenders.approve',
            ],
        },
    },
    {
        key: 'projects',
        labelKey: 'nav.projects',
        labelDefault: 'Projeler',
        menuKeys: ['projects', 'services'],
        // Mail & checklist settings live under /settings but are project
        // features (their routes are behind the project-module guard), so they
        // follow the projects module, not the settings one.
        pathPrefixes: ['/projects', '/services', '/settings/mail', '/settings/checklists'],
        actions: {
            read: ['projects.view'],
            write: [
                'projects.create', 'projects.manage', 'projects.approve', 'projects.report',
                'projects.createAddonOrder', 'projects.approveVariation', 'projects.bookings.manage',
                'projects.mail', 'mail.manage', 'mail.send',
            ],
        },
    },
    {
        key: 'inventory',
        labelKey: 'nav.inventory',
        labelDefault: 'Stok',
        menuKeys: ['inventory'],
        pathPrefixes: ['/inventory'],
        actions: {
            read: ['inventory.view'],
            write: ['inventory.manage', 'inventory.transfer', 'inventory.proposals.manage', 'inventory.articles.create', 'inventory.articles.update'],
            delete: ['inventory.articles.delete'],
        },
    },
    {
        key: 'logistics',
        labelKey: 'nav.logistics',
        labelDefault: 'Lojistik',
        menuKeys: ['logistics'],
        pathPrefixes: ['/logistics'],
        actions: {
            read: ['logistics.view'],
            write: ['logistics.manage'],
        },
    },
    {
        key: 'maintenance',
        labelKey: 'nav.maintenance',
        labelDefault: 'Bakım',
        menuKeys: ['maintenance'],
        pathPrefixes: ['/maintenance'],
        actions: {
            write: [
                'maintenance.contracts.manage', 'maintenance.tasks.manage', 'maintenance.reports.manage',
                'regie.calls.manage', 'regie.reports.manage', 'workorders.manage',
            ],
        },
    },
    // Pure page-visibility modules (no role permissions of their own): used in
    // company categories and role module packages to switch pages on/off.
    {
        key: 'calendar',
        labelKey: 'nav.calendar',
        labelDefault: 'Takvim',
        menuKeys: ['/calendar'],
        pathPrefixes: ['/calendar'],
        actions: {},
    },
    {
        key: 'fieldwork',
        labelKey: 'modules.fieldwork',
        labelDefault: 'Montaj / Saha',
        menuKeys: [],
        pathPrefixes: ['/projects/installation', '/maintenance/technician'],
        actions: {},
    },
    {
        key: 'billing',
        labelKey: 'modules.billing',
        labelDefault: 'Faturalama',
        menuKeys: [],
        pathPrefixes: [],
        actions: {
            read: ['billing.view'],
            write: ['billing.create', 'billing.manage'],
        },
    },
    {
        key: 'settings',
        labelKey: 'nav.settings',
        labelDefault: 'Ayarlar',
        menuKeys: ['settings'],
        pathPrefixes: ['/settings'],
        actions: {},
    },
    {
        key: 'administration',
        labelKey: 'modules.administration',
        labelDefault: 'Yönetim',
        alwaysAvailable: true,
        menuKeys: [],
        // Company categories are configured here: the page must stay reachable
        // even for a company whose category disables the settings module,
        // otherwise a category could lock the admin out of editing it.
        // Same for the authorization page (Berechtigungen): WITHOUT the longer
        // prefix here it falls to the settings module ('/settings'), and a
        // category or role package without 'settings' bounced the click back
        // to '/' — the menu item was visible (administration is always
        // available) but the page never opened.
        // Erinnerungs-Einstellungen ebenfalls: eine Mandanten-Richtlinie, die
        // Manager pflegen — sie darf nicht daran hängen, ob die Kategorie das
        // settings-Modul führt.
        // Der Upload gehört ebenfalls hierher: er ist die Fläche der
        // IT-Administration und hängt an einem Kennwort, nicht an einem Recht —
        // ohne diesen längeren Präfix fiele er an das settings-Modul und eine
        // Firmenkategorie ohne 'settings' würde die IT aussperren.
        pathPrefixes: ['/settings/company-categories', '/settings/authorization', '/settings/modules', '/settings/reminders', '/settings/upload'],
        actions: {
            write: ['roles.manage', 'users.manage', 'tenants.create', 'tenants.update'],
        },
    },
];

/** Modules no category can switch off (admin tooling). */
const ALWAYS_AVAILABLE_MODULE_KEYS: ReadonlySet<string> = new Set(
    MODULE_CATALOG.filter((moduleDef) => moduleDef.alwaysAvailable).map((moduleDef) => moduleDef.key),
);

/** True when the module can be granted under the given category. */
export const isModuleAvailable = (moduleDef: ModuleDefinition, enabled: EnabledModules): boolean =>
    Boolean(moduleDef.alwaysAvailable) || !enabled || enabled.has(moduleDef.key);

/** Permission names the given category forbids (gated modules that are off).
    Used to strip them from a role before saving — the backend rejects them. */
export const blockedPermissionNames = (enabled: EnabledModules): Set<string> => {
    if (!enabled) return new Set();
    return new Set(
        MODULE_CATALOG
            .filter((moduleDef) => !isModuleAvailable(moduleDef, enabled))
            .flatMap((moduleDef) => Object.values(moduleDef.actions).flat() as string[]),
    );
};

/** permission name -> owning module key (for launcher-item filtering). */
export const PERMISSION_TO_MODULE: ReadonlyMap<string, string> = new Map(
    MODULE_CATALOG.flatMap((moduleDef) =>
        Object.values(moduleDef.actions)
            .flat()
            .map((permission) => [permission, moduleDef.key] as [string, string]),
    ),
);

const MENU_KEY_TO_MODULE: ReadonlyMap<string, string> = new Map(
    MODULE_CATALOG.flatMap((moduleDef) => moduleDef.menuKeys.map((menuKey) => [menuKey, moduleDef.key] as [string, string])),
);

/** null = no category on the company = everything enabled. */
export type EnabledModules = ReadonlySet<string> | null;

export const isMenuSectionEnabled = (menuKey: string, enabled: EnabledModules): boolean => {
    if (!enabled) return true;
    const moduleKey = MENU_KEY_TO_MODULE.get(menuKey);
    return !moduleKey || isModuleKeyEnabled(moduleKey, enabled);
};

/** Direct module-key check (for menu leaves tagged with an explicit module). */
export const isModuleKeyEnabled = (moduleKey: string, enabled: EnabledModules): boolean =>
    !enabled || ALWAYS_AVAILABLE_MODULE_KEYS.has(moduleKey) || enabled.has(moduleKey);

/** Module owning a MENU_SECTIONS key, if any. */
export const menuSectionModule = (menuKey: string): string | null =>
    MENU_KEY_TO_MODULE.get(menuKey) ?? null;

/** Admin permissions (administration module): a role's module package never
    bypasses these — admin pages stay visible only to actual admins. */
export const ADMIN_PERMISSION_NAMES: ReadonlySet<string> = new Set(
    MODULE_CATALOG
        .filter((moduleDef) => moduleDef.alwaysAvailable)
        .flatMap((moduleDef) => Object.values(moduleDef.actions).flat() as string[]),
);

export const isPermissionModuleEnabled = (permission: string | undefined, enabled: EnabledModules): boolean => {
    if (!enabled || !permission) return true;
    const moduleKey = PERMISSION_TO_MODULE.get(permission);
    return !moduleKey || isModuleKeyEnabled(moduleKey, enabled);
};

/** Company-level switch for the Project module.
    The company category ("Numara" profile) is the authority for every module,
    so projects follows the same rule as the rest: a company without a category
    has it enabled. Tenant.isProjectModuleEnabled is the pre-category switch —
    it has no UI, defaults to off, and used to hide the module even from
    companies whose category or role package granted it, so it is no longer
    consulted. */
export const isProjectModuleEnabledForTenant = (
    tenant: { moduleProfile?: { moduleKeys?: string[] | null } | null } | null | undefined,
): boolean => {
    const categoryKeys = tenant?.moduleProfile?.moduleKeys;
    return !Array.isArray(categoryKeys) || categoryKeys.includes('projects');
};

/** Module key owning a route path, if any (for the disabled-module redirect).
    The longest matching prefix wins, so /projects/installation belongs to
    fieldwork even though /projects belongs to projects. */
export const moduleForPath = (pathname: string): string | null => {
    let best: { key: string; length: number } | null = null;
    for (const moduleDef of MODULE_CATALOG) {
        for (const prefix of moduleDef.pathPrefixes) {
            if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
            if (!best || prefix.length > best.length) best = { key: moduleDef.key, length: prefix.length };
        }
    }
    return best?.key ?? null;
};
