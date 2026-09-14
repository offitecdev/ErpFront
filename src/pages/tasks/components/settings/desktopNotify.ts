/**
 * Masaüstü bildirimleri — EIN Schalter je Gerät (localStorage), kein Wert am
 * Server: ob ein Browser Systemmeldungen zeigen darf, entscheidet dieses Gerät.
 * Die Meldungen selbst kann nur eine offene Anwendung auslösen.
 *
 * Wer Meldungen zeigen will (z. B. die Glocke), fragt `isTasksDesktopNotifyActive()`.
 */

export const TASKS_DESKTOP_NOTIFY_KEY = 'offitec:tasks:desktop-notify';

export type DesktopNotifySupport = 'unsupported' | 'default' | 'granted' | 'denied';

export const desktopNotifySupport = (): DesktopNotifySupport => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
};

export const readTasksDesktopNotify = (): boolean => {
    try { return localStorage.getItem(TASKS_DESKTOP_NOTIFY_KEY) === '1'; } catch { return false; }
};

export const writeTasksDesktopNotify = (on: boolean): void => {
    try {
        if (on) localStorage.setItem(TASKS_DESKTOP_NOTIFY_KEY, '1');
        else localStorage.removeItem(TASKS_DESKTOP_NOTIFY_KEY);
    } catch { /* privates Fenster: dann eben nicht gemerkt */ }
};

/** Eingeschaltet UND vom Browser erlaubt. */
export const isTasksDesktopNotifyActive = (): boolean =>
    readTasksDesktopNotify() && desktopNotifySupport() === 'granted';

/** Fragt den Browser; liefert die Antwort (auch ältere Safari mit Rückruf). */
export const requestDesktopNotifyPermission = async (): Promise<DesktopNotifySupport> => {
    if (desktopNotifySupport() === 'unsupported') return 'unsupported';
    try {
        const result = await new Promise<NotificationPermission>((resolve) => {
            const maybe = Notification.requestPermission(resolve);
            if (maybe && typeof maybe.then === 'function') void maybe.then(resolve);
        });
        return result;
    } catch {
        return desktopNotifySupport();
    }
};
