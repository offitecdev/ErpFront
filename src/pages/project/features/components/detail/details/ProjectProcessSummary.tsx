import { memo } from 'react';

import { Check, Plus, Receipt as ReceiptText } from '@/components/icons/antIconCompat';
import { SkeletonBar } from '@/components/ui-shared/Loader';
import { PopupEmpty, PopupMeter } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ProjectFlow } from '@/lib/projectFlow';

import type { FlowBillItem } from '../../../hooks/useProjectFlowSummary';
import { money } from '../../../utils/projectFormatters';

/**
 * Process details for one project: the overall completion rate, the technical
 * and invoicing split, and the per-order breakdown including addon orders.
 *
 * This is the read-only half of what used to live behind the project list's
 * "Process" button — the completion *wizard* stays in ProjectProcessModal,
 * reached from the project header.
 *
 * It only ever renders inside the details popup, so it is painted in the popup
 * kit's language (`--ofi-cal-*` tokens, `.ofi-tp-*` pieces) rather than in the
 * page's slate palette — that is what keeps it legible in dark mode.
 */
export const ProjectProcessSummary = memo(({
    flow,
    items,
    loading,
}: {
    flow: ProjectFlow | null;
    items: FlowBillItem[];
    loading: boolean;
}) => {
    if (loading) {
        return (
            <div className="space-y-3 pt-1">
                <div className="grid gap-4 sm:grid-cols-3">
                    {[0, 1, 2].map((index) => <SkeletonBar key={index} className="h-6 rounded-md" delayMs={index * 90} />)}
                </div>
                <SkeletonBar className="h-16 rounded-lg" delayMs={260} />
            </div>
        );
    }
    if (!flow) return null;

    return (
        <div className="space-y-3">
            {/* Overall first — it is the one number that answers "where is this
                project?"; technical and invoicing explain it. */}
            <div className="grid gap-4 sm:grid-cols-3">
                <PopupMeter label={t('projects.details.overall')} percent={flow.overallPercent} />
                <PopupMeter label={t('projects.flow.colTechnical')} percent={flow.technicalPercent} tone="technical" />
                <PopupMeter label={t('projects.flow.colBilling')} percent={flow.billingPercent} tone="billing" />
            </div>

            {items.length === 0 ? (
                <PopupEmpty>{t('projects.flow.noOrders')}</PopupEmpty>
            ) : (
                <div className="ofi-tp-list">
                    {items.map((item) => (
                        <div key={item.id} className={`ofi-tp-row ${item.isAddon ? 'is-child' : ''}`}>
                            <span className={`ofi-tp-icon ${item.isAddon ? 'is-addon' : ''}`}>
                                {item.isAddon ? <Plus size={14} /> : <ReceiptText size={14} />}
                            </span>
                            <span className="ofi-tp-row__main">
                                <span className="ofi-tp-row__title ofi-tp-code">{item.label}</span>
                                <span className="ofi-tp-row__meta">{money(item.amount)}</span>
                            </span>
                            {/* Two compact readouts per row: technical is binary
                                (delivery signed), invoicing is a percentage. */}
                            <span className="ofi-tp-state">
                                {t('projects.flow.colTechnical')}
                                {item.technicalDone
                                    ? <Check size={13} strokeWidth={3} className="ofi-tp-state__value is-done" aria-label={t('projects.flow.stateCompleted')} />
                                    : <span className="ofi-tp-state__value is-open" aria-label={t('projects.flow.statePending')}>—</span>}
                            </span>
                            <span className="ofi-tp-state">
                                {t('projects.flow.colBilling')}
                                <span className={`ofi-tp-state__value ${item.billedPercent >= 100 ? 'is-done' : ''}`}>
                                    {item.billedPercent}%
                                </span>
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});
