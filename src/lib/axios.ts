import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
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

/**
 * ── MAIL GÖNDERİMİ İÇİN ZAMAN AŞIMI ─────────────────────────────────────────
 * Axios'un VARSAYILAN zaman aşımı YOKTUR: bir istek yanıtlanmazsa söz (promise)
 * asla çözülmez ve gönder düğmesi sonsuza kadar döner. Sunucu tarafında bir
 * gönderim en fazla ~60 sn sürebilir (SMTP toplam süre bütçesi + büyük ekler
 * için verilen pay); buradaki sınır onun biraz üstündedir, böylece ekran her
 * hâlükârda bir sonuca ulaşır: ya "gönderildi" ya da anlaşılır bir hata.
 *
 * Normal bir gönderim 1-3 saniyede biter — bu sınır yalnızca ağ/sunucu
 * takıldığında devreye girer.
 */
export const MAIL_REQUEST_TIMEOUT_MS = 90_000;

/**
 * Zaman aşımına uğramış bir istek mi? Axios bu durumda İNGİLİZCE ve teknik bir
 * metin üretir ("timeout of 90000ms exceeded"); ekrana onu basmak yerine
 * kullanıcının dilinde bir cümle gösterebilmek için ayırt edilir.
 */
export const isRequestTimeout = (error: unknown): boolean => {
    const code = (error as { code?: string } | null)?.code;
    return code === 'ECONNABORTED' || code === 'ETIMEDOUT';
};

const readCsrfCookie = (): string | undefined => {
    const raw = document.cookie.match(/(?:^|;\s*)ofi_csrf=([^;]+)/)?.[1];
    return raw ? decodeURIComponent(raw) : undefined;
};

/**
 * ── DER CSRF-WERT VOR DER ANMELDUNG ─────────────────────────────────────────
 *
 * Anmeldung, QR-Anmeldung, Erneuerung und Abmeldung prüft der Server jetzt
 * ebenfalls auf die Doppelvorlage (nur wenn OFFITEC_COOKIE_SAMESITE=none —
 * unter Lax schützt der Browser sie schon von sich aus). Vor der Anmeldung gibt
 * es aber noch keinen Keks: den holt `GET /auth/csrf`.
 *
 * Der Wert kommt dort SOWOHL als Keks ALS AUCH im Rumpf. Der Rumpf ist für den
 * Fall, dass die Seite den Keks gar nicht lesen kann — die Schreibtisch-
 * anwendung läuft unter `file://` und sieht die Kekse der Schnittstellen-
 * adresse nicht. Dass ein Fremder den Rumpf nicht lesen kann, sichert die
 * Ursprungsliste des Servers (CORS), nicht der Keks.
 */
let issuedCsrfToken: string | undefined;
let csrfRequest: Promise<void> | null = null;

const ensureCsrfToken = async (): Promise<string | undefined> => {
    const existing = readCsrfCookie() || issuedCsrfToken;
    if (existing) return existing;
    if (!csrfRequest) {
        // Plain axios: die eigenen Abfangjäger dürfen hier nicht laufen.
        csrfRequest = axios
            .get(`${apiClient.defaults.baseURL}/auth/csrf`, { withCredentials: true })
            .then((res) => { issuedCsrfToken = res.data?.csrfToken; })
            .catch(() => { /* Unter Lax ist der Wert entbehrlich — nicht blockieren. */ })
            .finally(() => { csrfRequest = null; });
    }
    await csrfRequest;
    return readCsrfCookie() || issuedCsrfToken;
};

/** Die vier Wege, die ausserhalb von requireAuth liegen. */
const PUBLIC_AUTH_MUTATIONS = ['/auth/login', '/auth/qr-login', '/auth/refresh', '/auth/logout'];

apiClient.interceptors.request.use(async (config) => {
    const method = (config.method || 'get').toLowerCase();
    const path = config.url || '';

    // Vor einer unangemeldeten Anmeldeaktion den Wert erst besorgen.
    if (method !== 'get' && PUBLIC_AUTH_MUTATIONS.some((route) => path.startsWith(route))) {
        await ensureCsrfToken();
    }

    // CSRF double-submit: echo the JS-readable csrf cookie back as a header.
    // The server compares them on cookie-authenticated mutations; a cross-site
    // attacker can't read our cookies, so they can't forge this header.
    const csrfToken = readCsrfCookie() || issuedCsrfToken;
    if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
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
        // Der CSRF-Kopf muss hier von Hand mit: die Erneuerung wird jetzt
        // ebenfalls geprüft, und dieser Aufruf umgeht den Abfangjäger.
        const csrfToken = await ensureCsrfToken();
        await axios.post(`${apiClient.defaults.baseURL}/auth/refresh`, null, {
            withCredentials: true,
            headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        });
        return true;
    } catch {
        return false;
    }
};

// Single-flight GET: aynı URL için uçuşta olan bir istek varsa ikincisi yeni
// bir HTTP çağrısı açmaz, aynı promise'i paylaşır. Bunu asıl tetikleyen
// StrictMode: dev'de efektler iki kez koşuyor ve liste sayfaları aynı isteği
// iki kez atıyordu (`cancelled` bayrağı yalnızca ikinci cevabı yok sayar,
// isteği iptal etmez). Aynı veriyi paralel isteyen iki bileşen de tek çağrıya
// iner. Cevap paylaşıldığı için çağıranlar `response.data`yı MUTATE ETMEMELİ.
const inFlightGets = new Map<string, Promise<AxiosResponse<unknown>>>();

export const getShared = <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> => {
    // Tenant başlığı cevabı değiştirir — anahtarın parçası olmalı.
    const tenantKey = sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';
    const key = `${tenantKey}|${url}|${config?.params ? JSON.stringify(config.params) : ''}`;

    const pending = inFlightGets.get(key);
    if (pending) return pending as Promise<AxiosResponse<T>>;


    const request = apiClient.get<T>(url, config).finally(() => {
        inFlightGets.delete(key);
    });
    inFlightGets.set(key, request);
    return request;
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
