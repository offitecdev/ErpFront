import { memo, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';

import {
    BarChart03,
    CheckCircle as CheckCircle2,
    FileDownload02 as FileDown,
    Plus,
    Receipt as ReceiptText,
    X,
} from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { BillingSummaryDto, InvoiceStatus } from '@/types/billing';
import type { DeliveryReportDto } from '@/lib/api/project';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { money } from '../../../../utils/projectFormatters';
import { calculateTotals } from '../../../../utils/projectTotals';
import type { ProjectDetailView } from '../../../../types/projectDetailNavigation';
import { BillingBar, orderTechnicalState } from './orderStatusShared';
import { CompletionBars } from './CompletionBars';
import { SectionCard } from './SectionCard';

const invoiceStatusVariant = (status: InvoiceStatus) =>
    status === 'PAID' ? 'active' : status === 'CANCELLED' ? 'passive' : 'warning';

type ExplorerRow = {
    order: ProjectSalesOrder;
    isAddon: boolean;
    total: number;
    technicalDone: boolean;
    technicalStarted: boolean;
    fullyBilled: boolean;
    summary: BillingSummaryDto | null;
};

const CheckDot = ({ done }: { done: boolean }) => (
    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${done ? 'bg-[#059669] text-white' : 'bg-slate-200 text-slate-400 dark:bg-white/15 dark:text-white/50'}`}>
        {done ? <CheckCircle2 size={12} /> : <X size={11} />}
    </span>
);

// The orders overview box, split into three parts:
//   1) far left — the grand total of ALL orders + addons combined, with the
//      billed / remaining figures underneath;
//   2) middle — the order checklist (no percentage indicators: a check per
//      order — technical for the main order, fully-billed for addons);
//   3) right — the selection detail: technical status for the main order,
//      just the billing rate (plus invoices) for addon orders.
export const ProjectOrdersExplorer = memo(({
    project,
    orders,
    deliveryByOrderId,
    billingSummaries,
    onSelectOrder,
    onNavigate,
}: {
    project: ProjectDto;
    orders: ProjectSalesOrder[];
    deliveryByOrderId: Map<string, DeliveryReportDto[]>;
    billingSummaries: Record<string, BillingSummaryDto | null>;
    onSelectOrder: (orderId: string) => void;
    onNavigate: (view: ProjectDetailView) => void;
}) => {
    const rows = useMemo<ExplorerRow[]>(() => orders.map((order, index) => {
        const summary = order.id.startsWith('project-main-') ? null : billingSummaries[order.id] || null;
        const technical = orderTechnicalState(order, deliveryByOrderId);
        return {
            order,
            isAddon: Boolean(order.parentSalesOrderId),
            total: calculateTotals(project, order, index <= 0, orders).total,
            technicalDone: technical === 'completed',
            technicalStarted: technical !== 'pending',
            fullyBilled: Boolean(summary && (Number(summary.billedPercent) || 0) >= 100),
            summary,
        };
    }), [project, orders, deliveryByOrderId, billingSummaries]);

    const [activeId, setActiveId] = useState<string | null>(rows[0]?.order.id || null);
    useEffect(() => {
        if (!rows.some((row) => row.order.id === activeId)) setActiveId(rows[0]?.order.id || null);
    }, [rows, activeId]);
    const active = rows.find((row) => row.order.id === activeId) || rows[0] || null;

    // Grand totals across every order and addon combined.
    const grandTotal = useMemo(() => rows.reduce((sum, row) => sum + row.total, 0), [rows]);
    const billedTotal = useMemo(
        () => rows.reduce((sum, row) => sum + (row.summary ? Number(row.summary.billedAmount) || 0 : 0), 0),
        [rows],
    );
    const remainingTotal = Math.max(0, grandTotal - billedTotal);
    const mainRow = rows.find((row) => !row.isAddon) || null;

    // Three-column chart on the left: overall technical, overall billing and the
    // selected order's share of the grand total.
    const chartBars = useMemo(() => {
        const technicalPercent = mainRow ? (mainRow.technicalDone ? 100 : mainRow.technicalStarted ? 50 : 0) : 0;
        const billingPercent = grandTotal > 0 ? (billedTotal / grandTotal) * 100 : 0;
        const ratioPercent = active && grandTotal > 0 ? (active.total / grandTotal) * 100 : 0;
        return [
            { key: 'technical', label: t('projects.detail.technicalShort'), percent: technicalPercent, colorClass: 'bg-sky-500' },
            { key: 'billing', label: t('projects.detail.billingShort'), percent: billingPercent, colorClass: 'bg-[#059669]' },
            { key: 'ratio', label: t('projects.detail.ratioShort'), percent: ratioPercent, colorClass: 'bg-violet-500' },
        ];
    }, [mainRow, grandTotal, billedTotal, active]);

    return (
        <SectionCard
            title={t('projects.detail.ordersOverviewTitle')}
            subtitle={t('projects.detail.chartClickHint')}
            icon={<BarChart03 size={14} />}
            noPadding
        >
            {rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-slate-400">{t('projects.flow.noOrders')}</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_320px]">
                    {/* 1 · Far left: the grand total of all orders + addons combined,
                        with the three-column completion chart underneath. */}
                    <div className="flex flex-col border-b border-slate-100 p-3.5 lg:border-b-0 lg:border-r dark:border-white/10">
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('common.total')}</div>
                            <div className="mt-0.5 font-mono text-[19px] font-bold leading-tight text-[#272f67]">{money(grandTotal)}</div>
                            <div className="mt-0.5 text-[10px] text-slate-400">{rows.length} {t('projects.orders')}</div>
                        </div>
                        <div className="mt-2.5 space-y-1 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-500">{t('billing.billed')}</span>
                                <span className="font-mono font-semibold text-[#059669]">{money(billedTotal)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-500">{t('billing.remaining')}</span>
                                <span className="font-mono font-semibold text-slate-800">{money(remainingTotal)}</span>
                            </div>
                        </div>
                        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
                            <CompletionBars bars={chartBars} animateKey={active?.order.id || 'none'} />
                        </div>
                    </div>

                    {/* 2 · Middle: the order checklist — checks instead of percentages. */}
                    <div className="space-y-0.5 border-b border-slate-100 px-2 py-2 lg:border-b-0 dark:border-white/10">
                        <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                            {t('projects.detail.checklist')}
                        </div>
                        {rows.map((row) => {
                            const { order, isAddon, total, technicalDone, fullyBilled } = row;
                            const isActive = active?.order.id === order.id;
                            const done = isAddon ? fullyBilled : technicalDone;
                            return (
                                <button
                                    key={order.id}
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => setActiveId(order.id)}
                                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                                        isActive
                                            ? 'bg-[#eef4ff] ring-1 ring-[#272f67]/20 dark:bg-white/10 dark:ring-white/20'
                                            : 'hover:bg-slate-50'
                                    }`}
                                >
                                    <CheckDot done={done} />
                                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ${isAddon ? 'bg-amber-100 text-amber-700' : 'bg-[#272f67] text-white'}`}>
                                        {isAddon ? <Plus size={12} /> : <ReceiptText size={12} />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[12px] font-semibold text-slate-800">{localizeTenderNumbersInText(order.orderNumber)}</span>
                                        <span className="block text-[10px] text-slate-400">{dayjs(order.orderDate || order.createdAt).format('DD.MM.YYYY')}</span>
                                    </span>
                                    <span className="shrink-0 text-right font-mono text-[12px] font-semibold text-slate-800">{money(total)}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 3 · Right: the selection detail — technical for the main order,
                        the billing rate (and invoices) for addons. */}
                    {active && (
                        <div className="flex flex-col lg:border-l lg:border-slate-100 dark:lg:border-white/10">
                            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className={`shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${active.isAddon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {active.isAddon ? t('projects.addonOrder') : t('projects.mainOrder')}
                                    </span>
                                    <span className="truncate text-[13px] font-bold text-slate-900">{localizeTenderNumbersInText(active.order.orderNumber)}</span>
                                </div>
                                <span className="shrink-0 font-mono text-[13px] font-bold text-[#272f67]">{money(active.total)}</span>
                            </div>

                            <div className="min-h-0 flex-1 border-t border-slate-100 dark:border-white/10">
                                {active.isAddon ? (
                                    /* Addon: the billing rate is the whole story. */
                                    <div className="px-4 pb-1 pt-3">
                                        <BillingBar percent={active.summary ? Number(active.summary.billedPercent) || 0 : null} thick />
                                        {active.summary && (
                                            <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-slate-400">
                                                <span>{t('billing.billed')}: <span className="font-mono font-semibold text-slate-600">{money(active.summary.billedAmount)}</span></span>
                                                <span>{t('billing.remaining')}: <span className="font-mono font-semibold text-slate-600">{money(active.summary.remainingAmount)}</span></span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Main order: technical stays as-is — separate, no percentages. */
                                    <div className="flex items-center gap-2 px-4 pb-2 pt-3">
                                        <FileDown size={13} className="text-slate-400" />
                                        <span className="text-[11.5px] text-slate-500">{t('projects.detail.colTechnical')}</span>
                                        <StatusChip variant={active.technicalDone ? 'active' : 'warning'}>
                                            {active.technicalDone ? t('projects.flow.stateCompleted') : t('projects.detail.incomplete')}
                                        </StatusChip>
                                    </div>
                                )}

                                {/* The order's invoices — the billing section, for both kinds. */}
                                <div className="mt-1 border-t border-slate-100 dark:border-white/10">
                                    <div className="px-4 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                                        {t('projects.detail.invoices')}
                                    </div>
                                    {!active.summary || active.summary.invoices.length === 0 ? (
                                        <div className="px-4 py-4 text-[11.5px] text-slate-400">{t('projects.detail.noInvoicesYet')}</div>
                                    ) : (
                                        <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
                                            {active.summary.invoices.map((invoice) => (
                                                <div key={invoice.id} className="flex items-center justify-between gap-2 px-4 py-2">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-[12px] font-semibold text-slate-800">{invoice.invoiceNumber}</div>
                                                        <div className="text-[10.5px] text-slate-400">
                                                            {dayjs(invoice.createdAt).format('DD.MM.YYYY')} · %{Math.round(Number(invoice.billedPercent) || 0)}
                                                        </div>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-2">
                                                        <span className="font-mono text-[11.5px] font-semibold text-slate-800">{money(invoice.amount)}</span>
                                                        <StatusChip variant={invoiceStatusVariant(invoice.status)}>
                                                            {t(`crm.invoiceStatus_${invoice.status}`)}
                                                        </StatusChip>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Final element — unchanged. */}
                            <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-white/10">
                                <Button size="sm" variant="secondary" onClick={() => onSelectOrder(active.order.id)}>
                                    {t('projects.detail.openOrder')}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => onNavigate({ section: 'billing' })}>
                                    {t('projects.detail.goBilling')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </SectionCard>
    );
});
