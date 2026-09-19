import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { ArrowRight, Check, ChevronDown, Coins01, Eye, FileDownload02 } from '@/components/icons/antIconCompat';
import { ColResizeHandle, ResizableCols } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { billingApi } from '@/lib/api/billing';
import { openAmount } from '@/lib/orderBillingTotals';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n/translate';
import type { BillingSummaryDto, InvoiceDto, InvoiceKind, InvoiceStatus } from '@/types/billing';
import type { InvoiceOrderContext } from '@/utils/pdf/invoicePdf';
import { InvoicePopup } from './InvoicePopup';
import { PaymentPlanSheet } from './PaymentPlanSheet';
import { apiError } from '@/pages/sales/invoices/invoiceShared';

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v || 0);
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD.MM.YYYY') : '—');

export interface BillingLineInput {
    id: string;
    orderNumber: string;
    isAddon: boolean;
    /**
     * Ek siparişin gösterilecek sırası ("2. Zusatzauftrag"). Verilmezse bölüm
     * listedeki ek siparişleri kendi sayar; tek bir ek sipariş satırı gösteren
     * çağıranlar (proje Abrechnung sekmesi) gerçek sırayı buradan geçirir.
     */
    addonIndex?: number | null;
    revisionNumber?: number | null;
    date?: string | null;
    totalAmount: number;
    summary: BillingSummaryDto | null | undefined;
    /** Özet gelmediyse yedek plan kaynağı (JSON sütunu). */
    paymentStagesRaw?: string | null;
    context: InvoiceOrderContext;
}

/** Rapor + tamamlanan belge satırı (sipariş detayı sayfası besler). */
export interface BillingDocumentRow {
    id: string;
    label: string;
    type: string;
    date?: string | null;
    signed?: boolean;
}

const lineTotal = (line: BillingLineInput) => Number(line.summary?.baseAmount ?? line.totalAmount ?? 0);
const lineBilled = (line: BillingLineInput) => Number(line.summary?.billedAmount ?? 0);
/**
 * Açık bakiye — %100 faturalandırılmış bir siparişte 0.00'dır, kalan kuruş
 * yalnızca yuvarlama tozu olduğu için (bkz. `openAmount`).
 */
const lineOpen = (line: BillingLineInput) =>
    openAmount(line.summary?.billedPercent, lineTotal(line), lineBilled(line));
const linePct = (line: BillingLineInput) => {
    const total = lineTotal(line);
    return total > 0 ? Math.max(0, Math.min(100, Math.round((lineBilled(line) / total) * 100))) : 0;
};
const lineRemainingPct = (line: BillingLineInput) =>
    round2(Math.max(0, Number(line.summary?.remainingPercent ?? (100 - linePct(line)))));
const lineStages = (line: BillingLineInput) =>
    line.summary?.paymentStages ?? parsePaymentStages(line.paymentStagesRaw) ?? null;

/** Dieselbe Regel wie der Server: die Art folgt aus dem Anteil. */
const deriveKind = (billedPct: number, percent: number, remainingPct: number): InvoiceKind => {
    const completes = percent >= remainingPct - 0.005;
    if (completes) return billedPct > 0.005 ? 'SCHLUSS' : 'RECHNUNG';
    return billedPct > 0.005 ? 'ZWISCHEN' : 'AKONTO';
};

/** Zahlungsstand als Marke: bezahlt grün, offen bernstein, Storno grau. */
const PAYMENT_STATE: Record<InvoiceStatus, string> = {
    DRAFT: 'is-cancelled',
    PAID: 'is-paid',
    ISSUED: 'is-open',
    CANCELLED: 'is-cancelled',
};

const stateText = (status: InvoiceStatus, kind?: InvoiceKind) =>
    kind === 'STORNO' ? t('accounting.creditState.STORNO')
        : kind === 'GUTSCHRIFT' ? (status === 'PAID' ? t('accounting.creditState.REFUNDED') : t('accounting.creditState.REFUND_OPEN'))
        : status === 'DRAFT' ? t('accounting.state.DRAFT')
        : status === 'CANCELLED' ? t('billing.groupCancelled')
            : status === 'PAID' ? t('billing.groupPaid')
                : t('billing.groupOpen');

/**
 * ── ABRECHNUNG IM PROJEKT UND IM AUFTRAG: NUR DER STAND (16.09.2026, Schritt 5)
 *
 * Vorgabe Samet: «Rechnungen gehören in die Buchhaltung — an EINE Stelle.»
 * Projekt- und Auftragsseite zeigen darum nur noch, wo die Verrechnung steht:
 * Total · fakturiert · offen · der nächste Schritt (die Art folgt aus dem
 * Zahlungsplan) — und einen Weg dorthin: «Rechnung erstellen →» öffnet die
 * Buchhaltung mit genau diesem Auftrag. Ausstellen, Zahlung erfassen,
 * Datum ändern und stornieren geschieht dort.
 *
 * Geblieben sind der Zahlungsplan (er gehört dem AUFTRAG) und der Blick in
 * die Rechnungen des Auftrags (Vorschau, PDF, «in der Buchhaltung öffnen»).
 */

/** Popup'ta faturaları listelenecek sipariş (ana sipariş + ekleri). */
export interface BillingInvoiceScopeItem {
    id: string;
    orderNumber: string;
    isAddon: boolean;
    addonIndex?: number | null;
}

export const OrderBillingSection = ({
    lines,
    onReload,
    documents,
    invoiceScope,
    onOpenOrder,
    activeOrderId,
}: {
    lines: BillingLineInput[];
    onReload: () => void | Promise<void>;
    documents?: BillingDocumentRow[];
    /**
     * Fatura popup'ının kapsamı. Verilmezse tablodaki satırlar kullanılır;
     * proje Abrechnung sekmesi tabloda TEK sipariş gösterdiği için buraya
     * ana sipariş + ek siparişlerinin tamamını geçirir.
     */
    invoiceScope?: BillingInvoiceScopeItem[];
    /**
     * Popup'ta bir sipariş başlığına tıklanınca ne olacağı. Verilmezse CRM
     * sipariş sayfasının Abrechnung sekmesine gidilir.
     */
    onOpenOrder?: (orderId: string) => void;
    /** Hâlihazırda açık olan sipariş — popup'ta tıklanamaz başlık olur. */
    activeOrderId?: string;
}) => {
    const settings = usePdfSettings();
    const navigate = useNavigate();
    const canCreate = useAuthStore((state) => Boolean(state.isSystemAdmin) || state.permissions.includes('billing.create'));
    const grid = useColumnWidths({
        // v4 (16.09.2026, Schritt 5): die Eingabespalten sind dem «nächsten
        // Schritt» gewichen — gerechnet wird in der Buchhaltung.
        storageKey: 'offitec:order-billing:col-widths:v4',
        defaults: { order: 200, total: 140, billed: 160, remaining: 160, next: 300 },
        minPx: 72,
    });
    const [planFor, setPlanFor] = useState<BillingLineInput | null>(null);
    const [invoicesOpen, setInvoicesOpen] = useState(false);
    const activePlanLine = planFor ? lines.find((line) => line.id === planFor.id) ?? planFor : null;

    const openOrder = (orderId: string) => {
        setInvoicesOpen(false);
        if (onOpenOrder) onOpenOrder(orderId);
        else navigate(`/sales/orders/${orderId}?tab=billing`);
    };

    // Ana siparişler önce, ekleri altta.
    const ordered = useMemo(() => {
        const mains = lines.filter((line) => !line.isAddon);
        const addons = lines.filter((line) => line.isAddon);
        return [...mains, ...addons];
    }, [lines]);

    const totals = useMemo(() => {
        const total = round2(ordered.reduce((sum, line) => sum + lineTotal(line), 0));
        const billed = round2(ordered.reduce((sum, line) => sum + lineBilled(line), 0));
        return { total, billed, remaining: round2(ordered.reduce((sum, line) => sum + lineOpen(line), 0)) };
    }, [ordered]);

    // Der Zahlungsplan hängt am AUFTRAG — er reist in den PDF-Kontext mit.
    const contexts = useMemo(
        () => Object.fromEntries(ordered.map((line) => [line.id, { ...line.context, paymentStages: lineStages(line) }])),
        [ordered],
    );
    const mainLine = ordered[0] ?? null;

    const scope = useMemo<BillingInvoiceScopeItem[]>(() => {
        const source: BillingInvoiceScopeItem[] = invoiceScope?.length
            ? invoiceScope
            : ordered.map((line) => ({
                id: line.id,
                orderNumber: line.orderNumber,
                isAddon: line.isAddon,
                addonIndex: line.addonIndex,
            }));
        return [...source.filter((item) => !item.isAddon), ...source.filter((item) => item.isAddon)];
    }, [invoiceScope, ordered]);

    // ── Rechnungen je Auftrag — Popup und «Entwurf wartet» lesen daraus ─────
    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const lineIdsKey = useMemo(
        () => Array.from(new Set([...ordered.map((line) => line.id), ...scope.map((item) => item.id)])).join(','),
        [ordered, scope],
    );

    const loadInvoices = useCallback(async () => {
        if (!lineIdsKey) {
            setInvoices([]);
            return;
        }
        setInvoicesLoading(true);
        try {
            const perOrder = await Promise.all(
                lineIdsKey.split(',').map((id) => billingApi.listInvoices({ salesOrderId: id }).catch(() => [] as InvoiceDto[])),
            );
            setInvoices(perOrder.flat().sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()));
        } finally {
            setInvoicesLoading(false);
        }
    }, [lineIdsKey]);

    useEffect(() => {
        void loadInvoices();
    }, [loadInvoices]);

    // Entwürfe oben, Stornos am Ende.
    const invoicesOf = (orderId: string) =>
        invoices
            .filter((inv) => inv.salesOrderId === orderId)
            .sort((a, b) => {
                const rank = (status: InvoiceStatus) => (status === 'DRAFT' ? 0 : status === 'CANCELLED' ? 2 : 1);
                return rank(a.status) - rank(b.status);
            });

    const invoiceGroups = useMemo(() => {
        let addonCounter = 0;
        return scope.map((item) => {
            if (item.isAddon) addonCounter += 1;
            return {
                ...item,
                label: item.isAddon
                    ? `${item.addonIndex ?? addonCounter}. ${t('projects.addonOrder')}`
                    : t('projects.mainOrder'),
                invoices: invoicesOf(item.id),
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, invoices]);

    // ── PDF-Vorschau ────────────────────────────────────────────────────────
    const [previewInvoice, setPreviewInvoice] = useState<InvoiceDto | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!previewUrl) return;
        return () => URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);
    const releasePreview = () => {
        setPreviewUrl(null);
        setPreviewInvoice(null);
    };

    const contextOf = (invoice: InvoiceDto): InvoiceOrderContext =>
        (invoice.salesOrderId && contexts[invoice.salesOrderId])
        || { orderNumber: invoice.salesOrder?.orderNumber || '—', customerName: invoice.customer?.companyName };

    // Ein Entwurf druckt «ENTWURF» statt der (noch fehlenden) Nummer.
    const printable = (invoice: InvoiceDto): InvoiceDto =>
        (invoice.status === 'DRAFT' ? { ...invoice, invoiceNumber: t('accounting.draftNumber').toUpperCase() } : invoice);

    const preview = async (invoice: InvoiceDto) => {
        setBusyId(invoice.id);
        try {
            const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
            const bytes = await buildInvoicePdfBytes(printable(invoice), contextOf(invoice), settings);
            const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
            setPreviewUrl(url);
            setPreviewInvoice(invoice);
        } catch (e) {
            toast.error(apiError(e, t('billing.pdfError')));
        } finally {
            setBusyId(null);
        }
    };

    const download = async (invoice: InvoiceDto) => {
        setBusyId(invoice.id);
        try {
            const { exportInvoicePdf } = await import('@/utils/pdf/invoicePdf');
            await exportInvoicePdf(printable(invoice), contextOf(invoice), settings);
        } catch (e) {
            toast.error(apiError(e, t('billing.pdfError')));
        } finally {
            setBusyId(null);
        }
    };

    const openInAccounting = (invoice: InvoiceDto) => {
        setInvoicesOpen(false);
        navigate(`/accounting/invoices/${invoice.id}`);
    };

    const [cardOpen, setCardOpen] = useState(true);

    let addonIndex = 0;

    return (
        <>
            <section className="ofi-inv-card ofi-inv-scope">
                <header className="ofi-inv-card__head">
                    <button
                        type="button"
                        onClick={() => setCardOpen((value) => !value)}
                        aria-expanded={cardOpen}
                        title={cardOpen ? t('common.collapse') : t('common.expand')}
                        className="ofi-inv-card__toggle ofi-inv-card__title"
                    >
                        <ChevronDown size={14} className="ofi-inv-card__chev" />
                        <span className="truncate">{t('projects.flow.billing')}</span>
                    </button>
                    {mainLine && (
                        <div className="ofi-inv-card__actions">
                            <button type="button" className="ofi-inv-btn" onClick={() => setInvoicesOpen(true)}>
                                {t('billing.myInvoices')}
                            </button>
                            <button type="button" className="ofi-inv-btn" onClick={() => setPlanFor(mainLine)}>
                                <Coins01 size={14} />
                                {t('billing.paymentPlan')}
                            </button>
                        </div>
                    )}
                </header>

                {cardOpen && (
                <div className="ofi-inv-card__body">
                <p className="ofi-inv-sub" style={{ margin: '0 0 8px' }}>{t('accounting.billingLivesThere')}</p>
                <div className="ofi-inv-scroll">
                <table data-inv-table data-unstyled-table className="ofi-inv-ordertable w-full min-w-[900px]">
                    <colgroup>
                        <ResizableCols keys={['order', 'total', 'billed', 'remaining', 'next'] as const} grid={grid} />
                        <col style={{ width: 190 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="relative text-left">
                                {t('projects.detail.colOrder')}
                                <ColResizeHandle {...grid.resizeProps('order')} />
                            </th>
                            <th className="relative text-right">
                                {t('billing.totalAmount')}
                                <ColResizeHandle {...grid.resizeProps('total')} />
                            </th>
                            <th className="relative text-right">
                                {t('billing.billed')}
                                <ColResizeHandle {...grid.resizeProps('billed')} />
                            </th>
                            <th className="relative text-right">
                                {t('billing.remaining')}
                                <ColResizeHandle {...grid.resizeProps('remaining')} />
                            </th>
                            <th className="relative text-left">
                                {t('accounting.nextStep')}
                                <ColResizeHandle {...grid.resizeProps('next')} />
                            </th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {ordered.map((line) => {
                            const remaining = lineRemainingPct(line);
                            const done = remaining <= 0.005;
                            const minderung = line.isAddon && Number(line.totalAmount) < 0;
                            const draft = invoices.find((invoice) => invoice.salesOrderId === line.id && invoice.status === 'DRAFT') ?? null;
                            const billedPct = Number(line.summary?.billedPercent ?? linePct(line));
                            const suggested = round2(Math.min(remaining, line.summary?.nextStage?.suggestedPercent ?? remaining));
                            const nextKind = deriveKind(billedPct, suggested, remaining);
                            const nextAmount = suggested >= remaining - 0.005
                                ? lineOpen(line)
                                : round2((lineTotal(line) * suggested) / 100);
                            const stageDate = line.summary?.nextStage?.date ?? null;
                            if (line.isAddon) addonIndex += 1;
                            const label = line.isAddon ? `${line.addonIndex ?? addonIndex}. ${t('projects.addonOrder')}` : '';
                            return (
                                <Fragment key={line.id}>
                                <tr
                                    onClick={() => setInvoicesOpen(true)}
                                    title={t('billing.invoicesTitle')}
                                    className={`is-link ${line.id === activeOrderId ? 'is-current' : ''}`}
                                >
                                    <td className={`whitespace-nowrap ${line.isAddon ? 'pl-8' : ''}`}>
                                        <span className="ofi-inv-name">{line.orderNumber}</span>
                                        {(label || line.revisionNumber) && (
                                            <span className="ofi-inv-sub">
                                                {label}
                                                {line.revisionNumber ? `${label ? ' · ' : ''}N${line.revisionNumber}` : ''}
                                            </span>
                                        )}
                                    </td>
                                    <td className={`ofi-inv-num is-strong ${minderung ? 'is-minus' : ''}`}>
                                        {fmtMoney(minderung ? Number(line.totalAmount) : lineTotal(line))}
                                    </td>
                                    {minderung ? (
                                        <td colSpan={4} className="whitespace-nowrap">
                                            <span className="ofi-inv-sub">
                                                {mainLine && !mainLine.isAddon
                                                    ? t('billing.minderungSettled', { order: mainLine.orderNumber })
                                                    : t('billing.minderungSettledNoOrder')}
                                            </span>
                                        </td>
                                    ) : (
                                    <>
                                    <td className="ofi-inv-num is-billed">
                                        {fmtMoney(lineBilled(line))}<span className="ofi-inv-num__sub">· {linePct(line)}%</span>
                                    </td>
                                    <td className={`ofi-inv-num ${done ? 'is-billed' : 'is-open'}`}>
                                        {fmtMoney(lineOpen(line))}<span className="ofi-inv-num__sub">· {Math.round(remaining)}%</span>
                                    </td>
                                    <td className="whitespace-nowrap">
                                        {done ? (
                                            <span className="ofi-inv-done">
                                                <Check size={13} strokeWidth={3} />{t('billing.invoiceCreatedChip')}
                                            </span>
                                        ) : draft ? (
                                            <span className="ofi-inv-sub">{t('accounting.draftWaiting', { amount: fmtMoney(draft.amount) })}</span>
                                        ) : (
                                            <span>
                                                <span className="ofi-inv-kind">{t(`billing.kind_${nextKind}`)}</span>
                                                <span className="ofi-inv-num__sub">
                                                    {' '}{Math.round(suggested)}% · {fmtMoney(nextAmount)}
                                                    {stageDate ? ` · ${fmtDate(stageDate)}` : ''}
                                                </span>
                                            </span>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                                        {draft ? (
                                            <button type="button" className="ofi-inv-btn is-block" onClick={() => navigate(`/accounting/invoices/${draft.id}`)}>
                                                {t('accounting.openDraft')}
                                                <ArrowRight size={14} />
                                            </button>
                                        ) : !done && canCreate ? (
                                            <button
                                                type="button"
                                                className="ofi-inv-btn is-primary is-block"
                                                onClick={() => navigate(`/accounting/invoices/new?orderId=${line.id}`)}
                                            >
                                                {t('accounting.createInvoiceLink')}
                                                <ArrowRight size={14} />
                                            </button>
                                        ) : null}
                                    </td>
                                    </>
                                    )}
                                </tr>
                                </Fragment>
                            );
                        })}
                        {ordered.length > 1 && (
                            <tr className="ofi-inv-total">
                                <td className="ofi-inv-muted">{t('common.total')}</td>
                                <td className="ofi-inv-num is-strong">{fmtMoney(totals.total)}</td>
                                <td className="ofi-inv-num is-strong is-billed">{fmtMoney(totals.billed)}</td>
                                <td className="ofi-inv-num is-strong is-open">{fmtMoney(Math.max(0, totals.remaining))}</td>
                                <td colSpan={2} />
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>

                {documents && documents.length > 0 && (
                    <div className="ofi-inv-scroll">
                    <table data-inv-table data-unstyled-table className="w-full min-w-[520px] max-w-[880px]">
                        <thead>
                            <tr>
                                <th className="text-left">{t('billing.reportsDocs')}</th>
                                <th className="text-left">{t('common.type')}</th>
                                <th className="text-right">{t('common.date')}</th>
                                <th className="text-right">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documents.map((row) => (
                                <tr key={row.id}>
                                    <td className="whitespace-nowrap"><span className="ofi-inv-name">{row.label}</span></td>
                                    <td className="whitespace-nowrap ofi-inv-muted">{row.type}</td>
                                    <td className="ofi-inv-num ofi-inv-muted">{fmtDate(row.date)}</td>
                                    <td className={`ofi-inv-num ${row.signed ? 'is-billed' : 'is-open'}`}>
                                        {row.signed ? t('projects.complete.signedLabel') : t('projects.complete.unsignedLabel')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
                </div>
                )}
            </section>

            {/* Rechnungen des Auftrags — nur lesen; alles Weitere in der Buchhaltung. */}
            <InvoicePopup
                open={invoicesOpen}
                title={t('billing.invoicesTitle')}
                subtitle={scope[0]?.orderNumber}
                onClose={() => setInvoicesOpen(false)}
                size="wide"
            >
                <div className="ofi-inv-pop__scroll">
                    <table data-inv-table data-unstyled-table className="w-full min-w-[760px]">
                        <thead>
                            <tr>
                                <th className="text-left">{t('billing.invoiceNumber')}</th>
                                <th className="text-left">{t('billing.kindLabel')}</th>
                                <th className="text-right">{t('billing.invoiceDate')}</th>
                                <th className="text-right">{t('billing.dueDate')}</th>
                                <th className="text-right">{t('billing.share')}</th>
                                <th className="text-right">{t('billing.amountLabel')}</th>
                                <th className="text-left">{t('billing.paymentStatus')}</th>
                                <th className="text-right">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoicesLoading ? (
                                <tr><td colSpan={8} className="ofi-inv-empty">{t('common.loading')}</td></tr>
                            ) : invoiceGroups.every((group) => group.invoices.length === 0) ? (
                                <tr><td colSpan={8} className="ofi-inv-empty">{t('billing.noInvoices')}</td></tr>
                            ) : invoiceGroups.map((group) => [
                                <tr key={`head-${group.id}`} className="ofi-inv-group">
                                    <td colSpan={8} className="whitespace-nowrap">
                                        {group.id === activeOrderId ? (
                                            <div className="ofi-inv-group__inner">
                                                <span className="ofi-inv-group__num">{group.orderNumber}</span>
                                                <span className="ofi-inv-group__tag">{group.label}</span>
                                                <span className="ofi-inv-group__here">{t('billing.currentOrder')}</span>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => openOrder(group.id)}
                                                title={t('billing.openOrderInvoices')}
                                                className="ofi-inv-group__inner"
                                            >
                                                <span className="ofi-inv-group__num">{group.orderNumber}</span>
                                                <span className="ofi-inv-group__tag">{group.label}</span>
                                            </button>
                                        )}
                                    </td>
                                </tr>,
                                ...(group.invoices.length === 0
                                    ? [(
                                        <tr key={`empty-${group.id}`}>
                                            <td colSpan={8} className="ofi-inv-empty">{t('billing.noInvoices')}</td>
                                        </tr>
                                    )]
                                    : group.invoices.map((invoice) => {
                                        const cancelled = invoice.status === 'CANCELLED';
                                        const isDraft = invoice.status === 'DRAFT';
                                        const paid = invoice.status === 'PAID';
                                        return (
                                    <tr key={invoice.id} className={cancelled ? 'is-muted' : ''}>
                                        <td className="whitespace-nowrap">
                                            <span className={`ofi-inv-name ${cancelled ? 'is-struck' : ''}`}>
                                                {isDraft ? t('accounting.draftNumber') : invoice.invoiceNumber}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap ofi-inv-muted">
                                            {t(`billing.kind_${(invoice.kind || 'RECHNUNG') as InvoiceKind}`)}
                                        </td>
                                        <td className="ofi-inv-num ofi-inv-muted">{fmtDate(invoice.invoiceDate || invoice.createdAt)}</td>
                                        <td className="ofi-inv-num ofi-inv-muted">{fmtDate(invoice.dueDate)}</td>
                                        <td className="ofi-inv-num">{Math.round(invoice.billedPercent)}%</td>
                                        <td className={`ofi-inv-num is-strong ${paid ? 'is-billed' : ''} ${invoice.amount < 0 ? 'is-minus' : ''}`}>{fmtMoney(invoice.amount)}</td>
                                        <td className="whitespace-nowrap">
                                            <span className={`ofi-inv-state ${PAYMENT_STATE[invoice.status]}`}>
                                                {stateText(invoice.status, invoice.kind)}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap">
                                            <div className="ofi-inv-glyphs">
                                                <button type="button" className="ofi-inv-glyph is-accent" title={t('billing.previewBtn')} aria-label={t('billing.previewBtn')} disabled={busyId === invoice.id} onClick={() => void preview(invoice)}>
                                                    <Eye size={17} strokeWidth={1.8} />
                                                </button>
                                                <button type="button" className="ofi-inv-glyph is-pdf" title={t('billing.downloadBtn')} aria-label={t('billing.downloadBtn')} disabled={busyId === invoice.id} onClick={() => void download(invoice)}>
                                                    <FileDownload02 size={17} strokeWidth={1.8} />
                                                </button>
                                                <button type="button" className="ofi-inv-glyph" title={t('accounting.openInAccounting')} aria-label={t('accounting.openInAccounting')} onClick={() => openInAccounting(invoice)}>
                                                    <ArrowRight size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                        );
                                    })
                                ),
                            ])}
                        </tbody>
                    </table>
                </div>
            </InvoicePopup>

            <InvoicePopup
                open={previewUrl !== null}
                title={previewInvoice ? (previewInvoice.status === 'DRAFT' ? t('accounting.draftNumber') : previewInvoice.invoiceNumber) : t('billing.previewBtn')}
                subtitle={previewInvoice ? t(`billing.kind_${(previewInvoice.kind || 'RECHNUNG') as InvoiceKind}`) : undefined}
                onClose={releasePreview}
                size="compact"
                fill
            >
                {previewUrl && (
                    <iframe title={t('billing.previewBtn')} src={previewUrl} className="ofi-inv-frame" />
                )}
            </InvoicePopup>

            <PaymentPlanSheet
                open={activePlanLine !== null}
                onClose={() => setPlanFor(null)}
                orderNumber={activePlanLine?.orderNumber || ''}
                salesOrderId={activePlanLine?.id || ''}
                stages={activePlanLine ? lineStages(activePlanLine) : null}
                baseTotal={activePlanLine ? lineTotal(activePlanLine) : 0}
                billedPercent={Number(activePlanLine?.summary?.billedPercent) || 0}
                paidPercent={Number(activePlanLine?.summary?.paidPercent) || 0}
                onSaved={() => void onReload()}
            />
        </>
    );
};
