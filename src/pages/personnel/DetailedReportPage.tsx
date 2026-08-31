import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Edit01, Trash01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import type { ReportDay } from './types/personnel';
import { useDetailedReport, useLanguageTick } from './hooks/usePersonnel';
import { ReportFilterBar } from './components/ReportFilterBar';
import { LeaveFlagButton } from './components/LeaveFlagButton';
import { DayEntrySheet } from './components/DayEntrySheet';
import { Chip, SectionCard, TableStateRow } from './components/primitives';
import {
    buildStaffOrdinals,
    formatDate,
    formatHoursMinutes,
    formatTime,
    fullName,
    staffNumberDisplay,
} from './utils/format';

/**
 * ── DETAILBERICHT ────────────────────────────────────────────────────────────
 *
 * „Kommen- und Gehen-Bewegungen der Belegschaft. Weil beim Pausenbeginn ein
 * Gehen gebucht wird, entspricht jede Zeile der tatsächlich geleisteten Zeit."
 * Der Satz steht als Untertitel auf der Seite — ohne ihn liest sich der Bericht
 * wie ein Fehler.
 *
 * EINE ZEILE JE PERSON UND TAG (Vorgabe 16.08.2026). Vorher stand hier ein
 * Arbeitsfenster je Zeile, und wer zweimal Pause machte, belegte drei Zeilen.
 *
 * Die Zeile weist DREI Zeiten GETRENNT aus und verrechnet nichts davon
 * gegeneinander (Vorgabe):
 *
 *   Schichtdauer   erstes Kommen bis letztes Gehen
 *   Arbeitszeit    die Summe der Fenster
 *   Pausenzeit     die Lücken dazwischen
 *
 * Es gilt immer Schichtdauer = Arbeitszeit + Pausenzeit; die Pausenvorgabe des
 * Schichtplans wird NICHT abgezogen — hier steht, was gestempelt wurde.
 * Alle drei erscheinen in Stunden UND Minuten ausgeschrieben (`common.hm`),
 * nie als „8:15". Die einzelnen Stempelungen stecken hinter der Zeile und
 * werden im Tagesfenster (`DayEntrySheet`) korrigiert.
 *
 * Spalten: Mitarbeiter-Nr., Vorname, Nachname, Anlagedatum, Schichtdatum,
 * Kommt, Geht, Schichtdauer, Arbeitszeit, Pause.
 */
export const DetailedReportPage = () => {
    useLanguageTick();
    const report = useDetailedReport();
    const permissions = useAuthStore((state) => state.permissions);
    const canEdit = permissions.includes('attendance.update');

    // Laufende Nummern als Rückfall, damit die Spalte „Mitarbeiter-Nr." nie
    // leer bleibt (siehe `staffNumberDisplay`).
    const ordinals = useMemo(
        () => buildStaffOrdinals(report.report.days.map((day) => day.employeeId)),
        [report.report.days],
    );

    const [editing, setEditing] = useState<ReportDay | null>(null);
    const [exporting, setExporting] = useState(false);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);

    const exportPdf = async () => {
        setExporting(true);
        try {
            // Der Erzeuger wird erst hier geladen: jsPDF und die Schriften wiegen
            // mehr als die ganze Seite und dürfen sie nicht mit aufhalten.
            const { exportDetailedReportPdf } = await import('@/utils/pdf/personnelReportPdf');
            await exportDetailedReportPdf(report.report, report.applied);
        } catch {
            toast.error(t('personnel.pdf.failed'));
        } finally {
            setExporting(false);
        }
    };

    /** Löschen entfernt den GANZEN Tag — die Zeile ist der Tag. */
    const removeDay = async (day: ReportDay) => {
        const ids = day.segments.map((segment) => segment.id).filter((id): id is string => Boolean(id));
        if (ids.length === 0) return;
        const confirmed = window.confirm(t('personnel.entry.deleteDayConfirm', {
            name: fullName(day),
            date: formatDate(day.workDate),
            count: ids.length,
        }));
        if (!confirmed) return;

        setDeletingKey(day.key);
        try {
            for (const id of ids) await personnelApi.deleteTimeEntry(id);
            toast.success(t('personnel.entry.deleted'));
            report.reload();
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('personnel.entry.deleteFailed'));
        } finally {
            setDeletingKey(null);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <div>
                <InventoryListHeader title={t('personnel.detailed.title')} />
                <p className="-mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-500 dark:text-white/60">
                    {t('personnel.detailed.description')}
                </p>
            </div>

            <ReportFilterBar
                draft={report.draft}
                onPatch={report.patch}
                onApply={report.apply}
                onReset={report.reset}
                onExport={() => void exportPdf()}
                exporting={exporting}
            />

            <SectionCard title={t('personnel.detailed.sectionTitle', { count: report.report.days.length })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 84 }} />
                        <col />
                        <col />
                        <col style={{ width: 116 }} />
                        <col style={{ width: 116 }} />
                        <col style={{ width: 88 }} />
                        <col style={{ width: 88 }} />
                        <col style={{ width: 132 }} />
                        <col style={{ width: 132 }} />
                        <col style={{ width: 118 }} />
                        <col style={{ width: 92 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-right">{t('personnel.field.staffNumber')}</th>
                            <th className="text-left">{t('personnel.field.firstName')}</th>
                            <th className="text-left">{t('personnel.field.lastName')}</th>
                            <th className="text-left">{t('personnel.field.createdAt')}</th>
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
                        {(report.loading || report.report.days.length === 0) && (
                            <TableStateRow
                                colSpan={11}
                                loading={report.loading}
                                emptyText={report.error ? t('personnel.detailed.loadFailed') : t('personnel.detailed.empty')}
                            />
                        )}
                        {!report.loading && report.report.days.map((day) => {
                            const flags = report.flagsByEmployee.get(day.employeeId) ?? [];
                            const editableCount = day.segments.filter((segment) => segment.id && !segment.synthetic).length;
                            return (
                                <tr key={day.key} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                        {staffNumberDisplay(day.staffNumber, ordinals.get(day.employeeId))}
                                    </td>
                                    <td>
                                        <span className="inline-flex min-w-0 items-center">
                                            <span className="truncate font-medium text-slate-800 dark:text-white">{day.firstName}</span>
                                            <LeaveFlagButton
                                                flags={flags}
                                                personName={fullName(day)}
                                                employeeId={day.employeeId}
                                                workLocation={day.workLocation}
                                                onWorkLocationChanged={report.reload}
                                            />
                                        </span>
                                    </td>
                                    <td className="truncate font-medium text-slate-800 dark:text-white">{day.lastName}</td>
                                    <td className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                        {formatDate(day.employeeCreatedAt)}
                                    </td>
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
                                    {/* Die drei Zahlen stehen NEBENEINANDER und werden nicht
                                        gegeneinander verrechnet: Schichtdauer = Arbeitszeit + Pause. */}
                                    <td className="text-right font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                                        {day.open ? '—' : formatHoursMinutes(day.grossSeconds)}
                                    </td>
                                    <td className="text-right">
                                        <span className="font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                            {formatHoursMinutes(day.actualWorkSeconds)}
                                        </span>
                                        {/* Mehr als ein Fenster heisst: der Tag hatte Pausen. */}
                                        {day.segments.length > 1 && (
                                            <Chip className="ml-1.5 bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-white/70 dark:ring-white/15">
                                                {day.segments.length}×
                                            </Chip>
                                        )}
                                    </td>
                                    <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                        {day.open ? '—' : formatHoursMinutes(day.breakSeconds)}
                                    </td>
                                    <td className="text-right">
                                        {canEdit && editableCount > 0 && (
                                            <div className="inline-flex gap-1">
                                                <button
                                                    type="button"
                                                    aria-label={t('common.edit')}
                                                    title={t('common.edit')}
                                                    onClick={() => setEditing(day)}
                                                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] dark:hover:bg-white/10 dark:hover:text-white"
                                                >
                                                    <Edit01 size={13} />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label={t('common.delete')}
                                                    title={t('common.delete')}
                                                    disabled={deletingKey === day.key}
                                                    onClick={() => void removeDay(day)}
                                                    className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-white/10"
                                                >
                                                    <Trash01 size={13} />
                                                </button>
                                            </div>
                                        )}
                                        {day.synthetic && (
                                            <span className="text-[11px] text-slate-400 dark:text-white/45">
                                                {t('personnel.detailed.derived')}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!report.loading && report.report.days.length > 0 && (
                    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-slate-200 px-4 py-3 dark:border-white/10">
                        <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                            {t('personnel.field.shiftDuration')}
                            <span className="ml-2 font-mono text-[13.5px] text-slate-700 dark:text-white/80">
                                {formatHoursMinutes(report.totals.gross)}
                            </span>
                        </span>
                        <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                            {t('personnel.field.breakDuration')}
                            <span className="ml-2 font-mono text-[13.5px] text-slate-700 dark:text-white/80">
                                {formatHoursMinutes(report.totals.breaks)}
                            </span>
                        </span>
                        <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                            {t('personnel.field.actualWork')}
                            <span className="ml-2 font-mono text-[15px] font-bold text-slate-900 dark:text-white">
                                {formatHoursMinutes(report.totals.actual)}
                            </span>
                        </span>
                    </div>
                )}
            </SectionCard>

            <DayEntrySheet day={editing} onClose={() => setEditing(null)} onSaved={report.reload} />
        </div>
    );
};
