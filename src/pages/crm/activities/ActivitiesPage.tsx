import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
    Check, ChevronLeft, ChevronRight, File05, Mail01, Phone,
    Receipt, RefreshCcw01, SearchLg, ShoppingCart01,
} from '@/components/icons/antIconCompat';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import { activitiesApi, type ActivityKind, type ActivityRow, type ActivityStats } from '@/lib/api/enquiries';

import { dayHeading, dayKey, shortWhen } from '../enquiries/enquiryShared';

/**
 * ── AKTIVITÄTEN (`/crm/activities`, 10.09.2026, Vorgabe Samet) ───────────────
 *
 * «Alles, was auf einem Datensatz passiert ist» — EINE Zeitleiste über das
 * ganze Haus: eine Anfrage kam herein, ein Angebot ging raus, ein Auftrag
 * wurde erfasst, eine Aufgabe angelegt, Post kam an, jemand hat telefoniert.
 *
 * ABGRENZUNG ZUM INTERAKTIONSVERLAUF (Kommunikation): dort steht, was mit
 * einem KUNDEN besprochen wurde. Hier steht, was GESCHEHEN ist — auch das,
 * was noch keinen Kunden hat (eine Anfrage aus dem Formular zum Beispiel).
 *
 * DIE ZAHL AM MENÜEINTRAG ist `today`: was seit Mitternacht dazugekommen ist.
 * Nicht «alles jemals» — eine Zahl, die nur wächst, sagt nichts.
 *
 * NUR LESEN. Geändert wird an der Quelle: ein Klick springt zum Angebot, zum
 * Auftrag, zur Anfrage. Eine Zeitleiste, in der man auch bearbeiten kann, ist
 * keine Zeitleiste mehr, sondern eine zweite Bedienoberfläche für alles.
 */

const PAGE_SIZE = 40;

/** Die Reiter — die Reihenfolge ist die des Arbeitsflusses, nicht das Alphabet. */
const KINDS: ActivityKind[] = ['ENQUIRY', 'QUOTE', 'ORDER', 'TASK', 'MAIL', 'CONTACT'];

const KindMark = ({ kind }: { kind: ActivityKind }) => {
    if (kind === 'ENQUIRY') return <File05 size={15} />;
    if (kind === 'QUOTE') return <Receipt size={15} />;
    if (kind === 'ORDER') return <ShoppingCart01 size={15} />;
    if (kind === 'TASK') return <Check size={15} />;
    if (kind === 'MAIL') return <Mail01 size={15} />;
    return <Phone size={15} />;
};

/** Gedeckte Punktfarben — dieselbe Palette wie die Kalenderkarten. */
const KIND_DOT: Record<ActivityKind, string> = {
    ENQUIRY: '#039be5',
    QUOTE: '#8e24aa',
    ORDER: '#0b8043',
    TASK: '#0f766e',
    MAIL: '#3f51b5',
    CONTACT: '#e8710a',
};

export const ActivitiesPage = () => {
    const navigate = useNavigate();
    const locale = i18n.resolvedLanguage || 'de';

    const [kind, setKind] = useState<ActivityKind | ''>('');
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [page, setPage] = useState(1);

    const [rows, setRows] = useState<ActivityRow[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<ActivityStats | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(search.trim()), 250);
        return () => window.clearTimeout(id);
    }, [search]);
    useEffect(() => { setPage(1); }, [kind, debounced]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await activitiesApi.list({ kind, search: debounced, page, pageSize: PAGE_SIZE });
            setRows(result.data);
            setTotal(result.total);
            setTotalPages(result.totalPages);
        } catch {
            toast.error(t('crm.activity.loadError'));
        } finally {
            setLoading(false);
        }
    }, [kind, debounced, page]);

    const loadStats = useCallback(() => {
        activitiesApi.stats().then(setStats).catch(() => setStats(null));
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { loadStats(); }, [loadStats]);

    /* Wohin ein Klick springt. Nicht jede Quelle hat ein Ziel — Post öffnet das
       Postfach, ein Kontakt hat keine eigene Seite und bleibt still. */
    const jump = (row: ActivityRow) => {
        if (row.kind === 'ENQUIRY') return navigate(`/crm/enquiries?id=${row.id}`);
        if (row.kind === 'QUOTE') return navigate(`/sales/quotes/${row.id}`);
        if (row.kind === 'ORDER') return navigate(`/sales/orders/${row.id}`);
        if (row.kind === 'TASK') return navigate(`/crm/tasks/${row.id}`);
        if (row.kind === 'MAIL') return navigate('/crm/mail');
        if (row.customer) return navigate(`/crm/customers/${row.customer.id}`);
        return undefined;
    };

    /* Tagesblöcke: die Liste kommt absteigend, der Tag wechselt also genau
       dort, wo er sich vom VORHERIGEN Eintrag unterscheidet. Abgelesen wird er
       aus dem Feld und nicht aus einer mitlaufenden Variablen — eine Zuweisung
       im useMemo lässt den React-Compiler aussteigen, und gebraucht wird sie
       nicht. Kein Gruppieren, kein zweiter Durchlauf. */
    const withDays = useMemo(() => rows.map((row, index) => {
        const previous = index > 0 ? rows[index - 1] : null;
        const isFirstOfDay = !previous || dayKey(previous.occurredAt) !== dayKey(row.occurredAt);
        return { row, dayLabel: isFirstOfDay ? dayHeading(row.occurredAt, locale) : null };
    }), [rows, locale]);

    return (
        <div className="ofi-crm-page">
            <header className="ofi-crm-head">
                <div className="ofi-crm-head__title">
                    <h1>{t('nav.crmActivities')}</h1>
                    <span className="ofi-crm-head__count">
                        {stats ? t('crm.activity.todayCount', { count: stats.today }) : total}
                    </span>
                </div>
                <div className="ofi-crm-head__actions">
                    <label className="ofi-crm-search">
                        <SearchLg size={15} />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('crm.activity.searchPlaceholder')}
                            aria-label={t('crm.activity.searchPlaceholder')}
                        />
                    </label>
                    <button type="button" className="ofi-crm-iconbtn" onClick={() => { void load(); loadStats(); }} title={t('common.refresh')}>
                        <RefreshCcw01 size={15} />
                    </button>
                </div>
            </header>

            <div className="ofi-crm-filters">
                <div className="ofi-crm-chips">
                    <button
                        type="button"
                        className={`ofi-crm-chip${kind === '' ? ' is-on' : ''}`}
                        onClick={() => setKind('')}
                    >
                        {t('crm.activity.allKinds')}
                    </button>
                    {KINDS.map((value) => (
                        <button
                            key={value}
                            type="button"
                            className={`ofi-crm-chip${kind === value ? ' is-on' : ''}`}
                            onClick={() => setKind(value)}
                        >
                            {t(`crm.activity.kind.${value}`)}
                            {Boolean(stats?.byKind?.[value]) && (
                                <span className="ofi-crm-chip__n">{stats?.byKind?.[value]}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <section className="ofi-crm-surface">
                {loading && <div className="ofi-crm-empty"><InlineLoading label={t('common.loading')} /></div>}

                {!loading && rows.length === 0 && (
                    <div className="ofi-crm-empty">
                        <span className="ofi-crm-empty__title">{t('crm.activity.emptyTitle')}</span>
                        <span className="ofi-crm-empty__hint">{t('crm.activity.emptyHint')}</span>
                    </div>
                )}

                {!loading && rows.length > 0 && (
                    <div className="ofi-crm-list">
                        {withDays.map(({ row, dayLabel }) => (
                            <Fragment key={row.key}>
                                {dayLabel && <div className="ofi-crm-day">{dayLabel}</div>}
                                <button type="button" className="ofi-crm-row" onClick={() => jump(row)}>
                                    <span className="ofi-crm-row__mark" aria-hidden>
                                        <KindMark kind={row.kind} />
                                    </span>
                                    <span className="ofi-crm-row__main">
                                        <span className="ofi-crm-row__title">{row.title || t('crm.activity.untitled')}</span>
                                        <span className="ofi-crm-row__sub">
                                            <span className="ofi-crm-state" style={{ ['--dot' as string]: KIND_DOT[row.kind] }}>
                                                {t(`crm.activity.kind.${row.kind}`)}
                                            </span>
                                            {row.customer?.companyName && (
                                                <>
                                                    <span className="ofi-crm-row__dot">·</span>
                                                    <b>{row.customer.companyName}</b>
                                                </>
                                            )}
                                            {!row.customer && row.detail && (
                                                <>
                                                    <span className="ofi-crm-row__dot">·</span>
                                                    {row.detail}
                                                </>
                                            )}
                                            {row.employee && (
                                                <>
                                                    <span className="ofi-crm-row__dot">·</span>
                                                    {`${row.employee.firstName} ${row.employee.lastName}`.trim()}
                                                </>
                                            )}
                                        </span>
                                    </span>
                                    <span className="ofi-crm-row__side">
                                        <span className="ofi-crm-row__time">{shortWhen(row.occurredAt, locale)}</span>
                                    </span>
                                </button>
                            </Fragment>
                        ))}
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
                                onClick={() => setPage((value) => Math.max(1, value - 1))}
                                aria-label={t('common.previous')}
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                type="button"
                                className="ofi-crm-iconbtn"
                                disabled={page >= totalPages}
                                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                                aria-label={t('common.next')}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

export default ActivitiesPage;
