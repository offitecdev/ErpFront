import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CalendarCheck01, Edit01, FileDownload02, SearchLg } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { personnelHrApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import { PopupCard } from '@/components/ui-shared/PopupKit';
import { DateField } from '@/components/ui-shared/DateField';
import '@/styles/personnel.css';

import type { ReportDay, TimeRecordPerson, TimeRecordResult } from '../types/personnel';
import { useLanguageTick } from '../hooks/usePersonnel';
import { GhostButton, PrimaryButton, SectionCard, TableStateRow } from '../components/primitives';
import { DayEntrySheet } from '../components/DayEntrySheet';
import { AbsencesPopup } from './AbsencesPopup';
import {
    buildStaffOrdinals,
    formatDate,
    formatDays,
    formatHours,
    formatHoursMinutes,
    formatTime,
    staffNumberDisplay,
} from '../utils/format';
import { clampRangeEnd, maxRangeEnd, resolvePreset } from '../utils/ranges';

/**
 * ── ARBEITSZEITERFASSUNG (Neuaufbau 27.08.2026, Vorgabe Samet) ──────────────
 *
 * DER FILTER IST AUF ZWEI DATEN GESCHRUMPFT (Vorgabe: «keine ‹Letzter Monat›-
 * und ‹Dieses Jahr›-Knöpfe, nur Beginn und Ende — höchstens EIN Monat, z. B.
 * 01.08–31.08»). Die Felder sind die hauseigenen Kalender; das Ende lässt sich
 * gar nicht erst weiter als einen Monat setzen.
 *
 * ERST SUCHEN, DANN ZEIGEN — das bleibt: die Seite kommt leer hoch und lädt
 * von sich aus nichts.
 *
 * DIE TAGESZEILEN EINER PERSON ÖFFNEN SICH ALS FENSTER (Vorgabe: «statt einer
 * Aufklappung nach unten direkt ein Fenster mit der Monatstabelle»): ein Klick
 * auf die Personenzeile legt die Tabelle als Karte über die Seite, die Liste
 * dahinter bleibt stehen.
 *
 * ABWESENHEITEN sind ein KNOPF mit eigenem Fenster (Monatsfilter, PDF direkt,
 * manuelle Nacherfassung) — sie stehen nicht mehr zwischen den Arbeitszeiten.
 */

export const TimeRecordsPage = () => {
    useLanguageTick();

    const initial = resolvePreset('thisMonth');
    const [startDate, setStartDate] = useState(initial.startDate);
    const [endDate, setEndDate] = useState(initial.endDate);
    const [search, setSearch] = useState('');

    const [result, setResult] = useState<TimeRecordResult | null>(null);
    const [loading, setLoading] = useState(false);
    /* Was zuletzt GESUCHT wurde — nicht, was gerade im Feld steht. Der Kopf des
       PDF und die Überschrift müssen den Zeitraum der Zahlen tragen, nicht den
       eines halb geänderten Formulars. */
    const [applied, setApplied] = useState<{ startDate: string; endDate: string; search: string } | null>(null);
    const [selected, setSelected] = useState<TimeRecordPerson | null>(null);
    const [absencesOpen, setAbsencesOpen] = useState(false);
    const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);
    /* Eine Stempelung korrigieren — die Fähigkeit des alten Detailrapports. */
    const [editing, setEditing] = useState<ReportDay | null>(null);
    const permissions = useAuthStore((state) => state.permissions);
    const canEdit = permissions.includes('attendance.update');

    const setStart = (next: string) => {
        if (!next) return;
        setStartDate(next);
        setEndDate((current) => clampRangeEnd(next, current));
    };

    const runSearch = async () => {
        if (!startDate || !endDate || endDate < startDate) {
            toast.error(t('personnel.leave.rangeInvalid'));
            return;
        }
        setLoading(true);
        try {
            const value = await personnelHrApi.timeRecords({ startDate, endDate, search });
            setResult(value);
            setApplied({ startDate, endDate, search });
            setSelected(null);
        } catch (error) {
            setResult(null);
            toast.error(
                (error as { response?: { data?: { error?: string } } })?.response?.data?.error
                || t('personnel.timeRecords.loadFailed'),
            );
        } finally {
            setLoading(false);
        }
    };

    /** Die Tageszeilen je Person — für das Fenster und die Ausgabe. */
    const daysByPerson = useMemo(() => {
        const map = new Map<string, ReportDay[]>();
        for (const day of result?.days ?? []) {
            const bucket = map.get(day.employeeId);
            if (bucket) bucket.push(day);
            else map.set(day.employeeId, [day]);
        }
        return map;
    }, [result]);

    const ordinals = useMemo(
        () => buildStaffOrdinals((result?.people ?? []).map((person) => person.employeeId)),
        [result],
    );

    const totals = useMemo(() => (result?.people ?? []).reduce(
        (sum, person) => ({
            seconds: sum.seconds + person.totalSeconds,
            present: sum.present + person.presentDays,
            absent: sum.absent + person.absentDays,
        }),
        { seconds: 0, present: 0, absent: 0 },
    ), [result]);

    const exportPdf = async () => {
        if (!result || !applied) return;
        setExporting('pdf');
        try {
            const { exportTimeRecordsPdf } = await import('@/utils/pdf/personnelTimeRecordsPdf');
            await exportTimeRecordsPdf(result, applied);
        } catch {
            toast.error(t('personnel.pdf.failed'));
        } finally {
            setExporting(null);
        }
    };

    const exportExcel = async () => {
        if (!result || !applied) return;
        setExporting('excel');
        try {
            const { exportTimeRecordsExcel } = await import('../utils/exportTimeRecordsExcel');
            await exportTimeRecordsExcel(result, applied);
        } catch {
            toast.error(t('personnel.timeRecords.excelFailed'));
        } finally {
            setExporting(null);
        }
    };

    const selectedDays = selected ? (daysByPerson.get(selected.employeeId) ?? []) : [];

    return (
        <div className="ofi-tr flex w-full flex-col gap-4">
            <div>
                <InventoryListHeader
                    title={t('personnel.timeRecords.title')}
                    action={(
                        <GhostButton icon={<CalendarCheck01 size={14} />} onClick={() => setAbsencesOpen(true)}>
                            {t('personnel.absencesPopup.title')}
                        </GhostButton>
                    )}
                />
                <p className="-mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-500 dark:text-white/60">
                    {t('personnel.timeRecords.description')}
                </p>
            </div>

            {/* ── DIE SUCHE: Beginn, Ende, Name — mehr nicht ──────────────── */}
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
                    <label className="ofi-req-filter ofi-req-filter--wide">
                        <span>{t('personnel.timeRecords.searchLabel')}</span>
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') void runSearch(); }}
                            placeholder={t('personnel.timeRecords.searchPlaceholder')}
                            className="ofi-cal-input ofi-pf-input w-full"
                        />
                    </label>
                    <PrimaryButton
                        icon={<SearchLg size={14} />}
                        onClick={() => void runSearch()}
                        disabled={loading}
                        className="self-end"
                    >
                        {loading ? t('common.loading') : t('common.search')}
                    </PrimaryButton>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-white/45">
                    {t('personnel.filter.maxMonthHint')}
                </p>
            </section>

            {/* Vor der ersten Suche steht hier nichts — genau so ist es gewollt. */}
            {!result && !loading && (
                <div className="ofi-tr-idle">
                    <p className="ofi-tr-idle__title">{t('personnel.timeRecords.idleTitle')}</p>
                    <p className="ofi-tr-idle__text">{t('personnel.timeRecords.idleText')}</p>
                </div>
            )}

            {result && applied && (
                <>
                    {/* PDF UND EXCEL GANZ OBEN — über der Liste, nicht unter ihr. */}
                    <div className="ofi-tr-exportbar">
                        <div className="ofi-tr-exportbar__summary">
                            <strong>{formatDate(applied.startDate)} – {formatDate(applied.endDate)}</strong>
                            <span>{t('personnel.timeRecords.peopleCount', { count: result.people.length })}</span>
                            <span>
                                {t('personnel.field.actualWork')}: {formatHoursMinutes(totals.seconds)}
                            </span>
                            {result.basis && (
                                <span>
                                    {t('personnel.accounting.targetHours')}: {formatHours(result.basis.targetHours)}
                                </span>
                            )}
                        </div>
                        <div className="ofi-tr-exportbar__actions">
                            <GhostButton
                                icon={<FileDownload02 size={14} />}
                                onClick={() => void exportExcel()}
                                disabled={exporting !== null || result.people.length === 0}
                            >
                                {t('personnel.timeRecords.excel')}
                            </GhostButton>
                            <GhostButton
                                icon={<FileDownload02 size={14} />}
                                onClick={() => void exportPdf()}
                                disabled={exporting !== null || result.people.length === 0}
                            >
                                {t('personnel.filter.generatePdf')}
                            </GhostButton>
                        </div>
                    </div>

                    <SectionCard title={t('personnel.timeRecords.resultTitle', { count: result.people.length })}>
                        <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                            <colgroup>
                                <col style={{ width: 84 }} />
                                <col />
                                <col />
                                <col style={{ width: 130 }} />
                                <col style={{ width: 100 }} />
                                <col style={{ width: 92 }} />
                                <col style={{ width: 92 }} />
                                <col style={{ width: 92 }} />
                                <col style={{ width: 92 }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th className="text-right">{t('personnel.field.staffNumber')}</th>
                                    <th className="text-left">{t('personnel.field.firstName')}</th>
                                    <th className="text-left">{t('personnel.field.lastName')}</th>
                                    <th className="text-right">{t('personnel.field.actualWork')}</th>
                                    <th className="text-right">{t('personnel.accounting.targetHours')}</th>
                                    <th className="text-right">{t('personnel.timeRecords.presentDays')}</th>
                                    <th className="text-right">{t('personnel.timeRecords.absentDays')}</th>
                                    <th className="text-right">{t('personnel.accounting.daysShort')}</th>
                                    <th className="text-right">{t('personnel.accounting.extraDays')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(loading || result.people.length === 0) && (
                                    <TableStateRow
                                        colSpan={9}
                                        loading={loading}
                                        emptyText={t('personnel.timeRecords.empty')}
                                    />
                                )}
                                {!loading && result.people.map((person) => (
                                    <tr
                                        key={person.employeeId}
                                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                        onClick={() => setSelected(person)}
                                    >
                                        <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                            {staffNumberDisplay(person.staffNumber, ordinals.get(person.employeeId))}
                                        </td>
                                        <td className="truncate font-medium text-slate-800 dark:text-white">{person.firstName}</td>
                                        <td className="truncate font-medium text-slate-800 dark:text-white">{person.lastName}</td>
                                        <td className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                            {formatHoursMinutes(person.totalSeconds)}
                                        </td>
                                        <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                            {formatHours(person.targetHours)}
                                        </td>
                                        <td className="text-right font-mono text-[12.5px] text-slate-700 dark:text-white/80">
                                            {person.presentDays}
                                        </td>
                                        <td className="text-right font-mono text-[12.5px]">
                                            <span className={person.absentDays > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-white/60'}>
                                                {person.absentDays}
                                            </span>
                                        </td>
                                        <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                            {formatDays(person.daysShort)}
                                        </td>
                                        <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                            {formatDays(person.extraDays)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {!loading && result.people.length > 0 && (
                            <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-slate-200 px-4 py-3 dark:border-white/10">
                                <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                                    {t('personnel.timeRecords.presentDays')}
                                    <span className="ml-2 font-mono text-[13.5px] text-slate-700 dark:text-white/80">{totals.present}</span>
                                </span>
                                <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                                    {t('personnel.timeRecords.absentDays')}
                                    <span className="ml-2 font-mono text-[13.5px] text-slate-700 dark:text-white/80">{totals.absent}</span>
                                </span>
                                <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                                    {t('personnel.field.actualWork')}
                                    <span className="ml-2 font-mono text-[15px] font-bold text-slate-900 dark:text-white">
                                        {formatHoursMinutes(totals.seconds)}
                                    </span>
                                </span>
                            </div>
                        )}
                    </SectionCard>
                </>
            )}

            {/* ── DAS TAGESFENSTER EINER PERSON ───────────────────────────── */}
            <PopupCard
                open={Boolean(selected)}
                onClose={() => setSelected(null)}
                title={selected ? `${selected.firstName} ${selected.lastName}`.trim() : ''}
                subtitle={applied ? `${formatDate(applied.startDate)} – ${formatDate(applied.endDate)}` : undefined}
                width={860}
                closeOnOutside
            >
                <DayRows days={selectedDays} canEdit={canEdit} onEdit={setEditing} />
            </PopupCard>

            <AbsencesPopup
                open={absencesOpen}
                onClose={() => setAbsencesOpen(false)}
                onChanged={() => { if (applied) void runSearch(); }}
            />

            {/* Nach dem Speichern wird die Suche wiederholt — die Summen oben
                hängen an denselben Zeilen und wären sonst überholt. */}
            <DayEntrySheet
                day={editing}
                onClose={() => setEditing(null)}
                onSaved={() => void runSearch()}
            />
        </div>
    );
};

/** Die Tageszeilen einer Person — der Inhalt des Fensters: Kommen, Gehen,
    Schichtdauer, Arbeitszeit, Pause. */
const DayRows = ({
    days,
    canEdit,
    onEdit,
}: {
    days: ReportDay[];
    canEdit: boolean;
    onEdit: (day: ReportDay) => void;
}) => {
    if (days.length === 0) {
        return <p className="px-1 py-4 text-[12.5px] text-slate-400 dark:text-white/45">{t('personnel.detailed.empty')}</p>;
    }
    return (
        <table data-inv-table data-unstyled-table className="w-full">
            <colgroup>
                <col style={{ width: 110 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 52 }} />
            </colgroup>
            <thead>
                <tr>
                    <th className="text-left">{t('personnel.field.shiftDate')}</th>
                    <th className="text-left">{t('personnel.field.checkIn')}</th>
                    <th className="text-left">{t('personnel.field.checkOut')}</th>
                    <th className="text-right">{t('personnel.field.shiftDuration')}</th>
                    <th className="text-right">{t('personnel.field.actualWork')}</th>
                    <th className="text-right">{t('personnel.field.breakDuration')}</th>
                    <th className="text-right">{t('common.actions')}</th>
                </tr>
            </thead>
            <tbody>
                {days.map((day) => (
                    <tr key={day.key}>
                        <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">{formatDate(day.workDate)}</td>
                        <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">{formatTime(day.startedAt)}</td>
                        <td className="font-mono text-[12.5px]">
                            {day.endedAt
                                ? <span className="text-slate-700 dark:text-white/80">{formatTime(day.endedAt)}</span>
                                : <span className="text-emerald-600 dark:text-emerald-400">{t('personnel.clock.stillIn')}</span>}
                        </td>
                        <td className="text-right font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                            {day.open ? '—' : formatHoursMinutes(day.grossSeconds)}
                        </td>
                        <td className="text-right font-mono text-[12.5px] font-semibold text-slate-900 dark:text-white">
                            {formatHoursMinutes(day.actualWorkSeconds)}
                        </td>
                        <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                            {day.open ? '—' : formatHoursMinutes(day.breakSeconds)}
                        </td>
                        <td className="text-right">
                            {/* Abgeleitete Homeoffice-Tage haben keine Zeile in der
                                Datenbank — an ihnen gibt es nichts zu korrigieren. */}
                            {canEdit && day.segments.some((segment) => segment.id && !segment.synthetic) && (
                                <button
                                    type="button"
                                    aria-label={t('common.edit')}
                                    title={t('common.edit')}
                                    onClick={() => onEdit(day)}
                                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] dark:hover:bg-white/10 dark:hover:text-white"
                                >
                                    <Edit01 size={13} />
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
