import { useSearchParams, useNavigate } from 'react-router-dom';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';
import type { PurchaseOrderStatus } from '@/types/inventory';
import { ColResizeHandle, FILTER_INPUT_CLASS, FilterBar, Pager, ResizableCols, SearchBox, SectionCard, TableStateRow } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useLanguageTick } from './hooks/useLanguageTick';
import { ORDERS_PAGE_SIZE, useOrdersList } from './hooks/useOrdersList';
import { fmtDateTime, fmtMoneyIn } from './utils/format';
import { ORDER_STATUS_META, statusesOfKind, type PurchaseKind } from './utils/orderStatus';
import { MacDatePicker } from '@/components/ui-shared/MacDatePicker';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import '@/styles/modules/orderWorkspace.css';

/* Der Filter neben der Suche trägt das hausweite Mass (styles/controls.css). */
const TOOLBAR_CONTROL_CLASS = 'ofi-filter';

/**
 * ══ ZWEI LISTEN, EIN FENSTER (Vorgabe Samet, 22.09.2026) ═══════════════════
 *
 * «Ana listede artık fiyat talebi ve sipariş ayrıldı … mal kabul artık süreç
 *  olarak değil, ana listede DURUM olarak gösterilecek, turuncu MAL KABULDE.»
 *
 * Der Umschalter oben ist ein macOS-Segmentcontrol, kein Filter im Filter:
 * links die PREISANFRAGEN, rechts die BESTELLUNGEN. Die Wahl steht in der
 * Adresse (`?kind=`), damit ein Link genau die Liste öffnet, die gemeint war.
 * Ein Vorgang wechselt nie die Seite: aus einer Anfrage wird beim Umwandeln
 * eine ZWEITE Zeile drüben, die Anfrage bleibt hier stehen.
 */
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

const readKind = (value: string | null): PurchaseKind =>
    (value === 'request' || value === 'PRICE_REQUEST' ? 'PRICE_REQUEST' : 'ORDER');

export const OrdersPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const kind = readKind(searchParams.get('kind'));
    const permissions = useAuthStore((state) => state.permissions);
    const canManage = permissions.includes('inventory.transfer');
    const list = useOrdersList(kind);
    const grid = useColumnWidths<OrderListColumn>({
        storageKey: 'offitec:inv-orders:col-widths:v1',
        defaults: ORDER_LIST_COLUMN_WIDTHS,
        minPx: 72,
    });

    const isRequest = kind === 'PRICE_REQUEST';
    const setKind = (next: PurchaseKind) => {
        // Der Zustandsfilter gehört der Liste, die man verlässt — die andere
        // kennt ihn nicht. Er wird hier geräumt, nicht in einem Effekt.
        if (next !== kind) list.setStatus('');
        setSearchParams(next === 'PRICE_REQUEST' ? { kind: 'request' } : {}, { replace: true });
    };

    /* DER UMSCHALTER — dieselbe Mulde wie die Reiter der Auftragsseite. */
    const segmented = (
        <div className="ofi-ows">
            <div className="ofi-ows-tabs" role="tablist" aria-label={t('inv.orders.title')}>
                {([['ORDER', t('inv.orders.kind.order')], ['PRICE_REQUEST', t('inv.orders.kind.request')]] as [PurchaseKind, string][])
                    .map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={kind === key}
                            onClick={() => setKind(key)}
                            className={`ofi-ows-tab${kind === key ? ' is-on' : ''}`}
                        >
                            {label}
                        </button>
                    ))}
            </div>
        </div>
    );

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t(isRequest ? 'inv.orders.kind.request' : 'inv.orders.kind.order')}
                center={segmented}
                action={canManage ? (
                    <button
                        type="button"
                        onClick={() => navigate(`/inventory/orders/new${isRequest ? '?kind=request' : ''}`)}
                        className="rounded-md bg-[#0a7aff] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0066e0]"
                    >
                        {t(isRequest ? 'inv.orders.addRequestButton' : 'inv.orders.addButton')}
                    </button>
                ) : undefined}
            />

            {/* Auf schmalen Schirmen fehlt die Mitte der Kopfzeile. */}
            <div className="lg:hidden">{segmented}</div>

            <FilterBar>
                <SearchBox
                    value={list.search}
                    onChange={list.setSearch}
                    placeholder={t('inv.orders.searchPlaceholder')}
                />
                <select
                    value={list.status}
                    onChange={(event) => list.setStatus(event.target.value as PurchaseOrderStatus | '')}
                    aria-label={t('inv.columns.status')}
                    className={TOOLBAR_CONTROL_CLASS}
                >
                    <option value="">{t('inv.orders.allStatuses')}</option>
                    {/* Nur die Zustände DIESER Liste — die andere Hälfte gehört
                        nicht mehr in denselben Ablauf. */}
                    {statusesOfKind(kind).map((status) => (
                        <option key={status} value={status}>{t(ORDER_STATUS_META[status].labelKey)}</option>
                    ))}
                </select>
                <MacDatePicker value={list.dateFrom} onChange={(nextDate) => list.setDateFrom(nextDate)} ariaLabel={t('inv.movements.dateFrom')} className="is-toolbar" />
                <span className="text-[12px] text-slate-400">—</span>
                <MacDatePicker value={list.dateTo} onChange={(nextDate) => list.setDateTo(nextDate)} ariaLabel={t('inv.movements.dateTo')} className="is-toolbar" />
            </FilterBar>

            <SectionCard title={t('inv.orders.sectionTitle', { count: list.total })}>
                <div className="overflow-x-auto">
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
                                    <ColResizeHandle {...grid.resizeProps('reference')} />
                                </th>
                                <th className="relative text-left">
                                    {/* In der Bestellliste steht hier, aus WELCHER Anfrage
                                        die Bestellung kopiert wurde — die Spur zwischen den
                                        beiden Listen. Bei den Anfragen bleibt es die
                                        Angebotsnummer. */}
                                    {t(isRequest ? 'inv.orders.columns.quoteNumber' : 'inv.orders.columns.fromRequest')}
                                    <ColResizeHandle {...grid.resizeProps('quote')} />
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
                                {/* Durum rozeti ASLA sarılmaz. */}
                                <th className="relative text-left">
                                    {t('inv.columns.status')}
                                    <ColResizeHandle {...grid.resizeProps('status')} />
                                </th>
                            </tr>
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
                                <th />
                                <th />
                                <th />
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {(list.loading || list.items.length === 0) && (
                                <TableStateRow colSpan={8} loading={list.loading} emptyText={list.error || t(isRequest ? 'inv.orders.emptyRequests' : 'inv.orders.empty')} />
                            )}
                            {!list.loading && list.items.map((order) => {
                                const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.ORDER_DRAFT;
                                /* In der Bestellliste zeigt die zweite Spalte die
                                   Anfrage, aus der kopiert wurde (`priceRequestNumber`);
                                   gab es keine, bleibt die Angebotsnummer. Ältere
                                   Datensätze tragen dort ihre EIGENE Nummer — dann
                                   stünde sie zweimal in derselben Zeile. */
                                const fromRequest = order.priceRequestNumber && order.priceRequestNumber !== order.referenceNumber
                                    ? order.priceRequestNumber
                                    : null;
                                const second = isRequest ? order.quoteNumber : (fromRequest || order.quoteNumber);
                                return (
                                    <tr
                                        key={order.id}
                                        onClick={() => navigate(`/inventory/orders/${order.id}`)}
                                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                    >
                                        <td className="font-mono text-[13px] text-slate-700 dark:text-white/80"><PurchaseCode value={order.referenceNumber} /></td>
                                        <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">
                                            {second ? <PurchaseCode value={second} /> : '—'}
                                        </td>
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
        </div>
    );
};
