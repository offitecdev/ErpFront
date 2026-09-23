import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { ArrowRight } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { billingApi } from '@/lib/api/billing';
import type { ToBillItemDto } from '@/types/billing';
import { apiError, fmtDate, fmtMoney } from '@/pages/sales/invoices/invoiceShared';

import { kindLabel, useBillingRights } from './accountingShared';
import { AccPager, AccSearch } from './components/AccControls';
import '@/styles/modules/accounting.css';

/**
 * ── ZU VERRECHNEN (Buchhaltung, 17.09.2026, Schritt 7 / G14) ────────────────
 *
 * Die Arbeitsliste der Buchhaltung: was JETZT in Rechnung gestellt werden
 * sollte — fällige Raten des Zahlungsplans, die Anzahlung eines neuen
 * Auftrags, abgeschlossene Projekte mit offenem Rest, gelieferte
 * Lieferaufträge, offene Nachträge. Darunter, was bald fällig wird, und
 * alles übrige mit offenem Betrag.
 *
 * Jede Zeile trägt den Vorschlag (Art, Anteil, Betrag) und führt mit einem
 * Klick in den Erstellweg — mit genau diesem Auftrag.
 */

type Tab = 'NOW' | 'SOON' | 'ALL';

/** Auch die Arbeitsliste blättert 20 Zeilen (22.09.2026) — sie kommt als
 *  gerechnete Antwort vom Server, geblättert wird darum hier. */
const PAGE_SIZES = [20, 50, 100];

export const ToBillPage = () => {
    const navigate = useNavigate();
    const { canCreate } = useBillingRights();
    const [items, setItems] = useState<ToBillItemDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('NOW');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

    const load = useCallback(async () => {
        try {
            setItems(await billingApi.toBill(dayjs().format('YYYY-MM-DD')));
        } catch (error) {
            toast.error(apiError(error, t('accounting.loadError')));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const sums = useMemo(() => {
        const of = (urgency: ToBillItemDto['urgency'] | null) => {
            const rows = urgency ? items.filter((row) => row.urgency === urgency) : items;
            return {
                count: rows.length,
                amount: rows.reduce((sum, row) => sum + (urgency ? row.proposedAmount : row.remainingAmount), 0),
            };
        };
        return { now: of('NOW'), soon: of('SOON'), all: of(null) };
    }, [items]);

    const matching = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return items
            .filter((row) => tab === 'ALL' || row.urgency === tab)
            .filter((row) => !needle || [row.orderNumber, row.parentNumber, row.customerName, row.projectLabel]
                .some((value) => String(value || '').toLowerCase().includes(needle)));
    }, [items, tab, search]);

    // Reiter oder Suche gewechselt: wieder bei der ersten Seite anfangen.
    useEffect(() => { setPage(1); }, [tab, search, pageSize]);

    const rows = useMemo(
        () => matching.slice((page - 1) * pageSize, page * pageSize),
        [matching, page, pageSize],
    );

    const tile = (key: Tab, label: string, value: number, count: number, sub: string) => (
        <button
            type="button"
            className={`acc-figure ofi-btn-plain ofi-nosize ${tab === key ? 'is-on' : ''}`}
            onClick={() => setTab(key)}
        >
            <span className="acc-figure__label">{label}</span>
            <span className="acc-figure__value">{fmtMoney(value)}</span>
            <span className="acc-figure__sub">{sub.replace('{n}', String(count))}</span>
        </button>
    );

    const reasonText = (row: ToBillItemDto) => {
        const base = t(`accounting.toBill.reason.${row.reason}`);
        if (row.reason === 'STAGE_DUE' || row.reason === 'STAGE_SOON' || row.reason === 'FIRST_STAGE') {
            const stage = row.stageLabel || t('accounting.stageN', { n: (row.stageIndex ?? 0) + 1 });
            const parts = [base];
            if (stage.trim().toLowerCase() !== base.trim().toLowerCase()) parts.push(stage);
            if (row.dueDate) parts.push(fmtDate(row.dueDate));
            return parts.join(' · ');
        }
        return base;
    };

    return (
        <div className="acc">
            <InventoryListHeader title={t('nav.toBill')} />
            <p className="acc-sub">{t('accounting.toBill.subtitle')}</p>

            <div className="acc-figures acc-figures--three">
                {tile('NOW', t('accounting.toBill.now'), sums.now.amount, sums.now.count, t('accounting.toBill.countSub'))}
                {tile('SOON', t('accounting.toBill.soon'), sums.soon.amount, sums.soon.count, t('accounting.toBill.countSub'))}
                {tile('ALL', t('accounting.toBill.all'), sums.all.amount, sums.all.count, t('accounting.toBill.openSub'))}
            </div>

            <div className="acc-toolbar">
                <div className="acc-seg" role="tablist" aria-label={t('nav.toBill')}>
                    {(['NOW', 'SOON', 'ALL'] as Tab[]).map((key) => (
                        <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
                            {t(`accounting.toBill.tab${key}`)}
                            <span className={`acc-seg__count ${key === 'NOW' && sums.now.count ? 'is-red' : ''}`}>
                                {key === 'NOW' ? sums.now.count : key === 'SOON' ? sums.soon.count : sums.all.count}
                            </span>
                        </button>
                    ))}
                </div>
                <div className="acc-controls">
                    <AccSearch value={search} onChange={setSearch} placeholder={t('accounting.searchOrders')} />
                </div>
            </div>

            <section className="acc-card">
                {loading ? (
                    <div className="acc-empty"><LoadingDots /></div>
                ) : (
                    <>
                    {rows.length === 0 ? (
                        <div className="acc-empty">{tab === 'NOW' ? t('accounting.toBill.emptyNow') : t('accounting.toBill.empty')}</div>
                    ) : (
                    <div className="acc-scroll">
                        <table className="acc-table" data-unstyled-table>
                            <thead>
                                <tr>
                                    <th>{t('accounting.order')}</th>
                                    <th>{t('accounting.colCustomer')}</th>
                                    <th>{t('accounting.toBill.colReason')}</th>
                                    <th>{t('accounting.proposal')}</th>
                                    <th className="is-num">{t('accounting.stillOpen')}</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const target = row.draftId
                                        ? `/accounting/invoices/${row.draftId}`
                                        : `/accounting/invoices/new?orderId=${row.salesOrderId}`;
                                    return (
                                        <tr key={row.salesOrderId} onClick={() => navigate(`/sales/orders/${row.salesOrderId}?tab=billing`)}>
                                            <td>
                                                <span className="acc-strong">{row.orderNumber}</span>
                                                {row.isAddon && row.parentNumber && (
                                                    <span className="acc-order__tag">{t('accounting.addonOf', { order: row.parentNumber })}</span>
                                                )}
                                                {row.projectLabel && <span className="acc-line2">{row.projectLabel}</span>}
                                            </td>
                                            <td><span className="acc-name">{row.customerName || '—'}</span></td>
                                            <td>
                                                <span className={`acc-state is-${row.urgency === 'NOW' ? 'OVERDUE' : row.urgency === 'SOON' ? 'OPEN' : 'DRAFT'}`}>
                                                    {reasonText(row)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="acc-kind">{kindLabel(row.proposedKind)}</span>
                                                <span className="acc-line2">
                                                    {Math.round(row.proposedPercent)}% · {fmtMoney(row.proposedAmount)}
                                                </span>
                                            </td>
                                            <td className="is-num">
                                                <span className="acc-strong">{fmtMoney(row.remainingAmount)}</span>
                                                <span className="acc-line2">{t('accounting.openOf', { total: fmtMoney(row.baseAmount) })}</span>
                                            </td>
                                            <td className="is-num" onClick={(event) => event.stopPropagation()}>
                                                {canCreate && (
                                                    <button
                                                        type="button"
                                                        className={`acc-btn ofi-btn-plain ofi-nosize ${row.draftId ? '' : 'is-primary'}`}
                                                        onClick={() => navigate(target)}
                                                    >
                                                        {row.draftId ? t('accounting.openDraft') : t('accounting.createInvoiceLink')}
                                                        <ArrowRight size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    )}
                    {matching.length > 0 && (
                        <AccPager
                            page={page}
                            pageSize={pageSize}
                            total={matching.length}
                            onPage={setPage}
                            onPageSize={setPageSize}
                            sizes={PAGE_SIZES}
                        />
                    )}
                    </>
                )}
            </section>
        </div>
    );
};
