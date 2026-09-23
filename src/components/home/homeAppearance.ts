import { useCallback, useSyncExternalStore } from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
   The material of the start page — 21.09.2026, Samet: «glass kartlar da
   olabilir, macOS 27 tarzı». macOS 27's Liquid Glass is translucency WITH a
   transparency dial, not a fixed frosted pane: the user picks how far the
   cards let the page through. Three steps, like the system slider —
   «Aus · Leicht · Voll».

   The level is a view preference (per user, localStorage), and two components
   far apart read it: the page root in pages/Home.tsx paints the material, the
   picker sheet in OverviewTilesDialog.tsx sets it. A three-line external
   store keeps them in step without threading props through the dashboard.
   ───────────────────────────────────────────────────────────────────────── */

export type HomeGlass = 'off' | 'soft' | 'full';

export const HOME_GLASS_LEVELS: HomeGlass[] = ['off', 'soft', 'full'];
export const DEFAULT_HOME_GLASS: HomeGlass = 'soft';

const STORAGE_PREFIX = 'ofi:home-glass:v1:';

const listeners = new Set<() => void>();
const cache = new Map<string, HomeGlass>();

const isLevel = (value: unknown): value is HomeGlass =>
    typeof value === 'string' && (HOME_GLASS_LEVELS as string[]).includes(value);

const read = (id: string): HomeGlass => {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + id);
        return isLevel(raw) ? raw : DEFAULT_HOME_GLASS;
    } catch {
        return DEFAULT_HOME_GLASS;
    }
};

/** Cached so `useSyncExternalStore` sees a stable value between writes. */
const snapshot = (id: string): HomeGlass => {
    const known = cache.get(id);
    if (known) return known;
    const value = read(id);
    cache.set(id, value);
    return value;
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const useHomeGlass = (userId?: string | null) => {
    const id = userId || 'anonymous';
    const glass = useSyncExternalStore(subscribe, () => snapshot(id), () => DEFAULT_HOME_GLASS);

    const setGlass = useCallback((next: HomeGlass) => {
        cache.set(id, next);
        try { localStorage.setItem(STORAGE_PREFIX + id, next); } catch { /* private mode */ }
        listeners.forEach((listener) => listener());
    }, [id]);

    return { glass, setGlass };
};
