import { create } from 'zustand';
import { apiClient } from '../lib/axios';

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    tenantId: string;
    employeeRoles?: any[];
    roleName?: string;
}

export interface TenantOption {
    id: string;
    tenantName: string;
    parentTenantId: string | null;
    isProjectModuleEnabled: boolean;
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
            const [userRes, permRes, tenantRes] = await Promise.all([
                apiClient.get('/auth/me'),
                apiClient.get('/auth/me/permissions'),
                apiClient.get('/tenants')
            ]);

            const tenants: TenantOption[] = tenantRes.data.tenants || [];
            const savedTenantId = sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId');
            const selectedTenantId =
                tenants.some((tenant) => tenant.id === savedTenantId)
                    ? savedTenantId
                    : tenants.some((tenant) => tenant.id === userRes.data.tenantId)
                        ? userRes.data.tenantId
                        : tenants[0]?.id ?? null;

            if (selectedTenantId) {
                sessionStorage.setItem('selectedTenantId', selectedTenantId);
                localStorage.setItem('selectedTenantId', selectedTenantId);
            }

            localStorage.setItem(HAS_SESSION_KEY, '1');
            set({
                user: userRes.data,
                tenants,
                selectedTenantId,
                permissions: permRes.data.permissions,
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
