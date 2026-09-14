import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ChevronDown, Plus, Receipt } from '@/components/icons/antIconCompat';
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

import { InvoiceDetailPanel } from './components/InvoiceDetailPanel';
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
} from './invoiceShared';
import '@/styles/modules/invoicePages.css';

/**
 * ── RECHNUNGSLISTE (`/sales/invoices`) ───────────────────────────────────────
 *
 * Vorgabe Samet: ALLE Rechnungen an einer Stelle — die der PROJEKTAUFTRÄGE und
 * die der LIEFERAUFTRÄGE nebeneinander, dazu die Direktrechnungen —, nach
 * Rechnungstyp und Rechnungsdatum sortiert (die neueste zuoberst), und an jeder
 * Zeile ist zu lesen, zu welchem Projekt bzw. Auftrag sie gehört, welcher Kunde
 * dahinter steht und welcher Verkäufer sie gemacht hat.
 *
 * Der Typ ist nichts Gespeichertes, sondern die Frage, an welchem Beleg die
 * Rechnung hängt (Server: `deriveInvoiceCategory`):
 *   Projektauftrag · Lieferauftrag · Direktrechnung.
 *
 * ── UMBAU 05.09.2026 ─────────────────────────────────────────────────────────
 * Vorgabe Samet: „Zahlungsstatus und die übrigen Angaben gehören nicht in die
 * Tabelle, sondern daneben — ruhig, Apple-artig; und das Bezahltmelden muss
 * einfacher gehen und anders gelöst sein, damit die Liste nicht zugestellt
 * wird." Umgesetzt in drei Schnitten:
 *
 *  1. Die Tabelle trägt nur noch, was man beim SUCHEN liest: Nummer, Typ,
 *     Kunde, Beleg, Datum, Betrag. Die Statusspalte und die fünf Aktionssymbole
 *     je Zeile sind weg — sie waren der Grund, warum die Zeile voll war.
 *  2. Der Status steht ZWEIMAL daneben: oben als Übersicht (offen/bezahlt in
 *     Franken, für die ganze gefilterte Liste) und im Blatt rechts für die eine
 *     angeklickte Rechnung.
 *  3. Bezahltmelden ist im Blatt die grösste Fläche — ein Knopf mit dem
 *     Zahlungsdatum darunter (`InvoiceDetailPanel`), statt eines Häkchens
 *     zwischen vier weiteren Symbolen.
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
       den Typ auch dann, wenn die Seite schon offen ist. Ohne `type` stehen
       Projekt- und Lieferauftragsrechnungen NEBENEINANDER — das ist die
       Voreinstellung der Seite. */
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

    /* Die Zeile trägt seit dem Umbau weder Status noch Aktionen — dafür haben
       Kunde und Beleg wieder Platz. Schlüssel v4, damit gespeicherte alte
       Breiten die neue (kürzere) Aufteilung nicht überstimmen. */
    const grid = useColumnWidths({
        storageKey: 'offitec:invoice-list:col-widths:v4',
        defaults: { number: 176, type: 140, reference: 170, salesperson: 140, date: 132, amount: 140 },
        minPx: 72,
    });

    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);

    /* Die angeklickte Rechnung steht als ID im Zustand, nicht als Objekt: nach
       einem Statuswechsel wird die Liste neu geladen, und das Blatt soll die
       FRISCHE Zeile zeigen, nicht die eingefrorene von vorhin. */
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const [previewInvoice, setPreviewInvoice] = useState<InvoiceDto | null>(null);
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    /* `silent`: nach einer eigenen Änderung wird die Liste im Hintergrund
       abgeglichen — ohne Ladezustand, die Zeile zeigt die Änderung schon. */
    const load = useCallback(async (options: { silent?: boolean } = {}) => {
        if (!options.silent) setLoading(true);
        try {
            const list = await billingApi.listInvoices(category ? { category } : {});
            setInvoices(list);
        } catch (e) {
            if (!options.silent) toast.error(apiError(e, t('invoices.loadError')));
        } finally {
            if (!options.silent) setLoading(false);
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

    /**
     * Der Zahlungsstand der gefilterten Liste — die Antwort auf „wie viel steht
     * noch aus?", die vorher niemand geben konnte, weil sie über zwanzig
     * Statuszellen verteilt war. Stornierte Rechnungen zählen nirgends mit: sie
     * sind kein offener und kein bezahlter Betrag.
     */
    const totals = useMemo(() => {
        let open = 0; let openCount = 0;
        let paid = 0; let paidCount = 0;
        for (const invoice of rows) {
            const amount = Number(invoice.amount) || 0;
            if (invoice.status === 'PAID') { paid += amount; paidCount += 1; }
            else if (invoice.status === 'ISSUED') { open += amount; openCount += 1; }
        }
        return { open, openCount, paid, paidCount, billed: open + paid };
    }, [rows]);

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

    /* Das Blatt zeigt die Rechnung aus der GELADENEN Liste — verschwindet sie
       (gelöscht, weggefiltert), schliesst es sich von selbst. */
    const selected = useMemo(
        () => invoices.find((invoice) => invoice.id === selectedId) ?? null,
        [invoices, selectedId],
    );

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

    /**
     * Statuswechsel aus dem Blatt. `paidAt` reist beim Bezahltmelden mit — der
     * Zahlungseingang ist ein Datum, kein blosses Etikett; jeder andere Status
     * löscht es serverseitig wieder.
     */
    /* OPTIMISTISCH (14.09.2026): die Zeile zeigt den neuen Status sofort, der
       Server bestätigt dahinter. Auf dem Produktivrechner wartete der Klick
       sonst die Schreibanfrage UND das Neuladen der ganzen Liste ab. Scheitert
       die Anfrage, kommt die alte Zeile zurück und die Meldung erklärt warum. */
    const setStatusOf = async (invoice: InvoiceDto, next: InvoiceStatus, paidAt?: string | null) => {
        const before = invoice;
        setInvoices((rows) => rows.map((row) => (row.id === invoice.id
            ? { ...row, status: next, paidAt: next === 'PAID' ? (paidAt ?? row.paidAt ?? null) : null }
            : row)));
        if (next === 'CANCELLED' && previewInvoice?.id === invoice.id) closePreview();
        setBusyId(invoice.id);
        try {
            await billingApi.updateStatus(invoice.id, next, paidAt ?? null);
            toast.success(
                next === 'PAID' ? t('billing.markedPaid')
                    : next === 'CANCELLED' ? t('invoices.cancelled')
                        : t('invoices.reopened'),
            );
            void load({ silent: true });
        } catch (e) {
            setInvoices((rows) => rows.map((row) => (row.id === before.id ? before : row)));
            toast.error(apiError(e, t('billing.invoiceError')));
        } finally {
            setBusyId(null);
        }
    };

    /* Endgültig löschen kann nur eine STORNIERTE Rechnung (der Server besteht
       darauf): der Weg einer Korrektur ist immer erst stornieren, dann
       entfernen — die Nummernserie wird nie zurückgedreht. */
    const remove = async (invoice: InvoiceDto) => {
        // Optimistisch wie der Statuswechsel: die Zeile verschwindet sofort und
        // kehrt an ihren Platz zurück, wenn der Server ablehnt.
        const index = invoices.findIndex((row) => row.id === invoice.id);
        setInvoices((rows) => rows.filter((row) => row.id !== invoice.id));
        if (previewInvoice?.id === invoice.id) closePreview();
        setSelectedId(null);
        setBusyId(invoice.id);
        try {
            await billingApi.deleteInvoice(invoice.id);
            toast.success(t('billing.deleted'));
            void load({ silent: true });
        } catch (e) {
            setInvoices((rows) => {
                if (rows.some((row) => row.id === invoice.id)) return rows;
                const restored = [...rows];
                restored.splice(index < 0 ? restored.length : Math.min(index, restored.length), 0, invoice);
                return restored;
            });
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
                            className="ofi-btn-brand flex items-center gap-1.5 rounded-md bg-[#0a7aff] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#0066e0]"
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
                    className="ofi-invp-search is-grow"
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

            {/* ── DER ZAHLUNGSSTAND ───────────────────────────────────────────
                Der Status verlässt die Tabelle und steht hier: in Franken, für
                genau die Liste, die gerade gefiltert ist. Ein Klick auf „offen"
                bzw. „bezahlt" filtert danach — die Kachel ist damit auch der
                Weg dorthin und nicht nur eine Zahl. */}
            <div className="ofi-invp-tiles">
                <div className="ofi-invp-tile">
                    <div className="ofi-invp-tile__label">{t('invoices.tileCount')}</div>
                    <div className="ofi-invp-tile__value">{rows.length}</div>
                </div>
                <div className="ofi-invp-tile">
                    <div className="ofi-invp-tile__label">{t('invoices.tileTotal')}</div>
                    <div className="ofi-invp-tile__value">{fmtMoney(totals.billed)}</div>
                </div>
                <button
                    type="button"
                    className={`ofi-invp-tile is-open is-click ${status === 'ISSUED' ? 'is-on' : ''}`}
                    onClick={() => withPageReset(setStatus)(status === 'ISSUED' ? '' : 'ISSUED')}
                >
                    <div className="ofi-invp-tile__label">{t('invoices.tileOpen')} · {totals.openCount}</div>
                    <div className="ofi-invp-tile__value">{fmtMoney(totals.open)}</div>
                </button>
                <button
                    type="button"
                    className={`ofi-invp-tile is-paid is-click ${status === 'PAID' ? 'is-on' : ''}`}
                    onClick={() => withPageReset(setStatus)(status === 'PAID' ? '' : 'PAID')}
                >
                    <div className="ofi-invp-tile__label">{t('invoices.tilePaid')} · {totals.paidCount}</div>
                    <div className="ofi-invp-tile__value">{fmtMoney(totals.paid)}</div>
                </button>
            </div>

            {/* Liste links, das Blatt der angeklickten Rechnung rechts. Unter
                1280px wird aus dem Blatt eine Schicht über der Liste — die
                Tabelle soll nie in zwei enge Spalten gepresst werden. */}
            <div className={`ofi-invp-split ${selected ? 'has-detail' : ''}`}>
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
                            <ResizableCols keys={['reference', 'salesperson', 'date', 'amount'] as const} grid={grid} />
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
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || paged.length === 0) && (
                                <TableStateRow
                                    colSpan={7}
                                    loading={loading}
                                    emptyText={hasFilters ? t('invoices.emptyFiltered') : t('invoices.empty')}
                                />
                            )}
                            {!loading && paged.map((invoice) => {
                                const type = invoiceCategory(invoice);
                                const reference = referenceOf(invoice);
                                const cancelled = invoice.status === 'CANCELLED';
                                return (
                                    <tr
                                        key={invoice.id}
                                        /* Der Klick ÖFFNET DAS BLATT, er baut kein
                                           PDF mehr: das Blatt ist der Ort, an dem
                                           alles weitere steht — Vorschau
                                           eingeschlossen. */
                                        className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${selectedId === invoice.id ? 'ofi-invp-row is-selected' : ''}`}
                                        aria-selected={selectedId === invoice.id}
                                        onClick={() => setSelectedId(invoice.id)}
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
                                                        className="block max-w-full truncate text-left font-mono text-[12px] font-semibold text-[#0a7aff] hover:underline dark:text-white/80"
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

                {selected && (
                    <InvoiceDetailPanel
                        /* Eine andere Rechnung ist ein anderes Blatt: der
                           Schlüssel baut es neu auf, damit das Zahlungsdatum
                           nicht von der vorigen stehen bleibt. */
                        key={selected.id}
                        invoice={selected}
                        busy={busyId === selected.id}
                        onClose={() => setSelectedId(null)}
                        onPreview={() => void preview(selected)}
                        onDownload={() => void download(selected)}
                        onStatus={(next, paidAt) => void setStatusOf(selected, next, paidAt)}
                        onDelete={() => void remove(selected)}
                        /* Bearbeiten öffnet die Erfassungsmaske auf DIESER
                           Rechnung; sie behält Nummer und Zahlungsstand. */
                        onEdit={() => navigate(`/sales/invoices/new/direct?edit=${selected.id}`)}
                    />
                )}
            </div>

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
