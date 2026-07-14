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

interface AuthState {
    user: User | null;
    token: string | null;
    tenants: TenantOption[];
    selectedTenantId: string | null;
    permissions: string[];
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    fetchProfile: () => Promise<void>;
    setSelectedTenant: (tenantId: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    token: sessionStorage.getItem('token') || localStorage.getItem('token'),
    tenants: [],
    selectedTenantId: sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId'),
    permissions: [],
    isAuthenticated: !!(sessionStorage.getItem('token') || localStorage.getItem('token')),
    isLoading: !!(sessionStorage.getItem('token') || localStorage.getItem('token')),

    login: (token, user) => {
        // Persist to localStorage as well as sessionStorage so a page opened in a
        // new tab (which starts with empty sessionStorage) stays authenticated.
        sessionStorage.setItem('token', token);
        localStorage.setItem('token', token);
        set({ token, user, isAuthenticated: true });
    },

    logout: () => {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('selectedTenantId');
        localStorage.removeItem('token');
        localStorage.removeItem('selectedTenantId');
        set({ user: null, token: null, tenants: [], selectedTenantId: null, permissions: [], isAuthenticated: false });
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
            
            set({ 
                user: userRes.data, 
                tenants,
                selectedTenantId,
                permissions: permRes.data.permissions,
                isAuthenticated: true
            });
        } catch (error) {
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('selectedTenantId');
            localStorage.removeItem('token');
            set({ user: null, token: null, tenants: [], selectedTenantId: null, permissions: [], isAuthenticated: false });
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
