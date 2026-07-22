import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Check, Coins01 as Wallet, Receipt as ReceiptText, RefreshCcw01, X } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { inputClass } from '@/components/ui-shared/Field';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { billingApi } from '@/lib/api/billing';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { InvoiceDto, InvoiceStatus } from '@/types/billing';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { money } from '../../../utils/projectFormatters';
import { useOrderBillingSummaries } from '../../../hooks/useOrderBillingSummaries';
import { SectionCard } from './overview/SectionCard';

// Billing straight from the order list: every real order is a row with its billed
// and remaining percentages; entering nothing invoices the entire remainder in one
// click (billingType FULL). Rows are checkable for invoicing several orders at once.
// Below, the project's issued invoices with inline approve / cancel.
export const BillingTab = memo(({
    project,
    orders,
    onReload,
}: {
    project: ProjectDto;
    orders: ProjectSalesOrder[];
    onReload: () => Promise<void>;
}) => {
    const realOrders = useMemo(
        () => orders.filter((order) => !order.id.startsWith('project-main-')),
        [orders],
    );
    const { summaries, reload: reloadSummaries } = useOrderBillingSummaries(orders);
    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [invoicesLoaded, setInvoicesLoaded] = useState(false);
    // Uncontrolled inputs read at submit time — the shared controlled Input lagged
    // its first keystrokes behind React state and billed as if empty.
    const percentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [billingIds, setBillingIds] = useState<Set<string>>(new Set());
    const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(null);

    const loadInvoices = useCallback(async () => {
        try {
            setInvoices(await billingApi.listInvoices({ projectId: project.id }));
        } catch {
            setInvoices([]);
        } finally {
            setInvoicesLoaded(true);
        }
    }, [project.id]);

    // The tab must open fully loaded: no table until every order's summary and
    // the invoice list are in, so figures never pop in after the fact.
    const summariesLoaded = realOrders.every((order) => order.id in summaries);
    const ready = summariesLoaded && invoicesLoaded;

    useEffect(() => {
        void loadInvoices();
    }, [loadInvoices]);

    const refreshAll = useCallback(async () => {
        await Promise.all([reloadSummaries(), loadInvoices()]);
        await onReload();
    }, [reloadSummaries, loadInvoices, onReload]);

    const remainingOf = useCallback((orderId: string) => {
        const summary = summaries[orderId];
        return summary ? Math.max(0, Number(summary.remainingPercent) || 0) : 100;
    }, [summaries]);

    // Empty input → FULL (the whole remainder); a number → PARTIAL of that share.
    const billOrder = useCallback(async (order: ProjectSalesOrder): Promise<boolean> => {
        const remaining = remainingOf(order.id);
        if (remaining <= 0) return true;
        const raw = (percentInputRefs.current[order.id]?.value || '').trim();
        const percent = raw ? Math.min(remaining, Math.max(0, Number(raw) || 0)) : remaining;
        if (percent <= 0) {
            toast.error(t('billing.maxPercent', { percent: remaining }));
            return false;
        }
        try {
            await billingApi.createInvoice({
                salesOrderId: order.id,
                billingType: raw && percent < remaining ? 'PARTIAL' : 'FULL',
                percent: raw && percent < remaining ? percent : undefined,
            });
            return true;
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('billing.createError'));
            return false;
        }
    }, [remainingOf]);

    const clearPercentInput = (orderId: string) => {
        const input = percentInputRefs.current[orderId];
        if (input) input.value = '';
    };

    const billSingle = async (order: ProjectSalesOrder) => {
        setBillingIds(new Set([order.id]));
        try {
            if (await billOrder(order)) {
                toast.success(t('billing.createSuccess'));
                clearPercentInput(order.id);
                await refreshAll();
            }
        } finally {
            setBillingIds(new Set());
        }
    };

    const selectedOrders = realOrders.filter((order) => selected[order.id] && remainingOf(order.id) > 0);

    const billSelected = async () => {
        setBillingIds(new Set(selectedOrders.map((order) => order.id)));
        try {
            let ok = 0;
            for (const order of selectedOrders) {
                if (await billOrder(order)) {
                    ok += 1;
                    clearPercentInput(order.id);
                }
            }
            if (ok > 0) {
                toast.success(t('billing.createSuccess'));
                setSelected({});
                await refreshAll();
            }
        } finally {
            setBillingIds(new Set());
        }
    };

    const changeStatus = async (invoiceId: string, status: InvoiceStatus) => {
        setUpdatingInvoiceId(invoiceId);
        try {
            await billingApi.updateStatus(invoiceId, status);
            await refreshAll();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('billing.createError'));
        } finally {
            setUpdatingInvoiceId(null);
        }
    };

    if (!realOrders.length) {
        return (
            <EmptyState
                icon={<Wallet size={28} />}
                title={t('projects.detail.billingNoOrders')}
                description={t('projects.detail.billingVirtualOrderHint')}
            />
        );
    }

    if (!ready) {
        return (
            <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/60 text-slate-500 dark:border-white/10 dark:bg-white/5">
                <RefreshCcw01 size={18} className="animate-spin" />
                <span className="text-[12px] font-medium">{t('projects.detail.billingLoading')}</span>
            </div>
        );
    }

    const billableCount = realOrders.filter((order) => remainingOf(order.id) > 0).length;
    const allSelected = billableCount > 0 && selectedOrders.length === billableCount;

    return (
        <div className="space-y-4">
            {/* Orders, stacked as checkable rows — invoice inline, no dialogs. */}
            <SectionCard
                title={t('projects.flow.billing')}
                subtitle={t('projects.detail.billingAutoHint')}
                icon={<Wallet size={14} />}
                actions={selectedOrders.length > 0 ? (
                    <Button
                        size="sm"
                        variant="primary"
                        icon={<ReceiptText size={13} />}
                        loading={billingIds.size > 1}
                        onClick={() => void billSelected()}
                    >
                        {t('projects.detail.billSelected')} ({selectedOrders.length})
                    </Button>
                ) : undefined}
                noPadding
            >
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-[12.5px]">
                        <thead>
                            <tr className="border-b border-slate-100 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:border-white/10">
                                <th className="w-9 px-4 py-2">
                                    <input
                                        type="checkbox"
                                        className="size-3.5 accent-[#272f67]"
                                        checked={allSelected}
                                        disabled={billableCount === 0}
                                        onChange={(e) => {
                                            const next: Record<string, boolean> = {};
                                            if (e.target.checked) {
                                                realOrders.forEach((order) => { if (remainingOf(order.id) > 0) next[order.id] = true; });
                                            }
                                            setSelected(next);
                                        }}
                                    />
                                </th>
                                <th className="px-3 py-2">{t('projects.detail.colType')}</th>
                                <th className="px-3 py-2">{t('projects.detail.colOrder')}</th>
                                <th className="px-3 py-2">{t('common.date')}</th>
                                <th className="px-3 py-2 text-right">{t('billing.totalAmount')}</th>
                                <th className="px-3 py-2 text-right">{t('billing.billed')}</th>
                                <th className="px-3 py-2 text-right">{t('billing.remaining')}</th>
                                <th className="px-4 py-2 text-right">{t('projects.detail.colAction')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {realOrders.map((order) => {
                                const summary = summaries[order.id] || null;
                                const isAddon = Boolean(order.parentSalesOrderId);
                                const billed = summary ? Math.round(Number(summary.billedPercent) || 0) : 0;
                                const remaining = Math.round(remainingOf(order.id));
                                const fully = remaining <= 0;
                                const busy = billingIds.has(order.id);
                                return (
                                    <tr key={order.id}>
                                        <td className="px-4 py-2.5">
                                            <input
                                                type="checkbox"
                                                className="size-3.5 accent-[#272f67]"
                                                checked={Boolean(selected[order.id]) && !fully}
                                                disabled={fully}
                                                onChange={(e) => setSelected((prev) => ({ ...prev, [order.id]: e.target.checked }))}
                                            />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className={`rounded px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide ${isAddon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {isAddon ? t('projects.addonOrder') : t('projects.mainOrder')}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 font-semibold text-slate-800">{localizeTenderNumbersInText(order.orderNumber)}</td>
                                        <td className="px-3 py-2.5 text-slate-500">{dayjs(order.orderDate || order.createdAt).format('DD.MM.YYYY')}</td>
                                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">
                                            {money(summary ? summary.baseAmount : Number(order.totalAmount) || 0)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-600">%{billed}</td>
                                        <td className={`px-3 py-2.5 text-right font-mono font-semibold ${fully ? 'text-[#059669]' : 'text-red-600'}`}>%{remaining}</td>
                                        <td className="px-4 py-2.5">
                                            {fully ? (
                                                <span className="flex items-center justify-end gap-1 text-[11px] font-semibold text-[#059669]">
                                                    <Check size={12} strokeWidth={3} />{t('billing.fullyBilledChip')}
                                                </span>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2">
                                                    <input
                                                        ref={(el) => { percentInputRefs.current[order.id] = el; }}
                                                        type="number"
                                                        min={1}
                                                        max={remaining}
                                                        defaultValue=""
                                                        placeholder={`%${remaining}`}
                                                        className={`${inputClass} h-8 w-20 px-2.5 text-right text-sm`}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') void billSingle(order); }}
                                                    />
                                                    <Button
                                                        size="sm"
                                                        variant="primary"
                                                        icon={<ReceiptText size={12} />}
                                                        loading={busy}
                                                        onClick={() => void billSingle(order)}
                                                    >
                                                        {t('billing.buttonLabel')}
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            {/* The project's issued invoices, approve/cancel inline. */}
            <SectionCard title={t('projects.detail.projectInvoices')} noPadding>
                {invoices.length === 0 ? (
                    <div className="px-4 py-10 text-center text-[12px] text-slate-400">{t('projects.detail.noInvoicesYet')}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[700px] text-left text-[12.5px]">
                            <thead>
                                <tr className="border-b border-slate-100 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:border-white/10">
                                    <th className="px-4 py-2">{t('common.date')}</th>
                                    <th className="px-3 py-2">{t('billing.invoiceNumber')}</th>
                                    <th className="px-3 py-2">{t('projects.detail.colOrder')}</th>
                                    <th className="px-3 py-2 text-right">{t('projects.detail.colPercent')}</th>
                                    <th className="px-3 py-2 text-right">{t('projects.detail.colAmount')}</th>
                                    <th className="px-3 py-2">{t('projects.detail.colNote')}</th>
                                    <th className="px-3 py-2">{t('common.status')}</th>
                                    <th className="px-4 py-2 text-right">{t('projects.detail.colAction')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {invoices.map((invoice) => (
                                    <tr key={invoice.id}>
                                        <td className="px-4 py-2.5 text-slate-500">{dayjs(invoice.createdAt).format('DD.MM.YYYY')}</td>
                                        <td className="px-3 py-2.5 font-semibold text-slate-800">{invoice.invoiceNumber}</td>
                                        <td className="px-3 py-2.5 text-slate-600">
                                            {invoice.salesOrder?.orderNumber ? localizeTenderNumbersInText(invoice.salesOrder.orderNumber) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-600">%{Math.round(Number(invoice.billedPercent) || 0)}</td>
                                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">{money(invoice.amount)}</td>
                                        <td className="max-w-40 truncate px-3 py-2.5 text-slate-500">{invoice.notes || '—'}</td>
                                        {/* Payment confirmation is not asserted here: an
                                            invoice is either live or cancelled. Whether it
                                            has been settled is decided elsewhere, so this
                                            screen no longer offers "mark as paid". */}
                                        <td className="px-3 py-2.5">
                                            {invoice.status === 'CANCELLED' ? (
                                                <StatusChip variant="passive">{t('crm.invoiceStatus_CANCELLED')}</StatusChip>
                                            ) : (
                                                <StatusChip variant="info">{t('crm.invoiceStatus_ISSUED')}</StatusChip>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {invoice.status === 'CANCELLED' ? (
                                                <span className="block text-right text-slate-300">—</span>
                                            ) : (
                                                <div className="flex items-center justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        icon={<X size={12} />}
                                                        disabled={updatingInvoiceId === invoice.id}
                                                        onClick={() => void changeStatus(invoice.id, 'CANCELLED')}
                                                    >
                                                        {t('projects.detail.markCancelled')}
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </div>
    );
});
