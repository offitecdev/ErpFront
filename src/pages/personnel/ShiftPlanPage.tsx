import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';
import type { ShiftPlan } from './types/personnel';
import { useLanguageTick, useShiftPlan } from './hooks/usePersonnel';
import { GhostButton, Labelled, PrimaryButton, SectionCard } from './components/primitives';
import { formatHours, isoWeekdayLabel } from './utils/format';
import {
    DEFAULT_SHIFT_PLAN,
    WEEKDAY_KEYS,
    WEEKEND_DAYS,
    grossShiftMinutes,
    netShiftMinutes,
    weeklyNetMinutes,
} from './utils/personnel';

/**
 * ── SCHICHTPLANUNG ───────────────────────────────────────────────────────────
 *
 * Links wird geplant, rechts steht die PLANÜBERSICHT (Vorgabe): Arbeitstage je
 * Woche, Bruttoschicht, Pause, Tagesnetto, Wochennetto.
 *
 * Die Übersicht rechnet MIT DENSELBEN FUNKTIONEN wie der Server
 * (`utils/personnel.ts` ist die wortgleiche Kopie von `shared/personnel.ts`).
 * Sie ist deshalb keine Schätzung, sondern zeigt schon vor dem Speichern genau
 * die Sollstunden, mit denen der Buchhaltungsbericht später rechnet.
 *
 * Pause wird in STUNDEN UND MINUTEN getrennt erfasst (Vorgabe) und als eine
 * Minutenzahl gespeichert — nur so kann die Rechnung damit rechnen.
 */

const minutesToHm = (minutes: number) => ({
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
});

const durationLabel = (minutes: number) => {
    const { hours, minutes: rest } = minutesToHm(Math.max(0, minutes));
    return `${hours}:${String(rest).padStart(2, '0')}`;
};

const INPUT_CLASS =
    'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[14px] text-slate-800 outline-none transition-colors hover:border-slate-300 focus:border-[#1f2654] dark:border-white/15 dark:bg-transparent dark:text-white';

export const ShiftPlanPage = () => {
    useLanguageTick();
    const { plan, loading, saving, save } = useShiftPlan();
    const permissions = useAuthStore((state) => state.permissions);
    const canEdit = permissions.includes('attendance.update');

    const [draft, setDraft] = useState<ShiftPlan>({ ...DEFAULT_SHIFT_PLAN });
    const [breakHours, setBreakHours] = useState(0);
    const [breakMinutes, setBreakMinutes] = useState(0);

    // Der gespeicherte Plan kommt erst nach dem ersten Zeichnen an; sobald er da
    // ist, wird der Entwurf EINMAL daraus gesetzt.
    useEffect(() => {
        if (loading) return;
        setDraft(plan);
        const parts = minutesToHm(plan.breakMinutes);
        setBreakHours(parts.hours);
        setBreakMinutes(parts.minutes);
    }, [loading, plan]);

    const effective = useMemo<ShiftPlan>(() => ({
        ...draft,
        breakMinutes: Math.max(0, breakHours * 60 + breakMinutes),
    }), [draft, breakHours, breakMinutes]);

    const gross = grossShiftMinutes(effective);
    const net = netShiftMinutes(effective);
    const weekly = weeklyNetMinutes(effective);

    const toggleDay = (isoWeekday: number) => {
        setDraft((current) => {
            const has = current.workdays.includes(isoWeekday);
            const workdays = has
                ? current.workdays.filter((day) => day !== isoWeekday)
                : [...current.workdays, isoWeekday].sort((a, b) => a - b);
            return { ...current, workdays };
        });
    };

    const setDays = (workdays: number[]) => setDraft((current) => ({ ...current, workdays: [...workdays] }));

    const submit = async () => {
        if (effective.workdays.length === 0) {
            toast.error(t('personnel.shift.needOneDay'));
            return;
        }
        if (net <= 0) {
            toast.error(t('personnel.shift.breakTooLong'));
            return;
        }
        try {
            await save(effective);
            toast.success(t('personnel.shift.saved'));
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('personnel.shift.saveFailed'));
        }
    };

    const summary: Array<{ label: string; value: string; strong?: boolean }> = [
        { label: t('personnel.shift.summaryWorkdays'), value: t('personnel.shift.daysPerWeek', { count: effective.workdays.length }) },
        { label: t('personnel.shift.summaryGross'), value: t('personnel.shift.hoursValue', { value: durationLabel(gross) }) },
        { label: t('personnel.shift.summaryBreak'), value: t('personnel.shift.hoursValue', { value: durationLabel(effective.breakMinutes) }) },
        { label: t('personnel.shift.summaryDailyNet'), value: t('personnel.shift.hoursValue', { value: durationLabel(net) }), strong: true },
        { label: t('personnel.shift.summaryWeeklyNet'), value: t('personnel.shift.hoursValue', { value: durationLabel(weekly) }), strong: true },
    ];

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader title={t('personnel.shift.title')} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="flex flex-col gap-4">
                    <SectionCard title={t('personnel.shift.daysSection')}>
                        <div className="p-4">
                            <div className="flex flex-wrap gap-2">
                                {WEEKDAY_KEYS.map((isoWeekday) => {
                                    const on = effective.workdays.includes(isoWeekday);
                                    const weekend = WEEKEND_DAYS.includes(isoWeekday);
                                    return (
                                        <button
                                            key={isoWeekday}
                                            type="button"
                                            disabled={!canEdit}
                                            onClick={() => toggleDay(isoWeekday)}
                                            aria-pressed={on}
                                            className={`min-w-[104px] rounded-xl border-2 px-4 py-3 text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                                on
                                                    ? 'border-[#272f67] bg-[#eef2fb] text-[#1f2654] dark:border-[#f59e0b] dark:bg-[#f59e0b]/10 dark:text-[#fbbf24]'
                                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-white/15 dark:bg-transparent dark:text-white/60'
                                            }`}
                                        >
                                            {isoWeekdayLabel(isoWeekday)}
                                            {weekend && (
                                                <span className="mt-0.5 block text-[10.5px] font-medium uppercase tracking-wide opacity-70">
                                                    {t('personnel.shift.weekend')}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Schnellschalter: „Wochentage" bzw. „Wochenende" — der
                                häufigste Fall soll ein Griff sein, nicht fünf. */}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <GhostButton disabled={!canEdit} onClick={() => setDays([1, 2, 3, 4, 5])}>
                                    {t('personnel.shift.presetWeekdays')}
                                </GhostButton>
                                <GhostButton disabled={!canEdit} onClick={() => setDays(WEEKEND_DAYS)}>
                                    {t('personnel.shift.presetWeekend')}
                                </GhostButton>
                                <GhostButton disabled={!canEdit} onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>
                                    {t('personnel.shift.presetAll')}
                                </GhostButton>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title={t('personnel.shift.timesSection')}>
                        <div className="grid gap-4 p-4 sm:grid-cols-2">
                            <Labelled label={t('personnel.shift.startTime')}>
                                <input
                                    type="time"
                                    disabled={!canEdit}
                                    value={draft.startTime}
                                    onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
                                    className={INPUT_CLASS}
                                />
                            </Labelled>
                            <Labelled label={t('personnel.shift.endTime')}>
                                <input
                                    type="time"
                                    disabled={!canEdit}
                                    value={draft.endTime}
                                    onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))}
                                    className={INPUT_CLASS}
                                />
                            </Labelled>
                            <Labelled label={t('personnel.shift.breakHours')}>
                                <input
                                    type="number"
                                    min={0}
                                    max={12}
                                    disabled={!canEdit}
                                    value={breakHours}
                                    onChange={(event) => setBreakHours(Math.min(12, Math.max(0, Number(event.target.value) || 0)))}
                                    className={INPUT_CLASS}
                                />
                            </Labelled>
                            <Labelled label={t('personnel.shift.breakMinutes')}>
                                <input
                                    type="number"
                                    min={0}
                                    max={59}
                                    disabled={!canEdit}
                                    value={breakMinutes}
                                    onChange={(event) => setBreakMinutes(Math.min(59, Math.max(0, Number(event.target.value) || 0)))}
                                    className={INPUT_CLASS}
                                />
                            </Labelled>
                            {/* Nachtschicht: endet die Schicht rechnerisch vor ihrem
                                Beginn, läuft sie über Mitternacht — der Hinweis sagt
                                das, damit niemand die Zahl für einen Fehler hält. */}
                            {draft.endTime <= draft.startTime && (
                                <p className="sm:col-span-2 text-[12px] text-amber-600 dark:text-amber-400">
                                    {t('personnel.shift.overnightHint')}
                                </p>
                            )}
                        </div>
                    </SectionCard>

                    {canEdit && (
                        <div>
                            <PrimaryButton icon={<Save01 size={14} />} onClick={() => void submit()} disabled={saving || loading}>
                                {saving ? t('common.loading') : t('personnel.shift.save')}
                            </PrimaryButton>
                        </div>
                    )}
                </div>

                {/* Planübersicht — rechts (Vorgabe). */}
                <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none">
                    <h2 className="ofi-serif text-[16px] font-bold text-slate-900 dark:text-white">
                        {t('personnel.shift.summaryTitle')}
                    </h2>
                    <dl className="mt-4 space-y-3">
                        {summary.map((row) => (
                            <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5 last:border-0 dark:border-white/10">
                                <dt className="text-[12.5px] text-slate-500 dark:text-white/60">{row.label}</dt>
                                <dd className={`font-mono ${row.strong ? 'text-[16px] font-bold text-slate-900 dark:text-white' : 'text-[14px] text-slate-700 dark:text-white/80'}`}>
                                    {row.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <p className="mt-4 text-[11.5px] leading-relaxed text-slate-400 dark:text-white/45">
                        {t('personnel.shift.summaryHint', { hours: formatHours(net / 60) })}
                    </p>
                </aside>
            </div>
        </div>
    );
};
