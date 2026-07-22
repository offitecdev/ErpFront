import { useCallback, useEffect, useMemo, useState } from 'react';

import { billingApi } from '@/lib/api/billing';
import type { BillingSummaryDto } from '@/types/billing';
import type { ProjectSalesOrder } from '@/types/project';

// Billing summaries for every real sales order of the project, keyed by order id.
// Synthetic "project-main-*" orders have nothing to bill and are skipped.
export const useOrderBillingSummaries = (orders: ProjectSalesOrder[]) => {
    const realOrderIds = useMemo(
        () => orders.filter((order) => !order.id.startsWith('project-main-')).map((order) => order.id),
        [orders],
    );
    const idsKey = realOrderIds.join(',');
    const [summaries, setSummaries] = useState<Record<string, BillingSummaryDto | null>>({});
    const [loading, setLoading] = useState(false);

    const reload = useCallback(async () => {
        const ids = idsKey ? idsKey.split(',') : [];
        if (!ids.length) {
            setSummaries({});
            return;
        }
        setLoading(true);
        try {
            const entries = await Promise.all(ids.map(async (id) => {
                const summary = await billingApi.getSummary({ salesOrderId: id }).catch(() => null);
                return [id, summary] as const;
            }));
            setSummaries(Object.fromEntries(entries));
        } finally {
            setLoading(false);
        }
    }, [idsKey]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { summaries, loading, reload };
};
