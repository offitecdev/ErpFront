import { useState } from 'react';
import { toast } from 'sonner';
import { Check, XClose } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import type { LeaveRequestRow } from '../types/personnel';
import {
    formatDate,
    formatDateTime,
    fullName,
    leaveKindLabel,
    leaveStatusChipClass,
    leaveStatusLabel,
    leaveTypeLabel,
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

export interface LeaveDecisionCopy {
    /** Überschrift des Entscheidungsfensters (Vorgesetzter vs. Buchhaltung). */
    approveTitle: string;
    rejectTitle: string;
}

const DecisionSheet = ({
    request,
    decision,
    copy,
    onClose,
    onDone,
}: {
    request: LeaveRequestRow | null;
    decision: 'APPROVE' | 'REJECT';
    copy: LeaveDecisionCopy;
    onClose: () => void;
    onDone: () => void;
}) => {
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    if (!request) return null;

    const submit = async () => {
        setSaving(true);
        try {
            await personnelApi.decideLeave(request.id, decision, note.trim() || undefined);
            toast.success(decision === 'APPROVE' ? t('personnel.leave.approved') : t('personnel.leave.rejected'));
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
            title={decision === 'APPROVE' ? copy.approveTitle : copy.rejectTitle}
            subtitle={`${fullName(request.employee)} · ${leaveTypeLabel(request.leaveType, request.leaveTypeLabel)}`}
            width={600}
            height={480}
            footer={(
                <>
                    <GhostButton onClick={onClose} disabled={saving}>{t('common.cancel')}</GhostButton>
                    <PrimaryButton
                        onClick={() => void submit()}
                        disabled={saving}
                        className={decision === 'REJECT' ? '!bg-rose-600 hover:!bg-rose-700' : ''}
                    >
                        {saving ? t('common.loading') : decision === 'APPROVE' ? t('personnel.leave.approve') : t('personnel.leave.reject')}
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
                hint={decision === 'REJECT' ? t('personnel.leave.rejectNoteHint') : undefined}
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
    decisionCopy,
    onChanged,
    showRequester = true,
}: {
    rows: LeaveRequestRow[];
    loading: boolean;
    emptyText: string;
    decidable?: boolean;
    decisionCopy?: LeaveDecisionCopy;
    onChanged?: () => void;
    /** In „Meine Anträge" steht der Name nicht — man ist es ja selbst. */
    showRequester?: boolean;
}) => {
    const [pending, setPending] = useState<{ request: LeaveRequestRow; decision: 'APPROVE' | 'REJECT' } | null>(null);

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
                    return (
                        <article
                            key={request.id}
                            className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-white/15 dark:bg-transparent"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    {showRequester && (
                                        <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                                            {fullName(request.employee)}
                                        </p>
                                    )}
                                    <p className="text-[12.5px] font-medium text-slate-600 dark:text-white/70">
                                        {leaveTypeLabel(request.leaveType, request.leaveTypeLabel)}
                                        <span className="text-slate-400"> · {leaveKindLabel(request.kind)}</span>
                                    </p>
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

                            {decidable && open && decisionCopy && (
                                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
                                    <button
                                        type="button"
                                        onClick={() => setPending({ request, decision: 'APPROVE' })}
                                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-700"
                                    >
                                        <Check size={15} />
                                        {t('personnel.leave.approve')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPending({ request, decision: 'REJECT' })}
                                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-rose-200 px-3 py-2.5 text-[13px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-400/30 dark:hover:bg-rose-500/10"
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

            {pending && decisionCopy && (
                <DecisionSheet
                    request={pending.request}
                    decision={pending.decision}
                    copy={decisionCopy}
                    onClose={() => setPending(null)}
                    onDone={() => onChanged?.()}
                />
            )}
        </>
    );
};
