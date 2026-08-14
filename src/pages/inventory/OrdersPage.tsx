import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';
import type { PurchaseOrderStatus } from '@/types/inventory';
import { ColResizeHandle, FILTER_INPUT_CLASS, Pager, ResizableCols, SearchBox, SectionCard, TableStateRow } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { OrderSheet } from './components/OrderSheet';
import { useLanguageTick } from './hooks/useLanguageTick';
import { ORDERS_PAGE_SIZE, useOrdersList } from './hooks/useOrdersList';
import { fmtDateTime, fmtMoneyIn } from './utils/format';
import { FILTERABLE_ORDER_STATUSES, ORDER_STATUS_META } from './utils/orderStatus';

const TOOLBAR_CONTROL_CLASS = 'h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white';

/**
 * Satın alma siparişleri listesi. Satıra tıklanınca detay/önizleme popup'ı
 * (OrderSheet) açılır; ok tuşlarıyla sayfadaki siparişler arasında gezilir.
 */
// Sürüklenebilir sütun genişlikleri. Proje sütunu burada YOKTUR: genişliği
// olmayan tek sütun odur ve artan yeri o emer.
const ORDER_LIST_COLUMN_WIDTHS = {
    reference: 144,
    quote: 144,
    supplier: 192,
    itemCount: 96,
    total: 128,
    date: 160,
    status: 192,
};
type OrderListColumn = keyof typeof ORDER_LIST_COLUMN_WIDTHS;

export const OrdersPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const canManage = permissions.includes('inventory.transfer');
    const list = useOrdersList();
    // Sürüklenebilir sütunlar: proje sütununun solundakiler SAĞ kenarlarından,
    // sağındakiler sol kenarlarından tutulur — her tutamaç kendi taşıdığı çizgi.
    const grid = useColumnWidths<OrderListColumn>({
        storageKey: 'offitec:inv-orders:col-widths:v1',
        defaults: ORDER_LIST_COLUMN_WIDTHS,
        minPx: 72,
    });

    // Açık popup, sayfadaki listenin indeksiyle takip edilir (sol/sağ gezinme).
    const [sheetIndex, setSheetIndex] = useState<number | null>(null);
    const openOrder = sheetIndex !== null ? list.items[sheetIndex] ?? null : null;

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('inv.orders.title')}
                action={canManage ? (
                    <button
                        type="button"
                        onClick={() => navigate('/inventory/orders/new')}
                        className="rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                    >
                        {t('inv.orders.addButton')}
                    </button>
                ) : undefined}
            />

            <div className="flex flex-wrap items-center gap-2">
                <SearchBox
                    value={list.search}
                    onChange={list.setSearch}
                    placeholder={t('inv.orders.searchPlaceholder')}
                    className="w-64"
                />
                <select
                    value={list.status}
                    onChange={(event) => list.setStatus(event.target.value as PurchaseOrderStatus | '')}
                    aria-label={t('inv.columns.status')}
                    className={TOOLBAR_CONTROL_CLASS}
                >
                    <option value="">{t('inv.orders.allStatuses')}</option>
                    {FILTERABLE_ORDER_STATUSES.map((status) => (
                        <option key={status} value={status}>{t(ORDER_STATUS_META[status].labelKey)}</option>
                    ))}
                </select>
                <input
                    type="date"
                    value={list.dateFrom}
                    onChange={(event) => list.setDateFrom(event.target.value)}
                    aria-label={t('inv.movements.dateFrom')}
                    className={TOOLBAR_CONTROL_CLASS}
                />
                <span className="text-[12px] text-slate-400">—</span>
                <input
                    type="date"
                    value={list.dateTo}
                    onChange={(event) => list.setDateTo(event.target.value)}
                    aria-label={t('inv.movements.dateTo')}
                    className={TOOLBAR_CONTROL_CLASS}
                />
            </div>

            <SectionCard title={t('inv.orders.sectionTitle', { count: list.total })}>
                <div className="overflow-x-auto">
                    {/* min-w, DURUM SÜTUNU GENİŞLEDİĞİ için 880 → 960: rozet tek
                        satırda kalmalı ("Bestellung bestätigt" gibi uzun etiketler
                        de dahil — kullanıcı isteği 2026-08-03). */}
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[960px]">
                        <colgroup>
                            <ResizableCols keys={['reference', 'quote'] as const} grid={grid} />
                            {/* Proje sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                            <ResizableCols keys={['supplier', 'itemCount', 'total', 'date', 'status'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="relative text-left">
                                    {t('inv.orders.columns.reference')}
                                    <ColResizeHandle {...grid.resizeProps('reference', 'right')} />
                                </th>
                                <th className="relative text-left">
                                    {t('inv.orders.columns.quoteNumber')}
                                    <ColResizeHandle {...grid.resizeProps('quote', 'right')} />
                                </th>
                                <th className="text-left">{t('inv.orders.columns.project')}</th>
                                <th className="relative text-left">
                                    {t('inv.columns.supplier')}
                                    <ColResizeHandle {...grid.resizeProps('supplier')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.orders.columns.itemCount')}
                                    <ColResizeHandle {...grid.resizeProps('itemCount')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.columns.total')}
                                    <ColResizeHandle {...grid.resizeProps('total')} />
                                </th>
                                <th className="relative text-left">
                                    {t('common.date')}
                                    <ColResizeHandle {...grid.resizeProps('date')} />
                                </th>
                                {/* Durum rozeti ASLA sarılmaz; sütun en uzun etiketi
                                    tek satırda taşıyacak kadar geniştir. */}
                                <th className="relative text-left">
                                    {t('inv.columns.status')}
                                    <ColResizeHandle {...grid.resizeProps('status')} />
                                </th>
                            </tr>
                            {/* Kolon filtreleri: sipariş no / ad / tedarikçi. */}
                            <tr data-filter-row>
                                <th className="pb-1.5">
                                    <input
                                        value={list.filters.reference}
                                        onChange={(event) => list.setFilters({ ...list.filters, reference: event.target.value })}
                                        placeholder={t('inv.orders.filters.reference')}
                                        className={FILTER_INPUT_CLASS}
                                    />
                                </th>
                                <th className="pb-1.5">
                                    <input
                                        value={list.filters.quote}
                                        onChange={(event) => list.setFilters({ ...list.filters, quote: event.target.value })}
                                        placeholder={t('inv.orders.filters.quote')}
                                        className={FILTER_INPUT_CLASS}
                                    />
                                </th>
                                <th className="pb-1.5">
                                    <input
                                        value={list.filters.project}
                                        onChange={(event) => list.setFilters({ ...list.filters, project: event.target.value })}
                                        placeholder={t('inv.orders.filters.project')}
                                        className={FILTER_INPUT_CLASS}
                                    />
                                </th>
                                <th className="pb-1.5">
                                    <input
                                        value={list.filters.supplier}
                                        onChange={(event) => list.setFilters({ ...list.filters, supplier: event.target.value })}
                                        placeholder={t('inv.orders.filters.supplier')}
                                        className={FILTER_INPUT_CLASS}
                                    />
                                </th>
                                {/* Filtresi olmayan sütunlar da kendi (boş)
                                    hücrelerini alır ki çizgiler kesilmesin. */}
                                <th />
                                <th />
                                <th />
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {(list.loading || list.items.length === 0) && (
                                <TableStateRow colSpan={8} loading={list.loading} emptyText={list.error || t('inv.orders.empty')} />
                            )}
                            {!list.loading && list.items.map((order, index) => {
                                const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.PENDING;
                                return (
                                    <tr
                                        key={order.id}
                                        onClick={() => setSheetIndex(index)}
                                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                    >
                                        <td className="font-mono text-[13px] text-slate-700 dark:text-white/80">{order.referenceNumber}</td>
                                        <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{order.quoteNumber || '—'}</td>
                                        <td className="max-w-0 truncate text-slate-800 dark:text-white" title={order.projectName || undefined}>
                                            {order.projectName || '—'}
                                        </td>
                                        <td className="max-w-0 truncate text-slate-500 dark:text-white/60" title={order.supplierName}>
                                            {order.supplierName}
                                        </td>
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{order.itemCount}</td>
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                            {fmtMoneyIn(order.totalNet, order.currency)}
                                        </td>
                                        <td className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">{fmtDateTime(order.createdAt)}</td>
                                        <td>
                                            <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                                                {t(meta.labelKey)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={list.page}
                        totalPages={list.totalPages}
                        total={list.total}
                        pageSize={ORDERS_PAGE_SIZE}
                        onPage={list.setPage}
                    />
                </div>
            </SectionCard>

            {openOrder && sheetIndex !== null && (
                <OrderSheet
                    order={openOrder}
                    canManage={canManage}
                    canBack={sheetIndex > 0}
                    canNext={sheetIndex < list.items.length - 1}
                    onBack={() => setSheetIndex((current) => Math.max(0, (current ?? 0) - 1))}
                    onNext={() => setSheetIndex((current) => Math.min(list.items.length - 1, (current ?? 0) + 1))}
                    onClose={() => setSheetIndex(null)}
                    onOrderChanged={list.replaceItem}
                    onDeleted={(id) => { list.removeItem(id); setSheetIndex(null); }}
                />
            )}
        </div>
    );
};
