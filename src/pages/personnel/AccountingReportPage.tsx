import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { useAccountingReport, useLanguageTick } from './hooks/usePersonnel';
import { ReportFilterBar } from './components/ReportFilterBar';
import { LeaveFlagButton } from './components/LeaveFlagButton';
import { Chip, SectionCard, TableStateRow } from './components/primitives';
import { buildStaffOrdinals, formatDays, formatHours, fullName, staffNumberDisplay, workLocationLabel } from './utils/format';

/**
 * ── BUCHHALTUNGSBERICHT ──────────────────────────────────────────────────────
 *
 * Oben die Bemessungsgrundlage als KURZE KARTEN (Vorgabe): Kalendertage,
 * Arbeitstage, Feiertage, tatsächliche Arbeitstage, Tagesnetto, Sollstunden.
 * Darunter je Person eine Zeile: Mitarbeiter-Nr., Vorname, Nachname, Zeitraum,
 * Gesamtstunden, Fehltage, Mehrtage.
 *
 * Die Feiertagszahl ist eine EINGABE, keine Ableitung: welche Feiertage im
 * Kanton auf einen Arbeitstag fallen, weiss die Buchhaltung — der Server soll
 * dafür keinen Feiertagskalender pflegen müssen. „Feiertage zurücksetzen" setzt
 * NUR diese Zahl auf null und lässt den Zeitraum stehen.
 *
 * Ein Klick auf die Zeile führt in den Detailbericht dieser Person (Tag für Tag).
 */
export const AccountingReportPage = () => {
    useLanguageTick();
    const report = useAccountingReport();
    const navigate = useNavigate();
    const [exporting, setExporting] = useState(false);

    const basis = report.report?.basis;

    /* Jede Kennzahl trägt ihre Herkunft als Unterzeile: ohne sie ist „21" nur
       eine Zahl, mit ihr ist es „21 Arbeitstage laut Plan". */
    const cards = basis ? [
        { label: t('personnel.accounting.totalDays'), value: String(basis.totalDays), hint: '' },
        { label: t('personnel.accounting.workdays'), value: String(basis.workdays), hint: t('personnel.accounting.perPlan') },
        { label: t('personnel.accounting.publicHolidays'), value: String(basis.publicHolidays), hint: t('personnel.accounting.daysDeducted') },
        { label: t('personnel.accounting.actualWorkdays'), value: String(basis.actualWorkdays), hint: '' },
        { label: t('personnel.accounting.dailyNetHours'), value: formatHours(basis.dailyNetHours), hint: t('personnel.accounting.breakDeducted') },
        { label: t('personnel.accounting.targetHours'), value: formatHours(basis.targetHours), hint: t('personnel.accounting.perPerson'), strong: true },
    ] : [];

    // Laufende Nummern als Rückfall für die Spalte „Mitarbeiter-Nr.".
    const ordinals = useMemo(
        () => buildStaffOrdinals((report.report?.rows ?? []).map((person) => person.employeeId)),
        [report.report],
    );

    const exportPdf = async () => {
        if (!report.report) return;
        setExporting(true);
        try {
            const { exportAccountingReportPdf } = await import('@/utils/pdf/personnelReportPdf');
            await exportAccountingReportPdf(report.report, report.applied);
        } catch {
            toast.error(t('personnel.pdf.failed'));
        } finally {
            setExporting(false);
        }
    };

    const openDetail = (employeeId: string) => {
        const params = new URLSearchParams({
            startDate: report.applied.startDate,
            endDate: report.applied.endDate,
            publicHolidays: String(report.applied.publicHolidays),
        });
        navigate(`/personnel/accounting/${employeeId}?${params.toString()}`);
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <div>
                <InventoryListHeader title={t('personnel.accounting.title')} />
                <p className="-mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-500 dark:text-white/60">
                    {t('personnel.accounting.description')}
                </p>
            </div>

            <ReportFilterBar
                draft={report.draft}
                onPatch={report.patch}
                onApply={report.apply}
                onReset={report.reset}
                onExport={() => void exportPdf()}
                exporting={exporting}
                showHolidays
                onResetHolidays={report.resetHolidays}
            />

            {/* Kennzahlen als Karten — dieselbe Reihenfolge wie im PDF. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {cards.map((card) => (
                    <div
                        key={card.label}
                        className={`rounded-xl border bg-white px-4 py-3 dark:bg-transparent ${
                            card.strong
                                ? 'border-[#272f67]/30 dark:border-[#f59e0b]/40'
                                : 'border-slate-200 dark:border-white/15'
                        }`}
                    >
                        <p className="truncate text-[11.5px] font-medium text-slate-500 dark:text-white/60">{card.label}</p>
                        <p className={`mt-1 font-mono text-[21px] font-bold ${card.strong ? 'text-[#1f2654] dark:text-[#fbbf24]' : 'text-slate-900 dark:text-white'}`}>
                            {card.value}
                        </p>
                        {card.hint && <p className="text-[10.5px] text-slate-400 dark:text-white/45">{card.hint}</p>}
                    </div>
                ))}
            </div>

            {/* Kurzkarten je Person (Vorgabe): der Blick aufs Ganze, bevor die
                Tabelle darunter ins Einzelne geht. Auf dem Telefon sind sie die
                eigentliche Ansicht — sieben Spalten wären dort unlesbar. */}
            {!report.loading && (report.report?.rows.length ?? 0) > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {report.report?.rows.map((person) => (
                        <button
                            key={`card-${person.employeeId}`}
                            type="button"
                            onClick={() => openDetail(person.employeeId)}
                            className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:hover:bg-white/5"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                                        {fullName(person)}
                                    </p>
                                    <p className="font-mono text-[11.5px] text-slate-400 dark:text-white/45">
                                        {t('personnel.field.staffNumber')} {staffNumberDisplay(person.staffNumber, ordinals.get(person.employeeId))}
                                    </p>
                                </div>
                                <LeaveFlagButton
                                    flags={person.flags}
                                    personName={fullName(person)}
                                    employeeId={person.employeeId}
                                    workLocation={person.workLocation}
                                    onWorkLocationChanged={report.apply}
                                />
                            </div>

                            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
                                <div>
                                    <dt className="truncate text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-white/45">
                                        {t('personnel.accounting.totalHours')}
                                    </dt>
                                    <dd className="font-mono text-[16px] font-bold text-slate-900 dark:text-white">
                                        {formatHours(person.totalHours)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="truncate text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-white/45">
                                        {t('personnel.accounting.daysShort')}
                                    </dt>
                                    <dd className={`font-mono text-[16px] font-bold ${person.daysShort > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                                        {formatDays(person.daysShort)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="truncate text-[10.5px] uppercase tracking-wide text-slate-400 dark:text-white/45">
                                        {t('personnel.accounting.extraDays')}
                                    </dt>
                                    <dd className={`font-mono text-[16px] font-bold ${person.extraDays > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                        {formatDays(person.extraDays)}
                                    </dd>
                                </div>
                            </dl>
                        </button>
                    ))}
                </div>
            )}

            <SectionCard title={t('personnel.accounting.sectionTitle', { count: report.report?.rows.length ?? 0 })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 96 }} />
                        <col />
                        <col />
                        <col style={{ width: 200 }} />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 56 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-right">{t('personnel.field.staffNumber')}</th>
                            <th className="text-left">{t('personnel.field.firstName')}</th>
                            <th className="text-left">{t('personnel.field.lastName')}</th>
                            <th className="text-left">{t('personnel.pdf.period')}</th>
                            <th className="text-right">{t('personnel.accounting.totalHours')}</th>
                            <th className="text-right">{t('personnel.accounting.daysShort')}</th>
                            <th className="text-right">{t('personnel.accounting.extraDays')}</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(report.loading || !report.report || report.report.rows.length === 0) && (
                            <TableStateRow
                                colSpan={8}
                                loading={report.loading}
                                emptyText={report.error ? t('personnel.accounting.loadFailed') : t('personnel.accounting.empty')}
                            />
                        )}
                        {!report.loading && report.report?.rows.map((person) => (
                            <tr
                                key={person.employeeId}
                                onClick={() => openDetail(person.employeeId)}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                            >
                                <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                    {staffNumberDisplay(person.staffNumber, ordinals.get(person.employeeId))}
                                </td>
                                <td>
                                    <span className="inline-flex min-w-0 items-center">
                                        <span className="truncate font-medium text-slate-800 dark:text-white">{person.firstName}</span>
                                        <LeaveFlagButton
                                            flags={person.flags}
                                            personName={fullName(person)}
                                            employeeId={person.employeeId}
                                            workLocation={person.workLocation}
                                            onWorkLocationChanged={report.apply}
                                        />
                                    </span>
                                </td>
                                <td>
                                    <span className="block truncate font-medium text-slate-800 dark:text-white">{person.lastName}</span>
                                    {person.workLocation === 'REMOTE' && (
                                        <Chip className="mt-0.5 bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/30">
                                            {workLocationLabel(person.workLocation)}
                                        </Chip>
                                    )}
                                </td>
                                <td className="font-mono text-[12px] text-slate-500 dark:text-white/60">
                                    {report.applied.startDate} → {report.applied.endDate}
                                </td>
                                <td className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">
                                    {formatHours(person.totalHours)}
                                </td>
                                <td className="text-right font-mono text-[13px]">
                                    {person.daysShort > 0
                                        ? <span className="font-semibold text-rose-600 dark:text-rose-400">{formatDays(person.daysShort)}</span>
                                        : <span className="text-slate-400">0</span>}
                                </td>
                                <td className="text-right font-mono text-[13px]">
                                    {person.extraDays > 0
                                        ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatDays(person.extraDays)}</span>
                                        : <span className="text-slate-400">0</span>}
                                </td>
                                <td className="text-right text-slate-300 dark:text-white/30">
                                    <ArrowRight size={14} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>
        </div>
    );
};
