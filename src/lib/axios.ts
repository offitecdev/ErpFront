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
    // Auth travels as HttpOnly cookies set by the server — JS never touches
    // tokens. withCredentials makes the browser attach them.
    withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
    // CSRF double-submit: echo the JS-readable csrf cookie back as a header.
    // The server compares them on cookie-authenticated mutations; a cross-site
    // attacker can't read our cookies, so they can't forge this header.
    const csrfToken = document.cookie.match(/(?:^|;\s*)ofi_csrf=([^;]+)/)?.[1];
    if (csrfToken) {
        config.headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);
    }

    const selectedTenantId = sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId');
    const url = config.url || '';
    const isIdentityRequest = url.startsWith('/auth') || (config.method?.toLowerCase() === 'get' && url.startsWith('/tenants'));
    if (selectedTenantId && !isIdentityRequest) {
        config.headers['X-Tenant-Id'] = selectedTenantId;
    }

    return config;
});

// Silent refresh: the access cookie only lives 15 minutes. On a 401 we try
// once to renew the cookie pair via the refresh cookie and replay the failed
// request; only when that also fails is the user logged out. Single-flight so
// parallel 401s share one refresh call (the refresh token rotates on use).
let refreshPromise: Promise<boolean> | null = null;

const refreshSession = async (): Promise<boolean> => {
    try {
        // Plain axios: apiClient's own interceptors must not run for this call.
        // The server reads the refresh cookie and answers with fresh cookies.
        await axios.post(`${apiClient.defaults.baseURL}/auth/refresh`, null, { withCredentials: true });
        return true;
    } catch {
        return false;
    }
};

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error.response?.status;
        const config = error.config || {};
        const url: string = config.url || '';
        const isAuthEndpoint = url.startsWith('/auth/login') || url.startsWith('/auth/refresh') || url.startsWith('/auth/logout');

        if (status === 401 && !config._retry && !isAuthEndpoint) {
            config._retry = true;
            if (!refreshPromise) {
                refreshPromise = refreshSession().finally(() => { refreshPromise = null; });
            }
            if (await refreshPromise) {
                return apiClient(config);
            }
            useAuthStore.getState().logout();
            redirectToLogin();
        }

        return Promise.reject(error);
    }
);
