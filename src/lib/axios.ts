import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const defaultApiUrl = import.meta.env.DEV
    ? 'http://localhost:3000/api/v1'
    : 'https://demo.offitec.ch/backend/api/v1';

const configuredApiUrl = import.meta.env.VITE_API_URL;

export const apiClient = axios.create({
    baseURL: configuredApiUrl || defaultApiUrl,
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
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);
