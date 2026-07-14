import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronDown as DownOutlined, ChevronRight as RightOutlined, SearchLg as SearchOutlined, ChevronLeft as LeftOutlined } from '../../components/icons/antIconCompat';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Input } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { BillingButton } from '../../components/billing/BillingButton';
import { myOrdersApi } from '../../lib/api/billing';
import type { MyOrderAddonDto, MyOrderDto } from '../../types/billing';

import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

const PAGE_SIZE = 10;

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

// Solid status chips, matching the shared StatusChip used across the other
// modules (no translucent "glass" tints).
const billingChipVariant = (remaining: number): 'active' | 'warning' | 'info' =>
    remaining <= 0 ? 'active' : remaining >= 100 ? 'warning' : 'info';

const billingChipLabel = (billed: number, remaining: number) =>
    remaining <= 0 ?t('crm.billed') : remaining >= 100 ?t('crm.faturalanmadi') : t('crm.partially_billed', { percent: Math.round(billed) });

const BillingChip = ({ billed, remaining }: { billed: number; remaining: number }) => (
    <StatusChip variant={billingChipVariant(remaining)}>
        {billingChipLabel(billed, remaining)}
    </StatusChip>
);

const AddonRow: React.FC<{ addon: MyOrderAddonDto; onBilled: () => void }> = ({ addon, onBilled }) => {
    const billed = addon.billingSummary?.billedPercent ?? 0;
    const remaining = addon.billingSummary?.remainingPercent ?? 100;
    return (
        // Amber tint marks addon orders apart from the navy-tinted main orders.
        // Translucent (amber-400/10) so it stays dark-theme safe.
        <tr className="bg-amber-400/10 transition-colors hover:bg-amber-400/20">
            <td className="py-2 pl-2 pr-4">
                {/* Same leading indent as OrderRow (toggle column + gap) so addon
                    order numbers line up vertically with the main order numbers */}
                <div className="flex items-center gap-1.5">
                    <span className="inline-block w-5 shrink-0" />
                    <div className="flex items-center gap-2">
                        <span className="truncate text-[12px] font-semibold text-primary">{localizeTenderNumbersInText(addon.orderNumber)}</span>
                        {addon.revisionNumber ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">N{addon.revisionNumber}</span>
                        ) : null}
                        <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{t('crm.additional_order')}</span>
                    </div>
                </div>
            </td>
            <td className="px-4 py-2 text-[12px] text-secondary">-</td>
            <td className="px-4 py-2">
                <BillingChip billed={billed} remaining={remaining} />
            </td>
            <td className="px-4 py-2 text-right text-[12px] font-semibold text-primary">{fmtMoney(addon.totalAmount)}</td>
            <td className="px-4 py-2 text-right text-[12px] text-emerald-600">{fmtMoney(addon.billingSummary?.billedAmount)}</td>
            <td className="px-4 py-2 text-right text-[12px] text-amber-600">{fmtMoney(addon.billingSummary?.remainingAmount)}</td>
            <td className="px-4 py-2 text-right">
                <BillingButton
                    target={{ type: 'order', id: addon.id, label: t('crm.additional_order_label', { number: localizeTenderNumbersInText(addon.orderNumber) }) }}
                    onBilled={onBilled}
                    size="sm"
                    variant="ghost"
                    remainingPercent={remaining}
                />
            </td>
        </tr>
    );
};

const OrderRow: React.FC<{ order: MyOrderDto; onBilled: () => void; showAddons: boolean }> = ({ order, onBilled, showAddons }) => {
    const navigate = useNavigate();
    // Addons start expanded so the main order and its additional orders are
    // billed from the same grouped view; the toggle only collapses them.
    const [expanded, setExpanded] = useState(true);
    const addons = order.addonSalesOrders || [];
    const billed = order.billingSummary?.billedPercent ?? 0;
    const remaining = order.billingSummary?.remainingPercent ?? 100;
    const showExpanded = showAddons && expanded;

    return (
        <>
            <tr className="bg-[#272f67]/[0.04] transition-colors hover:bg-[#272f67]/[0.08] active:bg-[#272f67]/[0.1]">
                <td className="pl-2 pr-4 py-3">
                    <div className="flex items-start gap-1.5">
                        {addons.length > 0 && showAddons ? (
                            <button
                                type="button"
                                onClick={() => setExpanded((v) => !v)}
                                className="flex w-5 shrink-0 justify-center text-slate-400 hover:text-slate-600"
                                aria-label={t('crm.additional_siparisleri_goster')}
                            >
                                {showExpanded ? <DownOutlined size={16} /> : <RightOutlined size={16} />}
                            </button>
                        ) : (
                            <span className="inline-block w-5 shrink-0" />
                        )}
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-[13px] font-semibold text-primary">{localizeTenderNumbersInText(order.orderNumber)}</span>
                                {order.project && (
                                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">{t('common.detail')}</span>
                                )}
                                {addons.length > 0 && (
                                    <span className="text-[11px] text-tertiary">+{addons.length} {t('crm.additional')}</span>
                                )}
                            </div>
                            <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="h-full rounded-full bg-[#272f67]"
                                    style={{ width: `${Math.max(0, Math.min(100, billed))}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </td>
                <td className="px-4 py-3 text-[12.5px] text-secondary">{order.customer?.companyName ||t('crm.customer_not_found')}</td>
                <td className="px-4 py-3">
                    <BillingChip billed={billed} remaining={remaining} />
                </td>
                <td className="px-4 py-3 text-right text-[12.5px] font-semibold text-primary">{fmtMoney(order.totalAmount)}</td>
                <td className="px-4 py-3 text-right text-[12.5px] font-semibold text-emerald-600">{fmtMoney(order.billingSummary?.billedAmount)}</td>
                <td className="px-4 py-3 text-right text-[12.5px] font-semibold text-amber-600">{fmtMoney(order.billingSummary?.remainingAmount)}</td>
                <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                        <BillingButton
                            target={{ type: 'order', id: order.id, label: t('crm.order_label', { number: localizeTenderNumbersInText(order.orderNumber) }) }}
                            onBilled={onBilled}
                            size="sm"
                            variant="primary"
                            remainingPercent={remaining}
                        />
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/crm/my-orders/${order.id}`)}>{t('common.detail')}</Button>
                    </div>
                </td>
            </tr>
            {showExpanded && addons.map((addon) => <AddonRow key={addon.id} addon={addon} onBilled={onBilled} />)}
        </>
    );
};

export const MyOrders = () => {
    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [showAddons, setShowAddons] = useState(true);

    const load = async (query = search) => {
        setLoading(true);
        try {
            setOrders(await myOrdersApi.list(query.trim() || undefined));
            setPage(1);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('crm.orders_yuklenemedi'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totals = useMemo(() => {
        const flat = orders.flatMap((o) => [o, ...(o.addonSalesOrders || [])]);
        const ordered = flat.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
        const billed = orders.reduce((sum, o) => {
            const own = o.billingSummary?.billedAmount ?? 0;
            const addon = (o.addonSalesOrders || []).reduce((s, a) => s + (a.billingSummary?.billedAmount ?? 0), 0);
            return sum + own + addon;
        }, 0);
        return { ordered, billed, remaining: Math.max(0, ordered - billed) };
    }, [orders]);

    const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
    const pageOrders = useMemo(
        () => orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        [orders, page],
    );

    return (
        <div>
            <PageHeader
                breadcrumb={t('crm.breadcrumb_my_orders')}
                title={t('nav.myOrders')}
                description={t('crm.siparislerinizin_durumunu_izleyin_additional_siparisleri')}
                actions={
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void load();
                        }}
                        className="flex items-center gap-3"
                    >
                        <label className="flex items-center gap-1.5 cursor-pointer select-none text-[12px] text-slate-600">
                            <input
                                type="checkbox"
                                checked={showAddons}
                                onChange={(e) => setShowAddons(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-slate-300"
                            />{t('crm.additional_orders')}</label>
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('crm.order_customer_search')}
                            className="w-56"
                        />
                        <Button variant="secondary" size="md" icon={<SearchOutlined />} htmlType="submit">{t('common.search')}</Button>
                    </form>
                }
            />

            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Card>
                    <div className="text-[12px] text-tertiary">{t('crm.total_order_amount')}</div>
                    <div className="mt-1 text-xl font-semibold text-primary">{fmtMoney(totals.ordered)}</div>
                </Card>
                <Card>
                    <div className="text-[12px] text-tertiary">{t('crm.billed')}</div>
                    <div className="mt-1 text-xl font-semibold text-emerald-600">{fmtMoney(totals.billed)}</div>
                </Card>
                <Card>
                    <div className="text-[12px] text-tertiary">{t('billing.remaining')}</div>
                    <div className="mt-1 text-xl font-semibold text-amber-600">{fmtMoney(totals.remaining)}</div>
                </Card>
            </div>

            <Card noPadding>
                {loading ? (
                    <div className="space-y-2 p-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-50" />
                        ))}
                    </div>
                ) : orders.length === 0 ? (
                    <div className="p-6">
                        <EmptyState title={t('crm.order_not_found')} description={t('crm.no_goruntulenecek_bir_order_yet')} />
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[12.5px]">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="pl-2 pr-4 py-2.5 font-semibold">
                                            {/* Match the row leading (toggle gutter + gap) so the
                                                header sits over the order numbers */}
                                            <span className="flex items-center gap-1.5">
                                                <span className="inline-block w-5 shrink-0" />
                                                {t('crm.order_no')}
                                            </span>
                                        </th>
                                        <th className="px-4 py-2.5 font-semibold">{t('nav.quickActionsGroup.customers')}</th>
                                        <th className="px-4 py-2.5 font-semibold">{t('common.status')}</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">{t('common.total')}</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">{t('billing.billed')}</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">{t('billing.remaining')}</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">{t('crm.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pageOrders.map((order) => (
                                        <OrderRow key={order.id} order={order} onBilled={() => void load()} showAddons={showAddons} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <PaginationBar page={page} totalPages={totalPages} total={orders.length} onPage={setPage} />
                        )}
                    </>
                )}
            </Card>
        </div>
    );
};

const pageWindow = (page: number, totalPages: number) => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i);
};

const PaginationBar: React.FC<{
    page: number;
    totalPages: number;
    total: number;
    onPage: (page: number) => void;
}> = ({ page, totalPages, total, onPage }) => (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[12px]">
        <span className="text-slate-500">{t('common.total')} {total} {t('crm.record')}</span>
        <div className="inline-flex items-center gap-1">
            <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPage(page - 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
            >
                <LeftOutlined />
            </button>
            {pageWindow(page, totalPages).map((p) => (
                <button
                    key={p}
                    type="button"
                    onClick={() => onPage(p)}
                    className={`h-8 min-w-8 rounded-md border px-2 font-medium transition-colors active:bg-slate-100 ${p === page ?"border-[#272f67] bg-[#272f67] text-white" :"border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                    {p}
                </button>
            ))}
            <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPage(page + 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
            >
                <RightOutlined />
            </button>
        </div>
    </div>
);
