import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ChevronRight as RightOutlined,
    SearchLg as SearchOutlined,
    ChevronLeft as LeftOutlined,
} from '../../components/icons/antIconCompat';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Input } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { myOrdersApi } from '../../lib/api/billing';
import { orderBillingLines, orderBillingTotals } from '../../lib/orderBillingTotals';
import type { MyOrderDto } from '../../types/billing';

import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

const PAGE_SIZE = 10;

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

// Solid status chips, matching the shared StatusChip used across the other
// modules (no translucent "glass" tints).
const billingChipVariant = (billed: number): 'active' | 'warning' | 'info' =>
    billed >= 100 ? 'active' : billed <= 0 ? 'warning' : 'info';

// Always carries the figure once anything is invoiced — including the full
// state, which reads "100% billed" rather than a bare "Billed".
const billingChipLabel = (billed: number) =>
    billed <= 0 ? t('crm.faturalanmadi') : t('crm.partially_billed', { percent: Math.round(billed) });

const BillingChip = ({ billed }: { billed: number }) => (
    <StatusChip variant={billingChipVariant(billed)}>{billingChipLabel(billed)}</StatusChip>
);

/**
 * Group figures come from the shared helper so this list and the order detail
 * page always show the same numbers, and invoiced + remaining always closes
 * against the total.
 */
const groupTotals = (order: MyOrderDto) => orderBillingTotals(orderBillingLines(order));

/**
 * One row per order group — a pure overview. Invoicing is NOT done from here:
 * clicking the row opens the order, and the billing entry plus that order's
 * issued invoices live there. Additional orders are summarised as a count
 * rather than listed underneath, so the table never expands downwards.
 */
const OrderRow: React.FC<{ order: MyOrderDto }> = ({ order }) => {
    const navigate = useNavigate();
    const addons = order.addonSalesOrders || [];
    const amounts = groupTotals(order);
    const percent = amounts.percent;

    return (
        <tr
            className="cursor-pointer bg-[#272f67]/[0.04] transition-colors hover:bg-[#272f67]/[0.08] active:bg-[#272f67]/[0.1]"
            onClick={() => navigate(`/crm/my-orders/${order.id}`)}
        >
            <td className="py-3 pl-4 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-primary">{localizeTenderNumbersInText(order.orderNumber)}</span>
                    {addons.length > 0 && (
                        <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-700">
                            {t('crm.additionalOrdersCount', { count: addons.length })}
                        </span>
                    )}
                </div>
            </td>
            <td className="px-4 py-3 text-[12.5px] text-secondary">{order.customer?.companyName || t('crm.customer_not_found')}</td>
            <td className="px-4 py-3">
                <BillingChip billed={percent} />
            </td>
            <td className="px-4 py-3 text-right text-[12.5px] font-semibold text-primary">{fmtMoney(amounts.total)}</td>
            <td className="px-4 py-3 text-right text-[12.5px] font-semibold text-emerald-600">{fmtMoney(amounts.billed)}</td>
            <td className="px-4 py-3 text-right text-[12.5px] font-semibold text-amber-600">{fmtMoney(amounts.remaining)}</td>
        </tr>
    );
};

export const MyOrders = () => {
    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

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
        const groups = orders.map(groupTotals);
        const ordered = groups.reduce((sum, g) => sum + g.total, 0);
        const billed = groups.reduce((sum, g) => sum + g.billed, 0);
        // Mean of the per-group averages, so one large order cannot dominate the
        // headline figure the way an amount-weighted share would.
        const averagePercent = groups.length
            ? Math.round(groups.reduce((sum, g) => sum + g.percent, 0) / groups.length)
            : 0;
        // Derived, not summed from clamped per-order remainders, so the three
        // header figures always reconcile.
        return { ordered, billed, remaining: ordered - billed, averagePercent };
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
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-xl font-semibold text-emerald-600">{fmtMoney(totals.billed)}</span>
                        {/* Average invoiced share across every order group. */}
                        <span className="font-mono text-[13px] font-semibold tabular-nums text-tertiary">
                            {t('crm.averageBilled')} {totals.averagePercent}%
                        </span>
                    </div>
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
                                        <th className="py-2.5 pl-4 pr-4 font-semibold">{t('crm.order_no')}</th>
                                        <th className="px-4 py-2.5 font-semibold">{t('nav.quickActionsGroup.customers')}</th>
                                        <th className="px-4 py-2.5 font-semibold">{t('common.status')}</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">{t('common.total')}</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">{t('billing.billed')}</th>
                                        <th className="px-4 py-2.5 text-right font-semibold">{t('billing.remaining')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pageOrders.map((order) => (
                                        <OrderRow key={order.id} order={order} />
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
