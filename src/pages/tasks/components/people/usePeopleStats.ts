import { useCallback, useEffect, useRef, useState } from 'react';

import { tasksApi } from '@/lib/api/tasksModule';
import type { PersonStats, ReportRangeKey } from '@/types/tasksModule';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { useTasksChanged } from '../../utils/taskEvents';

/**
 * Kennzahlen je Person (GET /tasks/people, nur Leitung) für den gewählten
 * Zeitraum. Ein Wechsel des Zeitraums lädt neu; die Tabelle bleibt dabei
 * stehen (nur die erste Ladung zeigt Platzhalterzeilen).
 */
export const usePeopleStats = ({ enabled }: { enabled: boolean }) => {
    const noteServerNow = useTasksModuleStore((state) => state.noteServerNow);
    const [range, setRange] = useState<ReportRangeKey>('30');
    const [rows, setRows] = useState<PersonStats[] | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(false);
    const seq = useRef(0);

    const load = useCallback(async () => {
        if (!enabled) return;
        const current = ++seq.current;
        setLoading(true);
        try {
            const result = await tasksApi.peopleStats(range);
            if (current !== seq.current) return;
            noteServerNow(result.serverNow);
            setRows(result.data);
            setError(null);
        } catch (loadError) {
            if (current === seq.current) setError(loadError);
        } finally {
            if (current === seq.current) setLoading(false);
        }
    }, [enabled, range, noteServerNow]);

    useEffect(() => { void load(); }, [load]);

    useTasksChanged((kind) => { if (kind !== 'labels' && kind !== 'chat') void load(); });

    return { range, setRange, rows, error, loading, reload: load };
};
