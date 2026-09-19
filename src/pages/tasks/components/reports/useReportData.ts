import { useCallback, useEffect, useRef, useState } from 'react';

import { tasksApi } from '@/lib/api/tasksModule';
import type { WorkReport } from '@/types/tasksModule';
import { useTasksChanged } from '../../utils/taskEvents';
import type { ReportQuery } from './reportQuery';
import { periodBounds, toDateKey, type WorkPeriod } from './workReportModel';

/**
 * Lädt den Arbeitsrapport der Wahl (EINE Anfrage für Zeitraum + Person).
 * Beim Wechsel bleiben die alten Zahlen gedimmt stehen, bis die neuen da sind;
 * späte Antworten einer überholten Wahl werden verworfen.
 */

export const reportQueryKey = (query: ReportQuery): string =>
    `${query.period}:${periodBounds(query.period, query.date).from.getTime()}:${query.person}`;

export interface ReportData {
    report: WorkReport | null;
    /** Der Zeitraum, zu dem `report` gehört. */
    period: WorkPeriod;
    /** Die Zahlen gehören (noch) zu einer anderen Wahl. */
    stale: boolean;
    loading: boolean;
    error: unknown;
    reload: () => void;
}

export const useReportData = (query: ReportQuery, enabled: boolean): ReportData => {
    const key = reportQueryKey(query);
    const [loaded, setLoaded] = useState<{ key: string; report: WorkReport; period: WorkPeriod } | null>(null);
    const [pendingKey, setPendingKey] = useState<string | null>(null);
    const [failure, setFailure] = useState<{ key: string; error: unknown } | null>(null);

    const queryRef = useRef(query);
    useEffect(() => { queryRef.current = query; });
    const requestRef = useRef(0);

    const load = useCallback(() => {
        if (!enabled) return;
        const current = queryRef.current;
        const requestKey = reportQueryKey(current);
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;
        setPendingKey(requestKey);
        const { from, to, days } = periodBounds(current.period, current.date);
        const dayKeys = { fromDate: toDateKey(days[0]), toDate: toDateKey(days[days.length - 1]) };
        tasksApi.workReport(from.toISOString(), to.toISOString(), current.person, dayKeys)
            .then((report) => {
                if (requestRef.current !== requestId) return;
                setLoaded({ key: requestKey, report, period: current.period });
                setFailure(null);
            })
            .catch((error: unknown) => {
                if (requestRef.current === requestId) setFailure({ key: requestKey, error });
            })
            .finally(() => {
                if (requestRef.current === requestId) setPendingKey(null);
            });
    }, [enabled]);

    useEffect(() => {
        if (enabled) load();
    }, [enabled, key, load]);

    // Eine Messung gestartet/gestoppt, eine Aufgabe geändert → Zahlen neu holen.
    useTasksChanged((kind) => {
        if (kind === 'timer' || kind === 'task') load();
    });

    return {
        report: loaded?.report ?? null,
        period: loaded?.period ?? query.period,
        stale: Boolean(loaded && loaded.key !== key),
        loading: pendingKey === key,
        error: failure?.key === key ? failure.error : null,
        reload: load,
    };
};
