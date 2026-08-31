import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, XClose } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import type { LeaveRequestRow } from '../types/personnel';
import { requestTypeOf } from '../utils/personnel';
import {
    formatDate,
    formatDateTime,
    fullName,
    leaveStatusChipClass,
    leaveStatusLabel,
    leaveTypeLabel,
    requestTypeChipClass,
} from '../utils/format';
import { PersonnelSheet } from './PersonnelSheet';
import { Chip, GhostButton, Labelled, PrimaryButton } from './primitives';

/**
 * ── ANTRAGSLISTE (KARTEN, NICHT TABELLE) ─────────────────────────────────────
 *
 * Anträge werden auf dem TELEFON gelesen und entschieden (Vorgabe: „Mobile
 * Tauglichkeit ist wichtig"). Eine Tabelle mit acht Spalten wäre dort entweder
 * unlesbar oder eine Seitwärtsrutschbahn — deshalb je Antrag eine Karte, die auf
 * schmalen Bildschirmen untereinander steht und auf breiten in zwei Spalten.
 *
 * `decidable`: nur wo die anmeldende Person AUCH zuständig ist, erscheinen die
 * beiden Knöpfe. Die Zuständigkeit selbst prüft der Server noch einmal — hier
 * geht es nur darum, niemandem einen Knopf zu zeigen, der ohnehin abgewiesen
 * würde.
 */

/**
 * ── DER VERMERK GEHÖRT ZUR ABLEHNUNG, NICHT ZUR FREIGABE (28.08.2026) ────────
 *
 *   «Beim Freigeben durch Vorgesetzte oder die Buchhaltung soll keine
 *    Bemerkung nötig sein.»
 *
 * Ein Ja ist eine Zustimmung — es braucht keine Begründung und wird deshalb
 * direkt auf der Karte gegeben, mit EINEM Druck. Ein Nein dagegen muss die
 * antragstellende Person verstehen können; nur die Ablehnung öffnet daher noch
 * ein Fenster und fragt nach dem Grund.
 */

/** Ein Ja des Vorgesetzten SCHLIESST einen Urlaubsantrag nicht ab, es reicht
    ihn an den Purser weiter — und das muss auf dem Knopf stehen, sonst glaubt
    die freigebende Person, sie hätte den Urlaub bewilligt. Homeoffice und die
    Purser-Stufe selbst sind mit dem Ja fertig. */
const forwardsToPurser = (request: LeaveRequestRow) =>
    request.kind === 'LEAVE' && request.status === 'PENDING_MANAGER';

const RejectSheet = ({
    request,
    onClose,
    onDone,
}: {
    request: LeaveRequestRow | null;
    onClose: () => void;
    onDone: () => void;
}) => {
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    if (!request) return null;

    const submit = async () => {
        setSaving(true);
        try {
            await personnelApi.decideLeave(request.id, 'REJECT', note.trim() || undefined);
            toast.success(t('personnel.leave.rejected'));
            setNote('');
            onDone();
            onClose();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('personnel.leave.decisionFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PersonnelSheet
            open
            onClose={onClose}
            title={t('personnel.approvals.rejectTitle')}
            subtitle={`${fullName(request.employee)} · ${leaveTypeLabel(request.leaveType, request.leaveTypeLabel)}`}
            width={600}
            height={440}
            footer={(
                <>
                    <GhostButton onClick={onClose} disabled={saving}>{t('common.cancel')}</GhostButton>
                    <PrimaryButton
                        onClick={() => void submit()}
                        disabled={saving}
                        className="!bg-rose-600 hover:!bg-rose-700"
                    >
                        {saving ? t('common.loading') : t('personnel.leave.reject')}
                    </PrimaryButton>
                </>
            )}
        >
            <dl className="mb-4 space-y-2 rounded-xl border border-slate-200 p-4 text-[12.5px] dark:border-white/15">
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-white/60">{t('personnel.pdf.period')}</dt>
                    <dd className="font-mono text-slate-800 dark:text-white">
                        {formatDate(request.startDate)} – {formatDate(request.endDate)}
                    </dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-500 dark:text-white/60">{t('personnel.field.days')}</dt>
                    <dd className="font-mono text-slate-800 dark:text-white">{request.totalDays}</dd>
                </div>
                {request.note && (
                    <div>
                        <dt className="text-slate-500 dark:text-white/60">{t('personnel.field.note')}</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-slate-800 dark:text-white">{request.note}</dd>
                    </div>
                )}
            </dl>

            <Labelled
                label={t('personnel.leave.decisionNote')}
                hint={t('personnel.leave.rejectNoteHint')}
            >
                <textarea
                    rows={4}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[13.5px] text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-[#1f2654] dark:border-white/15 dark:bg-transparent dark:text-white"
                />
            </Labelled>
        </PersonnelSheet>
    );
};

export const LeaveList = ({
    rows,
    loading,
    emptyText,
    decidable = false,
    onChanged,
    showRequester = true,
    focusId = '',
}: {
    rows: LeaveRequestRow[];
    loading: boolean;
    emptyText: string;
    decidable?: boolean;
    onChanged?: () => void;
    /** In „Meine Anträge" steht der Name nicht — man ist es ja selbst. */
    showRequester?: boolean;
    /** Der Antrag aus einer Meldung: hervorgehoben und ins Bild gerollt. */
    focusId?: string;
}) => {
    const [rejecting, setRejecting] = useState<LeaveRequestRow | null>(null);
    /* Welche Karte gerade auf die Antwort des Servers wartet: ihre Knöpfe
       stehen so lange still, damit ein zweiter Druck dieselbe Entscheidung
       nicht ein zweites Mal sendet. */
    const [approvingId, setApprovingId] = useState('');
    const focusRef = useRef<HTMLElement | null>(null);

    /* Die Meldung führt auf die Seite, nicht auf die Karte — ohne diesen
       Sprung stünde der gemeinte Antrag irgendwo weiter unten in der Liste.
       `block: 'center'` statt 'start': am oberen Rand klebte die Karte unter
       dem Kopfband. */
    useEffect(() => {
        if (!focusId) return;
        focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [focusId, rows]);

    /* Freigeben ohne Fenster: ein Druck, ein Aufruf, fertig. Der Server
       prüft die Zuständigkeit noch einmal — hier geht es nur darum, dass
       niemand für ein Ja ein Formular ausfüllen muss. */
    const approve = async (request: LeaveRequestRow) => {
        if (approvingId) return;
        setApprovingId(request.id);
        try {
            await personnelApi.decideLeave(request.id, 'APPROVE');
            toast.success(forwardsToPurser(request)
                ? t('personnel.leave.forwarded')
                : t('personnel.leave.approved'));
            onChanged?.();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('personnel.leave.decisionFailed'));
        } finally {
            setApprovingId('');
        }
    };

    if (loading) {
        return (
            <div className="grid gap-3 sm:grid-cols-2">
                {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="ofi-shimmer h-32 rounded-xl border border-slate-200 dark:border-white/15" />
                ))}
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center text-[13px] text-slate-400 dark:border-white/20 dark:text-white/50">
                {emptyText}
            </div>
        );
    }

    return (
        <>
            <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((request) => {
                    // Entschieden wird nur, was noch offen ist — abgeschlossene
                    // Anträge zeigen ihren Verlauf, aber keine Knöpfe.
                    const open = request.status === 'PENDING_MANAGER' || request.status === 'PENDING_ACCOUNTING';
                    const type = requestTypeOf(request.kind, request.leaveType);
                    /* Der Antrag, auf den eine Meldung zeigt: er bekommt einen
                       Rahmen in der Hausfarbe, wird aber nicht allein gezeigt —
                       wer aus der Meldung kommt, will ihn im Zusammenhang sehen. */
                    const focused = Boolean(focusId) && request.id === focusId;
                    const busy = approvingId === request.id;
                    return (
                        <article
                            key={request.id}
                            ref={focused ? focusRef : undefined}
                            className={`flex flex-col rounded-xl border bg-white p-4 dark:bg-transparent ${
                                focused
                                    ? 'border-[#272f67] ring-2 ring-[#272f67]/15 dark:border-[#e6cf9e] dark:ring-[#e6cf9e]/20'
                                    : 'border-slate-200 dark:border-white/15'
                            }`}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    {showRequester && (
                                        <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                                            {fullName(request.employee)}
                                        </p>
                                    )}
                                    {/* Die ART trägt die Karte — sie ist das, wonach die
                                        Seite filtert, und die genaue Urlaubsart steht als
                                        Erläuterung daneben, nicht statt ihrer. */}
                                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                        <Chip className={requestTypeChipClass(type)}>
                                            {t(`personnel.requestType.${type}`)}
                                        </Chip>
                                        <span className="truncate text-[12.5px] font-medium text-slate-600 dark:text-white/70">
                                            {leaveTypeLabel(request.leaveType, request.leaveTypeLabel)}
                                        </span>
                                    </div>
                                </div>
                                <Chip className={leaveStatusChipClass(request.status)}>{leaveStatusLabel(request.status)}</Chip>
                            </div>

                            <p className="mt-2 font-mono text-[12.5px] text-slate-700 dark:text-white/80">
                                {formatDate(request.startDate)} – {formatDate(request.endDate)}
                                <span className="text-slate-400"> · {t('personnel.leaveFlag.days', { count: request.totalDays })}</span>
                            </p>

                            {request.note && (
                                <p className="mt-2 whitespace-pre-wrap text-[12.5px] text-slate-600 dark:text-white/70">{request.note}</p>
                            )}

                            {/* Der Weg des Antrags — wer wann was entschieden hat. */}
                            <ul className="mt-3 space-y-1 text-[11.5px] text-slate-400 dark:text-white/45">
                                <li>{t('personnel.leave.submittedAt', { value: formatDateTime(request.createdAt) })}</li>
                                <li>
                                    {t('personnel.leave.approverLine', {
                                        name: fullName(request.approver),
                                        value: request.managerDecisionAt ? formatDateTime(request.managerDecisionAt) : t('personnel.leave.pending'),
                                    })}
                                </li>
                                {request.kind === 'LEAVE' && (
                                    <li>
                                        {t('personnel.leave.accountingLine', {
                                            name: request.accountant ? fullName(request.accountant) : t('personnel.leave.accountingTeam'),
                                            value: request.accountingDecisionAt ? formatDateTime(request.accountingDecisionAt) : t('personnel.leave.pending'),
                                        })}
                                    </li>
                                )}
                                {request.managerNote && <li>“{request.managerNote}”</li>}
                                {request.accountingNote && <li>“{request.accountingNote}”</li>}
                            </ul>

                            {decidable && open && (
                                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
                                    <button
                                        type="button"
                                        onClick={() => void approve(request)}
                                        disabled={busy}
                                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <Check size={15} />
                                        {busy
                                            ? t('common.loading')
                                            : forwardsToPurser(request)
                                                ? t('personnel.leave.approveForward')
                                                : t('personnel.leave.approve')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRejecting(request)}
                                        disabled={busy}
                                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-rose-200 px-3 py-2.5 text-[13px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-400/30 dark:hover:bg-rose-500/10"
                                    >
                                        <XClose size={15} />
                                        {t('personnel.leave.reject')}
                                    </button>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>

            {rejecting && (
                <RejectSheet
                    request={rejecting}
                    onClose={() => setRejecting(null)}
                    onDone={() => onChanged?.()}
                />
            )}
        </>
    );
};
