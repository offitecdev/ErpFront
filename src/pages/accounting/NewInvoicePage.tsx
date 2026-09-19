import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { Briefcase01, Edit01 } from '@/components/icons/antIconCompat';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { MacDatePicker } from '@/components/ui-shared/MacDatePicker';
import { SearchBox } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { billingApi, myOrdersApi } from '@/lib/api/billing';
import { lineRemaining, lineTotal, orderBillingLines } from '@/lib/orderBillingTotals';
import type { BillingSummaryDto, InvoiceDto, MyOrderDetailDto, MyOrderDto } from '@/types/billing';
import { apiError, fmtDate, fmtMoney, isoToday, round2 } from '@/pages/sales/invoices/invoiceShared';

import { dayOf, kindLabel, proposedKind, useBillingRights } from './accountingShared';
import '@/styles/modules/accounting.css';

/**
 * ── NEUE RECHNUNG: EIN WEG (Buchhaltung, 16.09.2026, Schritt 5 / G16 · E1 · G17)
 *
 * Vorgabe Samet: eine Rechnung entsteht an EINER Stelle und in drei ruhigen
 * Schritten:
 *
 *   1. Quelle     Aus einem Auftrag — oder eine freie Rechnung (eigene Maske).
 *   2. Vorschlag  Das System schlägt vor, was jetzt fällig ist: die nächste
 *                 Rate des Zahlungsplans, sonst den offenen Rest. Die ART wird
 *                 nie gefragt — sie folgt aus dem Anteil (Akonto, Zwischen-,
 *                 Schluss- oder ganze Rechnung).
 *   3. Vorschau   «Weiter» legt einen ENTWURF ohne Nummer an und öffnet ihn;
 *                 dort wird geprüft und ausgestellt.
 *
 * `?orderId=` springt direkt zum Vorschlag (der Weg aus Projekt und Auftrag),
 * `?draftId=` öffnet einen bestehenden Entwurf zum Ändern.
 */

type Source = 'ORDER' | 'FREE';

type OrderOption = {
    id: string;
    orderNumber: string;
    parentNumber: string | null;
    customerName: string;
    projectLabel: string;
    total: number;
    open: number;
};

export const NewInvoicePage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const presetOrderId = searchParams.get('orderId') || '';
    const draftId = searchParams.get('draftId') || '';
    const { canCreate } = useBillingRights();

    const [step, setStep] = useState<0 | 1>(presetOrderId || draftId ? 1 : 0);
    const [source, setSource] = useState<Source>('ORDER');
    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [orderId, setOrderId] = useState(presetOrderId);

    // Der gewählte Auftrag und sein Stand.
    const [order, setOrder] = useState<MyOrderDetailDto | null>(null);
    const [summary, setSummary] = useState<BillingSummaryDto | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [draft, setDraft] = useState<InvoiceDto | null>(null);
    const draftRef = useRef<InvoiceDto | null>(null);

    // Der Vorschlag — änderbar.
    const [percentText, setPercentText] = useState('');
    const [amountDraft, setAmountDraft] = useState<string | null>(null);
    const [invoiceDate, setInvoiceDate] = useState(isoToday());
    const [dueDate, setDueDate] = useState(isoToday());
    const [dueTouched, setDueTouched] = useState(false);
    const [salesperson, setSalesperson] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void myOrdersApi.list()
            .then((rows) => { if (!cancelled) setOrders(rows); })
            .catch((error) => { if (!cancelled) toast.error(apiError(error, t('accounting.loadError'))); })
            .finally(() => { if (!cancelled) setOrdersLoading(false); });
        return () => { cancelled = true; };
    }, []);

    // Ein bestehender Entwurf bringt seinen Auftrag und seine Werte mit.
    useEffect(() => {
        if (!draftId) return undefined;
        let cancelled = false;
        void billingApi.getInvoice(draftId).then((invoice) => {
            if (cancelled) return;
            if (invoice.status !== 'DRAFT' || !invoice.salesOrderId) {
                navigate(`/accounting/invoices/${invoice.id}`, { replace: true });
                return;
            }
            draftRef.current = invoice;
            setDraft(invoice);
            setOrderId(invoice.salesOrderId);
        }).catch((error) => {
            if (!cancelled) toast.error(apiError(error, t('accounting.loadError')));
        });
        return () => { cancelled = true; };
    }, [draftId, navigate]);

    /* Wählbar ist jeder nicht stornierte Auftrag mit offenem Betrag — der
       Hauptauftrag und jeder Nachtrag mit Plus-Summe für sich (eine
       Minderung wird vom Hauptauftrag abgezogen, nie selbst verrechnet). */
    const options = useMemo<OrderOption[]>(() => {
        const list: OrderOption[] = [];
        for (const row of orders) {
            if (row.cancelledAt) continue;
            const customerName = row.customer?.companyName || '—';
            const projectLabel = row.project
                ? [row.project.projectNumber, row.project.projectName].filter(Boolean).join(' · ')
                : t('accounting.deliveryOrder');
            orderBillingLines(row).forEach((line) => {
                if (line.isAddon && line.totalAmount <= 0) return;
                const open = lineRemaining(line);
                if (open <= 0.005) return;
                list.push({
                    id: line.id,
                    orderNumber: line.orderNumber,
                    parentNumber: line.isAddon ? row.orderNumber : null,
                    customerName,
                    projectLabel,
                    total: lineTotal(line),
                    open,
                });
            });
        }
        return list;
    }, [orders]);

    const visibleOptions = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return options;
        return options.filter((option) => [option.orderNumber, option.parentNumber, option.customerName, option.projectLabel]
            .some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [options, search]);

    /* DER VORSCHLAG: nächste Rate des Plans, sonst der ganze Rest. Beim
       Ändern eines Entwurfs gelten seine Werte. Gesetzt EINMAL, wenn der
       Auftrag geladen ist — danach gehört das Feld der Person. */
    const applyProposal = (detail: MyOrderDetailDto, fresh: BillingSummaryDto, existing: InvoiceDto | null) => {
        const open = round2(Number(fresh.remainingPercent ?? 0));
        if (existing) {
            setPercentText(String(round2(Math.min(open, Number(existing.billedPercent) || open))));
            setInvoiceDate(dayOf(existing.invoiceDate) || isoToday());
            setDueDate(dayOf(existing.dueDate) || dayOf(existing.invoiceDate) || isoToday());
            setDueTouched(true);
            setSalesperson(existing.salespersonName || '');
            setNotes(existing.notes || '');
            return;
        }
        const suggested = fresh.nextStage?.suggestedPercent ?? open;
        setPercentText(String(round2(Math.min(open, suggested))));
        const stageDate = fresh.nextStage?.date && fresh.nextStage.date >= isoToday() ? fresh.nextStage.date : null;
        setInvoiceDate(isoToday());
        setDueDate(stageDate || isoToday());
        setDueTouched(Boolean(stageDate));
        const creator = [detail.tender?.createdBy?.firstName, detail.tender?.createdBy?.lastName].filter(Boolean).join(' ');
        setSalesperson(detail.tender?.salespersonName || creator || '');
        setNotes('');
    };

    const loadOrder = useCallback(async (id: string) => {
        setDetailLoading(true);
        try {
            const [detail, fresh] = await Promise.all([
                myOrdersApi.getById(id),
                billingApi.getSummary({ salesOrderId: id }),
            ]);
            setOrder(detail);
            setSummary(fresh);
            applyProposal(detail, fresh, draftRef.current);
        } catch (error) {
            toast.error(apiError(error, t('accounting.loadError')));
            setStep(0);
        } finally {
            setDetailLoading(false);
        }
        // applyProposal setzt nur Zustand — einmal je geladenem Auftrag.
    }, []);

    useEffect(() => {
        if (step === 1 && orderId) void loadOrder(orderId);
    }, [step, orderId, loadOrder]);

    const remaining = round2(Number(summary?.remainingPercent ?? 0));
    const billedPercent = round2(Number(summary?.billedPercent ?? 0));
    const base = Number(summary?.baseAmount ?? 0);
    const stages = summary?.paymentStages ?? null;
    const next = summary?.nextStage ?? null;

    const percent = round2(Number(percentText) || 0);
    const percentValid = percent > 0 && percent <= remaining + 0.005;
    const closes = percentValid && percent >= remaining - 0.005;
    const kind = proposedKind(billedPercent, percent, remaining);
    const amount = closes
        ? Number(summary?.remainingAmount ?? 0)
        : round2((base * percent) / 100);

    const setAmountText = (raw: string) => {
        if (!raw) { setPercentText(''); return; }
        const value = Number(raw);
        if (!Number.isFinite(value) || base <= 0) { setPercentText(''); return; }
        setPercentText(String(round2(Math.min(remaining, (value / base) * 100))));
    };

    const changePercentText = (raw: string) => {
        const normalized = raw.replace(',', '.');
        if (/^\d*(?:\.\d*)?$/.test(normalized)) setPercentText(normalized);
    };

    const changeAmountText = (raw: string) => {
        const normalized = raw.replace(',', '.');
        if (!/^\d*(?:\.\d*)?$/.test(normalized)) return;
        setAmountDraft(normalized);
        setAmountText(normalized);
    };

    const changeInvoiceDate = (value: string) => {
        setInvoiceDate(value);
        if (!dueTouched || dueDate < value) setDueDate(value);
    };

    const toPreview = async () => {
        if (!orderId || !percentValid || saving) return;
        setSaving(true);
        const body = {
            percent: closes ? null : percent,
            invoiceDate,
            dueDate: dueDate >= invoiceDate ? dueDate : invoiceDate,
            salespersonName: salesperson.trim() || null,
            notes: notes.trim() || null,
        };
        try {
            const { invoice } = draft
                ? await billingApi.updateOrderDraft(draft.id, body)
                : await billingApi.createInvoice({ salesOrderId: orderId, draft: true, ...body });
            navigate(`/accounting/invoices/${invoice.id}`, { replace: Boolean(draft) });
        } catch (error) {
            toast.error(apiError(error, t('billing.createError')));
        } finally {
            setSaving(false);
        }
    };

    const chooseSource = (value: Source) => {
        if (value === 'FREE') {
            navigate('/accounting/invoices/new/direct');
            return;
        }
        setSource(value);
    };

    const pickOrder = (id: string) => {
        setOrderId(id);
        setOrder(null);
        setSummary(null);
        setStep(1);
    };

    const stepItem = (index: number, label: string) => {
        const current = step === index;
        const done = index < step;
        return (
            <span className={`acc-steps__item ${current ? 'is-on' : ''} ${done ? 'is-done' : ''}`}>
                <span className="acc-steps__dot">{index + 1}</span>
                {label}
            </span>
        );
    };

    if (!canCreate) {
        return (
            <div className="acc">
                <InventoryListHeader title={t('accounting.newInvoice')} />
                <div className="acc-card"><div className="acc-empty">{t('accounting.noCreateRight')}</div></div>
            </div>
        );
    }

    return (
        <div className="acc">
            <InventoryListHeader
                title={draft ? t('accounting.editDraft') : t('accounting.newInvoice')}
                center={(
                    <div className="acc-steps">
                        {stepItem(0, t('accounting.stepSource'))}
                        <span className="acc-steps__sep" />
                        {stepItem(1, t('accounting.stepProposal'))}
                        <span className="acc-steps__sep" />
                        {stepItem(2, t('accounting.stepPreview'))}
                    </div>
                )}
            />

            <div className="acc-flow">
                {step === 0 && (
                    <>
                        <div className="acc-choices">
                            <button
                                type="button"
                                className={`acc-choice ofi-btn-plain ofi-nosize ${source === 'ORDER' ? 'is-on' : ''}`}
                                onClick={() => chooseSource('ORDER')}
                            >
                                <span className="acc-choice__icon"><Briefcase01 size={17} /></span>
                                <span className="min-w-0">
                                    <span className="acc-choice__title block">{t('accounting.fromOrder')}</span>
                                    <span className="acc-choice__text block">{t('accounting.fromOrderHint')}</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="acc-choice ofi-btn-plain ofi-nosize"
                                onClick={() => chooseSource('FREE')}
                            >
                                <span className="acc-choice__icon"><Edit01 size={17} /></span>
                                <span className="min-w-0">
                                    <span className="acc-choice__title block">{t('accounting.freeInvoice')}</span>
                                    <span className="acc-choice__text block">{t('accounting.freeInvoiceHint')}</span>
                                </span>
                            </button>
                        </div>

                        <section className="acc-section acc-pick">
                            <div className="acc-section__title">
                                <span>{t('accounting.pickOrder')}</span>
                                <SearchBox value={search} onChange={setSearch} placeholder={t('accounting.searchOrders')} />
                            </div>
                            <div className="acc-group acc-orders">
                                {ordersLoading ? (
                                    <div className="acc-empty"><LoadingDots /></div>
                                ) : visibleOptions.length === 0 ? (
                                    <div className="acc-empty">{t('accounting.noOpenOrders')}</div>
                                ) : visibleOptions.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        className={`acc-order ofi-btn-plain ofi-nosize ${orderId === option.id ? 'is-on' : ''}`}
                                        onClick={() => pickOrder(option.id)}
                                    >
                                        <span className="acc-radio" aria-hidden />
                                        <span className="min-w-0">
                                            <span className="acc-strong">{option.orderNumber}</span>
                                            {option.parentNumber && (
                                                <span className="acc-order__tag">{t('accounting.addonOf', { order: option.parentNumber })}</span>
                                            )}
                                            <span className="acc-line2">{option.customerName}</span>
                                        </span>
                                        <span className="acc-name acc-muted acc-hide-sm">{option.projectLabel}</span>
                                        <span className="text-right">
                                            <span className="acc-strong block tabular-nums">{fmtMoney(option.open)}</span>
                                            <span className="acc-line2">{t('accounting.openOf', { total: fmtMoney(option.total) })}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    </>
                )}

                {step === 1 && (
                    detailLoading || !order || !summary ? (
                        <div className="acc-card"><div className="acc-empty"><LoadingDots /></div></div>
                    ) : (
                        <>
                            <div className="acc-proposal">
                                <div className="acc-inspector">
                                    <section className="acc-section">
                                        <div className="acc-section__title">{t('accounting.orderSection')}</div>
                                        <div className="acc-group">
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('accounting.colSource')}</span>
                                                <span className="acc-row__value">
                                                    {order.orderNumber}
                                                    {order.parentSalesOrder ? ` · ${t('accounting.addonOf', { order: order.parentSalesOrder.orderNumber })}` : ''}
                                                </span>
                                            </div>
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('accounting.colCustomer')}</span>
                                                <span className="acc-row__value">{order.customer?.companyName || '—'}</span>
                                            </div>
                                            {order.project && (
                                                <div className="acc-row">
                                                    <span className="acc-row__label">{t('accounting.project')}</span>
                                                    <span className="acc-row__value">{order.project.projectName}</span>
                                                </div>
                                            )}
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('accounting.orderTotal')}</span>
                                                <span className="acc-row__value">{fmtMoney(base)}</span>
                                            </div>
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('accounting.billedSoFar')}</span>
                                                <span className="acc-row__value">{fmtMoney(summary.billedAmount)} · {Math.round(billedPercent)}%</span>
                                            </div>
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('accounting.stillOpen')}</span>
                                                <span className="acc-row__value acc-strong">{fmtMoney(summary.remainingAmount)} · {Math.round(remaining)}%</span>
                                            </div>
                                        </div>
                                    </section>

                                    {stages && stages.length > 0 && (
                                        <section className="acc-section">
                                            <div className="acc-section__title">{t('billing.paymentPlan')}</div>
                                            <div className="acc-group acc-stages">
                                                {(() => {
                                                    let cumulative = 0;
                                                    return stages.map((stage, index) => {
                                                        cumulative = round2(cumulative + stage.percent);
                                                        const done = cumulative <= billedPercent + 0.005;
                                                        const isNext = next?.index === index;
                                                        return (
                                                            <div key={index} className={`acc-stage ${done ? 'is-done' : ''} ${isNext ? 'is-next' : ''}`}>
                                                                <span className="acc-stage__dot">{index + 1}</span>
                                                                <span className="min-w-0">
                                                                    <span className="acc-name">{stage.label || t('accounting.stageN', { n: index + 1 })}</span>
                                                                    <span className="acc-line2">
                                                                        {done ? t('accounting.stageBilled') : isNext ? t('accounting.stageNext') : t('accounting.stageLater')}
                                                                        {stage.date ? ` · ${fmtDate(stage.date)}` : ''}
                                                                    </span>
                                                                </span>
                                                                <span className="acc-muted tabular-nums">{Math.round(stage.percent)}%</span>
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </section>
                                    )}
                                </div>

                                <div className="acc-inspector">
                                    <section className="acc-section">
                                        <div className="acc-section__title">{t('accounting.proposal')}</div>
                                        <div className="acc-group">
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('accounting.colKind')}</span>
                                                <span className="acc-kind">{percentValid ? kindLabel(kind) : '—'}</span>
                                            </div>
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('accounting.share')}</span>
                                                <span className="acc-unit">
                                                    <input
                                                        className="acc-input"
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={percentText}
                                                        onChange={(event) => changePercentText(event.target.value)}
                                                        onFocus={(event) => event.currentTarget.select()}
                                                        onClick={(event) => event.currentTarget.select()}
                                                        aria-label={t('accounting.share')}
                                                    />
                                                </span>
                                            </div>
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('accounting.colAmount')}</span>
                                                <span className="acc-unit">
                                                    <input
                                                        className="acc-input"
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={amountDraft ?? (percentValid ? String(amount) : '')}
                                                        onChange={(event) => changeAmountText(event.target.value)}
                                                        onFocus={(event) => {
                                                            setAmountDraft(event.currentTarget.value);
                                                            event.currentTarget.select();
                                                        }}
                                                        onClick={(event) => event.currentTarget.select()}
                                                        onBlur={() => setAmountDraft(null)}
                                                        aria-label={t('accounting.colAmount')}
                                                    />
                                                </span>
                                            </div>
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('billing.invoiceDate')}</span>
                                                <MacDatePicker value={invoiceDate} onChange={changeInvoiceDate} ariaLabel={t('billing.invoiceDate')} />
                                            </div>
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('billing.dueDate')}</span>
                                                <MacDatePicker
                                                    value={dueDate}
                                                    min={invoiceDate}
                                                    onChange={(value) => { setDueDate(value); setDueTouched(true); }}
                                                    ariaLabel={t('billing.dueDate')}
                                                />
                                            </div>
                                            <div className="acc-row">
                                                <span className="acc-row__label">{t('billing.salesperson')}</span>
                                                <input
                                                    className="acc-input"
                                                    style={{ width: 170, textAlign: 'left' }}
                                                    value={salesperson}
                                                    onChange={(event) => setSalesperson(event.target.value)}
                                                    aria-label={t('billing.salesperson')}
                                                />
                                            </div>
                                            <div className="acc-row is-stack">
                                                <span className="acc-row__label">{t('accounting.internalNote')}</span>
                                                <textarea
                                                    className="acc-input is-wide"
                                                    value={notes}
                                                    onChange={(event) => setNotes(event.target.value)}
                                                    aria-label={t('accounting.internalNote')}
                                                />
                                            </div>
                                        </div>
                                    </section>
                                    {!percentValid && (
                                        <div className="acc-note is-warning">{t('billing.maxPercent', { percent: remaining })}</div>
                                    )}
                                    <div className="acc-group">
                                        <div className="acc-row">
                                            <span className="acc-row__label acc-total">{t('accounting.invoiceAmount')}</span>
                                            <span className="acc-total tabular-nums">{percentValid ? fmtMoney(amount) : '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="acc-foot">
                                <button
                                    type="button"
                                    className="acc-btn ofi-btn-plain ofi-nosize"
                                    onClick={() => (draft ? navigate(`/accounting/invoices/${draft.id}`) : setStep(0))}
                                >
                                    {t('common.back')}
                                </button>
                                <button
                                    type="button"
                                    className="acc-btn is-primary ofi-btn-plain ofi-nosize"
                                    disabled={!percentValid || saving}
                                    onClick={() => void toPreview()}
                                >
                                    {saving && <span aria-hidden className="ofi-tp-spinner" />}
                                    {t('accounting.toPreview')}
                                </button>
                            </div>
                        </>
                    )
                )}
            </div>
        </div>
    );
};
