import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { ArrowRight, Plus } from '@/components/icons/antIconCompat';
import { FilterBar, FilterSelect, SearchBox } from '@/components/ui-shared/TableKit';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { billingApi } from '@/lib/api/billing';
import type { AccountingFiguresDto, InvoiceCategory, InvoiceDto } from '@/types/billing';
import {
    apiError,
    categoryLabel,
    CATEGORY_ORDER,
    fmtDate,
    fmtMoney,
    invoiceCategory,
    invoiceRecipient,
} from '@/pages/sales/invoices/invoiceShared';

import {
    displayNumber,
    invoiceSource,
    invoiceState,
    invoiceStateLabel,
    isCreditDocument,
    isOverdue,
    kindLabel,
    matchesTab,
    STATE_TABS,
    stateLabel,
    type InvoiceState,
    useBillingRights,
} from './accountingShared';
import '@/styles/modules/accounting.css';

/**
 * ── AUSGANGSRECHNUNGEN (Buchhaltung, 16.09.2026, Schritt 5 / G15) ────────────
 *
 * Die EINE Liste aller Rechnungen an Kunden. Oben vier Zahlen — was offen ist,
 * was überfällig ist, was diesen Monat ausgestellt und was diesen Monat
 * bezahlt wurde —, darunter die Reiter des Laufs (Entwurf · Offen ·
 * Überfällig · Bezahlt · Storniert), EIN Suchfeld und EIN Filter (Herkunft).
 *
 * Eine Zeile öffnet die Rechnung auf ihrer eigenen Seite; dort — und nur
 * dort — wird ausgestellt, bezahlt und storniert.
 */

type Tab = 'ALL' | InvoiceState;

const TAB_PARAM: Record<string, Tab> = {
    DRAFT: 'DRAFT', OPEN: 'OPEN', OVERDUE: 'OVERDUE', PAID: 'PAID', CANCELLED: 'CANCELLED', CREDIT: 'CREDIT',
};

export const OutgoingInvoicesPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { canCreate } = useBillingRights();

    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Reiter und Herkunft stehen in der Adresse: Kacheln der Startseite und
    // der Weg aus der Auftragsliste führen so direkt in die passende Ansicht.
    const tab: Tab = TAB_PARAM[searchParams.get('status') || ''] ?? 'ALL';
    const rawType = searchParams.get('type') || '';
    const category = (CATEGORY_ORDER as string[]).includes(rawType) ? (rawType as InvoiceCategory) : '';

    const setParam = (key: string, value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(key, value);
        else next.delete(key);
        setSearchParams(next, { replace: true });
    };

    const [serverFigures, setServerFigures] = useState<AccountingFiguresDto | null>(null);

    const load = useCallback(async () => {
        try {
            // Liste und Kennzahlen parallel; die Kennzahlen rechnen mit echten
            // Zahlungseingängen (Teilzahlungen) auf dem Server (Schritt 7).
            const [list, figures] = await Promise.all([
                billingApi.listInvoices(),
                billingApi.figures(dayjs().format('YYYY-MM-DD')).catch(() => null),
            ]);
            setInvoices(list);
            setServerFigures(figures);
        } catch (error) {
            toast.error(apiError(error, t('accounting.loadError')));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    /* Die vier Zahlen gelten für ALLE Rechnungen — sie sind der Stand der
       Buchhaltung, nicht der gerade gefilterten Ansicht. Quelle ist der
       Server; die lokale Rechnung ist nur der Rückfall. */
    const localFigures = useMemo(() => {
        const month = dayjs().format('YYYY-MM');
        let open = 0; let openCount = 0;
        let overdue = 0; let overdueCount = 0;
        let issuedMonth = 0; let issuedMonthCount = 0;
        let paidMonth = 0; let paidMonthCount = 0;
        for (const invoice of invoices) {
            const amount = Number(invoice.amount) || 0;
            // Offen heisst: der Kunde schuldet uns etwas — ein Gegenbeleg nie.
            if (invoice.status === 'ISSUED' && !isCreditDocument(invoice)) {
                const rest = invoice.openAmount ?? amount;
                open += rest; openCount += 1;
                if (isOverdue(invoice)) { overdue += rest; overdueCount += 1; }
            }
            // Ausgestellt netto: Gutschriften zählen negativ, Stornobelege
            // nicht (ihre Rechnung ist schon als storniert draussen).
            if ((invoice.status === 'ISSUED' || invoice.status === 'PAID') && invoice.kind !== 'STORNO'
                && String(invoice.invoiceDate || invoice.createdAt).slice(0, 7) === month) {
                issuedMonth += amount; issuedMonthCount += 1;
            }
            if (invoice.status === 'PAID' && String(invoice.paidAt || '').slice(0, 7) === month) {
                paidMonth += amount; paidMonthCount += 1;
            }
        }
        return { open, openCount, overdue, overdueCount, issuedMonth, issuedMonthCount, paidMonth, paidMonthCount };
    }, [invoices]);
    const figures = serverFigures
        ? {
            open: serverFigures.open.amount, openCount: serverFigures.open.count,
            overdue: serverFigures.overdue.amount, overdueCount: serverFigures.overdue.count,
            issuedMonth: serverFigures.issuedMonth.amount, issuedMonthCount: serverFigures.issuedMonth.count,
            paidMonth: serverFigures.paidMonth.amount, paidMonthCount: serverFigures.paidMonth.count,
        }
        : localFigures;

    // Suche und Herkunft zuerst — die Reiter zählen dann innerhalb davon.
    const scoped = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return invoices.filter((invoice) => {
            if (category && invoiceCategory(invoice) !== category) return false;
            if (!needle) return true;
            const source = invoiceSource(invoice);
            return [
                invoice.invoiceNumber,
                invoiceRecipient(invoice),
                source.primary,
                source.secondary,
                invoice.salespersonName,
                String(invoice.amount),
            ].some((value) => String(value || '').toLowerCase().includes(needle));
        });
    }, [invoices, search, category]);

    const counts = useMemo(() => {
        const result: Record<Tab, number> = { ALL: scoped.length, DRAFT: 0, OPEN: 0, OVERDUE: 0, PAID: 0, CANCELLED: 0, CREDIT: 0 };
        for (const invoice of scoped) {
            const state = invoiceState(invoice);
            result[state] += 1;
            if (state === 'OVERDUE') result.OPEN += 1;
        }
        return result;
    }, [scoped]);

    const rows = useMemo(() => {
        const list = scoped.filter((invoice) => matchesTab(invoice, tab));
        // Überfällig: die älteste Fälligkeit zuerst — sie braucht zuerst einen Anruf.
        if (tab === 'OVERDUE') {
            return list.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
        }
        // Entwürfe zuoberst (sie warten auf jemanden), dann die neuesten.
        return list.sort((a, b) => {
            const draftA = a.status === 'DRAFT' ? 0 : 1;
            const draftB = b.status === 'DRAFT' ? 0 : 1;
            if (draftA !== draftB) return draftA - draftB;
            return String(b.invoiceDate || b.createdAt).localeCompare(String(a.invoiceDate || a.createdAt));
        });
    }, [scoped, tab]);

    // Eine Kachel mit Reiter filtert danach (zweiter Klick hebt es auf);
    // «diesen Monat ausgestellt» ist eine reine Zahl ohne eigenen Reiter.
    const figureTile = (key: Tab | null, label: string, value: number, count: number, tone?: 'red' | 'green') => (
        <button
            type="button"
            className={`acc-figure ofi-btn-plain ofi-nosize ${key && tab === key ? 'is-on' : ''}`}
            onClick={() => setParam('status', !key || tab === key ? '' : key)}
        >
            <span className="acc-figure__label">{label}</span>
            <span className={`acc-figure__value ${tone && value > 0 ? `is-${tone}` : ''}`}>{fmtMoney(value)}</span>
            <span className="acc-figure__sub">{t('accounting.invoiceCount', { count })}</span>
        </button>
    );

    return (
        <div className="acc">
            <InventoryListHeader
                title={t('nav.outgoingInvoices')}
                action={canCreate ? (
                    <button
                        type="button"
                        className="ofi-cal-btn is-primary"
                        aria-label={t('accounting.newInvoice')}
                        onClick={() => navigate('/accounting/invoices/new')}
                    >
                        <Plus size={15} />
                        <span className="acc-hide-phone">{t('accounting.newInvoice')}</span>
                    </button>
                ) : null}
            />

            <div className="acc-figures">
                {figureTile('OPEN', t('accounting.figureOpen'), figures.open, figures.openCount)}
                {figureTile('OVERDUE', t('accounting.figureOverdue'), figures.overdue, figures.overdueCount, 'red')}
                {figureTile(null, t('accounting.figureIssuedMonth'), figures.issuedMonth, figures.issuedMonthCount)}
                {figureTile('PAID', t('accounting.figurePaidMonth'), figures.paidMonth, figures.paidMonthCount, 'green')}
            </div>

            {/* Hinweise aus der Buchhaltung: was zu verrechnen ist, welche
                Rückzahlungen ausstehen (Schritt 7). */}
            {serverFigures && (serverFigures.toBillNow > 0 || serverFigures.refundsOpen.count > 0) && (
                <div className="acc-hints">
                    {serverFigures.toBillNow > 0 && (
                        <button type="button" className="acc-hint ofi-btn-plain ofi-nosize" onClick={() => navigate('/accounting/to-bill')}>
                            <span className="acc-hint__dot" />
                            {t('accounting.toBill.hint', { billCount: serverFigures.toBillNow })}
                            <ArrowRight size={13} />
                        </button>
                    )}
                    {serverFigures.refundsOpen.count > 0 && (
                        <button type="button" className="acc-hint ofi-btn-plain ofi-nosize" onClick={() => setParam('status', 'CREDIT')}>
                            <span className="acc-hint__dot is-orange" />
                            {t('accounting.refundsOpenHint', { amount: fmtMoney(serverFigures.refundsOpen.amount), refundCount: serverFigures.refundsOpen.count })}
                            <ArrowRight size={13} />
                        </button>
                    )}
                </div>
            )}

            <div className="acc-toolbar">
                <div className="acc-seg" role="tablist" aria-label={t('accounting.stateFilter')}>
                    {STATE_TABS.map((key) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={tab === key}
                            className={tab === key ? 'is-on' : ''}
                            onClick={() => setParam('status', key === 'ALL' ? '' : key)}
                        >
                            {stateLabel(key)}
                            {counts[key] > 0 && (
                                <span className={`acc-seg__count ${key === 'OVERDUE' ? 'is-red' : ''}`}>{counts[key]}</span>
                            )}
                        </button>
                    ))}
                </div>
                <FilterBar>
                    <SearchBox value={search} onChange={setSearch} placeholder={t('accounting.searchPlaceholder')} />
                    <FilterSelect value={category} onChange={(value) => setParam('type', value)} label={t('accounting.sourceFilter')}>
                        <option value="">{t('accounting.sourceAll')}</option>
                        {CATEGORY_ORDER.map((key) => (
                            <option key={key} value={key}>{categoryLabel(key)}</option>
                        ))}
                    </FilterSelect>
                </FilterBar>
            </div>

            {tab === 'OVERDUE' && serverFigures && serverFigures.overdue.count > 0 && (
                <div className="acc-aging" aria-label={t('accounting.aging.title')}>
                    {serverFigures.aging.map((bucket) => (
                        <div key={bucket.bucket} className={`acc-aging__cell is-${bucket.bucket.replace('+', 'plus')}`}>
                            <span className="acc-aging__label">{t('accounting.aging.days', { range: bucket.bucket })}</span>
                            <span className="acc-aging__value">{fmtMoney(bucket.amount)}</span>
                            <span className="acc-aging__sub">{t('accounting.invoiceCount', { count: bucket.count })}</span>
                        </div>
                    ))}
                </div>
            )}

            <section className="acc-card">
                {loading ? (
                    <div className="acc-empty"><LoadingDots /></div>
                ) : rows.length === 0 ? (
                    <div className="acc-empty">{invoices.length === 0 ? t('accounting.emptyAll') : t('accounting.emptyFiltered')}</div>
                ) : (
                    <div className="acc-scroll">
                        <table className="acc-table" data-unstyled-table>
                            <thead>
                                <tr>
                                    <th>{t('accounting.colNumber')}</th>
                                    <th>{t('accounting.colCustomer')}</th>
                                    <th>{t('accounting.colSource')}</th>
                                    <th>{t('accounting.colKind')}</th>
                                    <th>{t('accounting.colDate')}</th>
                                    <th>{t('accounting.colDue')}</th>
                                    <th className="is-num">{t('accounting.colAmount')}</th>
                                    <th className="is-num">{t('accounting.colOpen')}</th>
                                    <th>{t('accounting.colState')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((invoice) => {
                                    const state = invoiceState(invoice);
                                    const source = invoiceSource(invoice);
                                    const cancelled = state === 'CANCELLED';
                                    return (
                                        <tr
                                            key={invoice.id}
                                            className={cancelled ? 'is-muted' : ''}
                                            onClick={() => navigate(`/accounting/invoices/${invoice.id}`)}
                                        >
                                            <td>
                                                <span className={`acc-strong ${cancelled ? 'acc-struck' : ''} ${state === 'DRAFT' ? 'acc-muted' : ''}`}>
                                                    {displayNumber(invoice)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="acc-name">{invoiceRecipient(invoice) || '—'}</span>
                                            </td>
                                            <td>
                                                <span className="acc-name">{source.primary}</span>
                                                {source.secondary && <span className="acc-line2">{source.secondary}</span>}
                                            </td>
                                            <td className="acc-muted">
                                                {kindLabel(invoice.kind)}
                                                {invoice.billedPercent > 0 && invoice.billedPercent < 100 && (
                                                    <span className="acc-faint"> · {Math.round(invoice.billedPercent)}%</span>
                                                )}
                                            </td>
                                            <td className="acc-muted">{fmtDate(invoice.invoiceDate || invoice.createdAt)}</td>
                                            <td className={state === 'OVERDUE' ? 'acc-red' : 'acc-muted'}>
                                                {fmtDate(invoice.dueDate)}
                                                {state === 'OVERDUE' && (
                                                    <span className="acc-line2 acc-red">
                                                        {t('accounting.daysLate', { days: dayjs().startOf('day').diff(dayjs(String(invoice.dueDate).slice(0, 10)), 'day') })}
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`is-num acc-strong ${Number(invoice.amount) < 0 ? 'acc-red' : ''}`}>{fmtMoney(invoice.amount)}</td>
                                            <td className="is-num">
                                                {(invoice.openAmount ?? 0) > 0.005
                                                    ? <span className={state === 'OVERDUE' ? 'acc-red acc-strong' : 'acc-strong'}>{fmtMoney(invoice.openAmount)}</span>
                                                    : <span className="acc-faint">—</span>}
                                            </td>
                                            <td><span className={`acc-state is-${state}`}>{invoiceStateLabel(invoice)}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};
