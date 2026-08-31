import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import type { LeaveFlag, WorkLocation } from '../types/personnel';
import { formatDate, leaveKindLabel, leaveStatusChipClass, leaveStatusLabel, leaveTypeLabel, workLocationLabel } from '../utils/format';
import { PersonnelSheet } from './PersonnelSheet';
import { Chip } from './primitives';

/**
 * ── DAS AUSRUFEZEICHEN NEBEN DEM NAMEN ───────────────────────────────────────
 *
 * Steht im Detail- UND im Buchhaltungsbericht (Vorgabe). Es sagt: „An dieser
 * Person hängt etwas, das die Zahlen daneben erklärt." Das ist zweierlei:
 *
 *   • eine Abwesenheit im gewählten Zeitraum (Urlaub, Krankheit, Kurzabsenz)
 *   • ein Homeoffice-Antrag ODER dauerhaftes Homeoffice — wer dauerhaft von zu
 *     Hause arbeitet, hat KEINE Stempelungen, und ohne diesen Hinweis läse sich
 *     seine Zeile wie ein Rückstand.
 *
 * Ein Druck darauf öffnet die Einzelheiten. Dort lässt sich das dauerhafte
 * Homeoffice auch umschalten (nur mit Personalverwaltungsrecht) — genau hier
 * fragt man danach, wenn einem die Zeile im Bericht auffällt.
 *
 * Gibt es weder Abwesenheit noch Homeoffice, wird gar nichts gezeichnet: ein
 * grauer Platzhalter in jeder Zeile machte die Tabelle nur unruhiger.
 */
export const LeaveFlagButton = ({
    flags,
    personName,
    employeeId,
    workLocation,
    onWorkLocationChanged,
}: {
    flags: LeaveFlag[];
    personName: string;
    /** Ohne id lässt sich der Arbeitsort nicht umstellen (nur Anzeige). */
    employeeId?: string;
    workLocation?: WorkLocation;
    onWorkLocationChanged?: (employeeId: string, next: WorkLocation) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const permissions = useAuthStore((state) => state.permissions);
    const canEditLocation = permissions.includes('employees.update');

    const permanentRemote = workLocation === 'REMOTE';
    if (!flags.length && !permanentRemote) return null;

    const toggleRemote = async () => {
        if (!employeeId) return;
        const next: WorkLocation = permanentRemote ? 'OFFICE' : 'REMOTE';
        setSaving(true);
        try {
            await personnelApi.setStaffRole(employeeId, { workLocation: next });
            onWorkLocationChanged?.(employeeId, next);
            toast.success(t('personnel.leaveFlag.locationSaved'));
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('personnel.leaveFlag.locationFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={(event) => { event.stopPropagation(); setOpen(true); }}
                aria-label={t('personnel.leaveFlag.aria', { count: flags.length, name: personName })}
                title={permanentRemote && !flags.length
                    ? t('personnel.leaveFlag.remoteTooltip')
                    : t('personnel.leaveFlag.tooltip', { count: flags.length })}
                className={`ml-1.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                    permanentRemote && !flags.length
                        ? 'bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-400/20 dark:text-violet-300'
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-400/20 dark:text-amber-300'
                }`}
            >
                <AlertTriangle size={12} />
            </button>

            <PersonnelSheet
                open={open}
                onClose={() => setOpen(false)}
                title={t('personnel.leaveFlag.title')}
                subtitle={personName}
                width={720}
                height={580}
                closeOnBackdrop
            >
                {/* Dauerhaftes Homeoffice — Zustand und Schalter in einem Block. */}
                {(permanentRemote || (canEditLocation && employeeId)) && (
                    <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-400/30 dark:bg-violet-500/10">
                        <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-violet-900 dark:text-violet-200">
                                {t('personnel.leaveFlag.permanentRemoteTitle')}
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-violet-700/80 dark:text-violet-300/80">
                                {permanentRemote
                                    ? t('personnel.leaveFlag.permanentRemoteOn')
                                    : t('personnel.leaveFlag.permanentRemoteOff')}
                            </p>
                        </div>
                        {canEditLocation && employeeId ? (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => void toggleRemote()}
                                className="shrink-0 rounded-md border border-violet-300 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-violet-800 transition-colors hover:bg-violet-100 disabled:opacity-40 dark:border-violet-400/40 dark:bg-transparent dark:text-violet-200"
                            >
                                {saving
                                    ? t('common.loading')
                                    : permanentRemote
                                        ? t('personnel.leaveFlag.switchToOffice')
                                        : t('personnel.leaveFlag.switchToRemote')}
                            </button>
                        ) : (
                            <Chip className="bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-400/30">
                                {workLocationLabel(workLocation ?? 'OFFICE')}
                            </Chip>
                        )}
                    </section>
                )}

                {flags.length === 0 ? (
                    <p className="py-8 text-center text-[13px] text-slate-400 dark:text-white/45">
                        {t('personnel.leaveFlag.noRequests')}
                    </p>
                ) : (
                    <ul className="space-y-2.5">
                        {flags.map((flag) => (
                            <li key={flag.id} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-white/15">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[13.5px] font-semibold text-slate-800 dark:text-white">
                                        {leaveTypeLabel(flag.leaveType, flag.leaveTypeLabel)}
                                    </span>
                                    <Chip className={leaveStatusChipClass(flag.status)}>{leaveStatusLabel(flag.status)}</Chip>
                                </div>
                                <p className="mt-1 text-[12.5px] text-slate-500 dark:text-white/60">
                                    {formatDate(flag.startDate)} – {formatDate(flag.endDate)}
                                    {' · '}
                                    {t('personnel.leaveFlag.days', { count: flag.totalDays })}
                                    {' · '}
                                    {leaveKindLabel(flag.kind)}
                                </p>
                                {flag.note && (
                                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-slate-600 dark:text-white/70">
                                        {flag.note}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </PersonnelSheet>
        </>
    );
};
