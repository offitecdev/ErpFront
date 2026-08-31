import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import type { ReportDay } from '../types/personnel';
import {
    formatDate,
    formatHoursMinutes,
    formatTime,
    fullName,
    sourceLabel,
    toInputDateTime,
} from '../utils/format';
import { PersonnelSheet } from './PersonnelSheet';
import { CELL_INPUT_CLASS, GhostButton, PrimaryButton } from './primitives';

/**
 * ── EINEN TAG KORRIGIEREN ────────────────────────────────────────────────────
 *
 * Der Detailbericht führt seit dem 16.08.2026 EINE Zeile je Person und Tag —
 * die einzelnen Stempelungen stecken darin. Korrigiert wird aber weiterhin die
 * einzelne Stempelung, denn nur sie ist gespeichert. Deshalb listet dieses
 * Fenster die Fenster des Tages untereinander auf: Kommen, Gehen, und dazwischen
 * die Pause, die aus der Lücke entsteht.
 *
 * Gespeichert wird ZEILENWEISE (je Fenster ein Aufruf) und erst auf Knopfdruck:
 * ein Tag mit drei Fenstern soll nicht drei Serverwege kosten, während jemand
 * noch tippt.
 *
 * ABGELEITETE Homeoffice-Fenster haben keine gespeicherte Zeile (`id === null`)
 * und werden nur angezeigt — es gibt nichts zu ändern.
 */

interface DraftSegment {
    id: string | null;
    startedAt: string;
    endedAt: string;
    source: string;
    synthetic: boolean;
    /** Zum Löschen vorgemerkt — verschwindet erst beim Speichern. */
    removed: boolean;
    /** Ausgangswerte, um unveränderte Zeilen gar nicht erst zu senden. */
    originalStartedAt: string;
    originalEndedAt: string;
}

const toDraft = (day: ReportDay): DraftSegment[] =>
    day.segments.map((segment) => ({
        id: segment.id,
        startedAt: toInputDateTime(segment.startedAt),
        endedAt: toInputDateTime(segment.endedAt),
        source: segment.source,
        synthetic: segment.synthetic,
        removed: false,
        originalStartedAt: toInputDateTime(segment.startedAt),
        originalEndedAt: toInputDateTime(segment.endedAt),
    }));

export const DayEntrySheet = ({
    day,
    onClose,
    onSaved,
}: {
    day: ReportDay | null;
    onClose: () => void;
    onSaved: () => void;
}) => {
    const [segments, setSegments] = useState<DraftSegment[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!day) return;
        setSegments(toDraft(day));
        setSaving(false);
    }, [day]);

    if (!day) return null;

    const patch = (index: number, next: Partial<DraftSegment>) => {
        setSegments((current) => current.map((segment, position) => (
            position === index ? { ...segment, ...next } : segment
        )));
    };

    const editable = segments.filter((segment) => segment.id && !segment.synthetic);
    const pendingRemovals = editable.filter((segment) => segment.removed).length;

    const save = async () => {
        for (const segment of editable) {
            if (segment.removed) continue;
            if (!segment.startedAt) {
                toast.error(t('personnel.entry.startRequired'));
                return;
            }
            if (segment.endedAt && new Date(segment.endedAt) < new Date(segment.startedAt)) {
                toast.error(t('personnel.entry.endBeforeStart'));
                return;
            }
        }

        setSaving(true);
        try {
            for (const segment of editable) {
                if (!segment.id) continue;
                if (segment.removed) {
                    await personnelApi.deleteTimeEntry(segment.id);
                    continue;
                }
                // Unverändert? Dann auch nicht senden — sonst würde jede
                // Stempelung des Tages ohne Not auf „Von Hand" umgestellt.
                if (segment.startedAt === segment.originalStartedAt && segment.endedAt === segment.originalEndedAt) continue;
                await personnelApi.updateTimeEntry(segment.id, {
                    startedAt: new Date(segment.startedAt).toISOString(),
                    endedAt: segment.endedAt ? new Date(segment.endedAt).toISOString() : null,
                });
            }
            toast.success(t('personnel.entry.saved'));
            onSaved();
            onClose();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('personnel.entry.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PersonnelSheet
            open
            onClose={onClose}
            title={t('personnel.entry.dayTitle')}
            subtitle={`${fullName(day)} · ${formatDate(day.workDate)}`}
            width={760}
            height={640}
            footer={(
                <>
                    <span className="text-[11.5px] text-slate-400 dark:text-white/50">
                        {pendingRemovals > 0
                            ? t('personnel.entry.pendingRemovals', { count: pendingRemovals })
                            : t('personnel.entry.manualHint')}
                    </span>
                    <div className="flex items-center gap-2">
                        <GhostButton onClick={onClose} disabled={saving}>{t('common.cancel')}</GhostButton>
                        <PrimaryButton onClick={() => void save()} disabled={saving || editable.length === 0}>
                            {saving ? t('common.loading') : t('common.save')}
                        </PrimaryButton>
                    </div>
                </>
            )}
        >
            {/* Tagesbilanz — dieselben Zahlen, die in der Berichtszeile stehen. */}
            <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                    { label: t('personnel.field.checkIn'), value: formatTime(day.startedAt) },
                    { label: t('personnel.field.checkOut'), value: day.endedAt ? formatTime(day.endedAt) : t('personnel.clock.stillIn') },
                    { label: t('personnel.field.shiftDuration'), value: day.open ? '—' : formatHoursMinutes(day.grossSeconds) },
                    { label: t('personnel.field.actualWork'), value: formatHoursMinutes(day.actualWorkSeconds) },
                    { label: t('personnel.field.breakDuration'), value: day.open ? '—' : formatHoursMinutes(day.breakSeconds) },
                ].map((cell) => (
                    <div key={cell.label} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/15">
                        <dt className="truncate text-[11px] text-slate-500 dark:text-white/60">{cell.label}</dt>
                        <dd className="mt-0.5 font-mono text-[14px] font-semibold text-slate-900 dark:text-white">{cell.value}</dd>
                    </div>
                ))}
            </dl>

            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
                {t('personnel.entry.segmentsTitle', { count: day.segments.length })}
            </h3>

            <ul className="space-y-2">
                {segments.map((segment, index) => (
                    <li
                        key={segment.id ?? `derived-${index}`}
                        className={`rounded-xl border px-3 py-3 ${
                            segment.removed
                                ? 'border-rose-200 bg-rose-50/60 dark:border-rose-400/30 dark:bg-rose-500/10'
                                : 'border-slate-200 dark:border-white/15'
                        }`}
                    >
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
                                {t('personnel.entry.segmentLabel', { index: index + 1 })}
                                {segment.source !== 'QR' && <> · {sourceLabel(segment.source)}</>}
                            </span>
                            {segment.id && !segment.synthetic && (
                                <button
                                    type="button"
                                    aria-label={segment.removed ? t('personnel.entry.undoRemove') : t('common.delete')}
                                    title={segment.removed ? t('personnel.entry.undoRemove') : t('common.delete')}
                                    onClick={() => patch(index, { removed: !segment.removed })}
                                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-white/10"
                                >
                                    <Trash01 size={13} />
                                </button>
                            )}
                        </div>

                        {segment.id && !segment.synthetic ? (
                            <div className="grid gap-2 sm:grid-cols-2">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[11px] text-slate-500 dark:text-white/60">{t('personnel.field.checkIn')}</span>
                                    <input
                                        type="datetime-local"
                                        disabled={segment.removed}
                                        value={segment.startedAt}
                                        onChange={(event) => patch(index, { startedAt: event.target.value })}
                                        className={CELL_INPUT_CLASS}
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[11px] text-slate-500 dark:text-white/60">{t('personnel.field.checkOut')}</span>
                                    <input
                                        type="datetime-local"
                                        disabled={segment.removed}
                                        value={segment.endedAt}
                                        onChange={(event) => patch(index, { endedAt: event.target.value })}
                                        className={CELL_INPUT_CLASS}
                                    />
                                </label>
                            </div>
                        ) : (
                            <p className="font-mono text-[13px] text-slate-600 dark:text-white/70">
                                {formatTime(segment.startedAt)} – {segment.endedAt ? formatTime(segment.endedAt) : '…'}
                                <span className="ml-2 text-[11.5px] text-slate-400">{t('personnel.detailed.derived')}</span>
                            </p>
                        )}
                    </li>
                ))}
            </ul>

            <p className="mt-3 text-[11.5px] text-slate-400 dark:text-white/45">{t('personnel.entry.endHint')}</p>
        </PersonnelSheet>
    );
};
