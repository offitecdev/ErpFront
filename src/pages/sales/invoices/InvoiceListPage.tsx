import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Check, ChevronDown, Eye, FileDownload02, Plus, Receipt, Trash01, X } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import {
    ColResizeHandle,
    FILTER_INPUT_CLASS,
    Pager,
    ResizableCols,
    SearchBox,
    SectionCard,
    SortableTh,
    TableStateRow,
} from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { t } from '@/i18n/translate';
import { billingApi } from '@/lib/api/billing';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { InvoiceCategory, InvoiceDto, InvoiceStatus } from '@/types/billing';
import type { InvoiceOrderContext } from '@/utils/pdf/invoicePdf';

import { InvoicePdfPopup } from './components/InvoicePdfPopup';
import {
    apiError,
    CATEGORY_ORDER,
    categoryLabel,
    categoryRank,
    categoryVariant,
    fmtDate,
    fmtMoney,
    invoiceCategory,
    invoiceRecipient,
    statusLabel,
    statusVariant,
} from './invoiceShared';

/**
 * ── RECHNUNGSLISTE (`/sales/invoices`, 30.08.2026) ───────────────────────────
 *
 * Vorgabe Samet: ALLE Rechnungen an einer Stelle, nach RECHNUNGSTYP und
 * Rechnungsdatum sortiert (die neueste zuoberst), und an jeder Zeile ist zu
 * lesen, zu welchem Projekt bzw. Auftrag sie gehört, welcher Kunde dahinter
 * steht und welcher Verkäufer sie gemacht hat.
 *
 * Der Typ ist nichts Gespeichertes, sondern die Frage, an welchem Beleg die
 * Rechnung hängt (Server: `deriveInvoiceCategory`):
 *   Projektauftrag · Lieferauftrag · Direktrechnung.
 *
 * Die Tabelle ist die GEMEINSAME Übersichtstabelle der Anwendung
 * (`data-inv-table data-list-table`) — dieselbe wie in der Kundenliste und der
 * Auftragsliste. Damit kommt auch deren Verhalten auf kleinen Geräten mit: auf
 * dem Tablet rollt sie seitwärts, auf dem Telefon wird jede Zeile zur Karte,
 * deren Werte aus `data-label` beschriftet sind.
 *
 * „Rechnung erstellen" öffnet KEIN Fenster: es zeigt die zwei Wege, und beide
 * führen auf eine eigene Seite mit Zurück-Knopf — die Rechnung aus einem
 * Auftrag und die selbst ausgefüllte Direktrechnung.
 */

const PAGE_SIZE = 20;

type SortKey = 'type' | 'number' | 'recipient' | 'date' | 'amount';
type SortDirection = 'asc' | 'desc';

/** Der Beleg, auf den die Zeile zeigt: Projekt bzw. Auftrag. */
const referenceOf = (invoice: InvoiceDto): { label: string; sub: string; to: string | null } => {
    const project = invoice.project;
    const order = invoice.salesOrder;
    if (project) {
        return {
            label: project.projectNumber || project.projectName,
            sub: order?.orderNumber || project.projectName,
            to: `/projects/${project.id}`,
        };
    }
    if (order) return { label: order.orderNumber, sub: '', to: `/sales/orders/${order.id}` };
    return { label: '', sub: '', to: null };
};

export const InvoiceListPage = () => {
    const navigate = useNavigate();
    const settings = usePdfSettings();

    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    /* Der Rechnungstyp wird SERVERSEITIG gefiltert (er ist abgeleitet, also
       genau dort zu Hause). Suche, Spaltenfilter und Status arbeiten in der
       geladenen Liste und antworten ohne Runde zum Server.

       Der Typ steht in der ADRESSE und nicht im Zustand: der Menüeintrag unter
       „Projekte" zeigt auf `?type=PROJECT`, der Weg aus „Meine Aufträge" auf
       `?type=DELIVERY` (Vorgabe Samet). Damit ist die Auswahl teilbar, der
       Zurück-Knopf tut das Erwartete, und ein zweiter Klick im Menü wechselt
       den Typ auch dann, wenn die Seite schon offen ist. */
    const [searchParams, setSearchParams] = useSearchParams();
    const category = useMemo<'' | InvoiceCategory>(() => {
        const raw = searchParams.get('type');
        return CATEGORY_ORDER.includes(raw as InvoiceCategory) ? (raw as InvoiceCategory) : '';
    }, [searchParams]);
    const setCategory = (next: '' | InvoiceCategory) => {
        const params = new URLSearchParams(searchParams);
        if (next) params.set('type', next);
        else params.delete('type');
        // `replace`: die Typwahl ist ein Filter, kein Ort — sie soll den
        // Zurück-Knopf nicht mit Zwischenständen füllen.
        setSearchParams(params, { replace: true });
    };
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'' | InvoiceStatus>('');
    const [numberFilter, setNumberFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [sortBy, setSortBy] = useState<SortKey>('type');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [page, setPage] = useState(1);

    /* Die erste Spalte hat KEINE Breite — sie nimmt, was die anderen übrig
       lassen. Sie trägt Nummer UND Rechnungsart-Marke, und „Zwischenrechnung"
       ist das längste Wort der Tabelle: die übrigen Spalten sind darum knapp
       bemessen, sonst wird die Marke mitten im Wort abgeschnitten. Der
       Schlüssel ist v2 — Browser mit den alten (breiteren) Werten sollen die
       neue Aufteilung bekommen. */
    /* Die Nummer braucht nur ihre eigene Breite — die KUNDENSPALTE nimmt, was
       übrig bleibt, und die Aktionen bekommen Platz für alle fünf Symbole
       (Vorgabe Samet: „das Rechnungsnummernfeld schmaler, dafür mehr Raum für
       die Operationen"). Schlüssel v3, damit gespeicherte alte Breiten die neue
       Aufteilung nicht überstimmen. */
    const grid = useColumnWidths({
        storageKey: 'offitec:invoice-list:col-widths:v3',
        defaults: { number: 168, type: 132, reference: 150, salesperson: 126, date: 124, amount: 124, status: 100, actions: 176 },
        minPx: 72,
    });

    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const [previewInvoice, setPreviewInvoice] = useState<InvoiceDto | null>(null);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await billingApi.listInvoices(category ? { category } : {});
            setInvoices(list);
        } catch (e) {
            toast.error(apiError(e, t('invoices.loadError')));
        } finally {
            setLoading(false);
        }
    }, [category]);

    useEffect(() => { void load(); }, [load]);

    /* Jeder Filter setzt die Seite mit zurück — sonst stünde man nach dem
       Tippen auf Seite 4 einer dreiseitigen Liste. Das geschieht IM Setzer und
       nicht in einem Effekt: ein Effekt würde denselben Zustand ein zweites Mal
       rendern, nur um eine Zahl zu korrigieren, die der Klick schon kennt. */
    const withPageReset = <T,>(set: (next: T) => void) => (next: T) => {
        set(next);
        setPage(1);
    };

    // Das Menü der zwei Wege schliesst bei Klick daneben und mit Escape.
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
        };
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const numberNeedle = numberFilter.trim().toLowerCase();
        const customerNeedle = customerFilter.trim().toLowerCase();
        const filtered = invoices.filter((invoice) => {
            if (status && invoice.status !== status) return false;
            if (numberNeedle && !invoice.invoiceNumber.toLowerCase().includes(numberNeedle)) return false;
            if (customerNeedle && !invoiceRecipient(invoice).toLowerCase().includes(customerNeedle)) return false;
            if (!needle) return true;
            const haystack = [
                invoice.invoiceNumber,
                invoiceRecipient(invoice),
                invoice.salesOrder?.orderNumber,
                invoice.project?.projectNumber,
                invoice.project?.projectName,
                invoice.salespersonName,
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(needle);
        });

        const dir = sortDirection === 'asc' ? 1 : -1;
        const dateOf = (invoice: InvoiceDto) => new Date(invoice.invoiceDate || invoice.createdAt).getTime();
        return [...filtered].sort((a, b) => {
            switch (sortBy) {
                case 'number': return dir * a.invoiceNumber.localeCompare(b.invoiceNumber);
                case 'recipient': return dir * invoiceRecipient(a).localeCompare(invoiceRecipient(b));
                case 'amount': return dir * (Number(a.amount || 0) - Number(b.amount || 0));
                case 'date': return dir * (dateOf(a) - dateOf(b));
                // Die Voreinstellung: erst der Typ, INNERHALB des Typs die
                // neueste zuoberst (Vorgabe). Die Richtung dreht das Datum —
                // die Typreihenfolge ist eine feste Lesereihenfolge.
                default: {
                    const byType = categoryRank(invoiceCategory(a)) - categoryRank(invoiceCategory(b));
                    return byType !== 0 ? byType : dir * (dateOf(a) - dateOf(b));
                }
            }
        });
    }, [invoices, search, status, numberFilter, customerFilter, sortBy, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

    const toggleSort = (key: SortKey) => {
        setSortDirection(sortBy === key && sortDirection === 'desc' ? 'asc' : 'desc');
        setSortBy(key);
        setPage(1);
    };

    /**
     * Bauplan des PDF: die Rechnung aus einem Auftrag zieht Positionen, Adresse
     * und Kommission aus der OFFERTE hinter dem Auftrag (deshalb liefert die
     * Liste `tenderId` mit); die Direktrechnung trägt alles selbst.
     */
    const contextOf = (invoice: InvoiceDto): InvoiceOrderContext => ({
        orderNumber: invoice.salesOrder?.orderNumber || '—',
        tenderId: invoice.salesOrder?.tenderId ?? null,
        customerName: invoiceRecipient(invoice) || null,
        salespersonName: invoice.salespersonName ?? null,
        commissionNumber: invoice.commissionNumber ?? null,
        paymentStages: parsePaymentStages(invoice.salesOrder?.paymentStages ?? null),
    });

    const closePreview = () => {
        setPreviewInvoice(null);
        setPreviewBlob(null);
        setPreviewLoading(false);
    };

    const preview = async (invoice: InvoiceDto) => {
        setPreviewInvoice(invoice);
        setPreviewBlob(null);
        setPreviewLoading(true);
        try {
            // Immer dynamisch nachladen: der PDF-Bauer ist gross und gehört
            // nicht in das Bündel der Liste.
            const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
            const bytes = await buildInvoicePdfBytes(invoice, contextOf(invoice), settings);
            setPreviewBlob(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
        } catch (e) {
            toast.error(apiError(e, t('billing.pdfError')));
        } finally {
            setPreviewLoading(false);
        }
    };

    const download = async (invoice: InvoiceDto) => {
        setBusyId(invoice.id);
        try {
            const { exportInvoicePdf } = await import('@/utils/pdf/invoicePdf');
            await exportInvoicePdf(invoice, contextOf(invoice), settings);
        } catch (e) {
            toast.error(apiError(e, t('billing.pdfError')));
        } finally {
            setBusyId(null);
        }
    };

    const setStatusOf = async (invoice: InvoiceDto, next: InvoiceStatus) => {
        setBusyId(invoice.id);
        try {
            await billingApi.updateStatus(invoice.id, next);
            toast.success(next === 'PAID' ? t('billing.markedPaid') : t('invoices.cancelled'));
            if (next === 'CANCELLED' && previewInvoice?.id === invoice.id) closePreview();
            await load();
        } catch (e) {
            toast.error(apiError(e, t('billing.invoiceError')));
        } finally {
            setBusyId(null);
        }
    };

    /* Endgültig löschen kann nur eine STORNIERTE Rechnung (der Server besteht
       darauf): der Weg einer Korrektur ist immer erst stornieren, dann
       entfernen — die Nummernserie wird nie zurückgedreht. */
    const remove = async (invoice: InvoiceDto) => {
        setBusyId(invoice.id);
        try {
            await billingApi.deleteInvoice(invoice.id);
            toast.success(t('billing.deleted'));
            if (previewInvoice?.id === invoice.id) closePreview();
            await load();
        } catch (e) {
            toast.error(apiError(e, t('billing.invoiceError')));
        } finally {
            setBusyId(null);
        }
    };

    const hasFilters = Boolean(search || status || category || numberFilter || customerFilter);

    // Auf dem Telefon trägt jede Zelle ihren Spaltennamen — aus DEMSELBEN
    // i18n-Text wie der Spaltenkopf.
    const colLabel = {
        type: t('invoices.colType'),
        customer: t('invoices.colCustomer'),
        reference: t('invoices.colReference'),
        salesperson: t('invoices.colSalesperson'),
        date: t('invoices.colDate'),
        amount: t('invoices.colAmount'),
        status: t('invoices.colStatus'),
        actions: t('common.actions'),
    };

    return (
        <div className="ofi-invp-page">
            <InventoryListHeader
                title={t('invoices.title')}
                action={
                    /* Der Knopf öffnet die ZWEI WEGE; beide führen auf eine
                       eigene Seite, nicht in ein Fenster (Vorgabe). */
                    <div className="ofi-invp-menuwrap" ref={menuRef}>
                        <button
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen((on) => !on)}
                            className="ofi-btn-brand flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1f2654]"
                        >
                            <Plus size={14} />
                            {t('invoices.create')}
                            <ChevronDown size={13} />
                        </button>
                        {menuOpen && (
                            <div className="ofi-invp-menu" role="menu">
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="ofi-invp-menu__item"
                                    onClick={() => { setMenuOpen(false); navigate('/sales/invoices/new/order'); }}
                                >
                                    <Receipt size={15} />
                                    <span>
                                        <span className="ofi-invp-menu__title">{t('invoices.createFromOrder')}</span>
                                        <span className="ofi-invp-menu__hint">{t('invoices.createFromOrderHint')}</span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    className="ofi-invp-menu__item"
                                    onClick={() => { setMenuOpen(false); navigate('/sales/invoices/new/direct'); }}
                                >
                                    <Plus size={15} />
                                    <span>
                                        <span className="ofi-invp-menu__title">{t('invoices.createDirect')}</span>
                                        <span className="ofi-invp-menu__hint">{t('invoices.createDirectHint')}</span>
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                }
            />

            {/* Oberleiste wie in der Kunden- und der Auftragsliste: Typwahl,
                Volltextsuche, Status. Auf dem Telefon stehen sie untereinander
                und in voller Breite. */}
            <div className="ofi-invp-toolbar">
                <div className="ofi-invp-segwrap">
                    <div className="ofi-invp-seg">
                        <button
                            type="button"
                            className={`ofi-invp-seg__btn ${category === '' ? 'is-on' : ''}`}
                            onClick={() => withPageReset(setCategory)('')}
                        >
                            {t('common.all')}
                        </button>
                        {CATEGORY_ORDER.map((key) => (
                            <button
                                key={key}
                                type="button"
                                className={`ofi-invp-seg__btn ${category === key ? 'is-on' : ''}`}
                                onClick={() => withPageReset(setCategory)(key)}
                            >
                                {categoryLabel(key)}
                            </button>
                        ))}
                    </div>
                </div>
                <SearchBox
                    value={search}
                    onChange={withPageReset(setSearch)}
                    placeholder={t('invoices.searchPlaceholder')}
                    className="ofi-invp-search"
                />
                <select
                    value={status}
                    onChange={(event) => withPageReset(setStatus)(event.target.value as '' | InvoiceStatus)}
                    aria-label={t('invoices.colStatus')}
                    className="ofi-invp-select"
                >
                    <option value="">{t('invoices.statusAll')}</option>
                    <option value="ISSUED">{statusLabel('ISSUED')}</option>
                    <option value="PAID">{statusLabel('PAID')}</option>
                    <option value="CANCELLED">{statusLabel('CANCELLED')}</option>
                </select>
            </div>

            <SectionCard title={`${t('invoices.title')} (${rows.length})`}>
                {/* `data-list-table`: luftiges Zeilenmass, seitwärts rollend auf
                    dem Tablet und Karten auf dem Telefon (index.css
                    „ÜBERSICHTSLISTEN"). */}
                <table data-inv-table data-list-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <ResizableCols keys={['number', 'type'] as const} grid={grid} />
                        {/* Kunde: keine Breite — der Name ist das Längste in der
                            Zeile, er nimmt den Rest. */}
                        <col />
                        <ResizableCols
                            keys={['reference', 'salesperson', 'date', 'amount', 'status', 'actions'] as const}
                            grid={grid}
                        />
                    </colgroup>
                    <thead>
                        <tr>
                            <SortableTh label={t('invoices.colNumber')} sortKey="number" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('number')} />
                            <SortableTh label={colLabel.type} sortKey="type" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('type')} />
                            <SortableTh label={colLabel.customer} sortKey="recipient" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" />
                            <th className="relative text-left">
                                {colLabel.reference}
                                <ColResizeHandle {...grid.resizeProps('reference')} />
                            </th>
                            <th className="relative text-left">
                                {colLabel.salesperson}
                                <ColResizeHandle {...grid.resizeProps('salesperson')} />
                            </th>
                            <SortableTh label={colLabel.date} sortKey="date" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('date')} />
                            <SortableTh label={colLabel.amount} sortKey="amount" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-right" {...grid.resizeProps('amount')} />
                            <th className="relative text-left">
                                {colLabel.status}
                                <ColResizeHandle {...grid.resizeProps('status')} />
                            </th>
                            <th className="relative text-right">
                                {colLabel.actions}
                                <ColResizeHandle {...grid.resizeProps('actions')} />
                            </th>
                        </tr>
                        {/* Spaltenfilter — Nummer und Kunde grenzen mit Text ein.
                            Spalten ohne Filter bekommen ihre eigene (leere)
                            Zelle, damit die Spaltenlinie nicht abreisst. */}
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input
                                    value={numberFilter}
                                    onChange={(event) => withPageReset(setNumberFilter)(event.target.value)}
                                    placeholder={`${t('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th />
                            <th className="pb-1.5">
                                <input
                                    value={customerFilter}
                                    onChange={(event) => withPageReset(setCustomerFilter)(event.target.value)}
                                    placeholder={`${t('common.filter')}...`}
                                    className={FILTER_INPUT_CLASS}
                                />
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
                                emptyText={hasFilters ? t('invoices.emptyFiltered') : t('invoices.empty')}
                            />
                        )}
                        {!loading && paged.map((invoice) => {
                            const type = invoiceCategory(invoice);
                            const reference = referenceOf(invoice);
                            const busy = busyId === invoice.id;
                            const cancelled = invoice.status === 'CANCELLED';
                            return (
                                <tr
                                    key={invoice.id}
                                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                    onClick={() => void preview(invoice)}
                                >
                                    <td>
                                        <div className={`truncate font-semibold text-slate-800 dark:text-white ${cancelled ? 'line-through' : ''}`}>
                                            {invoice.invoiceNumber}
                                        </div>
                                        <div className="ofi-list-sub pt-1">
                                            <span className="ofi-invp-kind">{t(`billing.kind_${invoice.kind}`)}</span>
                                        </div>
                                    </td>
                                    <td data-label={colLabel.type}>
                                        <StatusChip variant={categoryVariant(type)}>{categoryLabel(type)}</StatusChip>
                                    </td>
                                    <td data-label={colLabel.customer} className="text-slate-600 dark:text-white/80">
                                        {invoiceRecipient(invoice)
                                            ? <span className="block truncate">{invoiceRecipient(invoice)}</span>
                                            : <span className="text-slate-400 dark:text-white/40">{t('invoices.noRecipient')}</span>}
                                    </td>
                                    <td data-label={colLabel.reference}>
                                        {reference.to ? (
                                            <div className="min-w-0">
                                                <button
                                                    type="button"
                                                    className="block max-w-full truncate text-left font-mono text-[12px] font-semibold text-[#272f67] hover:underline dark:text-white/80"
                                                    title={invoice.project ? t('invoices.openProject') : t('invoices.openOrder')}
                                                    onClick={(event) => { event.stopPropagation(); navigate(reference.to as string); }}
                                                >
                                                    {reference.label}
                                                </button>
                                                {reference.sub && (
                                                    <span className="ofi-list-sub block truncate text-[10px] text-slate-400 dark:text-white/50">
                                                        {reference.sub}
                                                    </span>
                                                )}
                                            </div>
                                        ) : null}
                                    </td>
                                    <td data-label={colLabel.salesperson} className="text-slate-600 dark:text-white/70">
                                        {invoice.salespersonName ? <span className="block truncate">{invoice.salespersonName}</span> : null}
                                    </td>
                                    <td data-label={colLabel.date}>
                                        <div className="text-slate-700 dark:text-white/80">{fmtDate(invoice.invoiceDate || invoice.createdAt)}</div>
                                        {invoice.dueDate && (
                                            <div className="ofi-list-sub text-[11px] text-slate-400 dark:text-white/50">
                                                {t('invoices.dueShort', { date: fmtDate(invoice.dueDate) })}
                                            </div>
                                        )}
                                    </td>
                                    <td data-label={colLabel.amount} className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                        {fmtMoney(invoice.amount)}
                                    </td>
                                    <td data-label={colLabel.status}>
                                        <StatusChip variant={statusVariant(invoice.status)}>{statusLabel(invoice.status)}</StatusChip>
                                    </td>
                                    <td data-label={colLabel.actions} onClick={(event) => event.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                className="ofi-invp-glyph"
                                                title={t('billing.previewBtn')}
                                                disabled={busy}
                                                onClick={() => void preview(invoice)}
                                            >
                                                <Eye size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                className="ofi-invp-glyph is-pdf"
                                                title={t('billing.downloadBtn')}
                                                disabled={busy}
                                                onClick={() => void download(invoice)}
                                            >
                                                <FileDownload02 size={15} />
                                            </button>
                                            {invoice.status === 'ISSUED' && (
                                                <button
                                                    type="button"
                                                    className="ofi-invp-glyph is-ok"
                                                    title={t('billing.markPaid')}
                                                    disabled={busy}
                                                    onClick={() => void setStatusOf(invoice, 'PAID')}
                                                >
                                                    <Check size={15} />
                                                </button>
                                            )}
                                            {!cancelled && (
                                                <button
                                                    type="button"
                                                    className="ofi-invp-glyph is-danger"
                                                    title={t('invoices.cancelInvoice')}
                                                    disabled={busy}
                                                    onClick={() => void setStatusOf(invoice, 'CANCELLED')}
                                                >
                                                    <X size={15} />
                                                </button>
                                            )}
                                            {cancelled && (
                                                <button
                                                    type="button"
                                                    className="ofi-invp-glyph is-danger"
                                                    title={t('billing.deleteForever')}
                                                    disabled={busy}
                                                    onClick={() => void remove(invoice)}
                                                >
                                                    <Trash01 size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={pageSafe}
                        totalPages={totalPages}
                        total={rows.length}
                        pageSize={PAGE_SIZE}
                        onPage={setPage}
                    />
                </div>
            </SectionCard>

            <InvoicePdfPopup
                open={Boolean(previewInvoice)}
                title={previewInvoice ? t('invoices.previewTitle', { number: previewInvoice.invoiceNumber }) : ''}
                subtitle={previewInvoice ? `${categoryLabel(invoiceCategory(previewInvoice))} · ${fmtMoney(previewInvoice.amount)}` : undefined}
                blob={previewBlob}
                loading={previewLoading}
                onClose={closePreview}
                onDownload={() => { if (previewInvoice) void download(previewInvoice); }}
            />
        </div>
    );
};
