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
    const email = (user?.email || '').toLowerCase();
    if (roles.some((r) => r.includes('teknisyen') || r.includes('techniker') || r.includes('technician'))) {
        return 'technician';
    }
    if (email === 'engin.sahin@offitec.ch' || roles.some((r) => r.includes('proje sorumlusu') || r.includes('project officer'))) {
        return 'projectOfficer';
    }
    return 'full';
};

// For restricted profiles, only these nav/route keys are ever shown — regardless
// of the raw permission list. Keys match the MENU leaf keys / single-section paths
// in MainLayout (and the Home quick-access tiles).
//   technician   → home, calendar, device assembly (montaj görevleri)
//   projectOfficer (Engin) → home, calendar, CRM, stock (products + materials +
//      locations + suppliers), projects + orders, service programs
export const PROFILE_ALLOWED_KEYS: Record<Exclude<RoleProfile, 'full'>, string[]> = {
    technician: ['/', '/calendar', '/projects/installation/tasks'],
    projectOfficer: [
        '/',
        '/calendar',
        '/crm/customers',
        '/crm/tenders',
        '/inventory/articles',
        '/inventory/suppliers',
        '/inventory/extra-materials',
        '/inventory/locations',
        '/projects',
        '/crm/my-orders',
        '/services/reports',
    ],
};

// Whether a given nav/route key is visible for the user's role profile.
// `full` profiles fall back to the caller's own permission check (returns true here).
export const isKeyAllowedForProfile = (profile: RoleProfile, key: string): boolean => {
    if (profile === 'full') return true;
    return PROFILE_ALLOWED_KEYS[profile].includes(key);
};
