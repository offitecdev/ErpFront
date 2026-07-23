import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowDown,
    ArrowUp,
    ChevronLeft,
    ChevronRight,
    Plus,
    SearchLg as Search,
    X as XIcon,
} from '../../components/icons/antIconCompat';
import Tooltip from 'antd/es/tooltip';
import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Select } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { myOrdersApi } from '../../lib/api/billing';
import { orderBillingLines, orderBillingTotals } from '../../lib/orderBillingTotals';
import type { MyOrderDto } from '../../types/billing';

import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

const PAGE_SIZE = 15;

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

// Filtre satırı kontrolü — Teklifler/Projeler listesindeki desenle aynı.
const LIST_FILTER_CONTROL =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 placeholder:text-slate-400 transition-colors hover:bg-slate-100 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10';

type SortDirection = 'asc' | 'desc';
type OrderBillingState = 'notBilled' | 'partial' | 'billed';

// Solid status chips, matching the shared StatusChip used across the other modules.
const billingChipVariant = (billed: number): 'active' | 'warning' | 'info' =>
    billed >= 100 ? 'active' : billed <= 0 ? 'warning' : 'info';

// Always carries the figure once anything is invoiced — including the full
// state, which reads "100% billed" rather than a bare "Billed".
const billingChipLabel = (billed: number) =>
    billed <= 0 ? t('crm.faturalanmadi') : t('crm.partially_billed', { percent: Math.round(billed) });

const orderBillingState = (percent: number): OrderBillingState =>
    percent <= 0 ? 'notBilled' : percent >= 100 ? 'billed' : 'partial';

const orderCustomerName = (o: MyOrderDto) => o.customer?.companyName || '';
// Group figures come from the shared helper so this list and the order detail
// page always show the same numbers.
const groupTotals = (order: MyOrderDto) => orderBillingTotals(orderBillingLines(order));

const SortableHeader = ({
    label,
    column,
    sortBy,
    sortDirection,
    onSort,
    align = 'left',
}: {
    label: ReactNode;
    column: string;
    sortBy: string;
    sortDirection: SortDirection;
    onSort: (column: string, direction: SortDirection) => void;
    align?: 'left' | 'right' | 'center';
}) => (
    <th className={`px-4 py-2.5 font-semibold ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
        <div className={`flex min-w-0 items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
            <span className="truncate">{label}</span>
            <span className="inline-flex shrink-0 items-center">
                <Tooltip title={t('common.sortAscending')}>
                    <button
                        type="button"
                        aria-label={t('common.sortAscending')}
                        aria-pressed={sortBy === column && sortDirection === 'asc'}
                        onClick={() => onSort(column, 'asc')}
                        className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
                            sortBy === column && sortDirection === 'asc' ? 'text-[#272f67]' : 'text-slate-400'
                        }`}
                    >
                        <ArrowUp size={10} />
                    </button>
                </Tooltip>
                <Tooltip title={t('common.sortDescending')}>
                    <button
                        type="button"
                        aria-label={t('common.sortDescending')}
                        aria-pressed={sortBy === column && sortDirection === 'desc'}
                        onClick={() => onSort(column, 'desc')}
                        className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
                            sortBy === column && sortDirection === 'desc' ? 'text-[#272f67]' : 'text-slate-400'
                        }`}
                    >
                        <ArrowDown size={10} />
                    </button>
                </Tooltip>
            </span>
        </div>
    </th>
);

export const MyOrders = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [orderNoFilter, setOrderNoFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | OrderBillingState>('');
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [page, setPage] = useState(1);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const list = await myOrdersApi.list();
                if (!cancelled) setOrders(list);
            } catch (e: any) {
                if (!cancelled) toast.error(e.response?.data?.error ||t('crm.orders_yuklenemedi'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortDirection(direction); };

    // Filtre değişiminde sayfayı başa sar.
    useEffect(() => { setPage(1); }, [search, orderNoFilter, customerFilter, statusFilter, sortBy, sortDirection]);

    // Faturalama tutarları/yüzdesi her satırda bir kez hesaplanır.
    const rows = useMemo(() => orders.map((o) => ({ order: o, totals: groupTotals(o) })), [orders]);

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        const of = orderNoFilter.trim().toLowerCase();
        const cf = customerFilter.trim().toLowerCase();
        let list = rows.filter(({ order, totals }) => {
            if (statusFilter && orderBillingState(totals.percent) !== statusFilter) return false;
            const no = (order.orderNumber || '').toLowerCase();
            const cust = orderCustomerName(order).toLowerCase();
            if (s && !(no.includes(s) || cust.includes(s))) return false;
            if (of && !no.includes(of)) return false;
            if (cf && !cust.includes(cf)) return false;
            return true;
        });
        const dir = sortDirection === 'asc' ? 1 : -1;
        list = [...list].sort((a, b) => {
            switch (sortBy) {
                case 'orderNumber': return dir * (a.order.orderNumber || '').localeCompare(b.order.orderNumber || '');
                case 'customer': return dir * orderCustomerName(a.order).localeCompare(orderCustomerName(b.order));
                case 'total': return dir * (a.totals.total - b.totals.total);
                default: return dir * (new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime());
            }
        });
        return list;
    }, [rows, search, orderNoFilter, customerFilter, statusFilter, sortBy, sortDirection]);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
    const rangeFrom = total === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
    const rangeTo = Math.min(pageSafe * PAGE_SIZE, total);

    const hasActiveFilters = Boolean(search || orderNoFilter || customerFilter || statusFilter);
    const clearFilters = () => { setSearch(''); setOrderNoFilter(''); setCustomerFilter(''); setStatusFilter(''); };

    return (
        <div>
            <InventoryListHeader title={t('nav.myOrders')} />

            <Card noPadding>
                {/* Üst çubuk — arama (esner) + sıralama + sayfalama (sağda).
                    Durum filtresi kolon filtre satırındadır. */}
                <div className="px-3 py-3">
                    <div className="flex w-full flex-wrap items-center gap-3">
                        <div className="relative w-[240px] min-w-0 shrink">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('crm.order_customer_search')}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[13px] transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    aria-label={t('common.clear')}
                                    title={t('common.clear')}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                                >
                                    <XIcon size={12} />
                                </button>
                            )}
                        </div>
                        <div className="w-[200px] shrink-0">
                            <Select
                                value={`${sortBy}:${sortDirection}`}
                                onChange={(event) => {
                                    const [column, direction] = event.target.value.split(':') as [string, SortDirection];
                                    handleSort(column, direction);
                                }}
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                                aria-label={t('common.sortOrder')}
                            >
                                {sortBy !== 'createdAt' && (
                                    <option value={`${sortBy}:${sortDirection}`}>{t('common.sortOrder')}</option>
                                )}
                                <option value="createdAt:desc">{t('common.sortNewest')}</option>
                                <option value="createdAt:asc">{t('common.sortOldest')}</option>
                            </Select>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-3">
                            <span className="font-mono text-[12px] text-slate-500">{rangeFrom}-{rangeTo} / {total}</span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={pageSafe <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.back')}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="px-1 font-mono text-[12px] tabular-nums text-slate-500">{pageSafe} / {totalPages}</span>
                                <button
                                    type="button"
                                    disabled={pageSafe >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.next')}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full table-fixed text-left text-[12.5px] [&_th]:border-r [&_th]:border-slate-200 [&_td]:border-r [&_td]:border-slate-200 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                        <colgroup>
                            <col style={{ width: '20%' }} />
                            <col style={{ width: '22%' }} />
                            <col style={{ width: '16%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '14%' }} />
                        </colgroup>
                        <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <SortableHeader label={t('crm.order_no')} column="orderNumber" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                <SortableHeader label={t('nav.quickActionsGroup.customers')} column="customer" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                                <th className="px-4 py-2.5 font-semibold">{t('common.status')}</th>
                                <SortableHeader label={t('common.total')} column="total" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} align="right" />
                                <th className="px-4 py-2.5 text-right font-semibold">{t('billing.billed')}</th>
                                <th className="px-4 py-2.5 text-right font-semibold">{t('billing.remaining')}</th>
                            </tr>
                            {/* Kolon bazlı filtre satırı — sipariş no / müşteri metinle, durum seçiciyle daraltır. */}
                            <tr data-filter-row className="bg-white border-b border-slate-100">
                                <th className="px-2 py-1.5 font-normal">
                                    <input value={orderNoFilter} onChange={(e) => setOrderNoFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={LIST_FILTER_CONTROL} />
                                </th>
                                <th className="px-2 py-1.5 font-normal">
                                    <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={LIST_FILTER_CONTROL} />
                                </th>
                                <th className="px-2 py-1.5 font-normal">
                                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | OrderBillingState)} aria-label={t('common.status')} className={LIST_FILTER_CONTROL}>
                                        <option value="">{t('common.all')}</option>
                                        <option value="notBilled">{t('crm.faturalanmadi')}</option>
                                        <option value="partial">{t('projects.orderPartial')}</option>
                                        <option value="billed">{t('projects.orderBilled')}</option>
                                    </select>
                                </th>
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 w-full animate-pulse rounded bg-slate-100" /></td></tr>
                            ))}
                            {!loading && paged.length === 0 && (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="px-4 py-6">
                                            <EmptyState
                                                icon={<Search size={32} />}
                                                title={t('crm.order_not_found')}
                                                description={hasActiveFilters ?t('auto.secili_filtrelere_uygun_proje_bulunamadi_arama_v') :t('crm.no_goruntulenecek_bir_order_yet')}
                                                action={hasActiveFilters ? (
                                                    <Button variant="secondary" size="sm" icon={<XIcon size={13} />} onClick={clearFilters}>{t('auto.filtreleri_temizle')}</Button>
                                                ) : undefined}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && paged.map(({ order, totals }) => {
                                const addons = order.addonSalesOrders || [];
                                return (
                                    <tr key={order.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => navigate(`/crm/my-orders/${order.id}`)}>
                                        <td className="px-4 py-2.5">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span className="truncate font-semibold text-slate-800">{localizeTenderNumbersInText(order.orderNumber)}</span>
                                                {addons.length > 0 && (
                                                    <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                                                        <Plus size={9} />{t('crm.additionalOrdersCount', { count: addons.length })}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-slate-400">{new Date(order.createdAt).toLocaleDateString('de-CH')}</div>
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-600"><span className="block truncate">{order.customer?.companyName || t('crm.customer_not_found')}</span></td>
                                        <td className="px-4 py-2.5">
                                            <StatusChip variant={billingChipVariant(totals.percent)}>{billingChipLabel(totals.percent)}</StatusChip>
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">{fmtMoney(totals.total)}</td>
                                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-600">{fmtMoney(totals.billed)}</td>
                                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-amber-600">{fmtMoney(totals.remaining)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
