import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LuCheck, LuChevronLeft, LuChevronRight, LuInbox, LuRefreshCw, LuSend, LuTrash2 } from 'react-icons/lu';

import { SearchLg } from '@/components/icons/antIconCompat';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { SectionSplash } from '@/components/ui-shared/SectionSplash';
import { MAIL_SENT_EVENT } from '@/components/mail/mailComposeBus';
import { t } from '@/i18n/translate';
import {
    mailApiError, mailCategoriesApi, mailMessagesApi, inboxApi,
    type InboxStatusDto, type MailCategoryDto, type MailMessageDetail, type MailMessageRow, type MailStatsDto,
} from '@/lib/api/mail';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { MailCategories } from './MailCategories';
import { EMPTY_MAIL_FILTERS, MailFilters, type MailFilterValue } from './MailFilters';
import { MailList } from './MailList';
import { MailReader } from './MailReader';
import { categoryLabel, type MailFolderKey } from './mailShared';

/* /crm/mail — das FIRMENPOSTFACH im ERP (18.08.2026; umgebaut 08.09.2026).
   Sieht aus wie das Kalender-Modul: weisse Fläche, Hairlines, graue
   Beschriftung, Marineblau als einziger Akzent (`--ofi-cal-*`-Tokens;
   Klassen `.ofi-mail-*` in index.css).

   LINKS die Leiste (Vorgabe 08.09.2026): Posteingang, Postausgang,
   Papierkorb — und darunter die KATEGORIEN (MailCategories): die persönliche
   Ordnung des Postfachs, angelegt über den runden +, gefüllt per Ziehen oder
   im Sammelmodus. Kein Schreiben-Knopf mehr (geantwortet wird aus der
   Nachricht), keine Postfach-Adresse.

   OBEN neben der Suche die FILTER (13.09.2026): Kunde, Personal, Projekt
   (MailFilters). Die Kategorie links ist die Ordnung von Hand, der Filter
   findet, was ohnehin zusammengehört — beides lässt sich verbinden.

   EIN POSTFACH JE FIRMA: die Seite zeigt dasselbe Postfach, gleich welcher
   Mandant gerade gewählt ist (der Server hängt Mail am Kopf des Firmenbaums
   auf). Ein Mandantenwechsel wechselt also nicht mehr die Post.

   Das Postfach führt ALLES der letzten zwei Monate (der Abruf übernimmt jede
   Nachricht, nicht mehr nur Post bekannter Adressen); GELÖSCHT wird in den
   Papierkorb, endgültig nur von dort. In der Mitte die Liste, rechts die
   geöffnete Nachricht. Anhänge bleiben auf dem Mailserver und werden auf
   Klick von dort geladen. */

/* 50 Nachrichten je Seite (Vorgabe 19.08.2026) — danach blättert der Zähler
   in der Kopfzeile weiter. Der Server deckelt bei 100. */
const PAGE_SIZE = 50;
/* Takt des selbsttätigen Abrufs, solange die Seite offen ist — derselbe wie
   der des Zeitgebers im Server (ImapCaptureService, TICK_MS). */
const AUTO_CAPTURE_MS = 3 * 60_000;

/** Was die Liste zeigt: einen Ordner oder eine Kategorie. */
type MailView = { kind: 'folder'; folder: MailFolderKey } | { kind: 'category'; id: string };

export const MailPage = () => {
    useLanguageTick();
    const [status, setStatus] = useState<InboxStatusDto | null>(null);
    const [stats, setStats] = useState<MailStatsDto | null>(null);
    const [view, setView] = useState<MailView>({ kind: 'folder', folder: 'inbox' });
    const [categories, setCategories] = useState<MailCategoryDto[]>([]);
    /** SAMMELMODUS: solange gesetzt, ordnet der Klick auf eine Zeile sie
        dieser Kategorie zu (Rand in deren Farbe) statt sie zu öffnen. */
    const [assignCategory, setAssignCategory] = useState<MailCategoryDto | null>(null);
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    /** Kunde / Personal / Projekt — die Filter über der Liste. */
    const [filters, setFilters] = useState<MailFilterValue>(EMPTY_MAIL_FILTERS);
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState<MailMessageRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<MailMessageDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    /** Nur der Papierkorb fragt nach — dort ist Löschen endgültig. */
    const [pendingDelete, setPendingDelete] = useState<MailMessageRow | MailMessageDetail | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    /* Ein Nachschlag-Zeitgeber für den Fall, dass der Abruf länger läuft, als
       der Server auf ihn wartet (siehe `capture`). */
    const followUp = useRef<number | null>(null);
    /* Der Abruf beim Öffnen läuft genau EINMAL je Seitenaufruf — nicht noch
       einmal, wenn der Zustand des Postfachs nachträglich hereinkommt. */
    const openedWithCapture = useRef(false);
    useEffect(() => () => { if (followUp.current) window.clearTimeout(followUp.current); }, []);

    const folder: MailFolderKey | 'category' = view.kind === 'folder' ? view.folder : 'category';
    const activeCategoryId = view.kind === 'category' ? view.id : null;

    const refreshStatus = useCallback(async () => {
        try { setStatus(await inboxApi.status()); } catch { /* Leiste zeigt dann "unbekannt" */ }
    }, []);
    const refreshStats = useCallback(async () => {
        try { setStats(await mailMessagesApi.stats()); } catch { /* Zähler bleiben leer */ }
    }, []);
    const refreshCategories = useCallback(async () => {
        try { setCategories((await mailCategoriesApi.list()).categories); } catch { /* Leiste bleibt, wie sie war */ }
    }, []);

    useEffect(() => { void refreshStatus(); void refreshStats(); void refreshCategories(); }, [refreshStatus, refreshStats, refreshCategories]);

    /* Suche entprellen. */
    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(search.trim()), 250);
        return () => window.clearTimeout(id);
    }, [search]);
    useEffect(() => { setPage(1); }, [view, debounced, filters]);

    const listQuery = useMemo(() => {
        const scope = {
            search: debounced || undefined,
            customerId: filters.customerId || undefined,
            employeeId: filters.employeeId || undefined,
            projectId: filters.projectId || undefined,
        };
        return view.kind === 'category'
            // Eine Kategorie zeigt BEIDE Richtungen — das Gespräch, nicht die Hälfte.
            ? { folder: 'all' as const, categoryId: view.id, ...scope }
            : { folder: view.folder, ...scope };
    }, [view, debounced, filters]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const result = await mailMessagesApi.list({ ...listQuery, page, pageSize: PAGE_SIZE });
            setRows(result.data);
            setTotal(result.total);
        } catch (error: unknown) {
            toast.error(mailApiError(error).message || t('mail.page.loadError'));
        } finally {
            setLoading(false);
        }
    }, [listQuery, page]);

    useEffect(() => { void load(); }, [load]);

    /**
     * DER ABRUF-KNOPF — er holt, was hinter dem Lesestand liegt; der Erstabruf
     * liest das ganze Fenster (zwei Monate) in Schüben, jeder Klick bzw. jeder
     * Takt den nächsten.
     */
    const capture = async () => {
        setSyncing(true);
        try {
            const next = await inboxApi.capture();
            setStatus(next);
            const summary = next.summary;
            if (summary?.error) toast.error(summary.error);
            else if (summary) toast.success(t('mail.mailbox.captureDone', { stored: summary.stored, examined: summary.examined }));
            else {
                /* Der Server wartet höchstens ~25 s auf den Durchgang und
                   antwortet dann ohne Bericht. Ohne diesen Zweig bliebe der
                   Klick stumm und die frisch geholte Post hätte niemand
                   nachgeladen. */
                toast.info(t('mail.mailbox.captureRunning'));
                if (followUp.current) window.clearTimeout(followUp.current);
                followUp.current = window.setTimeout(() => {
                    void refreshStatus(); void load(true); void refreshStats(); void refreshCategories();
                }, 20_000);
            }
            await Promise.all([load(true), refreshStats()]);
        } catch (error: unknown) {
            const code = mailApiError(error).code;
            toast.error(code === 'imap_missing'
                ? t('mail.mailbox.imapMissing')
                : (mailApiError(error).message || t('mail.mailbox.captureFailed')));
        } finally {
            setSyncing(false);
        }
    };

    /* VON SELBST ABRUFEN (Vorgabe 19.08.2026).

       BEIM ÖFFNEN DER SEITE genau das, was ein Druck auf «Abrufen» tut —
       derselbe Weg, also auch derselbe drehende Pfeil und dieselbe Meldung.

       DANACH alle drei Minuten, im selben Takt wie der Zeitgeber im Server
       (ImapCaptureService, TICK_MS), aber STILL. Der ERSTABRUF (zwei volle
       Monate) läuft in Schüben — jeder Durchgang holt das nächste Stück,
       bis das Fenster steht; der Server arbeitet auch ohne offene Seite
       weiter. */
    useEffect(() => {
        if (!status?.imapConfigured || !status.captureEnabled) return;
        let cancelled = false;
        if (!openedWithCapture.current) {
            openedWithCapture.current = true;
            void capture();
        }
        const pull = async () => {
            try {
                const next = await inboxApi.capture();
                if (cancelled) return;
                setStatus(next);
                await Promise.all([load(true), refreshStats(), refreshCategories()]);
            } catch { /* ein stummer Mailserver darf die Seite nicht stören */ }
        };
        const timer = window.setInterval(() => { void pull(); }, AUTO_CAPTURE_MS);
        return () => { cancelled = true; window.clearInterval(timer); };
        // Absichtlich nur an der Erreichbarkeit des Postfachs hängend: hätte
        // `load` hier zu suchen, startete jeder Klick den Abruf neu.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status?.imapConfigured, status?.captureEnabled]);

    /* Nach jedem Versand aus dem ERP nachladen. */
    useEffect(() => {
        const handler = () => { void load(true); void refreshStats(); };
        window.addEventListener(MAIL_SENT_EVENT, handler);
        return () => window.removeEventListener(MAIL_SENT_EVENT, handler);
    }, [load, refreshStats]);

    /* Detail laden. */
    useEffect(() => {
        if (!selectedId) { setDetail(null); return; }
        let cancelled = false;
        setDetailLoading(true);
        mailMessagesApi.get(selectedId)
            .then((data) => {
                if (cancelled) return;
                setDetail(data);
                // Gelesen-Punkt in der Liste sofort ausblenden.
                setRows((current) => current.map((row) => (row.id === data.id && !row.isRead ? { ...row, isRead: true } : row)));
                if (stats && !rows.find((r) => r.id === data.id)?.isRead) void refreshStats();
            })
            .catch(() => { if (!cancelled) toast.error(t('mail.page.detailError')); })
            .finally(() => { if (!cancelled) setDetailLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    const dropRowFromList = (id: string) => {
        setRows((current) => current.filter((row) => row.id !== id));
        setTotal((current) => Math.max(0, current - 1));
        if (rows.length === 1 && page > 1) setPage((current) => current - 1);
        if (selectedId === id) setSelectedId(null);
    };

    /** Löschen: erst in den PAPIERKORB (ohne Rückfrage — er ist das Netz);
        im Papierkorb selbst fragt der Dialog nach, dann ist es endgültig. */
    const removeMessage = async (item: MailMessageRow | MailMessageDetail) => {
        if (folder === 'bin') { setPendingDelete(item); return; }
        try {
            await mailMessagesApi.remove(item.id);
            dropRowFromList(item.id);
            toast.success(t('mail.page.movedToBin'));
            void refreshStats();
            void refreshCategories();
        } catch (error: unknown) {
            toast.error(mailApiError(error).message || t('mail.page.deleteFailed'));
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        try {
            await mailMessagesApi.remove(pendingDelete.id);
            dropRowFromList(pendingDelete.id);
            setPendingDelete(null);
            toast.success(t('mail.page.deletedForever'));
            void refreshStats();
        } catch (error: unknown) {
            toast.error(mailApiError(error).message || t('mail.page.deleteFailed'));
        } finally {
            setDeleting(false);
        }
    };

    const restoreMessage = async (item: MailMessageDetail) => {
        try {
            await mailMessagesApi.restore(item.id);
            dropRowFromList(item.id);
            toast.success(t('mail.page.restored'));
            void refreshStats();
            void refreshCategories();
        } catch (error: unknown) {
            toast.error(mailApiError(error).message || t('mail.page.restoreFailed'));
        }
    };

    const onLinked = (next: MailMessageDetail) => {
        setDetail(next);
        setRows((current) => current.map((row) => (row.id === next.id
            ? { ...row, customer: next.customer, contact: next.contact, matchSource: next.matchSource }
            : row)));
        void refreshStats();
    };

    /* ── Kategorien: zuordnen (Ziehen + Sammelmodus), ordnen, pflegen ────── */

    /** Zähler der Leiste im Zustand mitführen — kein Neuladen je Klick. */
    const bumpCounts = (fromId: string | null, toId: string | null) => {
        setCategories((current) => current.map((category) => {
            if (category.id === fromId) return { ...category, count: Math.max(0, category.count - 1) };
            if (category.id === toId) return { ...category, count: category.count + 1 };
            return category;
        }));
    };

    /* Zuordnen und HERAUSNEHMEN (categoryId null) über die Nachricht selbst —
       nicht über die Listenzeile: aus dem Lesebereich heraus kann die geöffnete
       Nachricht längst aus der geladenen Seite gefallen sein. */
    const assignMail = async (mailId: string, previous: string | null, category: MailCategoryDto | null): Promise<boolean> => {
        const nextId = category?.id ?? null;
        if (previous === nextId) return false;
        try {
            await mailMessagesApi.assign([mailId], nextId);
            bumpCounts(previous, nextId);
            const lite = category ? { id: category.id, name: categoryLabel(category), color: category.color } : null;
            setRows((current) => current.map((entry) => (entry.id === mailId ? { ...entry, category: lite } : entry)));
            setDetail((current) => (current && current.id === mailId ? { ...current, category: lite } : current));
            // In der Kategorie-Ansicht fällt eine herausgenommene Zeile aus der Liste.
            if (view.kind === 'category' && nextId !== view.id) dropRowFromList(mailId);
            return true;
        } catch (error: unknown) {
            toast.error(mailApiError(error).message || t('mail.categories.assignFailed'));
            return false;
        }
    };

    const assignRow = (row: MailMessageRow, category: MailCategoryDto | null) =>
        assignMail(row.id, row.category?.id ?? null, category);

    /** Aus dem Lesebereich: die geöffnete Nachricht aus ihrer Kategorie nehmen. */
    const unassignOpenMail = async () => {
        if (!detail?.category) return;
        const name = detail.category.name;
        if (await assignMail(detail.id, detail.category.id, null)) {
            toast.success(t('mail.categories.unassigned', { name }));
        }
    };

    /** Sammelmodus: Klick = zuordnen, zweiter Klick = herausnehmen. */
    const toggleAssign = (row: MailMessageRow) => {
        if (!assignCategory) return;
        void assignRow(row, row.category?.id === assignCategory.id ? null : assignCategory);
    };

    const dropMailOnCategory = (categoryId: string, mailId: string) => {
        const row = rows.find((entry) => entry.id === mailId);
        const category = categories.find((entry) => entry.id === categoryId);
        if (!row || !category) return;
        void assignRow(row, category);
    };

    const reorderCategories = (ids: string[]) => {
        // Sofort so zeigen, wie gezogen wurde — der Server bestätigt still.
        setCategories((current) => {
            const byId = new Map(current.map((category) => [category.id, category]));
            return ids.map((id) => byId.get(id)).filter(Boolean) as MailCategoryDto[];
        });
        mailCategoriesApi.reorder(ids).catch(() => { void refreshCategories(); });
    };

    const selectCategory = (category: MailCategoryDto) => {
        setAssignCategory(null);
        setSelectedId(null);
        setView({ kind: 'category', id: category.id });
    };

    const selectFolder = (key: MailFolderKey) => {
        setAssignCategory(null);
        setSelectedId(null);
        setView({ kind: 'folder', folder: key });
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    /* «1/5», «2/5» (Vorgabe 19.08.2026): die Seite und wie viele es sind. Wie
       viele Nachrichten dahinterstehen, verrät der Titel des Zählers. */
    const pageLabel = total === 0 ? '0/0' : `${page}/${totalPages}`;
    const pageTitle = `${total} ${t('mail.page.messages')}`;

    /* Posteingang, Postausgang, Papierkorb — dazu unten die Kategorien
       (Vorgabe 08.09.2026: «links Posteingang, Postausgang und die übrigen
       Kategorien», kein Schreiben-Knopf, keine Postfach-Adresse). */
    const folders = useMemo(() => ([
        { key: 'inbox' as const, label: t('mail.folders.inbox'), icon: <LuInbox size={16} />, count: stats?.unreadInbox || 0, emphasize: true },
        { key: 'sent' as const, label: t('mail.folders.outbox'), icon: <LuSend size={16} />, count: 0, emphasize: false },
        { key: 'bin' as const, label: t('mail.folders.bin'), icon: <LuTrash2 size={16} />, count: stats?.bin || 0, emphasize: false },
    ]), [stats]);

    return (
        <div className="ofi-mail-page">
            <SectionSplash scope="mail" loading={loading} />
            <header className="ofi-cal-topbar ofi-mail-topbar">
                <label className="ofi-cal-search ofi-mail-search">
                    <SearchLg size={14} className="shrink-0 text-slate-400" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('mail.page.searchPlaceholder')} />
                    {search && <button type="button" className="ofi-mail-search__clear" onClick={() => setSearch('')} aria-label={t('common.reset')}>×</button>}
                </label>
                {/* Die Filter stehen NEBEN der Suche — Vorgabe 13.09.2026. */}
                <MailFilters value={filters} onChange={setFilters} />
                <div className="ofi-mail-toolbar">
                    {status?.imapConfigured && (
                        <button type="button" className="ofi-cal-todaybtn ofi-mail-syncbtn" onClick={() => void capture()} disabled={syncing || status.running}>
                            <LuRefreshCw size={14} className={syncing || status.running ? 'ofi-mail-spin' : ''} />
                            {syncing || status.running ? t('mail.mailbox.capturing') : t('mail.mailbox.captureNow')}
                        </button>
                    )}
                    <div className="ofi-cal-viewgroup ofi-mail-pager">
                        <button type="button" aria-label={t('common.back')} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><LuChevronLeft size={16} /></button>
                        <span className="ofi-mail-pager__label" title={pageTitle} aria-label={`${t('mail.page.pageLabel')} ${pageLabel}`}>{pageLabel}</span>
                        <button type="button" aria-label={t('common.next')} disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><LuChevronRight size={16} /></button>
                    </div>
                </div>
            </header>

            <div className="ofi-mail-body">
                <aside className="ofi-mail-rail">
                    <nav className="ofi-mail-folders">
                        {folders.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                className={`ofi-mail-folder ${view.kind === 'folder' && view.folder === item.key ? 'is-active' : ''} ${item.emphasize && item.count > 0 ? 'has-unread' : ''}`}
                                onClick={() => selectFolder(item.key)}
                            >
                                <span className="ofi-mail-folder__icon">{item.icon}</span>
                                <span className="ofi-mail-folder__label">{item.label}</span>
                                {item.count > 0 && <span className="ofi-mail-folder__count">{item.count}</span>}
                            </button>
                        ))}
                    </nav>
                    <MailCategories
                        categories={categories}
                        activeId={activeCategoryId}
                        assignCategoryId={assignCategory?.id ?? null}
                        onSelect={selectCategory}
                        onReorder={reorderCategories}
                        onDropMail={dropMailOnCategory}
                        onStartAssign={(category) => { setSelectedId(null); setAssignCategory(category); }}
                        onCreated={(category) => { setCategories((current) => [...current, category]); }}
                        onDeleted={(id) => {
                            setCategories((current) => current.filter((category) => category.id !== id));
                            setRows((current) => current.map((row) => (row.category?.id === id ? { ...row, category: null } : row)));
                            if (assignCategory?.id === id) setAssignCategory(null);
                            if (view.kind === 'category' && view.id === id) selectFolder('inbox');
                        }}
                    />
                </aside>

                <section className="ofi-mail-split">
                    <div className="ofi-mail-listwrap">
                        {/* Der Sammelmodus-Balken — in der Farbe der Kategorie,
                            bis «Hinzufügen abschliessen» gedrückt wird. */}
                        {assignCategory && (
                            <div className="ofi-mail-assignbar" style={{ ['--ofi-cat-color' as string]: assignCategory.color }}>
                                <span className="ofi-mail-assignbar__dot" style={{ background: assignCategory.color }} />
                                <span className="ofi-mail-assignbar__text">
                                    <b>{t('mail.categories.assignTitle', { name: categoryLabel(assignCategory) })}</b>
                                    <span>{t('mail.categories.assignHint')}</span>
                                </span>
                                <button type="button" className="ofi-cal-btn is-primary ofi-mail-assignbar__done" onClick={() => setAssignCategory(null)}>
                                    <LuCheck size={14} />
                                    {t('mail.categories.assignDone')}
                                </button>
                            </div>
                        )}
                        <MailList
                            rows={rows}
                            loading={loading}
                            folder={folder}
                            selectedId={selectedId}
                            connected={Boolean(status?.imapConfigured && status?.captureEnabled)}
                            configured={Boolean(status?.imapConfigured)}
                            assignCategory={assignCategory}
                            onSelect={setSelectedId}
                            onToggleAssign={toggleAssign}
                        />
                    </div>
                    <MailReader
                        detail={detail}
                        loading={detailLoading}
                        onClose={() => setSelectedId(null)}
                        onLinked={onLinked}
                        onDelete={(item) => void removeMessage(item)}
                        onRestore={folder === 'bin' ? (item) => void restoreMessage(item) : undefined}
                        onUnassignCategory={() => void unassignOpenMail()}
                    />
                </section>
            </div>

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('mail.page.deleteForeverTitle')}
                message={t('mail.page.deleteForeverHint')}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
};

export default MailPage;
