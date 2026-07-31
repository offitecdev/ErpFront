import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Check, ChevronDown, ChevronRight } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { customerApi } from '../../../lib/api/customer';
import type { CustomerOrderDto } from '../../../lib/api/customer';
import { billingApi } from '../../../lib/api/billing';
import type { InvoiceDto } from '../../../types/billing';
import { FILTER_INPUT_CLASS, Pager, SearchBox, SectionCard, SortableTh, TableStateRow } from '../../../components/ui-shared/TableKit';
import { cumulativeStages, parsePaymentStages, stageStatus } from '../../../lib/paymentSchedule';

/**
 * Aufträge des Kunden als HIERARCHISCHE Tabelle mit Verrechnung in der Zeile.
 *
 * Ein Hauptauftrag mit Zusatzaufträgen bekommt einen Pfeil; aufgeklappt zeigt er
 * seine Zusatzaufträge eingerückt und darunter den Ratenplan. Es gibt weder eine
 * Statusspalte noch einen eigenen Ratenplan-Knopf und keine Rechnungsliste —
 * verrechnete Anteile stehen als Prozentwert in der Zeile.
 *
 * Geladen wird mit ZWEI parallelen Requests (Aufträge + alle Rechnungen des
 * Kunden); verrechneter Betrag, Rest und Ratenstand werden daraus lokal
 * gerechnet, also ohne eine Zusammenfassung je Zeile.
 *
 * Suchen, Filtern, Sortieren und Blättern laufen — anders als bei den Angeboten
 * — im BROWSER. Grund ist die Hierarchie: eine serverseitige Seite würde
 * Zusatzaufträge von ihrem Hauptauftrag trennen, und die Summen je Gruppe
 * entstehen ohnehin erst aus Aufträgen + Rechnungen zusammen. Geblättert wird
 * daher über GRUPPEN (Hauptauftrag samt Zusatzaufträgen), nicht über Zeilen.
 */

/** Gruppen je Seite — wie in allen Listen der Anwendung. */
const PAGE_SIZE = 15;

const fmtMoney = (value?: number | null) =>
    typeof value === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value)
        : '—';

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const EPSILON = 0.005;

/** Verrechnungsstand eines einzelnen Auftrags. */
interface OrderFigures {
    billedAmount: number;
    billedPercent: number;
    remainingPercent: number;
    remainingAmount: number;
    stages: number[] | null;
    /** Rest der nächsten offenen Rate in Prozent; null ohne Ratenplan. */
    nextStagePercent: number | null;
}

const computeFigures = (order: CustomerOrderDto, invoices: InvoiceDto[]): OrderFigures => {
    const own = invoices.filter((invoice) => invoice.salesOrderId === order.id && invoice.status !== 'CANCELLED');
    const billedAmount = round2(own.reduce((sum, invoice) => sum + (invoice.amount ?? 0), 0));
    const billedPercent = round2(own.reduce((sum, invoice) => sum + (invoice.billedPercent ?? 0), 0));
    const remainingPercent = Math.max(0, round2(100 - billedPercent));
    const stages = parsePaymentStages(order.paymentStages);

    let nextStagePercent: number | null = null;
    if (stages) {
        const cumulative = cumulativeStages(stages);
        const target = cumulative.find((value) => value > billedPercent + EPSILON);
        if (target !== undefined) nextStagePercent = Math.min(remainingPercent, round2(target - billedPercent));
    }

    return {
        billedAmount,
        billedPercent,
        remainingPercent,
        remainingAmount: round2((order.totalAmount * remainingPercent) / 100),
        stages,
        nextStagePercent,
    };
};

/** Projekt- bzw. Angebotsbezeichnung einer Auftragszeile. */
const orderLabel = (order: CustomerOrderDto) =>
    order.project?.projectName || order.tender?.tenderNumber || '—';

/** Ein Hauptauftrag mit seinen Zusatzaufträgen und den Summen über beide. */
interface OrderGroup {
    parent: CustomerOrderDto;
    addons: CustomerOrderDto[];
    /** Anzahl Aufträge in der Gruppe, Hauptauftrag eingeschlossen. */
    orderCount: number;
    /** Summen ÜBER die ganze Gruppe — Zusatzaufträge zählen mit. */
    groupTotal: number;
    groupBilled: number;
    groupRemaining: number;
}

type OrderSortKey = 'orderNumber' | 'project' | 'createdAt' | 'total' | 'remaining';
type SortDirection = 'asc' | 'desc';

export const CustomerOrdersTable = ({
    customerId,
    onTotalChange,
}: {
    customerId: string;
    /** Meldet die Anzahl Auftragsgruppen an den Reiter, damit dessen Zähler stimmt. */
    onTotalChange?: (total: number) => void;
}) => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<CustomerOrderDto[]>([]);
    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [billingId, setBillingId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Spaltenfilter (Zeile unter den Kopfzeilen): Auftragsnummer und Projekt.
    const [numberFilter, setNumberFilter] = useState('');
    const [projectFilter, setProjectFilter] = useState('');
    const [debouncedColumns, setDebouncedColumns] = useState({ orderNumber: '', project: '' });
    const [sortBy, setSortBy] = useState<OrderSortKey>('createdAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [page, setPage] = useState(1);

    // Entprellt, damit das Tippen nicht bei jedem Anschlag die ganze Liste neu
    // filtert und sortiert.
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 200);
        return () => clearTimeout(id);
    }, [search]);

    useEffect(() => {
        const id = setTimeout(() => {
            setDebouncedColumns((prev) => {
                const next = {
                    orderNumber: numberFilter.trim().toLowerCase(),
                    project: projectFilter.trim().toLowerCase(),
                };
                return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
            });
        }, 250);
        return () => clearTimeout(id);
    }, [numberFilter, projectFilter]);

    // Unkontrollierte Eingaben: der geteilte Input verschluckte hier die ersten
    // Tastenanschläge (gleiche Begründung wie in MyOrderDetail).
    const percentRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [orderRows, invoiceRows] = await Promise.all([
                customerApi.listOrders(customerId),
                billingApi.listInvoices({ customerId }),
            ]);
            setOrders(orderRows);
            setInvoices(invoiceRows);
        } catch {
            if (!silent) toast.error(i18nT('crm.customers.errorLoadCustomer'));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [customerId]);

    useEffect(() => { void load(); }, [load]);

    const figuresByOrder = useMemo(() => {
        const map = new Map<string, OrderFigures>();
        orders.forEach((order) => map.set(order.id, computeFigures(order, invoices)));
        return map;
    }, [orders, invoices]);

    /** Zusatzaufträge hängen sich unter ihren Hauptauftrag; Waisen bleiben eigenständig. */
    const groups = useMemo<OrderGroup[]>(() => {
        const parents = orders.filter((order) => !order.parentSalesOrderId);
        const parentIds = new Set(parents.map((order) => order.id));
        const addonsByParent = new Map<string, CustomerOrderDto[]>();
        const orphans: CustomerOrderDto[] = [];

        orders.forEach((order) => {
            if (!order.parentSalesOrderId) return;
            if (!parentIds.has(order.parentSalesOrderId)) { orphans.push(order); return; }
            const list = addonsByParent.get(order.parentSalesOrderId) ?? [];
            list.push(order);
            addonsByParent.set(order.parentSalesOrderId, list);
        });

        const build = (parent: CustomerOrderDto): OrderGroup => {
            const addons = addonsByParent.get(parent.id) ?? [];
            const members = [parent, ...addons];
            return {
                parent,
                addons,
                orderCount: members.length,
                groupTotal: round2(members.reduce((sum, order) => sum + (order.totalAmount ?? 0), 0)),
                groupBilled: round2(members.reduce((sum, order) => sum + (figuresByOrder.get(order.id)?.billedAmount ?? 0), 0)),
                groupRemaining: round2(members.reduce((sum, order) => sum + (figuresByOrder.get(order.id)?.remainingAmount ?? 0), 0)),
            };
        };

        return [...parents.map(build), ...orphans.map(build)];
    }, [orders, figuresByOrder]);

    const hasFilters = Boolean(debouncedSearch || debouncedColumns.orderNumber || debouncedColumns.project);

    /**
     * Eine Gruppe bleibt sichtbar, sobald IRGENDEIN Auftrag darin passt — sonst
     * würde die Suche nach einer Zusatzauftragsnummer die ganze Gruppe (und
     * damit die gesuchte Zeile) ausblenden.
     */
    const filteredGroups = useMemo(() => {
        if (!hasFilters) return groups;
        return groups.filter((group) => {
            const members = [group.parent, ...group.addons];
            if (debouncedSearch && !members.some((order) =>
                [order.orderNumber, order.project?.projectName, order.tender?.tenderNumber]
                    .some((value) => (value || '').toLowerCase().includes(debouncedSearch)))) return false;
            if (debouncedColumns.orderNumber && !members.some((order) =>
                (order.orderNumber || '').toLowerCase().includes(debouncedColumns.orderNumber))) return false;
            if (debouncedColumns.project && !members.some((order) =>
                orderLabel(order).toLowerCase().includes(debouncedColumns.project))) return false;
            return true;
        });
    }, [groups, hasFilters, debouncedSearch, debouncedColumns]);

    const sortedGroups = useMemo(() => {
        const direction = sortDirection === 'asc' ? 1 : -1;
        const compare = (a: OrderGroup, b: OrderGroup) => {
            switch (sortBy) {
                // Auftragsnummern enden auf eine laufende Zahl — `numeric`
                // sortiert BE-2026-9 vor BE-2026-10.
                case 'orderNumber':
                    return a.parent.orderNumber.localeCompare(b.parent.orderNumber, undefined, { numeric: true });
                case 'project':
                    return orderLabel(a.parent).localeCompare(orderLabel(b.parent), undefined, { numeric: true });
                case 'total':
                    return a.groupTotal - b.groupTotal;
                case 'remaining':
                    return a.groupRemaining - b.groupRemaining;
                default:
                    return Date.parse(a.parent.createdAt) - Date.parse(b.parent.createdAt);
            }
        };
        return [...filteredGroups].sort((a, b) => compare(a, b) * direction);
    }, [filteredGroups, sortBy, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(sortedGroups.length / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const pageGroups = useMemo(
        () => sortedGroups.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
        [sortedGroups, pageSafe],
    );

    // Der Reiterzähler zeigt die ungefilterte Anzahl Gruppen.
    useEffect(() => {
        if (!loading) onTotalChange?.(groups.length);
    }, [loading, groups.length, onTotalChange]);

    // Jede Filter-/Sortieränderung springt auf Seite 1 zurück. Das passiert im
    // Handler und NICHT in einem Effekt — ein Effekt würde nach jedem Tippen
    // eine zweite Renderrunde auslösen.
    const changeSearch = (next: string) => { setSearch(next); setPage(1); };
    const changeNumberFilter = (next: string) => { setNumberFilter(next); setPage(1); };
    const changeProjectFilter = (next: string) => { setProjectFilter(next); setPage(1); };

    const toggleSort = (column: OrderSortKey) => {
        setSortDirection(sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc');
        setSortBy(column);
        setPage(1);
    };

    const toggle = (orderId: string) =>
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
            return next;
        });

    const bill = async (order: CustomerOrderDto) => {
        const figures = figuresByOrder.get(order.id);
        if (!figures || figures.remainingPercent <= EPSILON) return;

        const raw = percentRefs.current[order.id]?.value?.trim() ?? '';
        // Leer = der vorgeschlagene Wert (nächste Rate, sonst der ganze Rest).
        const fallback = figures.nextStagePercent ?? figures.remainingPercent;
        const percent = raw === '' ? fallback : Number(raw.replace(',', '.'));

        if (!Number.isFinite(percent) || percent <= 0) {
            toast.error(i18nT('billing.invalidPercent'));
            return;
        }
        const capped = Math.min(percent, figures.remainingPercent);
        const full = capped >= figures.remainingPercent - EPSILON;

        try {
            setBillingId(order.id);
            const { invoice } = await billingApi.createInvoice({
                salesOrderId: order.id,
                billingType: full ? 'FULL' : 'PARTIAL',
                percent: full ? null : capped,
            });
            // Kein Neuladen der Seite — die neue Rechnung wandert direkt in den
            // Zustand, die Zeile rechnet sich daraus neu.
            setInvoices((current) => [invoice, ...current]);
            const input = percentRefs.current[order.id];
            if (input) input.value = '';
            toast.success(i18nT('billing.invoiceCreated'));
            void load(true);
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : i18nT('billing.invoiceError'));
        } finally {
            setBillingId(null);
        }
    };

    /** Verrechnungszelle: entweder der erreichte Prozentwert oder Eingabe + Knopf. */
    const billingCell = (order: CustomerOrderDto) => {
        const figures = figuresByOrder.get(order.id)!;
        if (figures.remainingPercent <= EPSILON) {
            return (
                <span className="font-mono text-[13px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    100%
                </span>
            );
        }
        const suggestion = figures.nextStagePercent ?? figures.remainingPercent;
        return (
            <div className="flex items-center justify-end gap-1.5">
                {figures.billedPercent > EPSILON && (
                    <span className="font-mono text-[12px] tabular-nums text-slate-400 dark:text-white/40">
                        {figures.billedPercent}%
                    </span>
                )}
                {/* Ohne Ratenplan schlägt der Platzhalter den ganzen Rest vor,
                    mit Plan die nächste Rate. */}
                <input
                    ref={(element) => { percentRefs.current[order.id] = element; }}
                    type="number"
                    min={0.1}
                    max={figures.remainingPercent}
                    step="0.1"
                    defaultValue=""
                    placeholder={`%${suggestion}`}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); void bill(order); }
                    }}
                    className="h-8 w-20 rounded-[2px] border border-slate-300 bg-white px-2 text-right text-[13px] tabular-nums text-slate-800 outline-none transition-colors focus:border-[#1f2654] dark:border-white/20 dark:bg-white/5 dark:text-white"
                />
                <button
                    type="button"
                    onClick={() => void bill(order)}
                    disabled={billingId === order.id}
                    className="h-8 rounded-[2px] border border-dashed border-[#1f2654]/45 bg-white px-3 text-[12.5px] font-semibold text-[#1f2654] transition-colors hover:border-[#1f2654] hover:bg-[#f1f5fd] disabled:opacity-50 dark:border-sky-300/40 dark:bg-transparent dark:text-sky-300 dark:hover:bg-white/5"
                >
                    {billingId === order.id ? i18nT('common.loading') : i18nT('billing.buttonLabel')}
                </button>
            </div>
        );
    };

    /** Ratenplan des Hauptauftrags, eingeblendet unter der aufgeklappten Zeile. */
    const stageRows = (order: CustomerOrderDto) => {
        const figures = figuresByOrder.get(order.id)!;
        if (!figures.stages) {
            return (
                <div className="px-3 py-2 text-[12.5px] text-slate-400 dark:text-white/40">
                    {i18nT('billing.noPaymentSchedule')}
                </div>
            );
        }
        const statuses = stageStatus(figures.stages, figures.billedPercent);
        const cumulative = cumulativeStages(figures.stages);
        return (
            <div className="px-3 py-2">
                <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                    {i18nT('billing.paymentScheduleTab')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {figures.stages.map((percent, index) => (
                        <span
                            key={index}
                            className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-1 font-mono text-[12px] tabular-nums ${
                                statuses[index] === 'done'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                                    : statuses[index] === 'next'
                                        ? 'border-[#1f2654]/35 bg-[#f1f5fd] font-semibold text-[#1f2654] dark:border-sky-300/40 dark:bg-white/5 dark:text-sky-300'
                                        : 'border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-transparent dark:text-white/35'
                            }`}
                        >
                            {statuses[index] === 'done' && <Check size={11} />}
                            {index + 1}. {percent}%
                            <span className="text-[11px] opacity-70">
                                {fmtMoney((order.totalAmount * percent) / 100)} · {cumulative[index]}%
                            </span>
                        </span>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="flex w-full flex-col gap-3">
            {/* Obere Leiste — wie in den übrigen Listen: eine Suche über
                Auftragsnummer, Projekt und Angebotsnummer. */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-64">
                    <SearchBox
                        value={search}
                        onChange={changeSearch}
                        placeholder={i18nT('crm.orderNumber')}
                    />
                </div>
            </div>

            <SectionCard title={`${i18nT('crm.tab_orders')} (${sortedGroups.length})`}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <SortableTh label={i18nT('crm.orderNumber')} sortKey="orderNumber" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="w-56 text-left" />
                            <SortableTh label={i18nT('nav.projects')} sortKey="project" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" />
                            <th className="w-24 text-right">{i18nT('crm.orderCount')}</th>
                            <SortableTh label={i18nT('common.date')} sortKey="createdAt" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="w-28 text-left" />
                            <SortableTh label={i18nT('crm.orderTotal')} sortKey="total" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="w-36 text-right" />
                            <SortableTh label={i18nT('crm.outstandingTotal')} sortKey="remaining" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="w-36 text-right" />
                            <th className="w-[220px] text-right">{i18nT('billing.buttonLabel')}</th>
                        </tr>
                        {/* Spaltenfilter — Auftragsnummer und Projekt/Angebot. */}
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input
                                    value={numberFilter}
                                    onChange={(event) => changeNumberFilter(event.target.value)}
                                    placeholder={`${i18nT('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th className="pb-1.5">
                                <input
                                    value={projectFilter}
                                    onChange={(event) => changeProjectFilter(event.target.value)}
                                    placeholder={`${i18nT('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th colSpan={5} />
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || pageGroups.length === 0) && (
                            <TableStateRow
                                colSpan={7}
                                loading={loading}
                                emptyText={hasFilters ? i18nT('crmOverview.picker.empty') : i18nT('crm.noOrders')}
                            />
                        )}
                        {!loading && pageGroups.map((group) => {
                            const { parent, addons } = group;
                            const open = expanded.has(parent.id);
                            const hasChildren = addons.length > 0;
                            return [
                                <tr key={parent.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td className="font-mono text-[13px] font-semibold text-slate-800 dark:text-white/90">
                                        <div className="flex items-center gap-1.5">
                                            {/* Pfeil nur, wenn es wirklich Zusatzaufträge oder einen Ratenplan gibt. */}
                                            <button
                                                type="button"
                                                onClick={() => toggle(parent.id)}
                                                aria-expanded={open}
                                                aria-label={hasChildren ? i18nT('crm.addonOrders') : i18nT('billing.paymentScheduleTab')}
                                                className="inline-flex size-5 shrink-0 items-center justify-center rounded-[2px] text-slate-400 transition-colors hover:text-[#1f2654] dark:text-white/40 dark:hover:text-sky-300"
                                            >
                                                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/crm/my-orders/${parent.id}`)}
                                                className="truncate text-left hover:underline"
                                            >
                                                {parent.orderNumber}
                                            </button>
                                        </div>
                                        {hasChildren && (
                                            <button
                                                type="button"
                                                onClick={() => toggle(parent.id)}
                                                className="ml-[26px] mt-0.5 block text-[11px] font-semibold text-[#1f2654] hover:underline dark:text-sky-300"
                                            >
                                                {i18nT('crm.addonOrders')} ({addons.length})
                                            </button>
                                        )}
                                    </td>
                                    <td className="truncate text-slate-600 dark:text-white/70">{orderLabel(parent)}</td>
                                    <td className="text-right font-mono text-[13px] tabular-nums text-slate-600 dark:text-white/70">
                                        {group.orderCount}
                                    </td>
                                    <td className="text-slate-500 dark:text-white/55">
                                        {dayjs(parent.createdAt).format('DD.MM.YYYY')}
                                    </td>
                                    {/* Summen über die ganze Gruppe — Zusatzaufträge eingerechnet. */}
                                    <td className="text-right font-mono text-[13px] font-semibold tabular-nums">
                                        {fmtMoney(group.groupTotal)}
                                    </td>
                                    <td className="text-right font-mono text-[13px] font-semibold tabular-nums text-[#1f2654] dark:text-sky-300">
                                        {fmtMoney(group.groupRemaining)}
                                    </td>
                                    <td className="text-right">{billingCell(parent)}</td>
                                </tr>,

                                ...(open ? addons.map((addon) => (
                                    <tr key={addon.id} className="bg-slate-50/60 transition-colors hover:bg-slate-100/60 dark:bg-white/[0.02] dark:hover:bg-white/5">
                                        {/* Leichte Einrückung zeigt die Zugehörigkeit zum Hauptauftrag. */}
                                        <td className="pl-10 font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                                            {addon.orderNumber}
                                        </td>
                                        <td className="truncate text-slate-500 dark:text-white/55">{orderLabel(addon)}</td>
                                        <td />
                                        <td className="text-slate-500 dark:text-white/55">
                                            {dayjs(addon.createdAt).format('DD.MM.YYYY')}
                                        </td>
                                        <td className="text-right font-mono text-[13px] tabular-nums">{fmtMoney(addon.totalAmount)}</td>
                                        <td className="text-right font-mono text-[13px] tabular-nums text-slate-600 dark:text-white/70">
                                            {fmtMoney(figuresByOrder.get(addon.id)?.remainingAmount)}
                                        </td>
                                        <td className="text-right">{billingCell(addon)}</td>
                                    </tr>
                                )) : []),

                                ...(open ? [(
                                    <tr key={`${parent.id}-stages`} className="bg-slate-50/60 dark:bg-white/[0.02]">
                                        <td colSpan={7} className="!py-0">{stageRows(parent)}</td>
                                    </tr>
                                )] : []),
                            ];
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    {/* Gezählt wird in GRUPPEN — eine Gruppe ist eine Zeile der Liste. */}
                    <Pager
                        page={pageSafe}
                        totalPages={totalPages}
                        total={sortedGroups.length}
                        pageSize={PAGE_SIZE}
                        onPage={setPage}
                    />
                </div>
            </SectionCard>
        </div>
    );
};
