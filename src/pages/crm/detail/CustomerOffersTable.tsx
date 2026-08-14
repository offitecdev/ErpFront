import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    CheckCircle,
    ChevronRight,
    Eye,
    File05 as FileSpreadsheet,
    Plus,
    XClose,
} from '@/components/icons/antIconCompat';

import { getShared } from '../../../lib/axios';
import { Button } from '../../../components/ui-shared/Button';
import { StatusChip } from '../../../components/ui-shared/StatusBadge';
import { ColResizeHandle, FILTER_INPUT_CLASS, Pager, ResizableCols, SearchBox, SectionCard, SortableTh, TableStateRow } from '../../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../../hooks/useColumnWidths';
import { formatMoney, toCurrencyCode } from '../../../utils/currency';
import { tenderStatusLabel, tenderStatusVariant } from '../../tender/detail/utils/tenderStatus.utils';

import { t as i18nT } from '@/i18n/translate';

/**
 * Angebote des Kunden — dieselbe Tabelle wie die Angebotsliste des Moduls, nur
 * ohne Kundenspalte (der Kunde IST der Kontext).
 *
 * Gefiltert und geblättert wird SERVERSEITIG über `/tenders`: dieser Endpunkt
 * kann Suche, Spaltenfilter, Sortierung und `page`/`pageSize` bereits, und
 * `fields=list` schneidet die LONGTEXT-Felder (Anschreiben, Schlussbilder) aus
 * der Antwort. Ein Kunde mit hunderten Angeboten lädt damit 15 Zeilen statt
 * alles.
 *
 * Der Tender-API-Modul wird bewusst NICHT importiert (wie in CustomerDashboard):
 * er zieht den ganzen Angebotseditor in die Ladekette.
 */

const PAGE_SIZE = 15;

/**
 * Schlanke Zeile aus `fields=list`. Sie trägt KEIN `status` und kein `format` —
 * der Zustand wird aus `projectId`/`sourceStatus` abgeleitet (siehe
 * tenderStatus.utils), genau wie in der Angebotsliste.
 */
interface OfferRow {
    id: string;
    tenderNumber: string;
    version: number;
    projectId?: string | null;
    sourceStatus?: string | null;
    createdByName?: string | null;
    createdByEmail?: string | null;
    createdByEmployeeId?: string | null;
    currency?: string | null;
    createdAt: string;
    offerMailSentAt?: string | null;
    positionCount?: number;
    grandTotal?: number;
}

type OfferListResponse = OfferRow[] | { items?: OfferRow[]; total?: number; totalPages?: number };

type OfferSortKey = 'tenderNumber' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

const fmtMoney = (value?: number | null, currency?: string | null) =>
    typeof value === 'number' ? formatMoney(value, toCurrencyCode(currency)) : '—';

const creatorName = (row: OfferRow) =>
    row.createdByName || row.createdByEmail || row.createdByEmployeeId || '—';

const initialsFromName = (value?: string | null) => {
    const cleaned = value?.trim();
    if (!cleaned || cleaned === '—') return '?';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const source = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [cleaned];
    return source.map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
};

export const CustomerOffersTable = ({
    customerId,
    onTotalChange,
}: {
    customerId: string;
    /** Meldet die Gesamtzahl an den Reiter, damit dessen Zähler stimmt. */
    onTotalChange?: (total: number) => void;
}) => {
    const navigate = useNavigate();
    const [rows, setRows] = useState<OfferRow[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    // Spaltenfilter (Zeile unter den Kopfzeilen) — schränken serverseitig ein.
    const [numberFilter, setNumberFilter] = useState('');
    const [creatorFilter, setCreatorFilter] = useState('');
    const [debouncedColumns, setDebouncedColumns] = useState({ tenderNumber: '', creatorName: '' });
    const [orderState, setOrderState] = useState<'' | 'draft' | 'order'>('');
    const grid = useColumnWidths({
        storageKey: 'offitec:customer-offers:col-widths:v1',
        defaults: { status: 128, creator: 176, amount: 144, createdAt: 160, mail: 80, actions: 112 },
        minPx: 64,
    });
    const [sortBy, setSortBy] = useState<OfferSortKey>('createdAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Serverseitige Suche — Tastenanschläge entprellen.
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(id);
    }, [search]);

    // Spaltenfilter ebenso; bleibt der Wert gleich, bleibt das Objekt gleich
    // (sonst würde der Ladeeffekt nach jedem Tastendruck doppelt laufen).
    useEffect(() => {
        const id = setTimeout(() => {
            setDebouncedColumns((prev) => {
                const next = { tenderNumber: numberFilter.trim(), creatorName: creatorFilter.trim() };
                return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
            });
        }, 300);
        return () => clearTimeout(id);
    }, [numberFilter, creatorFilter]);

    // Filterwechsel + Seitenrücksprung in EINEM Effekt: ändert sich ein Filter
    // und steht die Ansicht nicht auf Seite 1, wird erst zurückgesprungen und
    // dieser Durchlauf übersprungen (sonst zwei Requests je Tastendruck).
    const filterKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const filterKey = JSON.stringify([customerId, debouncedSearch, debouncedColumns, orderState, sortBy, sortDirection]);
        const filtersChanged = filterKeyRef.current !== null && filterKeyRef.current !== filterKey;
        filterKeyRef.current = filterKey;
        if (filtersChanged && page !== 1) {
            setPage(1);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const params = new URLSearchParams({
                    customerId,
                    page: String(page),
                    pageSize: String(PAGE_SIZE),
                    sortBy,
                    sortDirection,
                    // Rumpf auf die Spalten dieser Tabelle beschränkt.
                    fields: 'list',
                });
                if (debouncedSearch) params.set('search', debouncedSearch);
                if (debouncedColumns.tenderNumber) params.set('tenderNumber', debouncedColumns.tenderNumber);
                if (debouncedColumns.creatorName) params.set('creatorName', debouncedColumns.creatorName);
                if (orderState) params.set('orderState', orderState);

                // getShared: der doppelt laufende StrictMode-Effekt wird zu EINEM
                // HTTP-Request zusammengefasst.
                const res = await getShared<OfferListResponse>(`/tenders?${params.toString()}`);
                if (cancelled) return;
                if (Array.isArray(res.data)) {
                    setRows(res.data);
                    setTotal(res.data.length);
                    setTotalPages(1);
                } else {
                    setRows(res.data.items ?? []);
                    setTotal(res.data.total ?? 0);
                    setTotalPages(res.data.totalPages ?? 1);
                }
            } catch {
                if (cancelled) return;
                toast.error(i18nT('crm.customers.errorLoadCustomer'));
                setRows([]);
                setTotal(0);
                setTotalPages(1);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [customerId, page, debouncedSearch, debouncedColumns, orderState, sortBy, sortDirection]);

    const hasFilters = Boolean(
        debouncedSearch || debouncedColumns.tenderNumber || debouncedColumns.creatorName || orderState,
    );

    // Der Reiterzähler zeigt die ungefilterte Gesamtzahl — ein Filter soll den
    // Zähler oben nicht scheinbar leeren.
    useEffect(() => {
        if (!loading && !hasFilters) onTotalChange?.(total);
    }, [loading, hasFilters, total, onTotalChange]);

    // Wie in der Kundenliste: derselbe Kopf schaltet asc/desc um.
    const toggleSort = (column: OfferSortKey) => {
        setSortDirection(sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc');
        setSortBy(column);
    };

    const totalPagesSafe = Math.max(1, totalPages);
    const pageSafe = Math.min(page, totalPagesSafe);

    return (
        <div className="flex w-full flex-col gap-3">
            {/* Obere Leiste — wie in der Angebotsliste: Suche + Zustandsauswahl. */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-64">
                    <SearchBox
                        value={search}
                        onChange={setSearch}
                        placeholder={i18nT('tenders.tender_no')}
                    />
                </div>
                <select
                    value={orderState}
                    onChange={(event) => setOrderState(event.target.value as '' | 'draft' | 'order')}
                    aria-label={i18nT('common.status')}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{i18nT('tenders.all_statuler')}</option>
                    <option value="draft">{i18nT('crm.tenders.statusDraft')}</option>
                    <option value="order">{i18nT('crm.tenders.statusOrdered')}</option>
                </select>
            </div>

            <SectionCard
                title={`${i18nT('crm.tenders.tableTitle')} (${total})`}
                action={
                    <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus size={11} />}
                        onClick={() => navigate(`/crm/tenders/new?customerId=${customerId}`)}
                    >
                        {i18nT('nav.quickActionsGroup.newTender')}
                    </Button>
                }
            >
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        {/* Teklif no: genişliği yok, kalan yeri emer. */}
                        <col />
                        <ResizableCols keys={['status', 'creator', 'amount', 'createdAt', 'mail', 'actions'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <SortableTh label={i18nT('tenders.tender_no')} sortKey="tenderNumber" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" />
                            <SortableTh label={i18nT('common.status')} sortKey="status" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('status')} />
                            <th className="relative text-left">
                                {i18nT('tenders.olusturan')}
                                <ColResizeHandle {...grid.resizeProps('creator')} />
                            </th>
                            <th className="relative text-right">
                                {i18nT('common.amount')}
                                <ColResizeHandle {...grid.resizeProps('amount')} />
                            </th>
                            <SortableTh label={i18nT('tenders.olusturma')} sortKey="createdAt" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('createdAt')} />
                            <th className="relative text-center">
                                {i18nT('tenders.mail')}
                                <ColResizeHandle {...grid.resizeProps('mail')} />
                            </th>
                            <th className="relative text-right">
                                <ColResizeHandle {...grid.resizeProps('actions')} />
                            </th>
                        </tr>
                        {/* Spaltenfilter — Angebotsnummer und Ersteller. */}
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input
                                    value={numberFilter}
                                    onChange={(event) => setNumberFilter(event.target.value)}
                                    placeholder={`${i18nT('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th />
                            <th className="pb-1.5">
                                <input
                                    value={creatorFilter}
                                    onChange={(event) => setCreatorFilter(event.target.value)}
                                    placeholder={`${i18nT('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            {/* Filtresi olmayan sütunlar da kendi (boş) hücrelerini
                                alır ki sütun çizgileri burada da kesilmesin. */}
                            <th />
                            <th />
                            <th />
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && (
                            <TableStateRow
                                colSpan={7}
                                loading={loading}
                                emptyText={hasFilters ? i18nT('crmOverview.picker.empty') : i18nT('tenders.no_tenders_yet')}
                            />
                        )}
                        {!loading && rows.map((row) => (
                            <tr
                                key={row.id}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                onClick={() => navigate(`/crm/tenders/${row.id}`)}
                            >
                                <td>
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-700 dark:bg-sky-500/15 dark:text-sky-300">
                                            <FileSpreadsheet size={14} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="truncate font-semibold text-slate-900 dark:text-white">
                                                {row.tenderNumber}
                                            </div>
                                            <div className="mt-0.5 font-mono text-[11.5px] text-slate-400">v{row.version}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <StatusChip variant={tenderStatusVariant(row)}>
                                        {tenderStatusLabel(row)}
                                    </StatusChip>
                                </td>
                                <td>
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                                            {initialsFromName(creatorName(row))}
                                        </span>
                                        <span className="truncate text-[12.5px] text-slate-700 dark:text-white/80">
                                            {creatorName(row)}
                                        </span>
                                    </div>
                                </td>
                                <td className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                    {fmtMoney(row.grandTotal, row.currency)}
                                </td>
                                <td className="text-[12.5px] text-slate-500 dark:text-white/60">
                                    {dayjs(row.createdAt).format('DD.MM.YYYY HH:mm')}
                                </td>
                                <td className="text-center">
                                    {row.offerMailSentAt ? (
                                        <span
                                            className="inline-flex items-center justify-center text-emerald-600 dark:text-emerald-400"
                                            title={`${i18nT('tenders.mail')} · ${dayjs(row.offerMailSentAt).format('DD.MM.YYYY HH:mm')}`}
                                        >
                                            <CheckCircle size={15} />
                                        </span>
                                    ) : (
                                        <span
                                            className="inline-flex items-center justify-center text-slate-300 dark:text-white/30"
                                            title={i18nT('tenders.mail')}
                                        >
                                            <XClose size={15} />
                                        </span>
                                    )}
                                </td>
                                <td className="text-right" onClick={(event) => event.stopPropagation()}>
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/crm/tenders/${row.id}`)}
                                        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-blue-700 transition-colors hover:bg-blue-50 active:bg-blue-100 dark:text-sky-300 dark:hover:bg-sky-500/15"
                                    >
                                        <Eye size={12} />{i18nT('common.detail')}<ChevronRight size={11} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={pageSafe}
                        totalPages={totalPagesSafe}
                        total={total}
                        pageSize={PAGE_SIZE}
                        onPage={setPage}
                    />
                </div>
            </SectionCard>
        </div>
    );
};
