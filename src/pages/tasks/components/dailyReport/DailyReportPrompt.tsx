import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck, LuFileText, LuImage, LuX } from 'react-icons/lu';

import { useWhatsNewStore } from '@/components/updates/whatsNewStore';
import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { absoluteAttachmentUrl, tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import { useAuthStore } from '@/store/authStore';
import '@/styles/modules/tasksDailyReport.css';
import type { MyDailyReport, TaskAttachment } from '@/types/tasksModule';
import { emitTasksChanged } from '../../utils/taskEvents';
import { periodBounds, toDateKey } from '../reports/workReportModel';
import { DailyReportEditor, type DailyEditorHandle } from './DailyReportEditor';
import { DAILY_REPORT_OPEN_EVENT, takePendingDailyReportOpen } from './dailyReportEvents';
import { loadDailyReportWindow, resetDailyReportWindow, useDailyReportWindow, windowState } from './dailyReportWindow';

/**
 * ── GÜN SONU RAPORU ───────────────────────────────────────────────────────────
 *
 * 16.09.2026 (Samet): «Gün sonu raporları artık madde madde olmayacak — direkt
 * BEYAZ BİR SAYFA, orada istediğini yazacak, markdown olacak, görsel
 * ekleyebilecek; görseller ve pdf'ler eklenti olarak tıklanabilir url olarak
 * yer alacak.»
 *
 *   Uyarı     Mo–Fr ab Beginn: kleine Glaskarte oben rechts (Mitteilung);
 *             Klick öffnet das Fenster, × schiebt 15 Minuten auf, nach dem
 *             Ende verschwindet sie.
 *   Fenster   ein weisses Blatt, auf dem man IM BILD schreibt (Samet,
 *             16.09.2026: «ön izleme olmasın, direkt kalın yapsın, italik
 *             yapsın, görsel de öyle görünsün»): DailyReportEditor —
 *             Überschrift, fett, kursiv, Listen, Zitat, Link, Bild in der
 *             Leiste, Bilder stehen als Bild im Text. Gespeichert wird
 *             Markdown; im PDF werden Bilder und Dateien zu anklickbaren
 *             Adressen. Dateien kommen per Knopf, Strg+V oder Ziehen dazu.
 *   Zeiten    Beginn/Ende = Modül ayarları → Görev Yönetimi (dailyReportWindow.ts).
 *             Außerhalb des Fensters kann nichts gespeichert werden.
 *
 * Hängt am Rahmen (MainLayout), damit die Uyarı auf jeder Seite erscheint.
 */

const CHECK_MS = 30_000;
const SNOOZE_MS = 15 * 60_000;
const ERROR_RETRY_MS = 5 * 60_000;
/** Wie der Server (DAILY_REPORT_LIMITS.bodyChars). */
const BODY_MAX = 20_000;
const TASKS_PERMISSIONS = ['tasks.view', 'tasks.manage', 'tasks.delete'];
const K = 'tasksModule.dailyReport';

type Mark = { done?: boolean; snoozeUntil?: number };

const markKey = (userId: string, tenantId: string, date: string) => `offitec:daily-report:${userId}:${tenantId}:${date}`;

const readMark = (key: string): Mark => {
    try {
        return JSON.parse(localStorage.getItem(key) ?? '{}') as Mark;
    } catch {
        return {};
    }
};

const writeMark = (key: string, mark: Mark): void => {
    try {
        localStorage.setItem(key, JSON.stringify(mark));
    } catch {
        /* Privater Modus: dann fragt der Server beim nächsten Blick. */
    }
};

const dayRequest = (now: Date) => {
    const date = toDateKey(now);
    const day = periodBounds('day', date);
    const week = periodBounds('week', date);
    return { date, from: day.from.toISOString(), to: day.to.toISOString(), weekStart: toDateKey(week.from) };
};

const httpStatus = (error: unknown): number =>
    Number((error as { response?: { status?: unknown } })?.response?.status ?? 0);

export const DailyReportPrompt = () => {
    useLanguageTick();
    const userId = useAuthStore((state) => state.user?.id ?? '');
    const tenantId = useAuthStore((state) => state.selectedTenantId ?? '');
    const canUse = useAuthStore((state) => state.isAuthenticated
        && (state.isSystemAdmin || state.permissions.some((permission) => TASKS_PERMISSIONS.includes(permission))));
    const updateSheetOpen = useWhatsNewStore((state) => state.open);
    const win = useDailyReportWindow(canUse);

    const [notice, setNotice] = useState(false);
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<MyDailyReport | null>(null);
    const [request, setRequest] = useState<ReturnType<typeof dayRequest> | null>(null);
    const [body, setBody] = useState('');
    const [files, setFiles] = useState<TaskAttachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const busyRef = useRef(false);
    const blockedRef = useRef(false);
    const checkingRef = useRef(false);
    const retryAtRef = useRef(0);
    const editorRef = useRef<DailyEditorHandle | null>(null);
    const pickerRef = useRef<HTMLInputElement | null>(null);
    /** Das Schliessen nach «kaydedildi» — ein neues Öffnen bricht es ab. */
    const closeTimerRef = useRef(0);

    useEffect(() => { busyRef.current = open || notice; }, [open, notice]);
    // Andere Person oder Firma: neu entscheiden, Zeiten neu lesen.
    useEffect(() => {
        blockedRef.current = false;
        retryAtRef.current = 0;
        resetDailyReportWindow();
        setNotice(false);
    }, [userId, tenantId]);
    // Fenster vorbei: die Uyarı geht still weg.
    useEffect(() => {
        if (!win.isOpen) setNotice(false);
    }, [win.isOpen]);

    const load = useCallback(async (now: Date) => {
        const next = dayRequest(now);
        const result = await tasksApi.myDailyReport(next);
        setRequest(next);
        setData(result);
        setBody(result.report?.body ?? '');
        setFiles(result.report?.files ?? result.files ?? []);
        return result;
    }, []);

    const openWindow = useCallback(() => {
        window.clearTimeout(closeTimerRef.current);
        setNotice(false);
        setSaved(false);
        setError('');
        setOpen(true);
        setLoading(true);
        load(new Date())
            .catch((failure: unknown) => setError(tasksErrorMessage(failure)))
            .finally(() => setLoading(false));
    }, [load]);

    /* Die Uhr: alle 30 s und beim Zurückkehren in den Tab. */
    useEffect(() => {
        if (!canUse || !userId) return undefined;
        const check = async () => {
            if (busyRef.current || blockedRef.current || checkingRef.current || document.hidden) return;
            if (Date.now() < retryAtRef.current) return;
            checkingRef.current = true;
            try {
                const setting = await loadDailyReportWindow();
                const now = new Date();
                if (!windowState(now, setting).isOpen) return;
                const key = markKey(userId, tenantId, toDateKey(now));
                const mark = readMark(key);
                if (mark.done || (mark.snoozeUntil ?? 0) > Date.now()) return;
                const result = await tasksApi.myDailyReport(dayRequest(now));
                if (result.report) {
                    writeMark(key, { done: true });
                    return;
                }
                if (!busyRef.current) setNotice(true);
            } catch (failure) {
                const status = httpStatus(failure);
                // Kein Modul/kein Zugang: in dieser Sitzung nicht mehr fragen.
                if (status === 401 || status === 403 || status === 404) blockedRef.current = true;
                else retryAtRef.current = Date.now() + ERROR_RETRY_MS;
            } finally {
                checkingRef.current = false;
            }
        };
        void check();
        const id = window.setInterval(() => { void check(); }, CHECK_MS);
        const onVisible = () => { if (!document.hidden) void check(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [canUse, userId, tenantId]);

    /* Von Hand (Knopf im Görevler-Kopf, nur im Zeitfenster aktiv). Ein Klick, der
       kam, bevor dieses Fenster geladen war, liegt noch bereit und wird hier abgeholt. */
    const openRef = useRef(open);
    useEffect(() => { openRef.current = open; }, [open]);
    useEffect(() => {
        const onOpen = () => {
            takePendingDailyReportOpen();
            if (!openRef.current) openWindow();
        };
        window.addEventListener(DAILY_REPORT_OPEN_EVENT, onOpen);
        if (takePendingDailyReportOpen() && !openRef.current) openWindow();
        return () => window.removeEventListener(DAILY_REPORT_OPEN_EVENT, onOpen);
    }, [openWindow]);
    useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !saving) setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, saving]);

    if (updateSheetOpen && !open) return null;

    const range = { start: win.setting.promptTime, end: win.setting.endTime };

    const snooze = () => {
        const date = request?.date ?? toDateKey(new Date());
        if (!data?.report) writeMark(markKey(userId, tenantId, date), { snoozeUntil: Date.now() + SNOOZE_MS });
    };

    if (notice && !open) {
        return createPortal(
            <div className="ofi-dr-notice" role="status">
                <button type="button" className="ofi-dr-notice__main ofi-btn-plain ofi-nosize" onClick={openWindow}>
                    <span className="ofi-dr-notice__title">{t(`${K}.title`)}</span>
                    <span className="ofi-dr-notice__body">{t(`${K}.noticeBody`, range)}</span>
                </button>
                <button
                    type="button"
                    className="ofi-dr-notice__close ofi-btn-plain ofi-nosize"
                    aria-label={t('common.close')}
                    onClick={() => { snooze(); setNotice(false); }}
                >
                    <LuX size={12} strokeWidth={2.5} />
                </button>
            </div>,
            document.body,
        );
    }

    if (!open) return null;

    const canSave = win.canSave && Boolean(request);
    const date = request ? new Date(`${request.date}T12:00:00`) : new Date();
    const locale = i18n.language || undefined;
    const dateText = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
    const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const workWeek = (data?.week ?? []).slice(0, 5);
    const locked = saving || saved || !win.canSave;
    const hasContent = Boolean(body.trim()) || files.length > 0;

    const close = () => {
        snooze();
        setOpen(false);
    };

    /** Bild oder Verweis an der Schreibmarke einsetzen (nach dem Hochladen). */
    const insertFile = (file: TaskAttachment) => {
        const url = absoluteAttachmentUrl(file);
        const name = file.fileName.replace(/[<>&"]/g, ' ');
        editorRef.current?.insertHtml(file.isImage
            ? `<p><img src="${url}" alt="${name}"></p>`
            : `<p><a href="${url}" target="_blank" rel="noreferrer">${name}</a></p>`);
    };

    const upload = async (picked: File[]) => {
        if (!request || !picked.length || locked) return;
        setUploading(true);
        setError('');
        try {
            const created = await tasksApi.uploadDailyReportFiles(
                { date: request.date, from: request.from, to: request.to },
                picked,
            );
            setFiles((current) => [...current, ...created]);
            created.forEach(insertFile);
        } catch (failure) {
            setError(tasksErrorMessage(failure));
        } finally {
            setUploading(false);
        }
    };

    const removeFile = async (file: TaskAttachment) => {
        if (locked) return;
        setError('');
        try {
            await tasksApi.deleteAttachment(file.id);
            setFiles((current) => current.filter((entry) => entry.id !== file.id));
            // Die Datei ist weg: ihre Stelle im Blatt geht mit.
            const url = absoluteAttachmentUrl(file);
            const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            setBody((current) => current
                .replace(new RegExp(`!?\\[[^\\]]*\\]\\(${escaped}\\)\\n?`, 'g'), '')
                .replace(new RegExp(escaped, 'g'), ''));
        } catch (failure) {
            setError(tasksErrorMessage(failure));
        }
    };

    const onPick = (event: ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(event.target.files ?? []);
        event.target.value = '';
        void upload(picked);
    };

    const save = async () => {
        if (!request || !hasContent || saving || !canSave) return;
        setSaving(true);
        setError('');
        try {
            const report = await tasksApi.saveDailyReport({
                date: request.date,
                from: request.from,
                to: request.to,
                // Wie der Server (DAILY_REPORT_LIMITS.bodyChars) — lieber hier kürzen als dort.
                body: body.trim().slice(0, BODY_MAX),
            });
            writeMark(markKey(userId, tenantId, request.date), { done: true });
            setFiles(report.files);
            setData((current) => (current ? {
                ...current,
                report,
                files: report.files,
                week: current.week.map((day) => (day.date === report.date
                    ? { ...day, submitted: true, totalMs: report.totalMs }
                    : day)),
            } : current));
            setSaved(true);
            emitTasksChanged('task');
            closeTimerRef.current = window.setTimeout(() => setOpen(false), 1400);
        } catch (failure) {
            setError(tasksErrorMessage(failure));
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="ofi-dr-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) close(); }}>
            <section className="ofi-dr" role="dialog" aria-modal="true" aria-labelledby="ofi-dr-title">
                <header className="ofi-dr__head">
                    <div className="ofi-dr__heading">
                        <h2 id="ofi-dr-title">{t(`${K}.title`)}</h2>
                        <span>{dateText} · {range.start}–{range.end}</span>
                    </div>
                    <button type="button" className="ofi-dr__close ofi-btn-plain ofi-nosize" onClick={close} aria-label={t('common.close')}>
                        <LuX size={14} strokeWidth={2.5} />
                    </button>
                </header>

                {workWeek.length > 0 && (
                    <ol className="ofi-dr__week" aria-label={t(`${K}.thisWeek`)}>
                        {workWeek.map((day) => {
                            const dayDate = new Date(`${day.date}T12:00:00`);
                            const today = day.date === request?.date;
                            return (
                                <li key={day.date} className={`${day.submitted ? 'is-done' : ''} ${today ? 'is-today' : ''}`.trim()}>
                                    <span className="ofi-dr__week-day">{weekdayShort.format(dayDate)}</span>
                                    <span className="ofi-dr__week-mark" aria-hidden>
                                        {day.submitted ? <LuCheck size={13} strokeWidth={2.75} /> : dayDate.getDate()}
                                    </span>
                                    <span className="ofi-dr__sr">{day.submitted ? t(`${K}.submitted`) : t(`${K}.notSubmitted`)}</span>
                                </li>
                            );
                        })}
                    </ol>
                )}

                <div className="ofi-dr__bar">
                    <span className="ofi-dr__label-text">{t(`${K}.question`)}</span>
                </div>

                {loading && !data ? (
                    <div className="ofi-dr__editor"><p className="ofi-dr__paper-muted">{t(`${K}.loading`)}</p></div>
                ) : (
                    <DailyReportEditor
                        ref={editorRef}
                        markdown={data?.report?.body ?? ''}
                        docKey={`${request?.date ?? ''}:${data?.report?.submittedAt ?? 'new'}`}
                        disabled={locked}
                        busy={uploading}
                        placeholder={t(`${K}.placeholder`)}
                        onChange={setBody}
                        onFiles={(picked) => void upload(picked)}
                        onPickFiles={() => pickerRef.current?.click()}
                    />
                )}
                <input
                    ref={pickerRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                    className="ofi-dr__picker"
                    onChange={onPick}
                />

                {files.length > 0 && (
                    <ul className="ofi-dr__files" aria-label={t(`${K}.filesTitle`)}>
                        {files.map((file) => {
                            const url = absoluteAttachmentUrl(file);
                            return (
                                <li key={file.id}>
                                    {file.isImage ? <LuImage size={14} aria-hidden /> : <LuFileText size={14} aria-hidden />}
                                    <a href={url} target="_blank" rel="noreferrer">
                                        <span className="ofi-dr__file-name">{file.fileName}</span>
                                        <span className="ofi-dr__file-url">{url}</span>
                                    </a>
                                    <button
                                        type="button"
                                        className="ofi-dr__file-remove ofi-btn-plain ofi-nosize"
                                        aria-label={t('common.delete')}
                                        disabled={locked}
                                        onClick={() => void removeFile(file)}
                                    >
                                        <LuX size={12} strokeWidth={2.5} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <p className="ofi-dr__hint">{win.canSave ? t(`${K}.hint`) : t(`${K}.windowClosed`, range)}</p>

                {error && <div className="ofi-dr__error" role="alert">{error}</div>}

                <footer className="ofi-dr__actions">
                    {saved ? (
                        <div className="ofi-dr__saved" role="status"><LuCheck size={15} strokeWidth={2.75} />{t(`${K}.saved`)}</div>
                    ) : (
                        <>
                            <button type="button" className="ofi-dr__later ofi-btn-plain ofi-nosize" onClick={close} disabled={saving}>
                                {data?.report || !win.canSave ? t('common.close') : t(`${K}.later`)}
                            </button>
                            {win.canSave && (
                                <button type="button" className="ofi-dr__save ofi-btn-plain ofi-nosize" onClick={() => void save()} disabled={!hasContent || saving || !canSave}>
                                    {saving ? t(`${K}.saving`) : data?.report ? t(`${K}.update`) : t(`${K}.save`)}
                                </button>
                            )}
                        </>
                    )}
                </footer>
            </section>
        </div>,
        document.body,
    );
};
