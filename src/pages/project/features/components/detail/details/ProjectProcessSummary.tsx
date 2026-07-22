import { memo } from 'react';

import { Check, Plus, Receipt as ReceiptText } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { ProjectFlow } from '@/lib/projectFlow';

import type { FlowBillItem } from '../../../hooks/useProjectFlowSummary';
import { money } from '../../../utils/projectFormatters';

/** Labelled progress bar — the same figure the project list column shows. */
const PercentBar = ({ label, percent, tone }: { label: string; percent: number; tone: string }) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
                <span className="shrink-0 font-mono text-[12.5px] font-bold text-slate-900">{clamped}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
                <span
                    className={`block h-full rounded-full transition-[width] duration-500 ease-out ${tone}`}
                    style={{ width: `${clamped}%` }}
                />
            </div>
        </div>
    );
};

/**
 * Process details for one project: the overall completion rate, the technical
 * and invoicing split, and the per-order breakdown including addon orders.
 *
 * This is the read-only half of what used to live behind the project list's
 * "Process" button — the completion *wizard* stays in ProjectProcessModal,
 * reached from the project header.
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
        return <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />;
    }
    if (!flow) return null;

    return (
        <div className="space-y-3">
            {/* Overall first — it is the one number that answers "where is this project?" */}
            <PercentBar label={t('projects.details.overall')} percent={flow.overallPercent} tone="bg-[#272f67] dark:bg-[color:var(--ofi-d-wheat)]" />
            <div className="grid grid-cols-2 gap-3">
                <PercentBar label={t('projects.flow.colTechnical')} percent={flow.technicalPercent} tone="bg-sky-500" />
                <PercentBar label={t('projects.flow.colBilling')} percent={flow.billingPercent} tone="bg-emerald-500" />
            </div>

            <div>
                <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                    {t('projects.details.ordersWithAddons')}
                </div>
                {items.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 px-3 py-5 text-center text-[12px] text-slate-400">
                        {t('projects.flow.noOrders')}
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className={`flex items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2 ${item.isAddon ? 'ml-4' : ''}`}
                            >
                                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${item.isAddon ? 'bg-amber-100 text-amber-700' : 'bg-[#272f67] text-white'}`}>
                                    {item.isAddon ? <Plus size={13} /> : <ReceiptText size={13} />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-mono text-[12px] font-semibold text-slate-800">
                                        {localizeTenderNumbersInText(item.label)}
                                    </div>
                                    <div className="font-mono text-[10.5px] text-slate-400">{money(item.amount)}</div>
                                </div>
                                {/* Two compact readouts per row: technical is binary
                                    (delivery signed), invoicing is a percentage. */}
                                <div className="flex shrink-0 items-center gap-3 text-[11px]">
                                    <span className="inline-flex items-center gap-1">
                                        <span className="text-slate-400">{t('projects.flow.colTechnical')}</span>
                                        {item.technicalDone
                                            ? <Check size={13} strokeWidth={3} className="text-emerald-600" aria-label={t('projects.flow.stateCompleted')} />
                                            : <span className="text-slate-300">—</span>}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="text-slate-400">{t('projects.flow.colBilling')}</span>
                                        <span className={`font-mono font-semibold ${item.billedPercent >= 100 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                            {item.billedPercent}%
                                        </span>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});
