/**
 * ── ÇALIŞAN GÖREV AUF DEM TELEFON: DIE MITTEILUNG ───────────────────────────
 *
 * 15.09.2026 (Samet): «bu özellik mobil görünümde de olsun». Ein Telefon-
 * Browser kann kein Fenster über andere Apps legen (Document Picture-in-
 * Picture gibt es dort nicht). Was bleibt, wenn die App zu ist, ist die
 * Mitteilung: derselbe Knopf ⧉ legt die laufende Aufgabe in die
 * Mitteilungsleiste — Titel, «Çalışıyor»/«Durduruldu», Durdur/Başlat, Kapat —
 * und sie bleibt dort, bis man sie schliesst.
 *
 * Geht nur mit Service Worker und Mitteilungsrecht über HTTPS: installierte
 * App bzw. Chrome auf Android, Home-Bildschirm-App auf iOS ab 16.4 (dort ohne
 * Knöpfe). In der Android-Hülle (WebView) gibt es keine Web-Mitteilungen.
 *
 * Die Knöpfe der Mitteilung laufen durch public/sw.js: der Worker holt die App
 * nach vorn (oder öffnet sie) und reicht die Aktion als Nachricht weiter; ist
 * keine App offen, liegt sie im «Briefkasten» (Cache Storage), den die App beim
 * Start leert. Die App führt die Aktion mit ihrer eigenen Anmeldung aus — der
 * Worker ruft nie selbst die API.
 */

export const TIMER_NOTIFICATION_KIND = 'ofi-task-timer';
export const TIMER_NOTIFICATION_MESSAGE = 'ofi:task-timer-notification';
const MAILBOX_CACHE = 'ofi-tdock-mailbox';
const MAILBOX_URL = '/__ofi-tdock-mailbox';
const NOTIFY_KEY = 'ofi:tasks-timer-dock:notify';
/** Start/Durdur aus dem Briefkasten gelten nur frisch — nie ein alter Klick von gestern. */
export const MAILBOX_ACTION_MAX_AGE_MS = 2 * 60_000;

export type NotificationAction = 'pause' | 'start' | 'close' | 'open' | 'dismissed';

export interface NotificationEvent {
    type: typeof TIMER_NOTIFICATION_MESSAGE;
    action: NotificationAction;
    taskId: string;
    at: number;
}

export interface TimerNotificationContent {
    taskId: string;
    title: string;
    running: boolean;
    url: string;
    labels: { running: string; stopped: string; stop: string; start: string; close: string };
}

const ACTIONS: readonly NotificationAction[] = ['pause', 'start', 'close', 'open', 'dismissed'];

export const isNotificationEvent = (value: unknown): value is NotificationEvent => {
    if (!value || typeof value !== 'object') return false;
    const event = value as Partial<NotificationEvent>;
    return event.type === TIMER_NOTIFICATION_MESSAGE
        && typeof event.action === 'string' && ACTIONS.includes(event.action)
        && typeof event.taskId === 'string'
        && typeof event.at === 'number';
};

/** Telefon/Tablett ohne Desktop-Fenster, mit Service Worker und Web-Mitteilungen. */
export const phoneNotificationSupported = (): boolean => {
    if (typeof window === 'undefined') return false;
    const hasDesktopWindow = 'documentPictureInPicture' in window
        && Boolean((window as Window & { documentPictureInPicture?: unknown }).documentPictureInPicture);
    return !hasDesktopWindow
        && window.isSecureContext
        && 'serviceWorker' in navigator
        && 'Notification' in window
        && typeof ServiceWorkerRegistration !== 'undefined'
        && 'showNotification' in ServiceWorkerRegistration.prototype
        && window.matchMedia('(pointer: coarse)').matches;
};

export const readNotifyFlag = (): boolean => {
    try {
        return localStorage.getItem(NOTIFY_KEY) === '1';
    } catch {
        return false;
    }
};

export const writeNotifyFlag = (on: boolean): void => {
    try {
        if (on) localStorage.setItem(NOTIFY_KEY, '1');
        else localStorage.removeItem(NOTIFY_KEY);
    } catch {
        /* nur eine Vorliebe */
    }
};

const registration = async (): Promise<ServiceWorkerRegistration | null> => {
    try {
        return (await navigator.serviceWorker.getRegistration()) ?? null;
    } catch {
        return null;
    }
};

export const notificationWorkerReady = async (): Promise<boolean> => Boolean(await registration());

export const showTimerNotification = async (content: TimerNotificationContent): Promise<void> => {
    const worker = await registration();
    if (!worker || Notification.permission !== 'granted') return;
    const { labels } = content;
    // `actions`/`renotify`/`requireInteraction` kennt die DOM-Typdatei nicht überall.
    const options: NotificationOptions & Record<string, unknown> = {
        body: content.running ? labels.running : labels.stopped,
        tag: TIMER_NOTIFICATION_KIND,
        icon: '/icons/icon-192.png',
        silent: true,
        renotify: false,
        requireInteraction: true,
        data: { kind: TIMER_NOTIFICATION_KIND, taskId: content.taskId, running: content.running, url: content.url },
        actions: [
            content.running ? { action: 'pause', title: labels.stop } : { action: 'start', title: labels.start },
            { action: 'close', title: labels.close },
        ],
    };
    try {
        await worker.showNotification(content.title, options);
    } catch {
        /* z. B. Recht inzwischen entzogen — die App zeigt weiter ihr eigenes Fenster */
    }
};

export const closeTimerNotification = async (): Promise<void> => {
    const worker = await registration();
    if (!worker) return;
    try {
        const shown = await worker.getNotifications({ tag: TIMER_NOTIFICATION_KIND });
        shown.forEach((notification) => notification.close());
    } catch {
        /* nichts zu schliessen */
    }
};

/** Liest und leert den Briefkasten des Workers (Aktionen, während keine App offen war). */
export const drainNotificationMailbox = async (): Promise<NotificationEvent[]> => {
    if (typeof caches === 'undefined') return [];
    try {
        const cache = await caches.open(MAILBOX_CACHE);
        const response = await cache.match(MAILBOX_URL);
        if (!response) return [];
        await cache.delete(MAILBOX_URL);
        const list: unknown = await response.json();
        return Array.isArray(list) ? list.filter(isNotificationEvent) : [];
    } catch {
        return [];
    }
};
