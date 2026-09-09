import { addonCreatePath } from '@/components/orders/addonEditorRoute';
import { AddonEditorSlot } from '@/components/orders/AddonEditorSlot';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PackagePlus, Plus } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { AddonOrderPdfButton } from '@/components/orders/AddonOrderPdfButton';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { ColResizeHandle, FILTER_INPUT_CLASS, FilterBar, FilterSelect, Pager, ResizableCols, SearchBox, SectionCard, SortableTh, TableStateRow } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { t } from '@/i18n/translate';
import { addonOrdersApi, type AddonOrderListItemDto } from '@/lib/api/addonOrders';
import { openAmount } from '@/lib/orderBillingTotals';
import { useAuthStore } from '@/store/authStore';

const PAGE_SIZE = 15;

const fmtMoney = (value?: number | null) =>
    typeof value === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value)
        : '-';
const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('de-CH') : '-');

type SortKey = 'date' | 'orderNumber' | 'parent' | 'customer' | 'total';
type BillingState = 'notBilled' | 'partial' | 'billed';

const billingVariant = (percent: number): 'active' | 'warning' | 'info' =>
    percent >= 100 ? 'active' : percent <= 0 ? 'warning' : 'info';
const billingLabel = (percent: number) =>
    percent <= 0 ? t('crm.faturalanmadi') : t('crm.partially_billed', { percent: Math.round(percent) });
const billingState = (percent: number): BillingState =>
    percent <= 0 ? 'notBilled' : percent >= 100 ? 'billed' : 'partial';

/** Die Zahlen einer Zeile — aus denselben Feldern wie die Auftragsliste. */
const figures = (addon: AddonOrderListItemDto) => {
    const total = Number(addon.billingSummary?.baseAmount ?? addon.totalAmount) || 0;
    const billed = Number(addon.billingSummary?.billedAmount) || 0;
    const percent = Number(addon.billingSummary?.billedPercent) || 0;
    return { total, billed, percent, remaining: openAmount(addon.billingSummary?.billedPercent, total, billed) };
};

/**
 * ── ZUSATZAUFTRÄGE (Nachträge, NT-…) ─────────────────────────────────────────
 * Die Liste ALLER Nachträge des Mandanten — unter Verkauf, neben den
 * Aufträgen (AB), so wie es Samet bestellt hat (05.09.2026): «einen Bereich
 * ‹Zusatzaufträge› wie den AB-Bereich, in dem sie aufgeführt sind.» Bis dahin
 * standen Nachträge nur als eingerückte Zeilen unter ihrem Hauptauftrag.
 *
 * Jede Zeile trägt ihren eigenen Beleg (Nachtrag-PDF, drei Sprachen) und
 * führt beim Anklicken in die Auftragsansicht des Hauptauftrags, geöffnet auf
 * dem Nachtrag. Oben rechts entsteht ein FREIER Nachtrag mit eigenen
 * Positionen — der Hauptauftrag wird dabei im Fenster gewählt.
 */
export const AddonOrdersPage = () => {
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canCreate = permissions.includes('projects.createAddonOrder');
    const [rows, setRows] = useState<AddonOrderListItemDto[]>([]);
    const [loading, setLoading] = useState(true);
    // Nach dem Erfassen eines Nachtrags lädt die Liste neu.
    const [reloadKey, setReloadKey] = useState(0);

    const [search, setSearch] = useState('');
    const [numberFilter, setNumberFilter] = useState('');
    const [parentFilter, setParentFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | BillingState>('');
    const [sortBy, setSortBy] = useState<SortKey>('date');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    // Die Seite gehört zu EINER Filterlage: ändert sich ein Filter oder die
    // Sortierung, steht die Liste wieder auf Seite 1 — ohne Effekt, die
    // Signatur der Filter entscheidet beim Rendern.
    const filterSignature = JSON.stringify([search, numberFilter, parentFilter, customerFilter, statusFilter, sortBy, sortDirection]);
    const [pageState, setPageState] = useState({ page: 1, signature: filterSignature });
    const page = pageState.signature === filterSignature ? pageState.page : 1;
    const setPage = (next: number) => setPageState({ page: next, signature: filterSignature });

    const grid = useColumnWidths({
        storageKey: 'offitec:addon-order-list:col-widths:v1',
        defaults: { parent: 170, customer: 220, project: 170, status: 176, total: 150, billed: 150, remaining: 150, pdf: 64 },
        minPx: 56,
    });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const list = await addonOrdersApi.list();
                if (!cancelled) setRows(list);
            } catch (error: unknown) {
                const failure = error as { response?: { data?: { error?: string } } };
                if (!cancelled) toast.error(failure?.response?.data?.error || t('crm.orders_yuklenemedi'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [reloadKey]);

    const toggleSort = (column: SortKey) => {
        setSortDirection(sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc');
        setSortBy(column);
    };

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        const nf = numberFilter.trim().toLowerCase();
        const pf = parentFilter.trim().toLowerCase();
        const cf = customerFilter.trim().toLowerCase();
        const list = rows.filter((addon) => {
            const f = figures(addon);
            if (statusFilter && billingState(f.percent) !== statusFilter) return false;
            const no = (addon.orderNumber || '').toLowerCase();
            const legacy = (addon.legacyNumber || '').toLowerCase();
            const parent = (addon.parentSalesOrder?.orderNumber || '').toLowerCase();
            const customer = (addon.customer?.companyName || '').toLowerCase();
            const project = `${addon.project?.projectNumber || ''} ${addon.project?.projectName || ''}`.toLowerCase();
            if (s && !(no.includes(s) || legacy.includes(s) || parent.includes(s) || customer.includes(s) || project.includes(s))) return false;
            if (nf && !(no.includes(nf) || legacy.includes(nf))) return false;
            if (pf && !parent.includes(pf)) return false;
            if (cf && !customer.includes(cf)) return false;
            return true;
        });
        const dir = sortDirection === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            switch (sortBy) {
                case 'orderNumber': return dir * (a.orderNumber || '').localeCompare(b.orderNumber || '');
                case 'parent': return dir * (a.parentSalesOrder?.orderNumber || '').localeCompare(b.parentSalesOrder?.orderNumber || '');
                case 'customer': return dir * (a.customer?.companyName || '').localeCompare(b.customer?.companyName || '');
                case 'total': return dir * (figures(a).total - figures(b).total);
                default: return dir * (new Date(a.orderDate || a.createdAt).getTime() - new Date(b.orderDate || b.createdAt).getTime());
            }
        });
    }, [rows, search, numberFilter, parentFilter, customerFilter, statusFilter, sortBy, sortDirection]);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);
    const hasActiveFilters = Boolean(search || numberFilter || parentFilter || customerFilter || statusFilter);

    const colLabel = {
        parent: t('crm.addon.parentOrder'),
        customer: t('nav.quickActionsGroup.customers'),
        project: t('nav.projects'),
        status: t('common.status'),
        total: t('common.total'),
        billed: t('billing.billed'),
        remaining: t('billing.remaining'),
        pdf: 'PDF',
    };

    const openAddon = (addon: AddonOrderListItemDto) =>
        navigate(`/sales/orders/${addon.parentSalesOrderId}?tab=addons&addon=${addon.id}`);

    /* Auch hier bleibt der Rahmen stehen: die Erfassung ersetzt die Liste,
       nicht die Seite. */
    return (
        <AddonEditorSlot onSaved={() => setReloadKey((key) => key + 1)}>
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('nav.addonOrders')}
                action={canCreate ? (
                    <button
                        type="button"
                        onClick={() => navigate(addonCreatePath(null))}
                        className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                    >
                        <Plus size={14} />
                        {t('crm.addon.newTitle')}
                    </button>
                ) : undefined}
            />

            {/* Werkzeugzeile — dieselbe wie auf jeder anderen Liste: Suchfeld
                links, Filter dahinter, gemeinsames Mass aus
                styles/controls.css. */}
            <FilterBar>
                <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder={t('crm.addon.searchPlaceholder')}
                />
                <FilterSelect
                    value={statusFilter}
                    onChange={(next) => setStatusFilter(next as '' | BillingState)}
                    label={t('common.status')}
                >
                    <option value="">{t('common.all')}</option>
                    <option value="notBilled">{t('crm.faturalanmadi')}</option>
                    <option value="partial">{t('projects.orderPartial')}</option>
                    <option value="billed">{t('projects.orderBilled')}</option>
                </FilterSelect>
            </FilterBar>

            <SectionCard title={`${t('nav.addonOrders')} (${total})`}>
                <table data-inv-table data-list-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col />
                        <ResizableCols keys={['parent', 'customer', 'project', 'status', 'total', 'billed', 'remaining', 'pdf'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <SortableTh label={t('projects.addonOrder')} sortKey="orderNumber" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" />
                            <SortableTh label={colLabel.parent} sortKey="parent" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('parent')} />
                            <SortableTh label={colLabel.customer} sortKey="customer" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('customer')} />
                            <th className="relative text-left">
                                {colLabel.project}
                                <ColResizeHandle {...grid.resizeProps('project')} />
                            </th>
                            <th className="relative text-left">
                                {colLabel.status}
                                <ColResizeHandle {...grid.resizeProps('status')} />
                            </th>
                            <SortableTh label={colLabel.total} sortKey="total" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-right" {...grid.resizeProps('total')} />
                            <th className="relative text-right">
                                {colLabel.billed}
                                <ColResizeHandle {...grid.resizeProps('billed')} />
                            </th>
                            <th className="relative text-right">
                                {colLabel.remaining}
                                <ColResizeHandle {...grid.resizeProps('remaining')} />
                            </th>
                            <th className="relative text-right">
                                {colLabel.pdf}
                                <ColResizeHandle {...grid.resizeProps('pdf')} />
                            </th>
                        </tr>
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input value={numberFilter} onChange={(event) => setNumberFilter(event.target.value)} placeholder={`${t('common.filter')}...`} className={FILTER_INPUT_CLASS} />
                            </th>
                            <th className="pb-1.5">
                                <input value={parentFilter} onChange={(event) => setParentFilter(event.target.value)} placeholder={`${t('common.filter')}...`} className={FILTER_INPUT_CLASS} />
                            </th>
                            <th className="pb-1.5">
                                <input value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} placeholder={`${t('common.filter')}...`} className={FILTER_INPUT_CLASS} />
                            </th>
                            <th />
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
                                colSpan={9}
                                loading={loading}
                                emptyText={hasActiveFilters ? t('crm.addon.listEmptyFiltered') : t('crm.addon.listEmpty')}
                            />
                        )}
                        {!loading && paged.map((addon) => {
                            const f = figures(addon);
                            return (
                                <tr
                                    key={addon.id}
                                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                    onClick={() => openAddon(addon)}
                                    title={t('crm.addon.openOrder')}
                                >
                                    <td>
                                        <div className="flex min-w-0 items-center gap-2">
                                            <PackagePlus size={13} className="shrink-0 text-amber-500" />
                                            <span className="truncate font-semibold text-slate-800 dark:text-white">{addon.orderNumber}</span>
                                            {addon.revisionNumber ? (
                                                <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                                    {addon.revisionNumber}. {t('projects.addonOrder')}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="ofi-list-sub text-[11px] text-slate-400 dark:text-white/50">{fmtDate(addon.orderDate || addon.createdAt)}</div>
                                    </td>
                                    <td data-label={colLabel.parent} className="font-mono text-[12px] text-slate-600 dark:text-white/70">
                                        <span className="block truncate">{addon.parentSalesOrder?.orderNumber || '-'}</span>
                                    </td>
                                    <td data-label={colLabel.customer} className="text-slate-600 dark:text-white/80">
                                        <span className="block truncate">{addon.customer?.companyName || t('crm.customer_not_found')}</span>
                                    </td>
                                    <td data-label={colLabel.project} className="font-mono text-[12px] text-slate-600 dark:text-white/70">
                                        {addon.project ? <span className="block truncate">{addon.project.projectNumber || addon.project.projectName}</span> : null}
                                    </td>
                                    <td data-label={colLabel.status}>
                                        <StatusChip variant={billingVariant(f.percent)}>{billingLabel(f.percent)}</StatusChip>
                                    </td>
                                    <td data-label={colLabel.total} className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">{fmtMoney(f.total)}</td>
                                    <td data-label={colLabel.billed} className="text-right font-mono text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoney(f.billed)}</td>
                                    <td data-label={colLabel.remaining} className="text-right font-mono text-[13px] font-semibold text-amber-600 dark:text-amber-400">{fmtMoney(f.remaining)}</td>
                                    <td data-label={colLabel.pdf} className="text-right">
                                        <AddonOrderPdfButton addon={addon} variant="icon" />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager page={pageSafe} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
                </div>
            </SectionCard>
        </div>
        </AddonEditorSlot>
    );
};
