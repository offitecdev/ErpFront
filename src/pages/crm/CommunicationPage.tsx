import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Mail01, MarkerPin01,
    Phone, Plus, RefreshCcw01, SearchLg, Trash01, Users01,
} from '@/components/icons/antIconCompat';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import { crmApi } from '@/lib/api/crm';
import { CustomerPicker } from './components/CustomerPicker';
import { QuickEntrySheet } from './components/QuickEntrySheet';
import { useCrmPagedList } from './hooks/useCrmPagedList';
import { useStaffDirectory } from './hooks/useStaffDirectory';
import { channelLabel, dateInputToIso, personName } from './utils/crmFormat.utils';
import { dayHeading, dayKey, shortWhen } from './enquiries/enquiryShared';
import { EMPTY_COMMUNICATION_FILTER } from './types/crm.types';
import type { CommunicationFilterState, CrmCustomerOption, CrmInteractionRow, InteractionType } from './types/crm.types';

/**
 * ── KOMMUNIKATION (`/crm/communication`) ─────────────────────────────────────
 *
 * EINE Liste aller Kundenkontakte: Telefonate, E-Mails, Besprechungen, Notizen
 * und Besuche vor Ort. Die Zeilen kommen aus allen Quellen (Schnellerfassung,
 * Notizen und Aktivitäten der Kundenakte, Postfach) über die vereinte
 * Serverabfrage — was in der Kundenakte erfasst wird, steht auch hier.
 *
 * UMGEBAUT AM 10.09.2026 (Vorgabe Samet: «ruhiger, sauberer und schneller —
 * wie der Kalender oder noch sauberer»): aus der Tabelle mit sechs Spalten,
 * Rahmen und ziehbaren Breiten wurde dieselbe stille Zeilenliste wie bei
 * Anfragen und Aktivitäten (`.ofi-crm-*`).
 *
 * WARUM DIE TABELLE WEG KONNTE: sie hatte keine Spalte, nach der man sortiert
 * oder rechnet — sie war eine Liste, die wie eine Tabelle aussah. Sechs
 * Spaltenlinien für Datum, Typ, Kunde, Notiz, Person kosten Aufmerksamkeit und
 * geben nichts zurück. Jetzt trägt eine Zeile dasselbe: Zeichen der Art links,
 * Notiz als Überschrift, Kunde/Person/Art darunter, Zeit rechts — und die
 * Einträge stehen unter Tagesüberschriften, wie im Postfach.
 *
 * DIE FILTER blieben dieselben vier Achsen (Kunde | Zeitraum | Art |
 * Mitarbeiter), nur als Kapseln und Auswahlfelder statt als eigene Leiste.
 *
 * REIHENFOLGE: neueste zuoberst. Die alte Fassung baute die Seite von unten
 * auf (ältestes oben, neuestes unten) — das passt zu einem Gesprächsverlauf,
 * aber nicht zu einer Liste, die man von oben überfliegt.
 */

const PAGE_SIZE = 30;

/* Die fünf Arten und ihr Zeichen. Dieselbe Palette wie die Kalenderkarten —
   im ganzen Programm bedeutet dieselbe Farbe dasselbe. */
const TYPE_DOT: Record<InteractionType, string> = {
    PHONE: '#e8710a',
    EMAIL: '#3f51b5',
    MEETING: '#8e24aa',
    NOTE: '#9aa0a6',
    VISIT: '#0b8043',
};

const TypeMark = ({ type }: { type: InteractionType }) => {
    if (type === 'PHONE') return <Phone size={15} />;
    if (type === 'EMAIL') return <Mail01 size={15} />;
    if (type === 'MEETING') return <Users01 size={15} />;
    if (type === 'VISIT') return <MarkerPin01 size={15} />;
    return <CalendarIcon size={15} />;
};

const TYPES: InteractionType[] = ['PHONE', 'EMAIL', 'MEETING', 'NOTE', 'VISIT'];

export const CommunicationPage = () => {
    const locale = i18n.resolvedLanguage || 'de';
    const [filters, setFilters] = useState<CommunicationFilterState>(EMPTY_COMMUNICATION_FILTER);
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(null);
    const [quickOpen, setQuickOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<CrmInteractionRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const { staff } = useStaffDirectory();

    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(search.trim().toLowerCase()), 250);
        return () => window.clearTimeout(id);
    }, [search]);

    const filterKey = JSON.stringify(filters);
    const fetcher = useCallback(
        (page: number) => crmApi.listInteractions({
            customerId: filters.customerId || undefined,
            type: filters.type || undefined,
            employeeId: filters.employeeId || undefined,
            from: dateInputToIso(filters.from),
            to: dateInputToIso(filters.to),
            page,
            pageSize: PAGE_SIZE,
        }),
        [filters],
    );
    const { rows, total, page, totalPages, loading, setPage, reload, removeRow } = useCrmPagedList<CrmInteractionRow>({
        fetcher,
        filterKey,
        pageSize: PAGE_SIZE,
        errorMessageKey: 'crm.comm.errorLoad',
    });

    const staffOptions = useMemo(
        () => staff.map((person) => ({ value: person.id, label: personName(person) })),
        [staff],
    );

    const pickCustomer = (picked: CrmCustomerOption | null) => {
        setCustomer(picked);
        setFilters((current) => ({ ...current, customerId: picked?.id || '' }));
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const target = pendingDelete;
        try {
            setDeleting(true);
            await crmApi.deleteInteraction(target);
            setPendingDelete(null);
            // Örtlich entfernen — kein Neuladen, kein Springen der Liste.
            removeRow((row) => row.key === target.key);
        } catch {
            toast.error(t('crm.comm.deleteError'));
        } finally {
            setDeleting(false);
        }
    };

    const hasFilters = filterKey !== JSON.stringify(EMPTY_COMMUNICATION_FILTER);

    /* Die SUCHE arbeitet in der geladenen Seite: der vereinte Serverweg kennt
       keinen Textfilter, und dreissig Zeilen im Browser zu durchsuchen ist
       schneller als jede Runde zum Server. Der Zähler oben bleibt deshalb der
       Gesamtstand, nicht der der Suche. */
    const shown = useMemo(() => {
        // Der Server liefert aufsteigend (ältestes zuerst); hier wird von oben
        // gelesen, also gedreht.
        const ordered = [...rows].reverse();
        if (!debounced) return ordered;
        return ordered.filter((row) => (
            row.note.toLowerCase().includes(debounced)
            || (row.customer.companyName || '').toLowerCase().includes(debounced)
            || personName(row.contact).toLowerCase().includes(debounced)
            || personName(row.createdBy).toLowerCase().includes(debounced)
        ));
    }, [rows, debounced]);

    /* Tagesblöcke: der Tag wechselt genau dort, wo er sich vom VORHERIGEN
       Eintrag unterscheidet — abgelesen aus dem Feld, ohne mitlaufende
       Variable (siehe Aktivitäten). */
    const withDays = useMemo(() => shown.map((row, index) => {
        const previous = index > 0 ? shown[index - 1] : null;
        const isFirstOfDay = !previous || dayKey(previous.occurredAt) !== dayKey(row.occurredAt);
        return { row, dayLabel: isFirstOfDay ? dayHeading(row.occurredAt, locale) : null };
    }), [shown, locale]);

    return (
        <div className="ofi-crm-page">
            <header className="ofi-crm-head">
                <div className="ofi-crm-head__title">
                    <h1>{t('nav.crmCommunication')}</h1>
                    <span className="ofi-crm-head__count">{total}</span>
                </div>
                <div className="ofi-crm-head__actions">
                    <label className="ofi-crm-search">
                        <SearchLg size={15} />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('crm.comm.searchPlaceholder')}
                            aria-label={t('crm.comm.searchPlaceholder')}
                        />
                    </label>
                    <button type="button" className="ofi-crm-iconbtn" onClick={reload} title={t('common.refresh')}>
                        <RefreshCcw01 size={15} />
                    </button>
                    <button type="button" className="ofi-crm-btn is-primary" onClick={() => setQuickOpen(true)}>
                        <Plus size={15} />
                        {t('crm.comm.newEntry')}
                    </button>
                </div>
            </header>

            {/* Art als Kapseln (das wechselt man oft), Kunde/Zeitraum/Person als
                Auswahlfelder daneben (das setzt man einmal). */}
            <div className="ofi-crm-filters">
                <div className="ofi-crm-chips">
                    <button
                        type="button"
                        className={`ofi-crm-chip${filters.type === '' ? ' is-on' : ''}`}
                        onClick={() => setFilters((c) => ({ ...c, type: '' }))}
                    >
                        {t('crm.comm.allChannels')}
                    </button>
                    {TYPES.map((type) => (
                        <button
                            key={type}
                            type="button"
                            className={`ofi-crm-chip${filters.type === type ? ' is-on' : ''}`}
                            onClick={() => setFilters((c) => ({ ...c, type }))}
                        >
                            {channelLabel(type)}
                        </button>
                    ))}
                </div>

                <div className="w-56">
                    <CustomerPicker
                        value={customer}
                        onPick={(pick) => pickCustomer(pick?.customer ?? null)}
                        placeholder={t('crm.comm.filterCustomer')}
                    />
                </div>
                <input
                    type="date"
                    className="ofi-crm-select"
                    value={filters.from}
                    onChange={(event) => setFilters((c) => ({ ...c, from: event.target.value }))}
                    aria-label={t('crm.comm.filterFrom')}
                />
                <input
                    type="date"
                    className="ofi-crm-select"
                    value={filters.to}
                    onChange={(event) => setFilters((c) => ({ ...c, to: event.target.value }))}
                    aria-label={t('crm.comm.filterTo')}
                />
                <select
                    className="ofi-crm-select"
                    value={filters.employeeId}
                    onChange={(event) => setFilters((c) => ({ ...c, employeeId: event.target.value }))}
                    aria-label={t('crm.comm.filterEmployee')}
                >
                    <option value="">{t('crm.comm.allEmployees')}</option>
                    {staffOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
                {hasFilters && (
                    <button
                        type="button"
                        className="ofi-crm-btn is-quiet"
                        onClick={() => { setFilters(EMPTY_COMMUNICATION_FILTER); setCustomer(null); }}
                    >
                        {t('crm.comm.resetFilters')}
                    </button>
                )}
            </div>

            <section className="ofi-crm-surface">
                {loading && <div className="ofi-crm-empty"><InlineLoading label={t('common.loading')} /></div>}

                {!loading && withDays.length === 0 && (
                    <div className="ofi-crm-empty">
                        <span className="ofi-crm-empty__title">
                            {hasFilters || debounced ? t('crm.comm.emptyFiltered') : t('crm.comm.empty')}
                        </span>
                    </div>
                )}

                {!loading && withDays.length > 0 && (
                    <div className="ofi-crm-list">
                        {withDays.map(({ row, dayLabel }) => {
                            const contact = personName(row.contact);
                            const by = personName(row.createdBy);
                            return (
                                <div key={row.key}>
                                    {dayLabel && <div className="ofi-crm-day">{dayLabel}</div>}
                                    <div className="ofi-crm-row">
                                        <span className="ofi-crm-row__mark" aria-hidden>
                                            <TypeMark type={row.type} />
                                        </span>
                                        <span className="ofi-crm-row__main">
                                            <span className="ofi-crm-row__title">
                                                {row.note || t('crm.comm.noNote')}
                                            </span>
                                            <span className="ofi-crm-row__sub">
                                                <span className="ofi-crm-state" style={{ ['--dot' as string]: TYPE_DOT[row.type] }}>
                                                    {channelLabel(row.type)}
                                                </span>
                                                <span className="ofi-crm-row__dot">·</span>
                                                <b>{row.customer.companyName}</b>
                                                {contact && (
                                                    <>
                                                        <span className="ofi-crm-row__dot">·</span>
                                                        {contact}
                                                    </>
                                                )}
                                                {by && (
                                                    <>
                                                        <span className="ofi-crm-row__dot">·</span>
                                                        {by}
                                                    </>
                                                )}
                                            </span>
                                        </span>
                                        <span className="ofi-crm-row__side">
                                            <span className="ofi-crm-row__time">{shortWhen(row.occurredAt, locale)}</span>
                                            <button
                                                type="button"
                                                className="ofi-crm-iconbtn"
                                                onClick={() => setPendingDelete(row)}
                                                aria-label={t('common.delete')}
                                                title={t('common.delete')}
                                            >
                                                <Trash01 size={14} />
                                            </button>
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {!loading && totalPages > 1 && (
                    <div className="ofi-crm-pager">
                        <span>{t('common.pageOf', { page, total: totalPages })}</span>
                        <div className="ofi-crm-pager__nav">
                            <button
                                type="button"
                                className="ofi-crm-iconbtn"
                                disabled={page <= 1}
                                onClick={() => setPage(page - 1)}
                                aria-label={t('common.previous')}
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                type="button"
                                className="ofi-crm-iconbtn"
                                disabled={page >= totalPages}
                                onClick={() => setPage(page + 1)}
                                aria-label={t('common.next')}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <QuickEntrySheet open={quickOpen} action="PHONE" onClose={() => setQuickOpen(false)} onSaved={reload} />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('crm.comm.deleteTitle')}
                message={pendingDelete?.note}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
};
