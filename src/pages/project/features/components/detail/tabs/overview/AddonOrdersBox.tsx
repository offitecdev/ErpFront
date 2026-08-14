import { memo, useState } from 'react';
import dayjs from 'dayjs';
import { lazyToast as toast } from '@/lib/lazyToast';

import { Plus } from '@/components/icons/antIconCompat';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import type { BillingSummaryDto } from '@/types/billing';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { money } from '../../../../utils/projectFormatters';
import { NUM_CELL, NUM_CELL_BILLED } from './overviewShared';

export type AddonRow = {
    order: ProjectSalesOrder;
    cost: number;
    billed: number;
    remaining: number;
    summary: BillingSummaryDto | null;
};

/**
 * The add-on orders of this project: what each one costs, what has been invoiced
 * on it and what is still open — plus the extra work that has been captured but
 * never turned into an add-on order yet. That pending block is the point of the
 * box: it is money the project has already spent and cannot bill, and the button
 * turns it into a real add-on order in one step.
 */
export const AddonOrdersBox = memo(({
    project,
    parentOrder,
    rows,
    pendingTotal,
    pendingCount,
    canCreate,
    onCreated,
}: {
    project: ProjectDto;
    parentOrder: ProjectSalesOrder | null;
    rows: AddonRow[];
    pendingTotal: number;
    pendingCount: number;
    canCreate: boolean;
    onCreated: (orderId: string) => Promise<void>;
}) => {
    const [creating, setCreating] = useState(false);
    // Only a real parent order can carry an add-on; the synthetic "project-main-*"
    // placeholder has no row in the database to hang one off.
    const canCreateHere = canCreate
        && Boolean(parentOrder && !parentOrder.id.startsWith('project-main-'))
        && pendingTotal > 0;

    const createNow = async () => {
        if (!parentOrder) return;
        setCreating(true);
        try {
            const res = await projectApi.createAddonOrder(project.id, { parentSalesOrderId: parentOrder.id });
            toast.success(res.message || t('auto.ek_siparis_olusturuldu'));
            await onCreated(res.salesOrder.id);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.ek_siparis_olusturulamadi'));
        } finally {
            setCreating(false);
        }
    };

    return (
        <SectionCard title={t('projects.detail.overview.addonsTitle')}>
            <table data-inv-table data-grid-lines data-unstyled-table className="ofi-compact-table w-full">
                <thead>
                    <tr>
                        <th className="text-left">{t('projects.detail.colOrder')}</th>
                        <th className="w-32 text-right">{t('projects.detail.colAmount')}</th>
                        <th className="w-32 text-right">{t('billing.billed')}</th>
                        <th className="w-32 text-right">{t('billing.remaining')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="py-6 text-center text-[13px] text-slate-400 dark:text-white/50">
                                {t('projects.detail.overview.noAddons')}
                            </td>
                        </tr>
                    ) : rows.map(({ order, cost, billed, remaining }) => (
                        <tr key={order.id}>
                            <td>
                                <span className="block truncate font-semibold text-slate-800 dark:text-white">
                                    {order.orderNumber}
                                </span>
                                <span className="block text-[11px] text-slate-400">
                                    {dayjs(order.orderDate || order.createdAt).format('DD.MM.YYYY')}
                                </span>
                            </td>
                            <td className={NUM_CELL}>{money(cost)}</td>
                            <td className={NUM_CELL_BILLED}>{money(billed)}</td>
                            <td className={NUM_CELL}>{money(remaining)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Extra work waiting for an add-on order that does not exist yet. */}
            {pendingTotal > 0 && (
                <div className="border-t border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-400/25 dark:bg-amber-400/10">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-amber-900 dark:text-amber-200">
                                {t('projects.detail.overview.pendingAddonTitle')}
                            </div>
                            <div className="mt-0.5 text-[11.5px] text-amber-800/80 dark:text-amber-200/70">
                                {pendingCount} {t('projects.recordUnitMany')} · {t('projects.detail.overview.pendingAddonHint')}
                            </div>
                        </div>
                        <span className="shrink-0 font-mono text-[13.5px] font-bold tabular-nums text-amber-900 dark:text-amber-200">
                            {money(pendingTotal)}
                        </span>
                    </div>
                    <button
                        type="button"
                        disabled={!canCreateHere || creating}
                        onClick={createNow}
                        className="mt-2.5 flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Plus size={13} />
                        {t('projects.detail.overview.createNow')}
                    </button>
                </div>
            )}
        </SectionCard>
    );
});
