import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { ArrowRight, Plus } from '@/components/icons/antIconCompat';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { billingApi } from '@/lib/api/billing';
import type { AccountingFiguresDto, InvoiceCategory, InvoicePageDto, InvoiceSortKey } from '@/types/billing';
import {
    apiError,
    categoryLabel,
    CATEGORY_ORDER,
    fmtDate,
    fmtMoney,
    invoiceRecipient,
} from '@/pages/sales/invoices/invoiceShared';

import {
    dayOf,
    displayNumber,
    invoiceSource,
    invoiceState,
    invoiceStateLabel,
    kindLabel,
    SORT_ORDER,
    sortLabel,
    STATE_TABS,
    stateLabel,
    type InvoiceState,
    useBillingRights,
} from './accountingShared';
import { AccPager, AccSearch, AccSelect } from './components/AccControls';
import '@/styles/modules/accounting.css';

/**
 * ── AUSGANGSRECHNUNGEN (Buchhaltung, 16.09.2026, Schritt 5 / G15) ────────────
 *
 * Die EINE Liste aller Rechnungen an Kunden. Oben vier Zahlen — was offen ist,
 * was überfällig ist, was diesen Monat ausgestellt und was diesen Monat
 * bezahlt wurde —, darunter die Reiter des Laufs (Entwurf · Offen ·
 * Überfällig · Bezahlt · Storniert), EIN Suchfeld und zwei Pop-up Buttons
 * (Herkunft, Reihenfolge).
 *
 * Eine Zeile öffnet die Rechnung auf ihrer eigenen Seite; dort — und nur
 * dort — wird ausgestellt, bezahlt und storniert.
 *
 * ── SEITENWEISE, NEUSTES OBEN (22.09.2026) ──────────────────────────────────
 * Vorgabe Samet: «20'şer 20'şer getirsin… son kesilen ya da işlem yapılan
 * faturadan aşağıya doğru». Die Seite lädt darum nur EINE Seite (20 Zeilen)
 * und sortiert nach dem LETZTEN VORGANG: was zuletzt ausgestellt, bezahlt,
 * geändert oder storniert wurde, steht zuoberst. Reiter, Suche, Herkunft und
 * die Zähler rechnet deshalb der Server (`GET /billing/invoices?page=…`) —
 * die Oberfläche hat nie mehr alle Rechnungen in der Hand.
 */

type Tab = 'ALL' | InvoiceState;

const TAB_PARAM: Record<string, Tab> = {
    DRAFT: 'DRAFT', OPEN: 'OPEN', OVERDUE: 'OVERDUE', PAID: 'PAID', CANCELLED: 'CANCELLED', CREDIT: 'CREDIT',
};

const PAGE_SIZES = [20, 50, 100];

export const OutgoingInvoicesPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { canCreate } = useBillingRights();

    const [result, setResult] = useState<InvoicePageDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    // Was im Feld steht, und was der Server schon kennt (300 ms später).
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

    // Reiter, Herkunft, Reihenfolge und Seite stehen in der Adresse: die
    // Kacheln der Startseite führen so direkt in die passende Ansicht, und der
    // Weg zurück aus einer Rechnung landet wieder auf derselben Seite.
    const tab: Tab = TAB_PARAM[searchParams.get('status') || ''] ?? 'ALL';
    const rawType = searchParams.get('type') || '';
    const category = (CATEGORY_ORDER as string[]).includes(rawType) ? (rawType as InvoiceCategory) : '';
    const rawSort = searchParams.get('sort') || '';
    const sort: InvoiceSortKey = (SORT_ORDER as string[]).includes(rawSort) ? (rawSort as InvoiceSortKey) : 'activity';
    const page = Math.max(1, Number(searchParams.get('page')) || 1);

    /** Ein Wert in der Adresse; jede Änderung ausser der Seite beginnt wieder bei Seite 1. */
    const setParam = useCallback((key: string, value: string) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            if (value) next.set(key, value);
            else next.delete(key);
            if (key !== 'page') next.delete('page');
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const setPage = useCallback((value: number) => setParam('page', value > 1 ? String(value) : ''), [setParam]);

    // Tippen wartet: erst 300 ms nach dem letzten Zeichen fragt die Seite.
    useEffect(() => {
        const timer = window.setTimeout(() => setQuery(search.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    // Eine neue Suche beginnt bei Seite 1.
    const lastQuery = useRef(query);
    useEffect(() => {
        if (lastQuery.current === query) return;
        lastQuery.current = query;
        setPage(1);
    }, [query, setPage]);

    const [serverFigures, setServerFigures] = useState<AccountingFiguresDto | null>(null);

    /* Die vier Zahlen gelten für ALLE Rechnungen — sie sind der Stand der
       Buchhaltung, nicht der gerade gefilterten Ansicht. Sie rechnen mit
       echten Zahlungseingängen (Teilzahlungen) auf dem Server (Schritt 7). */
    useEffect(() => {
        let alive = true;
        billingApi.figures(dayjs().format('YYYY-MM-DD'))
            .then((figures) => { if (alive) setServerFigures(figures); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, []);

    // Die Seite selbst: Zeilen, Gesamtzahl und die Zähler der Reiter.
    useEffect(() => {
        let alive = true;
        setBusy(true);
        billingApi.listInvoicesPage({
            page,
            pageSize,
            search: query,
            state: tab === 'ALL' ? '' : tab,
            category,
            sort,
            today: dayjs().format('YYYY-MM-DD'),
        })
            .then((data) => { if (alive) setResult(data); })
            .catch((error) => { if (alive) toast.error(apiError(error, t('accounting.loadError'))); })
            .finally(() => { if (alive) { setLoading(false); setBusy(false); } });
        return () => { alive = false; };
    }, [page, pageSize, query, tab, category, sort]);

    const figures = serverFigures
        ? {
            open: serverFigures.open.amount, openCount: serverFigures.open.count,
            overdue: serverFigures.overdue.amount, overdueCount: serverFigures.overdue.count,
            issuedMonth: serverFigures.issuedMonth.amount, issuedMonthCount: serverFigures.issuedMonth.count,
            paidMonth: serverFigures.paidMonth.amount, paidMonthCount: serverFigures.paidMonth.count,
        }
        : { open: 0, openCount: 0, overdue: 0, overdueCount: 0, issuedMonth: 0, issuedMonthCount: 0, paidMonth: 0, paidMonthCount: 0 };

    const counts = result?.counts;
    const rows = result?.items ?? [];
    const total = result?.total ?? 0;
    const filtered = tab !== 'ALL' || category !== '' || query !== '';

    const sortOptions = useMemo(
        () => SORT_ORDER.map((key) => ({ value: key, label: sortLabel(key) })),
        [],
    );

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
                            {(counts?.[key] ?? 0) > 0 && (
                                <span className={`acc-seg__count ${key === 'OVERDUE' ? 'is-red' : ''}`}>{counts?.[key]}</span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="acc-controls">
                    <AccSearch value={search} onChange={setSearch} placeholder={t('accounting.searchPlaceholder')} />
                    <AccSelect
                        value={category}
                        onChange={(value) => setParam('type', value)}
                        ariaLabel={t('accounting.sourceFilter')}
                        options={[
                            { value: '', label: t('accounting.sourceAll') },
                            ...CATEGORY_ORDER.map((key) => ({ value: key, label: categoryLabel(key) })),
                        ]}
                    />
                    <AccSelect
                        value={sort}
                        onChange={(value) => setParam('sort', value === 'activity' ? '' : value)}
                        ariaLabel={t('accounting.sortLabel')}
                        options={sortOptions}
                    />
                </div>
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

            <section className={`acc-card ${busy && !loading ? 'is-busy' : ''}`}>
                {loading ? (
                    <div className="acc-empty"><LoadingDots /></div>
                ) : (
                    <>
                        {rows.length === 0 ? (
                            <div className="acc-empty">{filtered ? t('accounting.emptyFiltered') : t('accounting.emptyAll')}</div>
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
                                        // Der letzte Vorgang — nur wenn er auf einen ANDEREN Tag
                                        // fällt als das Rechnungsdatum, erklärt er die Reihenfolge.
                                        const invoiceDay = dayOf(invoice.invoiceDate || invoice.createdAt);
                                        const changedDay = dayOf(invoice.activityAt);
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
                                                <td className="acc-muted">
                                                    {fmtDate(invoice.invoiceDate || invoice.createdAt)}
                                                    {changedDay && changedDay !== invoiceDay && (
                                                        <span className="acc-line2 acc-faint">{t('accounting.changedOn', { date: fmtDate(invoice.activityAt) })}</span>
                                                    )}
                                                </td>
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
                        {total > 0 && (
                            <AccPager
                                page={page}
                                pageSize={pageSize}
                                total={total}
                                onPage={setPage}
                                onPageSize={(size) => { setPageSize(size); setPage(1); }}
                                sizes={PAGE_SIZES}
                            />
                        )}
                    </>
                )}
            </section>
        </div>
    );
};
