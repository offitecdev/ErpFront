import { useCallback, useEffect, useRef, useState } from 'react';

import { tasksApi } from '@/lib/api/tasksModule';
import type { LiveOverview } from '@/types/tasksModule';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { useTasksChanged } from '../../utils/taskEvents';
import { readTasksCache, writeTasksCache } from '../../utils/tasksCache';

/**
 * «Canlı»: GET /tasks/live für HEUTE (Tagesgrenzen des Browsers), alle 15 s
 * neu, sofort nach einer Änderung im Modul (Start/Pause irgendwo auf der
 * Seite) und beim Zurückkehren in den Tab. Ein verborgener Tab fragt nicht.
 * Die Liste bleibt beim Neuladen stehen — nur die erste Ladung zeigt den Lader.
 * Beim Öffnen steht sofort der zuletzt gesehene Stand von HEUTE da
 * (tasksCache), das frische Laden läuft daneben.
 */

const CACHE_KEY = 'live';

const POLL_MS = 15_000;

const todayBounds = (): { from: string; to: string } => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
};

export const useLiveOverview = ({ enabled }: { enabled: boolean }) => {
    const noteServerNow = useTasksModuleStore((state) => state.noteServerNow);
    const [data, setData] = useState<LiveOverview | null>(() => {
        const cached = readTasksCache<LiveOverview>(CACHE_KEY);
        return cached && Date.parse(cached.day.from) === Date.parse(todayBounds().from) ? cached : null;
    });
    const [error, setError] = useState<unknown>(null);
    const [refreshing, setRefreshing] = useState(false);
    const seq = useRef(0);

    const load = useCallback(async () => {
        if (!enabled) return;
        const current = ++seq.current;
        setRefreshing(true);
        try {
            const result = await tasksApi.live(todayBounds());
            if (current !== seq.current) return;
            noteServerNow(result.serverNow);
            writeTasksCache(CACHE_KEY, result);
            setData(result);
            setError(null);
        } catch (loadError) {
            if (current === seq.current) setError(loadError);
        } finally {
            if (current === seq.current) setRefreshing(false);
        }
    }, [enabled, noteServerNow]);

    useEffect(() => {
        void load();
        if (!enabled) return undefined;
        const id = window.setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
        const onVisible = () => { if (!document.hidden) void load(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        };
    }, [enabled, load]);

    useTasksChanged((kind) => { if (kind !== 'chat') void load(); });

    return { data, error, refreshing, reload: load };
};
