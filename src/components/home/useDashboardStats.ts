import { useCallback, useEffect, useState } from 'react';
import { dashboardApi, type DashboardChartsDto, type DashboardSummaryDto } from '../../lib/api/dashboard';

/**
 * Aggregates behind the home dashboard. Both endpoints load in parallel and
 * independently: a failing charts call never blanks the KPI tiles. A 403 means
 * the user's role has none of the business view permissions — the dashboard
 * then simply hides the stats sections instead of surfacing an error.
 *
 * `refresh()` refetches silently: `loading` only gates the very first paint,
 * so a refetch never flashes the skeletons (the previous render holds).
 */
export const useDashboardStats = () => {
    const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
    const [charts, setCharts] = useState<DashboardChartsDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [denied, setDenied] = useState(false);
    const [error, setError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const status = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

        const summaryReq = dashboardApi.getSummary().then(
            (data) => ({ data, forbidden: false }),
            (e) => ({ data: null, forbidden: status(e) === 403 }),
        );
        const chartsReq = dashboardApi.getCharts().then(
            (data) => ({ data, forbidden: false }),
            (e) => ({ data: null, forbidden: status(e) === 403 }),
        );

        Promise.all([summaryReq, chartsReq]).then(([s, c]) => {
            if (cancelled) return;
            if (s.data) setSummary(s.data);
            if (c.data) setCharts(c.data);
            setDenied(s.forbidden && c.forbidden);
            setError(!s.data && !c.data && !(s.forbidden && c.forbidden));
            setLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

    return { summary, charts, loading, denied, error, refresh };
};
