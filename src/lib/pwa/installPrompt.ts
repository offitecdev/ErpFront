import { useCallback, useSyncExternalStore } from 'react';

/**
 * Installability plumbing for the PWA ("install this app on your computer").
 *
 * Chromium fires `beforeinstallprompt` once, shortly after the manifest is
 * parsed — usually before any lazy route has mounted. So the event is captured
 * at module level by `initInstallPrompt()` (called from main.tsx) and components
 * read it through the hook, no matter how late they mount.
 */

type UserChoice = { outcome: 'accepted' | 'dismissed'; platform: string };

type BeforeInstallPromptEvent = Event & {
    readonly platforms: readonly string[];
    prompt: () => Promise<void>;
    readonly userChoice: Promise<UserChoice>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialised = false;

const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void): (() => void) => {
    initInstallPrompt();
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** True when the app already runs as an installed window rather than a tab. */
export const isRunningStandalone = (): boolean => {
    if (typeof window === 'undefined') return false;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
};

/** Idempotent; safe to call from both main.tsx and the hook. */
export const initInstallPrompt = (): void => {
    if (initialised || typeof window === 'undefined') return;
    initialised = true;

    window.addEventListener('beforeinstallprompt', (event) => {
        // Suppressing the browser's own mini-infobar is what lets us re-open the
        // native dialog later from our own button.
        event.preventDefault();
        deferredPrompt = event as BeforeInstallPromptEvent;
        emit();
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        emit();
    });
};

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export const useInstallPrompt = (): {
    canInstall: boolean;
    isInstalled: boolean;
    promptInstall: () => Promise<InstallOutcome>;
} => {
    const canInstall = useSyncExternalStore(
        subscribe,
        () => deferredPrompt !== null,
        () => false,
    );

    const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
        const event = deferredPrompt;
        if (!event) return 'unavailable';

        try {
            await event.prompt();
            const { outcome } = await event.userChoice;
            // A captured prompt is single-use; Chromium re-fires the event on a
            // later visit if the user dismissed it.
            deferredPrompt = null;
            emit();
            return outcome;
        } catch {
            deferredPrompt = null;
            emit();
            return 'unavailable';
        }
    }, []);

    return { canInstall, isInstalled: isRunningStandalone(), promptInstall };
};
