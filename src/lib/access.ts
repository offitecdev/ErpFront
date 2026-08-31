// Central role-based module access rules.
// Used by both the sidebar (MainLayout) and the Home page so visibility stays
// consistent in one place.

import { pageKeyForPath } from './pageCatalog';
import { hasPageRules } from './pageAccess';

export type RoleProfile = 'technician' | 'projectOfficer' | 'full';

type AnyUser = {
    email?: string;
    roleName?: string;
    employeeRoles?: Array<{ role?: { roleName?: string } }>;
} | null | undefined;

const collectRoleNames = (user: AnyUser): string[] =>
    [user?.roleName, ...((user?.employeeRoles || []).map((er) => er?.role?.roleName))]
        .filter((r): r is string => Boolean(r))
        .map((r) => r.toLowerCase());

export const getRoleProfile = (user: AnyUser): RoleProfile => {
    const roles = collectRoleNames(user);
    if (roles.some((r) => r.includes('teknisyen') || r.includes('techniker') || r.includes('technician'))) {
        return 'technician';
    }

    // Purely role-based: anyone assigned a project-manager / Proje Sorumlusu role
    // gets the restricted projectOfficer profile (same menus & permissions),
    // not just a specific person.
    if (
        roles.some((r) =>
            r.includes('proje yöneticisi') ||
            r.includes('proje yoneticisi') ||
            r.includes('project manager') ||
            r.includes('projektleiter') ||
            r.includes('projektmanager') ||
            r.includes('proje sorumlusu') ||
            r.includes('project officer'),
        )
    ) {
        return 'projectOfficer';
    }
    return 'full';
};

/**
 * Accounts that use the montage workspace as their sole landing surface.
 * Role detection is the normal rule; the named production account is kept as
 * an explicit fallback because its legacy role label is not consistent across
 * tenants.
 */
export const isMontageTechnician = (user: AnyUser): boolean =>
    user?.email?.trim().toLowerCase() === 'hans@offitec.com'
    || getRoleProfile(user) === 'technician';

/**
 * Die Rechte, die der Server auf den LESENDEN Montage-Endpunkten überhaupt
 * durchlässt (project.routes.ts: /projects/technician/**, /projects/materials).
 * Stufe 1 der Seite «Montage» vergibt `projects.view`, Stufe 2 zusätzlich
 * `projects.report`; Wartungstechniker kommen über `maintenance.tasks.manage`.
 */
export const MONTAGE_PERMISSIONS = ['projects.view', 'projects.report', 'maintenance.tasks.manage'];

/** Die Zeile «Montage» im Seitenkatalog — der Technikerarbeitsplatz. */
export const MONTAGE_PAGE_KEY = 'montage.workspace';

/**
 * Seiten, die eine Technikerrolle mittragen DARF, ohne zur Bürorolle zu werden:
 * die Stempeluhr und die Anträge. Beides betrifft die eigene Person,
 * nicht die Arbeit im Büro — ein Monteur stempelt und meldet Ferien wie alle
 * anderen. Der Kalender steht gar nicht erst im Katalog (ALWAYS_ON_MODULE_KEYS)
 * und zählt deshalb ohnehin nicht mit.
 */
/* `personnel.leaves` steht seit dem 26.08.2026 als `personnel.requests` im
   Katalog; der alte Schlüssel bleibt hier stehen, weil er in bereits
   gespeicherten Rollenkarten weiterlebt (siehe RETIRED_PAGE_KEYS). Beide
   zählen als dieselbe Begleitseite. */
const TECHNICIAN_COMPANION_PAGES = ['personnel.terminal', 'personnel.requests', 'personnel.leaves'];

/**
 * Ist das eine TECHNIKERROLLE?
 *
 * Der rote Arbeitsplatz gehört den Technikern allein: wer im Büro arbeitet,
 * öffnet seine eigenen Bildschirme. Die Rolle sagt das so:
 *
 *   «Montage» ist ihre einzige ARBEITSFLÄCHE (Stempeluhr und eigene Anträge
 *   darf sie mittragen).
 *
 * Nicht «Montage ist dabei» — das griff zu weit: die Administratorrolle trägt
 * JEDE Seite auf der höchsten Stufe (ADMIN_PAGE_LEVELS im Server), also auch
 * die Montage, und landete prompt selbst auf dem Technikerbildschirm. Wer neben
 * der Montage eine Büroseite trägt (Kunden, Angebote, Projektliste, Lager,
 * Personalverwaltung), hat DORT seine Arbeitsfläche und startet wie alle
 * anderen auf der Startseite.
 */
export const isTechnicianRole = (
    pageAccess: Record<string, number> | null | undefined,
    isSystemAdmin?: boolean,
): boolean => {
    // Die feste Administratorrolle ist NIE eine Technikerrolle — unabhängig
    // davon, was in ihrer Stufenkarte steht.
    if (isSystemAdmin) return false;
    if (!hasPageRules(pageAccess)) return false;
    const grantedPages = Object.entries(pageAccess as Record<string, number>)
        .filter(([, level]) => level > 0)
        .map(([key]) => key);
    return grantedPages.includes(MONTAGE_PAGE_KEY)
        && grantedPages.every((key) => key === MONTAGE_PAGE_KEY || TECHNICIAN_COMPANION_PAGES.includes(key));
};

/**
 * Darf dieses Konto den Montage-Arbeitsplatz öffnen — und startet es dort?
 *
 * Beides ist DIESELBE Frage, darum dieselbe Antwort: eine Technikerrolle hat
 * keine zweite Arbeitsfläche, also ist der rote Bildschirm ihr Zuhause; jede
 * andere Rolle hat dort nichts verloren. Ein einziger Ausdruck heisst auch,
 * dass `MontageGuard` (/montage → '/') und `TechnicianBridge` ('/' → /montage)
 * gar nicht auseinandergehen KÖNNEN — sonst schieben sich die beiden
 * Weiterleitungen endlos hin und her.
 *
 * Vorher entschied der ROLLENNAME ALLEIN, also etwas, das die
 * Berechtigungstabelle nicht kennt: eine dort gebaute Technikerrolle öffnete
 * den Bildschirm nie, und eine Rolle, die bloss «Techniker» HIESS, kam herein
 * und lief dann in «Erisim Engellendi ... projects.view, projects.report,
 * maintenance.tasks.manage». Jetzt zählt beides — die Stufenkarte ODER der
 * Name —, aber in beiden Fällen erst, wenn das Recht wirklich da ist.
 */
export const canOpenMontage = (
    user: AnyUser,
    pageAccess: Record<string, number> | null | undefined,
    permissions: string[] | null | undefined,
    isSystemAdmin?: boolean,
): boolean => {
    // Die Administratorrolle nie — sie trägt jede Seite, auch die Montage.
    if (isSystemAdmin) return false;
    // Ohne das Recht bliebe ein Bildschirm offen, dessen sämtliche Abfragen der
    // Server ablehnt ("Erisim Engellendi ..."). Erst das Recht, dann die Rolle.
    //
    // EINE Ausnahme: eine Rolle, die GAR NICHTS vergibt. Dann greift die Schranke
    // ins Leere — die Person hat auch im Büro kein einziges Recht, und weil ihre
    // Stufenkarte leer bleibt, schaltet `hasPageRules` die Seitenprüfung ganz ab:
    // sie sah bisher das VOLLSTÄNDIGE Menü und lief in jeder Ecke in ein 403.
    // Heisst die Rolle nach einem Techniker, gehört diese Person auf den
    // Montagebildschirm; dass dort nichts geladen wird, zeigt den Fehler an der
    // richtigen Stelle (die Rolle braucht die Seite «Montage», Stufe 2).
    const granted = permissions ?? [];
    if (granted.length > 0 && !MONTAGE_PERMISSIONS.some((name) => granted.includes(name))) return false;
    // ZWEI Wege hinein, und der Name ist KEIN blosser Notnagel für Rollen ohne
    // Stufenkarte: eine solche Karte gibt es praktisch nie. Der Server rechnet
    // Altrollen ihre Karte aus den Rechten ZURÜCK (pageLevelsFromPermissions),
    // und `projects.view` ist das Leserecht von «Montage» UND von der
    // Projektliste des Büros — eine Altrolle sieht darum nie nach «nur
    // Montage» aus. Ein Monteur von früher (Rolle «Techniker», hans@offitec.com)
    // verlöre seinen Arbeitsplatz, verliessen wir uns allein auf die Karte.
    return isTechnicianRole(pageAccess, isSystemAdmin) || isMontageTechnician(user);
};


/**
 * Der Technikerarbeitsplatz ist die GANZE Anwendung eines Monteurs.
 *
 * Bisher hielt ihn nur die Startseite dort fest (die Brücke '/' → /montage);
 * jede andere Adresse stand offen, sobald die Stufenkarte sie hergab — und sie
 * gibt bei einer Altrolle mehr her, als jemand meint: der Server rechnet die
 * Karte aus den Rechten zurück, und `projects.view` ist zugleich das Leserecht
 * der Projektliste des BÜROS, `crm.customers.view` das der Kundenliste. Ein
 * Monteur kam so über die Kopfzeile (Suche, Schnellzugriff) oder die
 * Adresszeile mitten ins Büroprogramm.
 *
 * Offen bleiben genau die Bildschirme, die zum Arbeitsplatz gehören:
 *
 *   • `/montage/**`  — der Arbeitsplatz selbst,
 *   • `/calendar`    — die vierte Kachel dort und der Knopf oben führen hin;
 *                      es sind die eigenen Termine,
 *   • `/profile`     — das eigene Konto aus dem Avatarmenü (Bild, Passwort),
 *   • die Begleitseiten der Rolle (Stempeluhr, eigene Anträge) — aber nur,
 *     wenn die Rolle sie wirklich freigibt: ein Monteur stempelt und meldet
 *     Ferien wie alle anderen.
 *
 * Alles andere führt zurück auf `/montage`.
 */
const TECHNICIAN_FIXED_PATHS = ['/montage', '/calendar', '/profile'];

export const isPathAllowedForTechnician = (
    path: string,
    pageAccess: Record<string, number> | null | undefined,
): boolean => {
    if (TECHNICIAN_FIXED_PATHS.some((base) => path === base || path.startsWith(`${base}/`))) return true;
    const key = pageKeyForPath(path);
    if (!key || !TECHNICIAN_COMPANION_PAGES.includes(key)) return false;
    // Ohne Stufenkarte (Altrolle) bleibt die Begleitseite zu: geöffnet wird sie
    // erst, wenn die Rolle sie ausdrücklich trägt.
    return (pageAccess?.[key] ?? 0) > 0;
};


export const PROFILE_ALLOWED_KEYS: Record<Exclude<RoleProfile, 'full'>, string[]> = {
    technician: ['/', '/calendar', '/montage', '/projects/installation/tasks', '/projects/installation/delivery'],
    projectOfficer: [
        '/',
        '/calendar',
        '/crm/overview',
        '/crm/customers',
        '/crm/contacts',
        '/crm/communication',
        '/crm/mail',
        '/crm/tasks',
        '/crm/quick-entry',
        '/crm/forms',
        '/crm/forms/templates',
        '/sales/quotes',
        '/inventory/articles',
        '/inventory/suppliers',
        '/inventory/stock',
        '/inventory/stock/movements',
        '/inventory/orders',
        '/inventory/orders/new',
        '/projects',
        '/projects/installation/delivery',
        '/sales/orders',
        '/inventory',
        '/services/reports',
    ],
};


export const isKeyAllowedForProfile = (profile: RoleProfile, key: string): boolean => {
    if (profile === 'full') return true;
    return PROFILE_ALLOWED_KEYS[profile].includes(key);
};
