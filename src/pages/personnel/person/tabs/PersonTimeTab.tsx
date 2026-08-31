import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FileDownload02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { DateField } from '@/components/ui-shared/DateField';
import { personnelHrApi } from '@/lib/api/personnel';
import '@/styles/personnel.css';

import type { PersonTimeLog } from '../../types/personnel';
import { GhostButton } from '../../components/primitives';
import {
    formatDate,
    formatDays,
    formatHours,
    formatHoursMinutes,
    formatTime,
    toInputDate,
} from '../../utils/format';
import { clampRangeEnd, maxRangeEnd, resolvePreset } from '../../utils/ranges';

/**
 * ── REITER «ARBEITSZEITEN» (Neuaufbau 27.08.2026, Vorgabe Samet) ────────────
 *
 * NUR NOCH VON UND BIS (Vorgabe: «keine Tag-für-Tag-Knöpfe, kein ‹Letzter
 * Monat›, kein ‹Dieses Jahr› — nur Beginn und Ende, höchstens EIN Monat»).
 * Die beiden Datumsfelder sind die hauseigenen Kalender, keine
 * Systemsteuerelemente; das Ende lässt sich gar nicht erst weiter als einen
 * Monat hinter den Beginn setzen.
 *
 * DIE ANTWORT ZUERST: die Summenkarte oben, die Tageszeilen darunter als
 * Beleg. Urlaub und Abwesenheiten stehen NICHT in der Arbeitszeittabelle —
 * sie sind keine Arbeitszeit.
 *
 * ZWEI REITER IN DER TABELLE: «Erfasst» sind die gestempelten Tage, «Noch
 * nicht begonnen» die geplanten Arbeitstage in der Zukunft. ABWESENHEITEN
 * haben seit dem 27.08.2026 einen EIGENEN Seitenreiter (Vorgabe: «Urlaub und
 * Abwesenheiten sind getrennte Seiten») — hier steht nur Arbeitszeit.
 */

type DayTab = 'recorded' | 'upcoming';

export const PersonTimeTab = ({ employeeId }: { employeeId: string }) => {
    const initial = resolvePreset('thisMonth');
    const [startDate, setStartDate] = useState(initial.startDate);
    const [endDate, setEndDate] = useState(initial.endDate);
    const [dayTab, setDayTab] = useState<DayTab>('recorded');

    const [log, setLog] = useState<PersonTimeLog | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        if (!startDate || !endDate || endDate < startDate) return;
        let cancelled = false;
        setLoading(true);
        personnelHrApi.timeLog(employeeId, { startDate, endDate })
            .then((value) => { if (!cancelled) setLog(value); })
            .catch(() => { if (!cancelled) setLog(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [employeeId, startDate, endDate]);

    const setStart = (next: string) => {
        if (!next) return;
        setStartDate(next);
        setEndDate((current) => clampRangeEnd(next, current));
    };

    /* «Noch nicht begonnen»: geplante Arbeitstage des Zeitraums, die in der
       Zukunft liegen — kein Feiertag, kein Wochenende. Sie werden im Browser
       aus Plan und Feiertagsliste gerechnet, die der Nachweis ohnehin trägt. */
    const upcomingDays = useMemo(() => {
        if (!log) return [] as string[];
        const holidays = new Set(log.holidays.map((holiday) => holiday.date));
        const today = new Date();
        const todayKey = toInputDate(today);
        const out: string[] = [];
        const cursor = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);
        while (cursor.getTime() <= end.getTime() && out.length < 62) {
            const key = toInputDate(cursor);
            const iso = cursor.getDay() === 0 ? 7 : cursor.getDay();
            if (key > todayKey && log.plan.workdays.includes(iso) && !holidays.has(key)) out.push(key);
            cursor.setDate(cursor.getDate() + 1);
        }
        return out;
    }, [log, startDate, endDate]);

    const exportPdf = async () => {
        if (!log) return;
        setExporting(true);
        try {
            const { exportPersonTimeLogPdf } = await import('@/utils/pdf/personnelTimeRecordsPdf');
            await exportPersonTimeLogPdf(log, { startDate, endDate });
        } catch {
            toast.error(t('personnel.pdf.failed'));
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="ofi-tr flex flex-col gap-4">
            {/* ── DER FILTER: Beginn und Ende, mehr nicht ─────────────────── */}
            <section className="ofi-tr-search" aria-label={t('personnel.timeRecords.searchTitle')}>
                <div className="ofi-tr-fields">
                    <label className="ofi-req-filter">
                        <span>{t('personnel.filter.startDate')}</span>
                        <DateField
                            value={startDate}
                            onChange={setStart}
                            ariaLabel={t('personnel.filter.startDate')}
                            buttonClassName="ofi-cal-input ofi-pf-input"
                        />
                    </label>
                    <label className="ofi-req-filter">
                        <span>{t('personnel.filter.endDate')}</span>
                        <DateField
                            value={endDate}
                            onChange={(next) => { if (next) setEndDate(clampRangeEnd(startDate, next)); }}
                            min={startDate}
                            max={maxRangeEnd(startDate)}
                            ariaLabel={t('personnel.filter.endDate')}
                            buttonClassName="ofi-cal-input ofi-pf-input"
                        />
                    </label>
                    <span className="self-end pb-1 text-[11px] text-slate-400 dark:text-white/45">
                        {t('personnel.filter.maxMonthHint')}
                    </span>
                    <GhostButton
                        icon={<FileDownload02 size={14} />}
                        onClick={() => void exportPdf()}
                        disabled={exporting || !log}
                        className="ml-auto self-end"
                    >
                        {t('personnel.filter.generatePdf')}
                    </GhostButton>
                </div>
            </section>

            {/* DIE ANTWORT ZUERST: «Wie viele Stunden hat diese Person in dem
                Monat gearbeitet?» ist EINE Zahl — sie steht gross oben, und
                die Tageszeilen darunter belegen sie. */}
            <div className="ofi-tr-total">
                <div className="ofi-tr-total__main">
                    <span className="ofi-tr-total__value">
                        {formatHoursMinutes(log?.totals.actualSeconds ?? 0)}
                    </span>
                    <span className="ofi-tr-total__label">
                        {t('personnel.field.actualWork')} · {formatDate(startDate)} – {formatDate(endDate)}
                    </span>
                </div>
                <dl className="ofi-tr-total__side">
                    <div>
                        <dt>{t('personnel.accounting.targetHours')}</dt>
                        <dd>{formatHours(log?.basis.targetHours ?? 0)}</dd>
                    </div>
                    <div>
                        <dt>{t('personnel.timeRecords.presentDays')}</dt>
                        <dd>{log?.totals.presentDays ?? 0}</dd>
                    </div>
                    <div>
                        <dt>{t('personnel.timeRecords.absentDays')}</dt>
                        <dd>{log?.totals.absentDays ?? 0}</dd>
                    </div>
                    <div>
                        <dt>{t('personnel.accounting.daysShort')}</dt>
                        <dd>{formatDays(log?.totals.daysShort ?? 0)}</dd>
                    </div>
                    <div>
                        <dt>{t('personnel.accounting.extraDays')}</dt>
                        <dd>{formatDays(log?.totals.extraDays ?? 0)}</dd>
                    </div>
                </dl>
            </div>

            <SectionCard
                title={dayTab === 'recorded'
                    ? t('personnel.timeLog.daysTitle', { count: log?.days.length ?? 0 })
                    : t('personnel.timeLog.upcomingTitle', { count: upcomingDays.length })}
                action={(
                    <span className="flex items-center gap-1">
                        {(['recorded', 'upcoming'] as DayTab[]).map((key) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={dayTab === key}
                                onClick={() => setDayTab(key)}
                                className={`ofi-tr-preset ${dayTab === key ? 'is-active' : ''}`}
                            >
                                {t(`personnel.timeLog.tab.${key}`)}
                            </button>
                        ))}
                    </span>
                )}
            >
                {dayTab === 'recorded' ? (
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <col style={{ width: 130 }} />
                            <col style={{ width: 90 }} />
                            <col style={{ width: 90 }} />
                            <col />
                            <col style={{ width: 140 }} />
                            <col style={{ width: 130 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('personnel.field.shiftDate')}</th>
                                <th className="text-left">{t('personnel.field.checkIn')}</th>
                                <th className="text-left">{t('personnel.field.checkOut')}</th>
                                <th className="text-right">{t('personnel.field.shiftDuration')}</th>
                                <th className="text-right">{t('personnel.field.actualWork')}</th>
                                <th className="text-right">{t('personnel.field.breakDuration')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || (log?.days.length ?? 0) === 0) && (
                                <TableStateRow colSpan={6} loading={loading} emptyText={t('personnel.detailed.empty')} />
                            )}
                            {!loading && (log?.days ?? []).map((day) => (
                                <tr key={day.key}>
                                    <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">
                                        {formatDate(day.workDate)}
                                    </td>
                                    <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">
                                        {formatTime(day.startedAt)}
                                    </td>
                                    <td className="font-mono text-[12.5px]">
                                        {day.endedAt
                                            ? <span className="text-slate-700 dark:text-white/80">{formatTime(day.endedAt)}</span>
                                            : <span className="text-emerald-600 dark:text-emerald-400">{t('personnel.clock.stillIn')}</span>}
                                    </td>
                                    <td className="text-right font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                                        {day.open ? '—' : formatHoursMinutes(day.grossSeconds)}
                                    </td>
                                    <td className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                        {formatHoursMinutes(day.actualWorkSeconds)}
                                    </td>
                                    <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                        {day.open ? '—' : formatHoursMinutes(day.breakSeconds)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <col style={{ width: 130 }} />
                            <col />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('personnel.field.shiftDate')}</th>
                                <th className="text-left">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {upcomingDays.length === 0 && (
                                <TableStateRow colSpan={2} loading={false} emptyText={t('personnel.timeLog.noUpcoming')} />
                            )}
                            {upcomingDays.map((day) => (
                                <tr key={day}>
                                    <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">
                                        {formatDate(day)}
                                    </td>
                                    <td className="text-[12px] text-slate-400 dark:text-white/45">
                                        {t('personnel.timeLog.notStarted')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </SectionCard>

        </div>
    );
};
