import { useEffect, useState } from 'react';
import { t } from '@/i18n/translate';
import type { WeekDay, WeekOverview } from '../types/personnel';
import { formatDate, formatHoursMinutes, formatTime, isoWeekdayLabel, isoWeekdayShort } from '../utils/format';
import { toDateKey } from '../utils/personnel';
import { PersonnelSheet } from './PersonnelSheet';

/**
 * ── „DIESE WOCHE" (TABLET) ───────────────────────────────────────────────────
 *
 * Montag bis Freitag als GROSSE Schaltflächen (Vorgabe): das Fenster wird mit
 * dem Finger bedient, oft mit Handschuhen, deshalb sind die Tagesknöpfe hoch
 * und weit statt einer schmalen Reiterleiste.
 *
 * WICHTIG: Das Fenster hält die Erfassung NICHT an. Die Kamera der Seite läuft
 * darunter weiter, und ein Scan schliesst es auch nicht — wer während der
 * Wochenschau stempelt, wird begrüsst und die Liste frischt sich auf.
 */

const dayTotals = (day: WeekDay | undefined) => ({
    people: day?.presentCount ?? 0,
    seconds: day?.totalSeconds ?? 0,
});

export const WeekSheet = ({
    open,
    week,
    loading,
    onClose,
}: {
    open: boolean;
    week: WeekOverview;
    loading: boolean;
    onClose: () => void;
}) => {
    const todayIso = (() => {
        const now = new Date();
        return now.getDay() === 0 ? 7 : now.getDay();
    })();
    // Beim Öffnen steht der heutige Tag vorn; am Wochenende der Montag, weil
    // das Fenster nur Mo–Fr führt.
    const [selected, setSelected] = useState<number>(Math.min(Math.max(todayIso, 1), 5));

    useEffect(() => {
        if (open) setSelected(Math.min(Math.max(todayIso, 1), 5));
    }, [open, todayIso]);

    const days = week.days;
    const active = days.find((day) => day.isoWeekday === selected);
    const todayKey = toDateKey(new Date());

    return (
        <PersonnelSheet
            open={open}
            onClose={onClose}
            title={t('personnel.clock.weekTitle')}
            subtitle={active ? formatDate(active.date) : undefined}
            width={1180}
            height={760}
            closeOnBackdrop
        >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[1, 2, 3, 4, 5].map((isoWeekday) => {
                    const day = days.find((candidate) => candidate.isoWeekday === isoWeekday);
                    const totals = dayTotals(day);
                    const isActive = selected === isoWeekday;
                    const isToday = day?.date === todayKey;
                    return (
                        <button
                            key={isoWeekday}
                            type="button"
                            onClick={() => setSelected(isoWeekday)}
                            aria-pressed={isActive}
                            className={`flex min-h-[104px] flex-col items-start justify-between rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                                isActive
                                    ? 'border-[#272f67] bg-[#eef2fb] text-[#1f2654] dark:border-[#f59e0b] dark:bg-[#f59e0b]/10 dark:text-[#fbbf24]'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-white/70'
                            }`}
                        >
                            <span className="flex w-full items-center justify-between gap-2">
                                <span className="text-[19px] font-bold">
                                    <span className="hidden sm:inline">{isoWeekdayLabel(isoWeekday)}</span>
                                    <span className="sm:hidden">{isoWeekdayShort(isoWeekday)}</span>
                                </span>
                                {isToday && (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                        {t('personnel.clock.today')}
                                    </span>
                                )}
                            </span>
                            <span className="text-[12.5px] opacity-80">{day ? formatDate(day.date) : '—'}</span>
                            <span className="text-[13px] font-semibold">
                                {t('personnel.clock.peopleCount', { count: totals.people })} · {formatHoursMinutes(totals.seconds)}
                            </span>
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-white/15">
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 96 }} />
                        <col />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 150 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-right">{t('personnel.field.staffNumber')}</th>
                            <th className="text-left">{t('personnel.field.name')}</th>
                            <th className="text-left">{t('personnel.field.checkIn')}</th>
                            <th className="text-left">{t('personnel.field.checkOut')}</th>
                            <th className="text-right">{t('personnel.field.duration')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || !active || active.entries.length === 0) && (
                            <tr>
                                <td colSpan={5} className="py-14 text-center text-[15px] text-slate-400 dark:text-white/50">
                                    {loading ? t('common.loading') : t('personnel.clock.noEntriesForDay')}
                                </td>
                            </tr>
                        )}
                        {!loading && active?.entries.map((entry) => (
                            <tr key={entry.id} className="text-[15px]">
                                <td className="text-right font-mono text-slate-500 dark:text-white/60">{entry.staffNumber ?? '—'}</td>
                                <td className="font-semibold text-slate-800 dark:text-white">
                                    {entry.firstName} {entry.lastName}
                                </td>
                                <td className="font-mono text-slate-700 dark:text-white/80">{formatTime(entry.startedAt)}</td>
                                <td className="font-mono text-slate-700 dark:text-white/80">
                                    {entry.endedAt
                                        ? formatTime(entry.endedAt)
                                        : <span className="text-emerald-600 dark:text-emerald-400">{t('personnel.clock.stillIn')}</span>}
                                </td>
                                <td className="text-right font-mono font-semibold text-slate-900 dark:text-white">
                                    {formatHoursMinutes(entry.durationSeconds)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </PersonnelSheet>
    );
};
