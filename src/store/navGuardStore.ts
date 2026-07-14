import { useCallback } from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';
import { create } from 'zustand';

/** Intercepts a pending navigation (e.g. to warn about unsaved changes). */
type NavAttempt = (proceed: () => void) => void;

interface NavGuardState {
    /** The active guard, or null when nothing wants to intercept navigation. */
    attempt: NavAttempt | null;
    /** Register (or clear, with null) the current guard. */
    setGuard: (attempt: NavAttempt | null) => void;
}

/**
 * Holds at most one navigation guard, registered by a page that has unsaved
 * changes. Menu / tab switches route their `navigate()` through it (see
 * `useGuardedNavigate`) so they get the same "unsaved changes" prompt that
 * in-app `<a>` links already trigger via the document-level click interceptor.
 */
export const useNavGuardStore = create<NavGuardState>((set) => ({
    attempt: null,
    setGuard: (attempt) => set({ attempt }),
}));

/**
 * A drop-in replacement for `useNavigate` that first passes through any
 * registered navigation guard. When a page with unsaved changes has registered
 * one, the guard decides whether to proceed (typically by showing a save
 * prompt); with no guard registered it navigates directly.
 *
 * This is what lets the top workspace tabs and the sidebar — which navigate via
 * `navigate()` on plain buttons rather than anchors — honour the unsaved-changes
 * warning while editing a tender.
 */
export const useGuardedNavigate = () => {
    const navigate = useNavigate();
    return useCallback(
        (to: To, options?: NavigateOptions) => {
            const proceed = () => navigate(to, options);
            const { attempt } = useNavGuardStore.getState();
            if (attempt) attempt(proceed);
            else proceed();
        },
        [navigate],
    );
};
