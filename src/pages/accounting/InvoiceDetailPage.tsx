import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { DocumentHistoryButton } from '@/components/governance';
import { CheckCircle, Edit01, FileDownload02, Receipt as ReceiptRefund, Send01, Trash01, XClose } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { openMailCompose } from '@/components/mail/mailComposeBus';
import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { MacDatePicker } from '@/components/ui-shared/MacDatePicker';
import { t } from '@/i18n/translate';
import { billingApi } from '@/lib/api/billing';
import { documentEventsApi, type DocumentEventDto } from '@/lib/api/documentEvents';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { InvoiceDto } from '@/types/billing';
import { apiError, fmtDate, fmtMoney, invoiceRecipient, isoToday } from '@/pages/sales/invoices/invoiceShared';

import {
    dayOf,
    displayNumber,
    invoiceState,
    invoiceStateLabel,
    isCreditDocument,
    kindLabel,
    pdfContextOf,
    pdfInvoiceOf,
    useBillingRights,
} from './accountingShared';
import { CreditDialog } from './components/CreditDialog';
import '@/styles/modules/accounting.css';

/**
 * ── EINE RECHNUNG (Buchhaltung, 16.09.2026, Schritt 5 / G18) ─────────────────
 *
 * Alles über eine Rechnung auf EINER Seite: links das Dokument, wie es der
 * Kunde bekommt; rechts der Inspektor — Stand, Betrag, Fälligkeit, Herkunft,
 * Zahlung, Verlauf und genau die Handlungen, die jetzt möglich sind.
 *
 *   Entwurf    ausstellen (und senden) · bearbeiten · verwerfen
 *   Offen      Zahlung erfassen · senden · PDF · stornieren
 *   Bezahlt    Zahlungsdatum korrigieren · Zahlung zurücknehmen · PDF
 *   Storniert  nur lesen
 */

const EVENT_LIMIT = 6;

/* Die Antworten der Schreibwege tragen den Auftrag ohne Offerte und Plan —
   übernommen werden darum nur die Felder, die sich geändert haben können. */
const withChanges = (prev: InvoiceDto, next: InvoiceDto): InvoiceDto => ({
    ...prev,
    status: next.status,
    invoiceNumber: next.invoiceNumber,
    paidAt: next.paidAt ?? null,
    invoiceDate: next.invoiceDate,
    dueDate: next.dueDate,
    updatedAt: next.updatedAt,
});

const eventTitle = (event: DocumentEventDto): string => {
    if (event.action === 'STATUS_CHANGED') {
        const to = String(event.snapshot?.to ?? '');
        if (to === 'PAID') return t('governance.action.markedPaid');
        if (to === 'ISSUED') return t('governance.action.reopened');
    }
    return t(`governance.action.${event.action}`);
};

export const InvoiceDetailPage = () => {
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const settings = usePdfSettings();
    const { canCreate, canManage, canCancel } = useBillingRights();

    const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [events, setEvents] = useState<DocumentEventDto[]>([]);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [pdfState, setPdfState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [busy, setBusy] = useState<string | null>(null);
    // Neuer Zahlungseingang (Schritt 7): Betrag (voreingestellt der offene Rest), Tag, Notiz.
    const [paidDate, setPaidDate] = useState(isoToday());
    const [payAmount, setPayAmount] = useState('');
    const [payNote, setPayNote] = useState('');
    const [confirm, setConfirm] = useState<'discard' | null>(null);
    // Gegenbeleg-Fenster (Schritt 6): Storno-Rechnung oder Gutschrift.
    const [creditMode, setCreditMode] = useState<'STORNO' | 'GUTSCHRIFT' | null>(null);

    const loadEvents = useCallback(async () => {
        try {
            setEvents(await documentEventsApi.list('INVOICE', id));
        } catch {
            setEvents([]);
        }
    }, [id]);

    const load = useCallback(async () => {
        try {
            const next = await billingApi.getInvoice(id);
            setInvoice(next);
            setPaidDate(isoToday());
            setPayAmount(next.lifecycle ? next.lifecycle.openAmount.toFixed(2) : '');
            setPayNote('');
        } catch (error) {
            toast.error(apiError(error, t('accounting.loadError')));
            navigate('/accounting/invoices', { replace: true });
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        void load();
        void loadEvents();
    }, [load, loadEvents]);

    /* Das ECHTE Dokument — derselbe Generator wie beim Herunterladen. Neu
       gebaut, sobald sich an der Rechnung etwas ändert, das es zeigt. */
    const pdfKey = invoice
        ? [invoice.id, invoice.status, invoice.invoiceNumber, invoice.amount, invoice.invoiceDate, invoice.dueDate, invoice.updatedAt].join('|')
        : '';
    useEffect(() => {
        if (!invoice) return undefined;
        let cancelled = false;
        let url: string | null = null;
        // Bis das neue Dokument steht, bleibt das alte sichtbar.
        void (async () => {
            try {
                const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
                const bytes = await buildInvoicePdfBytes(pdfInvoiceOf(invoice), pdfContextOf(invoice), settings);
                if (cancelled) return;
                const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
                url = URL.createObjectURL(blob);
                setPdfBlob(blob);
                setPdfUrl(url);
                setPdfState('ready');
            } catch {
                if (!cancelled) setPdfState('error');
            }
        })();
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
        // Der Schlüssel fasst zusammen, was das Dokument zeigt.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfKey, settings]);

    const refresh = async (next?: InvoiceDto) => {
        if (next) {
            setInvoice(next);
        } else {
            await load();
        }
        void loadEvents();
    };

    const run = async (key: string, action: () => Promise<void>) => {
        if (busy) return;
        setBusy(key);
        try {
            await action();
        } catch (error) {
            toast.error(apiError(error, t('billing.createError')));
        } finally {
            setBusy(null);
        }
    };

    const sendByMail = async (target: InvoiceDto) => {
        const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
        const bytes = await buildInvoicePdfBytes(target, pdfContextOf(target), settings);
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const customer = target.customer
            || (target.customerId ? { id: target.customerId, companyName: invoiceRecipient(target) } : null);
        openMailCompose({
            subject: t('mail.invoice.subject', { number: target.invoiceNumber }),
            body: t('mail.invoice.body', { number: target.invoiceNumber }),
            customer,
            entity: { type: 'INVOICE', id: target.id, label: target.invoiceNumber },
            attachments: [{ filename: `${target.invoiceNumber}.pdf`, contentType: 'application/pdf', blob, size: blob.size }],
        });
    };

    const issue = (andSend: boolean) => run(andSend ? 'issueSend' : 'issue', async () => {
        const { invoice: issued } = await billingApi.issueInvoice(id);
        toast.success(t('accounting.issued', { number: issued.invoiceNumber }));
        // Die Antwort des Ausstellens trägt nicht jede Listenangabe (Offerte
        // hinter dem Auftrag) — frisch holen, damit PDF und Mail stimmen.
        const full = await billingApi.getInvoice(id);
        await refresh(full);
        if (andSend) await sendByMail(full);
    });

    const addPayment = () => run('paid', async () => {
        const amount = Number(String(payAmount).replace(',', '.'));
        await billingApi.addPayment(id, { amount: Number.isFinite(amount) && amount > 0 ? amount : null, paidAt: paidDate, note: payNote.trim() || null });
        toast.success(t('accounting.pay.recorded'));
        // Neu laden: offener Rest und Regeln hängen an den Eingängen.
        await refresh();
    });

    const removePayment = (paymentId: string) => run(`remove:${paymentId}`, async () => {
        await billingApi.removePayment(id, paymentId);
        toast.success(t('accounting.pay.removed'));
        await refresh();
    });

    const saveDates = (field: 'invoiceDate' | 'dueDate', value: string) => run(field, async () => {
        if (!invoice || !value) return;
        const invoiceDay = field === 'invoiceDate' ? value : dayOf(invoice.invoiceDate) || isoToday();
        let dueDay = field === 'dueDate' ? value : dayOf(invoice.dueDate) || invoiceDay;
        if (dueDay < invoiceDay) dueDay = invoiceDay;
        const { invoice: next } = await billingApi.updateDates(id, invoiceDay, dueDay);
        await refresh(withChanges(invoice, next));
    });

    /* Gegenbeleg ausstellen. Ein Fehler wirft zurück ins Fenster (dort steht
       er); gelingt es, lädt die Seite neu und zeigt den Beleg in der Liste
       «Gegenbelege» — ein Klick öffnet ihn. */
    const issueCredit = async ({ reason, amount }: { reason: string; amount: number | null }) => {
        try {
            const document = creditMode === 'STORNO'
                ? await billingApi.stornoInvoice(id, reason)
                : await billingApi.creditInvoice(id, amount, reason);
            toast.success(creditMode === 'STORNO'
                ? t('accounting.credit.stornoDone', { number: document.invoiceNumber })
                : t('accounting.credit.creditDone', { number: document.invoiceNumber }));
            setCreditMode(null);
            await refresh();
        } catch (error) {
            throw new Error(apiError(error, t('billing.createError')), { cause: error });
        }
    };

    const discard = () => run('discard', async () => {
        setConfirm(null);
        await billingApi.discardDraft(id);
        toast.success(t('accounting.discarded'));
        navigate('/accounting/invoices', { replace: true });
    });

    const download = () => run('pdf', async () => {
        if (!invoice) return;
        if (pdfBlob && invoice.status !== 'DRAFT') {
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${invoice.invoiceNumber}.pdf`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
        }
        const { exportInvoicePdf } = await import('@/utils/pdf/invoicePdf');
        await exportInvoicePdf(pdfInvoiceOf(invoice), pdfContextOf(invoice), settings);
    });

    if (loading || !invoice) {
        return (
            <div className="acc">
                <div className="acc-card"><div className="acc-empty"><LoadingDots /></div></div>
            </div>
        );
    }

    const state = invoiceState(invoice);
    const isDraft = state === 'DRAFT';
    const isCancelled = state === 'CANCELLED';
    const isCredit = isCreditDocument(invoice);
    const isStornoDoc = invoice.kind === 'STORNO';
    // Eine Gutschrift «bezahlt» = zurückgezahlt; sie hat denselben Zahlungsblock.
    const isPaid = invoice.status === 'PAID';
    const isDirect = !invoice.salesOrderId && !invoice.projectId;
    const lifecycle = invoice.lifecycle;
    const datesEditable = canManage && !isCancelled && !isCredit;
    const editPath = isDirect
        ? `/accounting/invoices/new/direct?edit=${invoice.id}`
        : `/accounting/invoices/new?draftId=${invoice.id}`;
    // Ein Beleg mit Zahlung oder Gutschrift ändert seinen Betrag nicht mehr (Schritt 7).
    const hasMoney = (invoice.lifecycle?.paidAmount ?? 0) > 0.005 || (invoice.lifecycle?.creditedAmount ?? 0) > 0.005;
    const canEdit = canCreate && !isCredit && (isDraft || (isDirect && !isPaid && !isCancelled && !hasMoney));
    const creditable = lifecycle?.creditableAmount ?? 0;
    const reversals = invoice.reversals ?? [];
    const payments = invoice.payments ?? [];
    const totalAmount = Math.abs(Number(invoice.amount) || 0);
    const openAmount = lifecycle?.openAmount ?? 0;
    const settledAmount = Math.max(0, totalAmount - openAmount);
    const settledShare = totalAmount > 0 ? Math.min(100, Math.round((settledAmount / totalAmount) * 100)) : 0;

    const dueLine = isStornoDoc
        ? t('accounting.credit.stornoOn', { date: fmtDate(invoice.invoiceDate) })
        : isCredit
            ? (isPaid
                ? t('accounting.credit.refundedOn', { date: fmtDate(invoice.paidAt) })
                : t('accounting.credit.refundDue', { date: fmtDate(invoice.dueDate) }))
        : isPaid
        ? t('accounting.paidOn', { date: fmtDate(invoice.paidAt) })
        : (lifecycle?.paidAmount ?? 0) > 0.005 && !isCancelled
            ? t('accounting.pay.openRest', { amount: fmtMoney(openAmount), date: fmtDate(invoice.dueDate) })
        : isCancelled
            ? t('accounting.state.CANCELLED')
            : state === 'OVERDUE'
                ? t('accounting.overdueSince', { date: fmtDate(invoice.dueDate), days: dayjs().startOf('day').diff(dayjs(dayOf(invoice.dueDate)), 'day') })
                : t('accounting.dueOn', { date: fmtDate(invoice.dueDate) });

    return (
        <div className="acc">
            <InventoryListHeader
                title={displayNumber(invoice)}
                action={(
                    <DocumentHistoryButton
                        entityType="INVOICE"
                        entityId={invoice.id}
                        documentNumber={invoice.invoiceNumber || null}
                        refreshKey={`${invoice.status}:${invoice.paidAt ?? ''}:${events.length}`}
                    />
                )}
            />
            {isDraft && <div className="acc-note is-warning">{t('accounting.draftExplained')}</div>}

            <div className="acc-detail">
                <div className="acc-preview">
                    {pdfState === 'ready' && pdfUrl
                        ? <iframe src={`${pdfUrl}#toolbar=0`} title={displayNumber(invoice)} />
                        : (
                            <div className="acc-preview__state">
                                {pdfState === 'error' ? t('billing.pdfError') : <LoadingDots />}
                            </div>
                        )}
                </div>

                <aside className="acc-inspector">
                    <div className="acc-hero">
                        <div className="acc-hero__top">
                            <span className="acc-hero__kind">
                                {kindLabel(invoice.kind)}
                                {invoice.billedPercent > 0 && invoice.billedPercent < 100 ? ` · ${Math.round(invoice.billedPercent)}%` : ''}
                            </span>
                            <span className={`acc-state is-${state}`}>{invoiceStateLabel(invoice)}</span>
                        </div>
                        <span className={`acc-hero__amount ${isCancelled ? 'acc-struck acc-faint' : ''} ${isCredit ? 'acc-red' : ''}`}>{fmtMoney(invoice.amount)}</span>
                        <span className={`acc-hero__meta ${state === 'OVERDUE' ? 'is-red' : ''}`}>{dueLine}</span>
                    </div>

                    {/* ── Handlungen ─────────────────────────────────── */}
                    <div className="acc-actions">
                        {isDraft && canCreate && (
                            <>
                                <button type="button" className="acc-btn is-primary ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => void issue(true)}>
                                    {busy === 'issueSend' ? <span aria-hidden className="ofi-tp-spinner" /> : <Send01 size={15} />}
                                    {t('accounting.issueAndSend')}
                                </button>
                                <div className="acc-actions__pair">
                                    <button type="button" className="acc-btn ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => void issue(false)}>
                                        {busy === 'issue' && <span aria-hidden className="ofi-tp-spinner" />}
                                        {t('accounting.issueOnly')}
                                    </button>
                                    <button type="button" className="acc-btn ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => navigate(editPath)}>
                                        <Edit01 size={14} />
                                        {t('common.edit')}
                                    </button>
                                </div>
                            </>
                        )}
                        {!isDraft && !isCancelled && (
                            <div className="acc-actions__pair">
                                <button type="button" className="acc-btn ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => void run('mail', () => sendByMail(invoice))}>
                                    <Send01 size={14} />
                                    <span className="acc-btn__label">{t('accounting.sendShort')}</span>
                                </button>
                                <button type="button" className="acc-btn ofi-btn-plain ofi-nosize" disabled={Boolean(busy) || pdfState !== 'ready'} onClick={() => void download()}>
                                    <FileDownload02 size={14} />
                                    <span className="acc-btn__label">{t('accounting.pdfShort')}</span>
                                </button>
                            </div>
                        )}
                        {isCancelled && (
                            <button type="button" className="acc-btn ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => void download()}>
                                <FileDownload02 size={14} />
                                {t('billing.downloadBtn')}
                            </button>
                        )}
                        {!isDraft && canEdit && (
                            <button type="button" className="acc-btn ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => navigate(editPath)}>
                                <Edit01 size={14} />
                                {t('common.edit')}
                            </button>
                        )}
                    </div>

                    {/* ── Zahlung (bei der Gutschrift: Rückzahlung) ───── */}
                    {!isDraft && !isCancelled && !isStornoDoc && (
                        <section className="acc-section">
                            <div className="acc-section__title">{isCredit ? t('accounting.credit.refund') : t('accounting.payment')}</div>
                            <div className="acc-group">
                                <div className="acc-row is-stack">
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span className="acc-row__label">{isCredit ? t('accounting.pay.settledCredit') : t('accounting.pay.settled')}</span>
                                        <span className="acc-muted tabular-nums">{fmtMoney(settledAmount)} / {fmtMoney(totalAmount)}</span>
                                    </span>
                                    <span className="acc-progress"><span style={{ width: `${settledShare}%` }} /></span>
                                    {!isCredit && (lifecycle?.creditedAmount ?? 0) > 0.005 && (
                                        <span className="acc-event__who">
                                            {t('accounting.pay.paidAndCredited', {
                                                paid: fmtMoney(lifecycle?.paidAmount ?? 0),
                                                credited: fmtMoney(lifecycle?.creditedAmount ?? 0),
                                            })}
                                        </span>
                                    )}
                                </div>
                                {payments.map((payment) => (
                                    <div key={payment.id} className="acc-row">
                                        <div className="acc-pay w-full">
                                            <span className="min-w-0">
                                                {fmtDate(payment.paidAt)}
                                                <span className="acc-event__who">
                                                    {payment.kind === 'OFFSET'
                                                        ? t('accounting.pay.offset')
                                                        : [payment.note, payment.createdByName].filter(Boolean).join(' · ') || (isCredit ? t('accounting.pay.refundRow') : t('accounting.pay.paymentRow'))}
                                                </span>
                                            </span>
                                            <span className="acc-pay__amount">{fmtMoney(Math.abs(payment.amount))}</span>
                                            {canManage && payment.kind === 'PAYMENT' && (lifecycle?.creditedAmount ?? 0) <= 0.005 ? (
                                                <button
                                                    type="button"
                                                    className="acc-pay__remove ofi-btn-plain ofi-nosize"
                                                    title={t('accounting.pay.remove')}
                                                    aria-label={t('accounting.pay.remove')}
                                                    disabled={Boolean(busy)}
                                                    onClick={() => void removePayment(payment.id)}
                                                >
                                                    <XClose size={12} />
                                                </button>
                                            ) : <span />}
                                        </div>
                                    </div>
                                ))}
                                {canManage && lifecycle?.canRecordPayment && (
                                    <>
                                        <div className="acc-row">
                                            <span className="acc-row__label">{isCredit ? t('accounting.pay.refundAmount') : t('accounting.pay.amount')}</span>
                                            <span className="acc-unit">
                                                <input
                                                    className="acc-input"
                                                    type="number"
                                                    min={0.05}
                                                    max={lifecycle.openAmount}
                                                    step="0.05"
                                                    value={payAmount}
                                                    onChange={(event) => setPayAmount(event.target.value)}
                                                    aria-label={t('accounting.pay.amount')}
                                                />
                                                CHF
                                            </span>
                                        </div>
                                        <div className="acc-row">
                                            <span className="acc-row__label">{isCredit ? t('accounting.credit.refundDate') : t('accounting.paymentDate')}</span>
                                            <MacDatePicker
                                                value={paidDate}
                                                min={dayOf(invoice.invoiceDate) || undefined}
                                                disabled={Boolean(busy)}
                                                onChange={setPaidDate}
                                                ariaLabel={t('accounting.paymentDate')}
                                            />
                                        </div>
                                        <div className="acc-row">
                                            <input
                                                className="acc-input is-wide"
                                                value={payNote}
                                                maxLength={500}
                                                placeholder={t('accounting.pay.notePlaceholder')}
                                                onChange={(event) => setPayNote(event.target.value)}
                                                aria-label={t('accounting.pay.notePlaceholder')}
                                            />
                                        </div>
                                        <div className="acc-row">
                                            <button
                                                type="button"
                                                className="acc-btn is-primary is-block ofi-btn-plain ofi-nosize"
                                                disabled={Boolean(busy) || !paidDate || !(Number(payAmount) > 0) || Number(payAmount) > lifecycle.openAmount + 0.005}
                                                onClick={() => void addPayment()}
                                            >
                                                {busy === 'paid' ? <span aria-hidden className="ofi-tp-spinner" /> : <CheckCircle size={14} />}
                                                {Number(payAmount) >= lifecycle.openAmount - 0.005
                                                    ? (isCredit ? t('accounting.credit.recordRefund') : t('accounting.pay.recordFull'))
                                                    : t('accounting.pay.recordPartial')}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>
                    )}

                    {/* ── Angaben ────────────────────────────────────── */}
                    <section className="acc-section">
                        <div className="acc-section__title">{t('accounting.details')}</div>
                        <div className="acc-group">
                            {invoice.reversesInvoice && (
                                <div className="acc-row">
                                    <span className="acc-row__label">{t('accounting.credit.reverses')}</span>
                                    <span className="acc-row__value">
                                        <Link to={`/accounting/invoices/${invoice.reversesInvoice.id}`}>{invoice.reversesInvoice.invoiceNumber}</Link>
                                    </span>
                                </div>
                            )}
                            {invoice.creditReason && (
                                <div className="acc-row is-stack">
                                    <span className="acc-row__label">{t('accounting.credit.reason')}</span>
                                    <span className="acc-muted" style={{ whiteSpace: 'pre-wrap' }}>{invoice.creditReason}</span>
                                </div>
                            )}
                            <div className="acc-row">
                                <span className="acc-row__label">{t('accounting.colCustomer')}</span>
                                <span className="acc-row__value">
                                    {invoice.customer
                                        ? <Link to={`/crm/customers/${invoice.customer.id}`}>{invoice.customer.companyName}</Link>
                                        : (invoiceRecipient(invoice) || '—')}
                                </span>
                            </div>
                            {invoice.salesOrder && (
                                <div className="acc-row">
                                    <span className="acc-row__label">{t('accounting.order')}</span>
                                    <span className="acc-row__value">
                                        <Link to={`/sales/orders/${invoice.salesOrder.id}`}>{invoice.salesOrder.orderNumber}</Link>
                                    </span>
                                </div>
                            )}
                            {invoice.project && (
                                <div className="acc-row">
                                    <span className="acc-row__label">{t('accounting.project')}</span>
                                    <span className="acc-row__value">
                                        <Link to={`/projects/${invoice.project.id}`}>
                                            {[invoice.project.projectNumber, invoice.project.projectName].filter(Boolean).join(' · ')}
                                        </Link>
                                    </span>
                                </div>
                            )}
                            {isDirect && (
                                <div className="acc-row">
                                    <span className="acc-row__label">{t('accounting.colSource')}</span>
                                    <span className="acc-row__value">{t('accounting.freeInvoice')}</span>
                                </div>
                            )}
                            <div className="acc-row">
                                <span className="acc-row__label">{t('billing.invoiceDate')}</span>
                                {datesEditable ? (
                                    <MacDatePicker
                                        value={dayOf(invoice.invoiceDate || invoice.createdAt)}
                                        disabled={Boolean(busy)}
                                        onChange={(value) => void saveDates('invoiceDate', value)}
                                        ariaLabel={t('billing.invoiceDate')}
                                    />
                                ) : <span className="acc-row__value">{fmtDate(invoice.invoiceDate || invoice.createdAt)}</span>}
                            </div>
                            <div className="acc-row">
                                <span className="acc-row__label">{t('billing.dueDate')}</span>
                                {datesEditable ? (
                                    <MacDatePicker
                                        value={dayOf(invoice.dueDate || invoice.invoiceDate)}
                                        min={dayOf(invoice.invoiceDate) || undefined}
                                        disabled={Boolean(busy)}
                                        onChange={(value) => void saveDates('dueDate', value)}
                                        ariaLabel={t('billing.dueDate')}
                                    />
                                ) : <span className="acc-row__value">{fmtDate(invoice.dueDate)}</span>}
                            </div>
                            {invoice.salespersonName && (
                                <div className="acc-row">
                                    <span className="acc-row__label">{t('billing.salesperson')}</span>
                                    <span className="acc-row__value">{invoice.salespersonName}</span>
                                </div>
                            )}
                            {invoice.issuedBy && (
                                <div className="acc-row">
                                    <span className="acc-row__label">{isDraft ? t('accounting.createdBy') : t('accounting.issuedBy')}</span>
                                    <span className="acc-row__value">{`${invoice.issuedBy.firstName} ${invoice.issuedBy.lastName}`.trim()}</span>
                                </div>
                            )}
                            {invoice.notes && (
                                <div className="acc-row is-stack">
                                    <span className="acc-row__label">{t('accounting.internalNote')}</span>
                                    <span className="acc-muted" style={{ whiteSpace: 'pre-wrap' }}>{invoice.notes}</span>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ── Gegenbelege zu dieser Rechnung ─────────────── */}
                    {reversals.length > 0 && (
                        <section className="acc-section">
                            <div className="acc-section__title">{t('accounting.credit.documents')}</div>
                            <div className="acc-group">
                                {reversals.map((row) => (
                                    <Link key={row.id} to={`/accounting/invoices/${row.id}`} className="acc-row acc-row--link">
                                        <span className="acc-row__label">
                                            {row.invoiceNumber}
                                            <span className="acc-event__who">{kindLabel(row.kind)} · {fmtDate(row.invoiceDate)}</span>
                                        </span>
                                        <span className="acc-row__value acc-red">{fmtMoney(row.amount)}</span>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ── Verlauf ────────────────────────────────────── */}
                    {events.length > 0 && (
                        <section className="acc-section">
                            <div className="acc-section__title">{t('governance.historyTitle')}</div>
                            <div className="acc-group acc-events">
                                {events.slice(0, EVENT_LIMIT).map((event) => (
                                    <div key={event.id} className="acc-event">
                                        <span className="min-w-0">
                                            {eventTitle(event)}
                                            {event.actorName && <span className="acc-event__who">{event.actorName}</span>}
                                        </span>
                                        <span className="acc-event__when">{dayjs(event.createdAt).format('DD.MM.YY HH:mm')}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ── Zurücknehmen ───────────────────────────────── */}
                    {isDraft && canCreate && (
                        <button type="button" className="acc-btn is-danger is-block ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => setConfirm('discard')}>
                            <Trash01 size={14} />
                            {t('accounting.discardDraft')}
                        </button>
                    )}
                    {lifecycle?.canCancel && canCancel && (
                        <button type="button" className="acc-btn is-danger is-block ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => setCreditMode('STORNO')}>
                            <XClose size={14} />
                            {t('accounting.credit.stornoOpen')}
                        </button>
                    )}
                    {lifecycle?.canCredit && canCancel && (
                        <button type="button" className="acc-btn is-danger is-block ofi-btn-plain ofi-nosize" disabled={Boolean(busy)} onClick={() => setCreditMode('GUTSCHRIFT')}>
                            <ReceiptRefund size={14} />
                            {t('accounting.credit.creditOpen')}
                        </button>
                    )}
                    {isPaid && !isCredit && !lifecycle?.canCredit && (
                        <div className="acc-note">{t('accounting.credit.fullyCredited')}</div>
                    )}
                    {isCredit && <div className="acc-note">{isStornoDoc ? t('accounting.credit.stornoFinal') : t('accounting.credit.creditFinal')}</div>}
                </aside>
            </div>

            {creditMode && (
                <CreditDialog
                    mode={creditMode}
                    invoice={invoice}
                    creditable={creditable}
                    openAmount={openAmount}
                    onCancel={() => setCreditMode(null)}
                    onConfirm={issueCredit}
                />
            )}
            <DangerConfirmDialog
                open={confirm === 'discard'}
                title={t('accounting.discardTitle')}
                message={t('accounting.discardMessage')}
                confirmLabel={t('accounting.discardDraft')}
                requirePassword={false}
                onCancel={() => setConfirm(null)}
                onConfirm={() => void discard()}
            />
        </div>
    );
};
