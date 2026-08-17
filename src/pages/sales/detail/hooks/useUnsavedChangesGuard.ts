import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavGuardStore } from '../../../../store/navGuardStore';

type Proceed = () => void;

type UnsavedChangesGuardOptions = {
    /**
     * When set, an intercepted exit does not ask first: the modal opens in its
     * "Saving..." state, this callback persists everything, and on success the
     * navigation continues by itself. Used for a tender's initial entry right
     * after creation. Resolving/throwing false falls back to the regular
     * save / discard prompt so the user is never stuck.
     */
    autoSave?: (() => Promise<boolean>) | null;
};

/**
 * Intercepts attempts to leave the current page while `when` is true (there are
 * unsaved changes) and routes them through a custom confirmation modal instead
 * of letting the navigation happen silently.
 *
 * Covers three exit paths:
 *  - in-app menu / link clicks (react-router `<Link>` renders an `<a href>`),
 *  - the browser Back / Forward buttons (via a history sentinel),
 *  - programmatic navigations the caller drives itself (via `attempt`).
 *
 * A real page refresh or tab close still triggers the browser's own native
 * dialog (`beforeunload`) — browsers do not allow a custom modal there.
 */
export const useUnsavedChangesGuard = (when: boolean, options?: UnsavedChangesGuardOptions) => {
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [autoSaving, setAutoSaving] = useState(false);
    const pendingRef = useRef<Proceed | null>(null);
    const whenRef = useRef(when);
    const autoSaveRef = useRef(options?.autoSave ?? null);
    // Set while we intentionally navigate, so our own interceptors don't re-block.
    const bypassRef = useRef(false);
    // Ensures the Back-button sentinel history entry is pushed at most once.
    const sentinelPushedRef = useRef(false);

    useEffect(() => {
        whenRef.current = when;
    }, [when]);

    useEffect(() => {
        autoSaveRef.current = options?.autoSave ?? null;
    });

    // Discard: continue to the pending destination without saving.
    const proceed = useCallback(() => {
        const fn = pendingRef.current;
        pendingRef.current = null;
        setIsOpen(false);
        setAutoSaving(false);
        bypassRef.current = true;
        fn?.();
        window.setTimeout(() => {
            bypassRef.current = false;
        }, 200);
    }, []);

    // Route an intercepted exit through the modal — or, in auto-save mode
    // (initial entry), run the save immediately with the modal showing only
    // its "Saving..." state and continue on success. A failed auto-save drops
    // back to the regular save / discard buttons.
    const openPrompt = useCallback((proceedFn: Proceed) => {
        pendingRef.current = proceedFn;
        setIsOpen(true);
        const autoSave = autoSaveRef.current;
        if (!autoSave) return;
        setAutoSaving(true);
        void (async () => {
            let saved = false;
            try {
                saved = await autoSave();
            } catch {
                saved = false;
            }
            if (saved) proceed();
            else setAutoSaving(false);
        })();
    }, [proceed]);

    // Native dialog for a real unload (refresh / tab close). This is the only
    // exit a custom modal cannot replace, per browser security rules.
    useEffect(() => {
        if (!when) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [when]);

    // Intercept in-app link / menu clicks before react-router navigates.
    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (!whenRef.current || bypassRef.current || event.defaultPrevented) return;
            // Ignore modified clicks (new tab / download / middle click).
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = (event.target as HTMLElement | null)?.closest?.('a');
            if (!anchor) return;
            const href = anchor.getAttribute('href');
            if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

            let url: URL;
            try {
                url = new URL(anchor.href, window.location.href);
            } catch {
                return;
            }
            if (url.origin !== window.location.origin) return;

            const dest = url.pathname + url.search + url.hash;
            const current = window.location.pathname + window.location.search + window.location.hash;
            if (dest === current) return;

            event.preventDefault();
            event.stopPropagation();
            openPrompt(() => navigate(url.pathname + url.search));
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [navigate, openPrompt]);

    // Intercept the browser Back / Forward buttons. A single sentinel history
    // entry is pushed the first time the page becomes dirty, so the first Back
    // press pops onto it (keeping us on the page) and lets us show the modal;
    // discarding then walks back past both the sentinel and the page. The
    // sentinel is pushed at most once so repeated save/edit cycles don't pile up
    // redundant history entries.
    useEffect(() => {
        if (!when || sentinelPushedRef.current) return;
        sentinelPushedRef.current = true;
        window.history.pushState(null, '', window.location.href);
    }, [when]);

    useEffect(() => {
        const onPop = () => {
            if (!whenRef.current || bypassRef.current) return;
            // Re-push so we stay put while the modal decides what to do.
            window.history.pushState(null, '', window.location.href);
            openPrompt(() => {
                bypassRef.current = true;
                window.history.go(-2);
            });
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [openPrompt]);

    // Stay: dismiss the modal and cancel the pending navigation.
    const cancel = useCallback(() => {
        pendingRef.current = null;
        setIsOpen(false);
    }, []);

    // Gate a navigation the caller triggers itself (e.g. a Back button handler).
    const attempt = useCallback((proceedFn: Proceed) => {
        if (!whenRef.current) {
            proceedFn();
            return;
        }
        openPrompt(proceedFn);
    }, [openPrompt]);

    // Expose our intercept globally so programmatic navigations that don't render
    // an anchor — the top workspace tabs and the sidebar switch pages via
    // `navigate()` on buttons — route through the same prompt as in-app links.
    const setGuard = useNavGuardStore((state) => state.setGuard);
    useEffect(() => {
        setGuard(attempt);
        return () => setGuard(null);
    }, [attempt, setGuard]);

    return { isOpen, autoSaving, proceed, cancel, attempt };
};
