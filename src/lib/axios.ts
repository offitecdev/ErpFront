import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const productionApiUrl = 'https://demo.offitec.ch/backend/api/v1';
const developmentApiUrl = 'http://localhost:3000/api/v1';

const defaultApiUrl = import.meta.env.DEV
    ? developmentApiUrl
    : productionApiUrl;

const configuredApiUrl = import.meta.env.VITE_API_URL;

const isLocalHost = (hostname: string) =>
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const resolveApiUrl = (apiUrl: string) => {
    if (typeof window === 'undefined') return apiUrl;

    try {
        const parsed = new URL(apiUrl);

        if (!isLocalHost(parsed.hostname)) {
            return apiUrl;
        }

        if (window.location.protocol === 'file:') {
            return import.meta.env.DEV ? apiUrl : productionApiUrl;
        }

        if (isLocalHost(window.location.hostname)) {
            return apiUrl;
        }

        if (window.location.protocol === 'https:') {
            return `${window.location.origin}/backend/api/v1`;
        }

        return `${window.location.origin}/backend/api/v1`;
    } catch {
        return apiUrl;
    }
};

const redirectToLogin = () => {
    if (typeof window === 'undefined') return;

    if (window.location.protocol === 'file:') {
        window.location.hash = '/login';
        return;
    }

    window.location.href = '/login';
};

export const apiClient = axios.create({
    baseURL: resolveApiUrl(configuredApiUrl || defaultApiUrl),
});

// Request Interceptor: Token'ı ekle
apiClient.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (token && token !== 'undefined' && token !== 'null') {
        config.headers.Authorization = `Bearer ${token}`;
    }

    const selectedTenantId = sessionStorage.getItem('selectedTenantId');
    const url = config.url || '';
    const isIdentityRequest = url.startsWith('/auth') || (config.method?.toLowerCase() === 'get' && url.startsWith('/tenants'));
    if (selectedTenantId && !isIdentityRequest) {
        config.headers['X-Tenant-Id'] = selectedTenantId;
    }

    return config;
});

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            useAuthStore.getState().logout();
            redirectToLogin();
        }
        return Promise.reject(error);
    }
);
