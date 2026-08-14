// Central role-based module access rules.
// Used by both the sidebar (MainLayout) and the Home page so visibility stays
// consistent in one place.

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


export const PROFILE_ALLOWED_KEYS: Record<Exclude<RoleProfile, 'full'>, string[]> = {
    technician: ['/', '/calendar', '/montage', '/projects/installation/tasks', '/projects/installation/delivery'],
    projectOfficer: [
        '/',
        '/calendar',
        '/crm/overview',
        '/crm/customers',
        '/crm/tenders',
        '/inventory/articles',
        '/inventory/suppliers',
        '/inventory/stock',
        '/inventory/stock/movements',
        '/inventory/orders',
        '/inventory/orders/new',
        '/projects',
        '/projects/installation/delivery',
        '/crm/my-orders',
        '/inventory',
        '/services/reports',
    ],
};


export const isKeyAllowedForProfile = (profile: RoleProfile, key: string): boolean => {
    if (profile === 'full') return true;
    return PROFILE_ALLOWED_KEYS[profile].includes(key);
};
