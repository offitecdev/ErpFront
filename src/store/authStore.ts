import { create } from 'zustand';
import { apiClient, getShared } from '../lib/axios';
import { takePrefetched } from '../lib/bootPrefetch';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    tenantId: string;
    employeeRoles?: any[];
    roleName?: string;
    /** Per-entity module packages of the user's role(s), keyed by tenant id —
        the only source of "pages this person may open". No entry for a tenant =
        no restriction from the role there. */
    roleModuleKeysByTenant?: Record<string, string[]>;
}

export interface TenantModuleProfile {
    id: string;
    profileNumber: number;
    name: string;
    moduleKeys: string[];
}

export interface TenantOption {
    id: string;
    tenantName: string;
    parentTenantId: string | null;
    isProjectModuleEnabled: boolean;
    /** Company category ("Numara" profile); null/undefined = all modules enabled. */
    moduleProfileId?: string | null;
    moduleProfile?: TenantModuleProfile | null;
    /**
     * Şirket numarası — belge kodundaki blok (numara × 10000, yani 4 →
     * AN-2026-40001). 0 = bloksuz. Modül kategorisinden bağımsızdır.
     */
    companyNumber?: number;
}

// Tokens live exclusively in HttpOnly cookies set by the server — JavaScript
// never sees or stores them (XSS can't exfiltrate what it can't read). The
// only thing persisted here is a non-sensitive marker telling the app it is
// worth attempting a profile fetch on startup.
const HAS_SESSION_KEY = 'ofi_has_session';

// One-time cleanup of the pre-cookie era storage keys.
for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem('token');
    storage.removeItem('refreshToken');
}

export const hasSessionHint = () => localStorage.getItem(HAS_SESSION_KEY) === '1';

interface AuthState {
    user: User | null;
    tenants: TenantOption[];
    selectedTenantId: string | null;
    permissions: string[];
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (user: User) => void;
    logout: () => void;
    fetchProfile: () => Promise<void>;
    setSelectedTenant: (tenantId: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    tenants: [],
    selectedTenantId: sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId'),
    permissions: [],
    isAuthenticated: hasSessionHint(),
    isLoading: hasSessionHint(),

    login: (user) => {
        localStorage.setItem(HAS_SESSION_KEY, '1');
        set({ user, isAuthenticated: true });
    },

    logout: () => {
        // The server owns the HttpOnly cookies, so it must clear them.
        apiClient.post('/auth/logout').catch(() => undefined);
        localStorage.removeItem(HAS_SESSION_KEY);
        sessionStorage.removeItem('selectedTenantId');
        localStorage.removeItem('selectedTenantId');
        set({ user: null, tenants: [], selectedTenantId: null, permissions: [], isAuthenticated: false });
    },

    fetchProfile: async () => {
        try {
            set({ isLoading: true });
            // The inline script in index.html may have started these three
            // requests at HTML-parse time; use those responses when present
            // and fall back to the normal (refresh-capable) axios path.
            const [userData, permData, tenantData] = await Promise.all([
                takePrefetched<User>('me')
                    .then((data) => data ?? getShared<User>('/auth/me').then((r) => r.data)),
                takePrefetched<{ permissions: string[] }>('permissions')
                    .then((data) => data ?? getShared<{ permissions: string[] }>('/auth/me/permissions').then((r) => r.data)),
                takePrefetched<{ tenants: TenantOption[] }>('tenants')
                    .then((data) => data ?? getShared<{ tenants: TenantOption[] }>('/tenants').then((r) => r.data)),
            ]);

            const tenants: TenantOption[] = tenantData.tenants || [];
            const savedTenantId = sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId');
            const selectedTenantId =
                tenants.some((tenant) => tenant.id === savedTenantId)
                    ? savedTenantId
                    : tenants.some((tenant) => tenant.id === userData.tenantId)
                        ? userData.tenantId
                        : tenants[0]?.id ?? null;

            if (selectedTenantId) {
                sessionStorage.setItem('selectedTenantId', selectedTenantId);
                localStorage.setItem('selectedTenantId', selectedTenantId);
            }

            localStorage.setItem(HAS_SESSION_KEY, '1');
            set({
                user: userData,
                tenants,
                selectedTenantId,
                permissions: permData.permissions,
                isAuthenticated: true
            });
        } catch (error) {
            localStorage.removeItem(HAS_SESSION_KEY);
            sessionStorage.removeItem('selectedTenantId');
            set({ user: null, tenants: [], selectedTenantId: null, permissions: [], isAuthenticated: false });
        } finally {
            set({ isLoading: false });
        }
    },

    setSelectedTenant: (tenantId) => {
        sessionStorage.setItem('selectedTenantId', tenantId);
        localStorage.setItem('selectedTenantId', tenantId);
        set({ selectedTenantId: tenantId });
    },
}));
