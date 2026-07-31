import { t } from '@/i18n/translate';

/**
 * Registers `public/sw.js`, which makes the app installable and keeps it usable
 * offline. Registration is deliberately narrow:
 *
 * - production builds only — in dev any previously installed worker is removed
 *   so it cannot shadow the Vite dev server with stale chunks,
 * - top-level windows only — the split-view right pane is a same-origin iframe
 *   and must not register or prompt a second time,
 * - http(s) only — the Electron desktop build loads over file://.
 */

const SW_URL = '/sw.js';
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Set by the update toast, so a controller swap we did not ask for never reloads the page. */
let updateAccepted = false;
let reloading = false;

const canRegister = (): boolean =>
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    window.self === window.top &&
    window.location.protocol.startsWith('http');

const removeExistingWorkers = async (): Promise<void> => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('offitec-')).map((key) => caches.delete(key)));
    }
};

const promptForUpdate = async (waiting: ServiceWorker): Promise<void> => {
    const { toast } = await import('sonner');

    toast.info(t('pwa.updateReady'), {
        description: t('pwa.updateReadyHint'),
        duration: Infinity,
        action: {
            label: t('pwa.updateReload'),
            onClick: () => {
                updateAccepted = true;
                waiting.postMessage({ type: 'SKIP_WAITING' });
            },
        },
    });
};

const watchForUpdates = (registration: ServiceWorkerRegistration): void => {
    // A waiting worker is only an *update* when another worker is already in
    // control; on a first visit it is simply this session's own worker.
    if (registration.waiting && navigator.serviceWorker.controller) void promptForUpdate(registration.waiting);

    registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                void promptForUpdate(installing);
            }
        });
    });

    window.setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_INTERVAL_MS);
};

export const registerServiceWorker = (): void => {
    if (!canRegister()) return;

    if (import.meta.env.DEV) {
        void removeExistingWorkers().catch(() => undefined);
        return;
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!updateAccepted || reloading) return;
        reloading = true;
        window.location.reload();
    });

    const start = (): void => {
        navigator.serviceWorker
            .register(SW_URL, { scope: '/' })
            .then(watchForUpdates)
            .catch(() => undefined);
    };

    // Registration competes with the first paint and the profile request for
    // bandwidth, so it waits until the page has settled.
    if (document.readyState === 'complete') window.setTimeout(start, 1000);
    else window.addEventListener('load', () => window.setTimeout(start, 1000), { once: true });
};
