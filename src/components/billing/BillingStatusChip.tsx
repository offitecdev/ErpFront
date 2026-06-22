import { useEffect, useState } from 'react';
import { billingApi } from '../../lib/api/billing';
import { StatusChip } from '../ui-shared/StatusBadge';
import { t } from '@/i18n/translate';

/**
 * Read-only billing indicator. Projects no longer expose a billing action;
 * invoicing happens in the Project Flow billing stage. Here we only show
 * whether a target is fully billed ("completed") or not ("pending").
 */
export const BillingStatusChip = ({ salesOrderId, projectId }: { salesOrderId?: string; projectId?: string }) => {
    const [percent, setPercent] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!salesOrderId && !projectId) {
            setPercent(0);
            return;
        }
        billingApi
            .getSummary(salesOrderId ? { salesOrderId } : { projectId })
            .then((s) => {
                if (!cancelled) setPercent(Number(s.billedPercent) || 0);
            })
            .catch(() => {
                if (!cancelled) setPercent(0);
            });
        return () => {
            cancelled = true;
        };
    }, [salesOrderId, projectId]);

    if (percent === null) return <span className="text-[12px] text-slate-300">…</span>;

    const completed = percent >= 100;
    return (
        <StatusChip variant={completed ? 'active' : 'warning'}>
            {completed ? t('projects.flow.stateCompleted') : t('projects.flow.statePending')}
        </StatusChip>
    );
};

export default BillingStatusChip;
