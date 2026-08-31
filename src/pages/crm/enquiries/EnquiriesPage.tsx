import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import {
    Check, ChevronLeft, ChevronRight, Copy01, File05, Mail01, Plus,
    RefreshCcw01, SearchLg, Send01, Settings01, User01,
} from '@/components/icons/antIconCompat';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import {
    enquiriesApi,
    type EnquiryFormDto, type EnquiryRow, type EnquirySource, type EnquiryStats, type EnquiryStatus,
} from '@/lib/api/enquiries';

import { EnquiryPopup } from './EnquiryPopup';
import { EnquiryComposePopup } from './EnquiryComposePopup';
import { EnquiryFormPopup } from './EnquiryFormPopup';
import { ENQUIRY_STATUSES, enquiryWho, shortWhen, sourceLabel, statusDot, statusLabel } from './enquiryShared';

/**
 * ── ANFRAGEN (`/crm/enquiries`, 10.09.2026, Vorgabe Samet) ───────────────────
 *
 *   «Es wird Kunden geben und es wird Anfragen geben. Die Anfragen kann man von
 *    Hand anlegen. Es gibt ein Anfrageformular mit einem Link — den Link findet
 *    man auf der Seite, man kann ihn kopieren und per Mail verschicken. Und im
 *    Postfach gibt es den Bereich Anfragen; was ich dort hineinlege, ist die
 *    Mail eines Kunden, der meistens noch nicht im System steht.»
 *
 * DIE SEITE HAT DREI TEILE, VON OBEN NACH UNTEN:
 *   1. Der LINK des öffentlichen Formulars — sichtbar, kopierbar, verschickbar.
 *      Er steht ganz oben, weil er der Grund ist, warum hier überhaupt etwas
 *      hereinkommt.
 *   2. Die Reiter der STÄNDE mit ihren Zahlen (Neu / In Arbeit / …).
 *   3. Die LISTE: eine Zeile je Anfrage, Herkunftszeichen links, Betreff und
 *      Absender in der Mitte, Stand und Zeit rechts. Klick öffnet das Fenster.
 *
 * GESTALTUNG: `.ofi-crm-*` (index.css) auf den Kalender-Werten — weisse
 * Fläche, Haarlinien, EIN Akzent. Keine Tabelle mit Rahmen, keine bunten
 * Schilder: der Stand ist ein Punkt, ungelesen ist fettere Schrift.
 *
 * KEIN NACHLADEN BEIM TIPPEN: die Suche ist entprellt und der Server liefert
 * die fertige Seite (`{ data, total, totalPages }`).
 */

const PAGE_SIZE = 25;

/** Das Zeichen links in der Zeile — es sagt, WOHER die Anfrage kam. */
const SourceMark = ({ source }: { source: EnquirySource }) => {
    if (source === 'MAIL') return <Mail01 size={15} />;
    if (source === 'FORM') return <File05 size={15} />;
    return <User01 size={15} />;
};

export const EnquiriesPage = () => {
    const locale = i18n.resolvedLanguage || 'de';
    const [params, setParams] = useSearchParams();

    /* Der Stand steht in der ADRESSE: der Punkt am Menüeintrag und die
       Apps-Kachel springen auf `?status=NEW`, und ein geteilter Link zeigt
       dieselbe Auswahl. */
    const status = (params.get('status') || '') as EnquiryStatus | 'OPEN' | '';
    const setStatus = (next: EnquiryStatus | 'OPEN' | '') => {
        const search = new URLSearchParams(params);
        if (next) search.set('status', next);
        else search.delete('status');
        setParams(search, { replace: true });
    };

    const [source, setSource] = useState<EnquirySource | ''>('');
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [page, setPage] = useState(1);

    const [rows, setRows] = useState<EnquiryRow[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<EnquiryStats | null>(null);
    const [form, setForm] = useState<EnquiryFormDto | null>(null);
    const [copied, setCopied] = useState(false);

    const [openId, setOpenId] = useState<string | null>(params.get('id'));
    const [composing, setComposing] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const copyTimer = useRef<number | null>(null);

    useEffect(() => () => { if (copyTimer.current) window.clearTimeout(copyTimer.current); }, []);

    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(search.trim()), 250);
        return () => window.clearTimeout(id);
    }, [search]);
    useEffect(() => { setPage(1); }, [status, source, debounced]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const result = await enquiriesApi.list({
                status, source, search: debounced, page, pageSize: PAGE_SIZE,
            });
            setRows(result.data);
            setTotal(result.total);
            setTotalPages(result.totalPages);
        } catch {
            toast.error(t('crm.enquiry.loadError'));
        } finally {
            setLoading(false);
        }
    }, [status, source, debounced, page]);

    const loadStats = useCallback(() => {
        enquiriesApi.stats().then(setStats).catch(() => setStats(null));
    }, []);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { loadStats(); }, [loadStats]);

    /* Das Formular wird beim ersten Lesen serverseitig angelegt — hier steht
       darum immer ein Link, ohne dass jemand etwas erstellen muss. */
    useEffect(() => {
        enquiriesApi.form().then(setForm).catch(() => setForm(null));
    }, []);

    /** Die volle Adresse baut der BROWSER: der Server kennt seine Domain nicht. */
    const publicUrl = useMemo(
        () => (form ? `${window.location.origin}${form.path}` : ''),
        [form],
    );

    const copyLink = async () => {
        if (!publicUrl) return;
        try {
            await navigator.clipboard.writeText(publicUrl);
            setCopied(true);
            if (copyTimer.current) window.clearTimeout(copyTimer.current);
            copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error(t('crm.enquiry.copyError'));
        }
    };

    /* Verschicken heisst hier: das Mailprogramm mit fertigem Text öffnen. Eine
       eigene Sendemaske wäre ein zweites Postfach — den Link schickt man an
       eine Adresse, die man ohnehin gerade im Kopf hat. */
    const mailLink = () => {
        if (!publicUrl) return;
        const subject = encodeURIComponent(t('crm.enquiry.shareSubject'));
        const body = encodeURIComponent(`${t('crm.enquiry.shareBody')}\n\n${publicUrl}\n`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    };

    const openRow = (id: string) => {
        setOpenId(id);
        const next = new URLSearchParams(params);
        next.set('id', id);
        setParams(next, { replace: true });
    };
    const closeRow = () => {
        setOpenId(null);
        const next = new URLSearchParams(params);
        next.delete('id');
        setParams(next, { replace: true });
    };

    /** Nach jedem Schreiben: Liste und Zähler nachziehen, Fenster bleibt offen. */
    const afterChange = () => { void load(true); loadStats(); };

    const chips: Array<{ key: EnquiryStatus | 'OPEN' | ''; label: string; count?: number }> = useMemo(() => ([
        { key: '', label: t('crm.enquiry.filterAll'), count: stats?.total },
        { key: 'OPEN', label: t('crm.enquiry.filterOpen'), count: stats?.open },
        ...ENQUIRY_STATUSES.map((value) => ({
            key: value,
            label: statusLabel(value),
            count: stats?.byStatus?.[value],
        })),
    ]), [stats]);

    return (
        <div className="ofi-crm-page">
            <header className="ofi-crm-head">
                <div className="ofi-crm-head__title">
                    <h1>{t('nav.crmEnquiries')}</h1>
                    <span className="ofi-crm-head__count">{total}</span>
                </div>
                <div className="ofi-crm-head__actions">
                    <label className="ofi-crm-search">
                        <SearchLg size={15} />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('crm.enquiry.searchPlaceholder')}
                            aria-label={t('crm.enquiry.searchPlaceholder')}
                        />
                    </label>
                    <button type="button" className="ofi-crm-iconbtn" onClick={() => { void load(); loadStats(); }} title={t('common.refresh')}>
                        <RefreshCcw01 size={15} />
                    </button>
                    <button type="button" className="ofi-crm-btn is-primary" onClick={() => setComposing(true)}>
                        <Plus size={15} />
                        {t('crm.enquiry.new')}
                    </button>
                </div>
            </header>

            {/* DER LINK. Er steht ganz oben, weil er der Weg ist, auf dem die
                Anfragen hereinkommen — und weil man ihn sonst suchen müsste. */}
            {form && (
                <section className="ofi-crm-link">
                    <span className="ofi-crm-link__label">
                        <File05 size={14} />
                        {t('crm.enquiry.formLink')}
                    </span>
                    <code className="ofi-crm-link__url" title={publicUrl}>{publicUrl}</code>
                    {!form.active && <span className="ofi-crm-link__off">{t('crm.enquiry.formOff')}</span>}
                    <button type="button" className="ofi-crm-btn" onClick={() => void copyLink()}>
                        {copied ? <Check size={14} /> : <Copy01 size={14} />}
                        {copied ? t('common.copied') : t('common.copy')}
                    </button>
                    <button type="button" className="ofi-crm-btn" onClick={mailLink}>
                        <Send01 size={14} />
                        {t('crm.enquiry.sendByMail')}
                    </button>
                    <button type="button" className="ofi-crm-iconbtn" onClick={() => setFormOpen(true)} title={t('crm.enquiry.formSettings')}>
                        <Settings01 size={15} />
                    </button>
                </section>
            )}

            <div className="ofi-crm-filters">
                <div className="ofi-crm-chips">
                    {chips.map((chip) => (
                        <button
                            key={chip.key || 'all'}
                            type="button"
                            className={`ofi-crm-chip${status === chip.key ? ' is-on' : ''}`}
                            onClick={() => setStatus(chip.key)}
                        >
                            {chip.label}
                            {chip.count !== undefined && chip.count > 0 && (
                                <span className="ofi-crm-chip__n">{chip.count}</span>
                            )}
                        </button>
                    ))}
                </div>
                <select
                    className="ofi-crm-select"
                    value={source}
                    onChange={(event) => setSource(event.target.value as EnquirySource | '')}
                    aria-label={t('crm.enquiry.filterSource')}
                >
                    <option value="">{t('crm.enquiry.allSources')}</option>
                    <option value="FORM">{sourceLabel('FORM')}</option>
                    <option value="MAIL">{sourceLabel('MAIL')}</option>
                    <option value="MANUAL">{sourceLabel('MANUAL')}</option>
                </select>
            </div>

            <section className="ofi-crm-surface">
                {loading && (
                    <div className="ofi-crm-empty"><InlineLoading label={t('common.loading')} /></div>
                )}
                {!loading && rows.length === 0 && (
                    <div className="ofi-crm-empty">
                        <span className="ofi-crm-empty__title">{t('crm.enquiry.emptyTitle')}</span>
                        <span className="ofi-crm-empty__hint">{t('crm.enquiry.emptyHint')}</span>
                    </div>
                )}
                {!loading && rows.length > 0 && (
                    <div className="ofi-crm-list">
                        {rows.map((row) => (
                            <button
                                key={row.id}
                                type="button"
                                className={`ofi-crm-row${row.status === 'NEW' ? ' is-new' : ''}${openId === row.id ? ' is-selected' : ''}`}
                                onClick={() => openRow(row.id)}
                            >
                                <span className="ofi-crm-row__mark" aria-hidden>
                                    <SourceMark source={row.source} />
                                </span>
                                <span className="ofi-crm-row__main">
                                    <span className="ofi-crm-row__title">{row.subject}</span>
                                    <span className="ofi-crm-row__sub">
                                        <b>{enquiryWho(row)}</b>
                                        {row.email && (
                                            <>
                                                <span className="ofi-crm-row__dot">·</span>
                                                {row.email}
                                            </>
                                        )}
                                        {/* Steht ein Kunde dahinter, ist das die Ausnahme
                                            und darum erwähnenswert. */}
                                        {row.customer && (
                                            <>
                                                <span className="ofi-crm-row__dot">·</span>
                                                {row.customer.companyName}
                                            </>
                                        )}
                                    </span>
                                </span>
                                <span className="ofi-crm-row__side">
                                    <span className="ofi-crm-state" style={{ ['--dot' as string]: statusDot[row.status] }}>
                                        {statusLabel(row.status)}
                                    </span>
                                    <span className="ofi-crm-row__time">{shortWhen(row.createdAt, locale)}</span>
                                </span>
                            </button>
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

            <EnquiryPopup
                id={openId}
                onClose={closeRow}
                onChanged={afterChange}
                onDeleted={() => { closeRow(); afterChange(); }}
            />

            <EnquiryComposePopup
                open={composing}
                onClose={() => setComposing(false)}
                onCreated={(created) => { setComposing(false); afterChange(); openRow(created.id); }}
            />

            {form && (
                <EnquiryFormPopup
                    open={formOpen}
                    form={form}
                    url={publicUrl}
                    onClose={() => setFormOpen(false)}
                    onSaved={setForm}
                />
            )}
        </div>
    );
};

export default EnquiriesPage;
