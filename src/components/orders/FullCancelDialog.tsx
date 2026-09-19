import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    AlertTriangle,
    Briefcase01,
    Calendar,
    File02,
    Receipt,
    XClose,
} from '@/components/icons/antIconCompat';
import { openMailCompose, type ComposeAttachment } from '@/components/mail/mailComposeBus';
import { PopupActions, PopupButton, PopupDialog, PopupEmpty, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { Switch } from '@/components/ui-shared/Switch';
import { t } from '@/i18n/translate';
import { billingApi, fullCancelApi } from '@/lib/api/billing';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { FullCancelPlanDto, FullCancelResultDto } from '@/types/billing';
import { apiError, fmtMoney, round2 } from '@/pages/sales/invoices/invoiceShared';
import { pdfContextOf } from '@/pages/accounting/accountingShared';
import '@/components/governance/governance.css';

/**
 * ── «GESAMTEN VORGANG STORNIEREN» (17.09.2026, Schritt 6 / F1) ──────────────
 *
 * Erst die Übersicht, dann der Klick: was storniert wird (Aufträge, Offerten,
 * Projekt, Termine) und was mit jeder Rechnung geschieht — offene bekommen
 * eine Storno-Rechnung, bezahlte eine Gutschrift (Betrag änderbar, 0 = die
 * Buchhaltung regelt es später), Entwürfe fallen weg. Ein Grund ist Pflicht.
 * Der Server führt alles in EINER Transaktion aus: gelingt ein Beleg nicht,
 * bleibt alles, wie es war.
 *
 * Danach — voreingestellt — öffnet sich das Mailfenster mit den neuen Belegen
 * als PDF, adressiert an den Kunden.
 */
export const FullCancelDialog = ({
    scope,
    id,
    initialReason = '',
    onClose,
    onDone,
}: {
    scope: 'ORDER' | 'PROJECT';
    id: string;
    initialReason?: string;
    onClose: () => void;
    onDone: (result: FullCancelResultDto, plan: FullCancelPlanDto) => void | Promise<void>;
}) => {
    const settings = usePdfSettings();
    const [plan, setPlan] = useState<FullCancelPlanDto | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reason, setReason] = useState(initialReason);
    const [credits, setCredits] = useState<Record<string, string>>({});
    const [sendMail, setSendMail] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fullCancelApi.preview(scope, id)
            .then((data) => {
                if (cancelled) return;
                setPlan(data);
                setCredits(Object.fromEntries(
                    data.invoices.filter((row) => row.action === 'GUTSCHRIFT').map((row) => [row.id, row.creditable.toFixed(2)]),
                ));
            })
            .catch((caught) => { if (!cancelled) setLoadError(apiError(caught, t('orders.fullCancel.loadFailed'))); });
        return () => { cancelled = true; };
    }, [scope, id]);

    const creditValues = useMemo(() => {
        const values: Record<string, number> = {};
        for (const [invoiceId, text] of Object.entries(credits)) {
            values[invoiceId] = round2(Number(String(text).replace(',', '.')) || 0);
        }
        return values;
    }, [credits]);

    const creditsValid = !plan || plan.invoices.every((row) => row.action !== 'GUTSCHRIFT'
        || (creditValues[row.id] >= 0 && creditValues[row.id] <= row.creditable + 0.005));
    const reasonValid = reason.trim().length >= 3;
    const blocked = Boolean(plan && (plan.blockers.length > 0 || (plan.needsInvoiceRight && !plan.canSettleInvoices)));
    const willIssueDocuments = Boolean(plan?.invoices.some((row) => row.action === 'STORNO'
        || (row.action === 'GUTSCHRIFT' && (creditValues[row.id] ?? 0) > 0)));
    const refundTotal = plan
        // Zurückgezahlt wird nur, was die Gutschrift über den offenen Rest hinaus deckt.
        ? round2(plan.invoices.filter((row) => row.action === 'GUTSCHRIFT')
            .reduce((sum, row) => sum + Math.max(0, (creditValues[row.id] ?? 0) - (row.openAmount ?? 0)), 0))
        : 0;

    /** Die neuen Belege als PDF ins Mailfenster legen. */
    const mailDocuments = async (result: FullCancelResultDto, current: FullCancelPlanDto) => {
        const attachments: ComposeAttachment[] = [];
        const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
        for (const doc of result.documents) {
            const invoice = await billingApi.getInvoice(doc.id);
            const bytes = await buildInvoicePdfBytes(invoice, pdfContextOf(invoice), settings);
            const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
            attachments.push({ filename: `${doc.invoiceNumber}.pdf`, contentType: 'application/pdf', blob, size: blob.size });
        }
        const numbers = result.documents.map((doc) => doc.invoiceNumber).join(', ');
        openMailCompose({
            to: current.customer?.email ?? undefined,
            subject: t('orders.fullCancel.mailSubject', { number: current.rootNumber || '' }),
            body: t('orders.fullCancel.mailBody', { number: current.rootNumber || '', documents: numbers }),
            customer: current.customer ? { id: current.customer.id, companyName: current.customer.companyName } : null,
            entity: result.documents[0]
                ? { type: 'INVOICE', id: result.documents[0].id, label: result.documents[0].invoiceNumber }
                : null,
            attachments,
        });
    };

    const submit = async () => {
        if (!plan || busy || !reasonValid || !creditsValid || blocked) return;
        setBusy(true);
        setError(null);
        try {
            const result = await fullCancelApi.run(scope, id, {
                reason: reason.trim(),
                credits: creditValues,
                expectedInvoiceIds: plan.invoices.filter((row) => row.action !== 'NONE').map((row) => row.id),
            });
            toast.success(t('orders.fullCancel.done', { number: plan.rootNumber || '' }));
            if (sendMail && result.documents.length > 0) {
                await mailDocuments(result, plan).catch((caught) => toast.error(apiError(caught, t('billing.pdfError'))));
            }
            await onDone(result, plan);
        } catch (caught) {
            setError(apiError(caught, t('orders.lifecycle.actionFailed')));
            setBusy(false);
        }
    };

    const actionText = (row: FullCancelPlanDto['invoices'][number]) => {
        if (row.action === 'STORNO') return t('orders.fullCancel.actionStorno');
        if (row.action === 'DISCARD') return t('orders.fullCancel.actionDiscard');
        if (row.action === 'NONE') return t('orders.fullCancel.actionNone');
        return t('orders.fullCancel.actionCredit');
    };

    return (
        <PopupDialog
            open
            title={t('orders.fullCancel.title', { number: plan?.rootNumber || '' })}
            subtitle={t('orders.fullCancel.subtitle')}
            icon={<AlertTriangle size={20} />}
            tone="danger"
            width={600}
            z={800}
            onClose={() => { if (!busy) onClose(); }}
            closeOnBackdrop={!busy}
            closeOnEscape={!busy}
            footer={(
                <PopupActions
                    start={willIssueDocuments ? (
                        <label className="flex items-center gap-2 text-[12.5px]">
                            <Switch checked={sendMail} onChange={setSendMail} label={t('orders.fullCancel.sendMail')} />
                            {t('orders.fullCancel.sendMail')}
                        </label>
                    ) : null}
                >
                    <PopupButton disabled={busy} onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton
                        variant="danger"
                        loading={busy}
                        disabled={!plan || blocked || !reasonValid || !creditsValid}
                        onClick={() => void submit()}
                    >
                        {t('orders.fullCancel.action')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            {loadError ? (
                <PopupNote tone="danger">{loadError}</PopupNote>
            ) : !plan ? (
                <PopupEmpty>{t('common.loading')}</PopupEmpty>
            ) : plan.blockers.includes('NOTHING_TO_CANCEL') ? (
                <PopupNote>{t('orders.fullCancel.nothing')}</PopupNote>
            ) : (
                <div className="gov gov-history">
                    <section className="gov-section">
                        <div className="gov-section__title">{t('orders.fullCancel.willCancel')}</div>
                        <div className="gov-group">
                            {plan.orders.map((order) => (
                                <div key={order.id} className="gov-row">
                                    <span className="gov-icon is-danger"><XClose size={14} /></span>
                                    <span className="min-w-0">
                                        <span className="gov-row__title">
                                            {order.orderNumber}
                                            {order.isAddon && <span className="gov-doc">{t('projects.addonOrder')}</span>}
                                        </span>
                                    </span>
                                    <span className="gov-row__time">{fmtMoney(order.totalAmount)}</span>
                                </div>
                            ))}
                            {plan.tenders.map((tender) => (
                                <div key={tender.id} className="gov-row">
                                    <span className="gov-icon"><File02 size={14} /></span>
                                    <span className="gov-row__title">{tender.tenderNumber || t('governance.entity.TENDER')}</span>
                                    <span className="gov-row__time">{t('governance.entity.TENDER')}</span>
                                </div>
                            ))}
                            {plan.project?.willCancel && (
                                <div className="gov-row">
                                    <span className="gov-icon is-danger"><Briefcase01 size={14} /></span>
                                    <span className="min-w-0">
                                        <span className="gov-row__title">{plan.project.projectNumber || plan.project.projectName}</span>
                                        <span className="gov-row__meta">{plan.project.projectName}</span>
                                    </span>
                                    <span className="gov-row__time">{t('governance.entity.PROJECT')}</span>
                                </div>
                            )}
                            {plan.upcomingAppointmentIds.length > 0 && (
                                <div className="gov-row">
                                    <span className="gov-icon"><Calendar size={14} /></span>
                                    <span className="gov-row__title">
                                        {t('orders.fullCancel.appointments', { appointmentCount: plan.upcomingAppointmentIds.length })}
                                    </span>
                                    <span />
                                </div>
                            )}
                        </div>
                    </section>

                    {plan.invoices.length > 0 && (
                        <section className="gov-section">
                            <div className="gov-section__title">{t('orders.fullCancel.invoices')}</div>
                            <div className="gov-group">
                                {plan.invoices.map((row) => (
                                    <div key={row.id} className="gov-row">
                                        <span className={`gov-icon ${row.action === 'NONE' ? '' : 'is-accent'}`}><Receipt size={14} /></span>
                                        <span className="min-w-0">
                                            <span className="gov-row__title">
                                                {row.status === 'DRAFT' ? t('accounting.draftNumber') : row.invoiceNumber}
                                                <span className="gov-doc">
                                                    {row.status === 'PAID' ? t('accounting.state.PAID') : row.status === 'DRAFT' ? t('accounting.state.DRAFT') : t('accounting.state.OPEN')}
                                                </span>
                                            </span>
                                            <span className="gov-row__meta">
                                                → {actionText(row)}
                                                {row.paidAmount > 0.005 && ` · ${t('accounting.pay.paidShort', { amount: fmtMoney(row.paidAmount) })}`}
                                            </span>
                                            {row.action === 'GUTSCHRIFT' && (
                                                <span className="mt-1.5 flex items-center gap-2 text-[12px]">
                                                    <input
                                                        className="ofi-cal-input w-28 text-right tabular-nums"
                                                        type="number"
                                                        min={0}
                                                        max={row.creditable}
                                                        step="0.05"
                                                        value={credits[row.id] ?? ''}
                                                        onChange={(event) => setCredits((prev) => ({ ...prev, [row.id]: event.target.value }))}
                                                        aria-label={t('accounting.credit.amount')}
                                                    />
                                                    <span className="gov-row__meta">
                                                        {t('orders.fullCancel.creditMax', { max: fmtMoney(row.creditable) })}
                                                    </span>
                                                </span>
                                            )}
                                        </span>
                                        <span className="gov-row__time">{fmtMoney(row.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {refundTotal > 0 && (
                        <PopupNote tone="warning">{t('orders.fullCancel.refundNote', { amount: fmtMoney(refundTotal) })}</PopupNote>
                    )}
                    {plan.needsInvoiceRight && !plan.canSettleInvoices && (
                        <PopupNote tone="danger">{t('orders.fullCancel.noInvoiceRight')}</PopupNote>
                    )}
                    {!creditsValid && <PopupNote tone="danger">{t('orders.fullCancel.creditInvalid')}</PopupNote>}
                    <PopupNote>{t('orders.fullCancel.noUndo')}</PopupNote>

                    <PopupField label={t('accounting.credit.reason')} hint={t('accounting.credit.reasonHint')}>
                        <textarea
                            className="ofi-cal-input w-full"
                            rows={3}
                            maxLength={1000}
                            value={reason}
                            placeholder={t('orders.fullCancel.reasonPlaceholder')}
                            onChange={(event) => setReason(event.target.value)}
                        />
                    </PopupField>
                    {error && <PopupNote tone="danger">{error}</PopupNote>}
                </div>
            )}
        </PopupDialog>
    );
};
