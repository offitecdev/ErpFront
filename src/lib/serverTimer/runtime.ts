import { useAuthStore } from '@/store/authStore';
import { serverTimersApi, toTimerApiError } from '../api/serverTimers';
import { configureTimerStore } from './timerStore';

/**
 * Verdrahtung des Zählerspeichers mit der Anwendung: HTTP über `apiClient`
 * (Cookies, CSRF, Firmenkopf), Firmen- und Personenschlüssel aus Auth-Store
 * und Storage. Wer den Speicher benutzt (useServerTimer), importiert ihn
 * über DIESE Datei — timerStore.ts selbst kennt die Anwendung nicht.
 */

const selectedTenantKey = (): string => {
    try {
        return sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';
    } catch {
        return '';
    }
};

configureTimerStore({
    transport: {
        read: (subject) => serverTimersApi.read(subject),
        act: (subject, action) => serverTimersApi.act(subject, action),
    },
    tenantKey: selectedTenantKey,
    ownerId: () => useAuthStore.getState().user?.id ?? '',
    toError: toTimerApiError,
});

export { dispatchTimer, ensureTimer, refreshTimer, subscribeTimer, timerSnapshot } from './timerStore';
export type { TimerActionResult, TimerApiError, TimerSnapshot, TimerSource } from './timerStore';
