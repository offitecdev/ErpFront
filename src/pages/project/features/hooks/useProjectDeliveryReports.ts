import { useCallback, useEffect, useMemo, useState } from 'react';

import { deliveryReportApi, type DeliveryReportDto } from '@/lib/api/project';

// All delivery reports of the project plus a by-sales-order lookup, so the
// overview can show each order's technical (delivery) state without N requests.
export const useProjectDeliveryReports = (projectId: string | undefined) => {
    const [reports, setReports] = useState<DeliveryReportDto[]>([]);
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        if (!projectId) {
            setReports([]);
            return;
        }
        setLoading(true);
        try {
            setReports(await deliveryReportApi.list({ projectId }));
        } catch {
            setReports([]);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const byOrderId = useMemo(() => {
        const map = new Map<string, DeliveryReportDto[]>();
        reports.forEach((report) => {
            const key = report.salesOrderId || '';
            map.set(key, [...(map.get(key) || []), report]);
        });
        return map;
    }, [reports]);

    return { reports, byOrderId, loading, reload };
};
