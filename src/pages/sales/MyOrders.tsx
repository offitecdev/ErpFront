import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CornerDownRight, Plus } from '../../components/icons/antIconCompat';
import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { ColResizeHandle, FILTER_INPUT_CLASS, Pager, ResizableCols, SearchBox, SectionCard, SortableTh, TableStateRow } from '../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../hooks/useColumnWidths';
import { myOrdersApi } from '../../lib/api/billing';
import { lineBilled, linePercent, lineRemaining, lineTotal, orderBillingLines, orderBillingTotals } from '../../lib/orderBillingTotals';
import type { MyOrderDto, MyOrderListAddonDto } from '../../types/billing';

import { t } from '@/i18n/translate';

const PAGE_SIZE = 15;

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

type SortDirection = 'asc' | 'desc';
type OrderSortKey = 'createdAt' | 'orderNumber' | 'customer' | 'total';
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
// Teklif onaylanırken seçilen yol: INVOICE = teslimat siparişi, PROJECT_* proje
// üzerinden yürür. Eski kayıtlarda tür boşsa projenin varlığına bakılır.
const isDeliveryRow = (o: MyOrderDto) => (o.orderType ? o.orderType === 'INVOICE' : !o.project);
// Group figures come from the shared helper so this list and the order detail
// page always show the same numbers.
const groupTotals = (order: MyOrderDto) => orderBillingTotals(orderBillingLines(order));
// Ek siparişin kendi satır figürleri de aynı kaynaktan (line* yardımcıları) gelir.
const addonLine = (addon: MyOrderListAddonDto) => ({
    id: addon.id,
    orderNumber: addon.orderNumber,
    isAddon: true,
    summary: addon.billingSummary,
    totalAmount: Number(addon.totalAmount || 0),
});

export const MyOrders = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [orderNoFilter, setOrderNoFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | OrderBillingState>('');
    // Sürüklenebilir sütunlar; sipariş no sütununun genişliği yoktur, kalanı o emer.
    const grid = useColumnWidths({
        storageKey: 'offitec:order-list:col-widths:v1',
        defaults: { customer: 224, project: 168, status: 160, total: 144, billed: 144, remaining: 144 },
        minPx: 72,
    });
    const [sortBy, setSortBy] = useState<OrderSortKey>('createdAt');
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

    // Ürün listesiyle aynı davranış: aynı kolona tıklandıkça asc/desc döner.
    const toggleSort = (column: OrderSortKey) => {
        setSortDirection(sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc');
        setSortBy(column);
    };

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
            // Ek siparişler ana siparişin altında satır olarak listelendiği için
            // NT- numarasıyla arama/filtre de grubun tamamını bulur.
            const addonNos = (order.addonSalesOrders || []).map((a) => (a.orderNumber || '').toLowerCase());
            if (s && !(no.includes(s) || cust.includes(s) || addonNos.some((n) => n.includes(s)))) return false;
            if (of && !(no.includes(of) || addonNos.some((n) => n.includes(of)))) return false;
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

    const hasActiveFilters = Boolean(search || orderNoFilter || customerFilter || statusFilter);

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader title={t('nav.myOrders')} />

            {/* Üst çubuk — ürün listesiyle aynı: genel arama + durum seçici. */}
            <div className="flex flex-wrap items-center gap-2">
                <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder={t('crm.order_customer_search')}
                    className="w-64"
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as '' | OrderBillingState)}
                    aria-label={t('common.status')}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{t('common.all')}</option>
                    <option value="notBilled">{t('crm.faturalanmadi')}</option>
                    <option value="partial">{t('projects.orderPartial')}</option>
                    <option value="billed">{t('projects.orderBilled')}</option>
                </select>
            </div>

            <SectionCard title={`${t('nav.myOrders')} (${total})`}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        {/* Sipariş no: genişliği yok, kalan yeri emer. */}
                        <col />
                        <ResizableCols keys={['customer', 'project', 'status', 'total', 'billed', 'remaining'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <SortableTh label={t('crm.order_no')} sortKey="orderNumber" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" />
                            <SortableTh label={t('nav.quickActionsGroup.customers')} sortKey="customer" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('customer')} />
                            <th className="relative text-left">
                                {t('nav.projects')}
                                <ColResizeHandle {...grid.resizeProps('project')} />
                            </th>
                            <th className="relative text-left">
                                {t('common.status')}
                                <ColResizeHandle {...grid.resizeProps('status')} />
                            </th>
                            <SortableTh label={t('common.total')} sortKey="total" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-right" {...grid.resizeProps('total')} />
                            <th className="relative text-right">
                                {t('billing.billed')}
                                <ColResizeHandle {...grid.resizeProps('billed')} />
                            </th>
                            <th className="relative text-right">
                                {t('billing.remaining')}
                                <ColResizeHandle {...grid.resizeProps('remaining')} />
                            </th>
                        </tr>
                        {/* Kolon bazlı filtre satırı — sipariş no / müşteri metinle daraltır. */}
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input value={orderNoFilter} onChange={(e) => setOrderNoFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={FILTER_INPUT_CLASS} />
                            </th>
                            <th className="pb-1.5">
                                <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={FILTER_INPUT_CLASS} />
                            </th>
                            {/* Filtresi olmayan sütunlar da kendi (boş) hücrelerini
                                alır ki sütun çizgileri burada da kesilmesin. */}
                            <th />
                            <th />
                            <th />
                            <th />
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || paged.length === 0) && (
                            <TableStateRow
                                colSpan={7}
                                loading={loading}
                                emptyText={hasActiveFilters ?t('auto.secili_filtrelere_uygun_proje_bulunamadi_arama_v') :t('crm.no_goruntulenecek_bir_order_yet')}
                            />
                        )}
                        {!loading && paged.map(({ order, totals }) => {
                            const addons = order.addonSalesOrders || [];
                            return (
                                <Fragment key={order.id}>
                                <tr className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => navigate(`/sales/orders/${order.id}`)}>
                                    <td>
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="truncate font-semibold text-slate-800 dark:text-white">{order.orderNumber}</span>
                                            {addons.length > 0 && (
                                                <span className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                                    <Plus size={9} />{t('crm.additionalOrdersCount', { count: addons.length })}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-slate-400 dark:text-white/50">{new Date(order.createdAt).toLocaleDateString('de-CH')}</div>
                                    </td>
                                    <td className="text-slate-600 dark:text-white/80"><span className="block truncate">{order.customer?.companyName || t('crm.customer_not_found')}</span></td>
                                    {/* Teklif onaylanırken seçilen yol her satırda görünür:
                                        proje siparişi proje numarasının altında etiketlenir,
                                        projesi olmayan sipariş teslimat siparişidir. */}
                                    <td>
                                        {isDeliveryRow(order) ? (
                                            <StatusChip variant="neutral">{t('crm.deliveryOrder')}</StatusChip>
                                        ) : (
                                            <>
                                                <span className="block truncate font-mono text-[12px] text-slate-600 dark:text-white/70">
                                                    {order.project?.projectNumber || order.project?.projectName || '-'}
                                                </span>
                                                <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-[#272f67] dark:text-white/50">
                                                    {t('crm.projectOrder')}
                                                </span>
                                            </>
                                        )}
                                    </td>
                                    <td>
                                        <StatusChip variant={billingChipVariant(totals.percent)}>{billingChipLabel(totals.percent)}</StatusChip>
                                    </td>
                                    <td className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">{fmtMoney(totals.total)}</td>
                                    <td className="text-right font-mono text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoney(totals.billed)}</td>
                                    <td className="text-right font-mono text-[13px] font-semibold text-amber-600 dark:text-amber-400">{fmtMoney(totals.remaining)}</td>
                                </tr>
                                {/* Ek siparişler ana siparişin hemen altında kendi
                                    satırlarıyla listelenir; tıklamak ana siparişin
                                    Zusatzaufträge sekmesine götürür ve ilgili ek
                                    siparişin içerik popup'ını orada açar. */}
                                {addons.map((addon) => {
                                    const line = addonLine(addon);
                                    const percent = linePercent(line);
                                    const date = addon.orderDate || addon.createdAt;
                                    return (
                                        <tr
                                            key={addon.id}
                                            className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                            onClick={() => navigate(`/sales/orders/${order.id}?tab=addons&addon=${addon.id}`)}
                                        >
                                            <td>
                                                <div className="flex min-w-0 items-center gap-2 pl-5">
                                                    <CornerDownRight size={12} className="shrink-0 text-amber-500" />
                                                    <span className="truncate font-semibold text-slate-700 dark:text-white/85">{addon.orderNumber}</span>
                                                    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                                        {t('projects.addonOrder')}
                                                    </span>
                                                </div>
                                                <div className="pl-10 text-[11px] text-slate-400 dark:text-white/50">
                                                    {date ? new Date(date).toLocaleDateString('de-CH') : '-'}
                                                </div>
                                            </td>
                                            {/* Müşteri/proje ana siparişinkiyle aynı — satırın bir
                                                alt kayıt olduğu okunsun diye soluk tekrarlanır. */}
                                            <td className="text-slate-400 dark:text-white/40"><span className="block truncate">{order.customer?.companyName || ''}</span></td>
                                            <td className="font-mono text-[12px] text-slate-400 dark:text-white/40">
                                                <span className="block truncate">{isDeliveryRow(order) ? '' : (order.project?.projectNumber || order.project?.projectName || '')}</span>
                                            </td>
                                            <td>
                                                <StatusChip variant={billingChipVariant(percent)}>{billingChipLabel(percent)}</StatusChip>
                                            </td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoney(lineTotal(line))}</td>
                                            <td className="text-right font-mono text-[13px] text-emerald-600/90 dark:text-emerald-400/90">{fmtMoney(lineBilled(line))}</td>
                                            <td className="text-right font-mono text-[13px] text-amber-600/90 dark:text-amber-400/90">{fmtMoney(lineRemaining(line))}</td>
                                        </tr>
                                    );
                                })}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={pageSafe}
                        totalPages={totalPages}
                        total={total}
                        pageSize={PAGE_SIZE}
                        onPage={setPage}
                    />
                </div>
            </SectionCard>
        </div>
    );
};
