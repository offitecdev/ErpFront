import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FileDownload02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { useAccountingDetail, useLanguageTick, type ReportFilterState } from './hooks/usePersonnel';
import { PrimaryButton, SectionCard, TableStateRow } from './components/primitives';
import {
    firstDayOfMonth,
    formatDate,
    formatDays,
    formatHoursMinutes,
    formatHours,
    formatTime,
    isoWeekdayLabel,
    lastDayOfMonth,
    leaveTypeLabel,
} from './utils/format';
import { isoWeekday, parseDateOnly } from './utils/personnel';

/**
 * ── BUCHHALTUNGS-DETAILBERICHT (EINE PERSON) ─────────────────────────────────
 *
 * Der Zeitraum kommt als Adressparameter mit — genau der, der in der Liste
 * gewählt war. So führt ein geteilter Link auf DIESELBE Auswertung und nicht
 * auf einen Standardmonat, in dem die Zahlen anders aussehen.
 *
 * Die Tabelle zeigt Tag für Tag: Datum, Wochentag, Kommen/Gehen jeder Spanne,
 * die Tagessumme, das Tagessoll und eine allfällige Abwesenheit. Planfreie Tage
 * ohne Stempelung und ohne Abwesenheit werden ausgelassen — sie wären eine
 * Bildschirmseite voll leerer Zeilen.
 */
export const AccountingDetailPage = () => {
    useLanguageTick();
    const { employeeId = '' } = useParams();
    const [searchParams] = useSearchParams();
    const [exporting, setExporting] = useState(false);

    // Aus der Adresse gelesen und stabilisiert: ohne `useMemo` wäre der Filter
    // bei jedem Zeichnen ein neues Objekt und der Ladehaken liefe endlos.
    const query = useMemo<ReportFilterState>(() => ({
        startDate: searchParams.get('startDate') || firstDayOfMonth(),
        endDate: searchParams.get('endDate') || lastDayOfMonth(),
        firstName: '',
        lastName: '',
        publicHolidays: Math.max(0, Number(searchParams.get('publicHolidays')) || 0),
    }), [searchParams]);

    const { detail, loading, error } = useAccountingDetail(employeeId || null, query);

    const person = detail?.person ?? null;
    const totalHours = (detail?.totalSeconds ?? 0) / 3600;
    const basis = detail?.basis;
    const difference = basis ? totalHours - basis.targetHours : 0;
    const perDay = basis?.dailyNetHours || 0;

    const visibleDays = (detail?.days ?? []).filter(
        (day) => day.entries.length > 0 || day.isWorkday || day.leave,
    );

    const exportPdf = async () => {
        if (!detail) return;
        setExporting(true);
        try {
            const { exportAccountingDetailPdf } = await import('@/utils/pdf/personnelReportPdf');
            await exportAccountingDetailPdf(detail, query);
        } catch {
            toast.error(t('personnel.pdf.failed'));
        } finally {
            setExporting(false);
        }
    };

    const cards = basis ? [
        { label: t('personnel.accounting.targetHours'), value: formatHours(basis.targetHours) },
        { label: t('personnel.accounting.totalHours'), value: formatHours(totalHours), strong: true },
        {
            label: difference < 0 ? t('personnel.accounting.daysShort') : t('personnel.accounting.extraDays'),
            value: perDay > 0 ? formatDays(Math.abs(difference) / perDay) : '0',
        },
        { label: t('personnel.accounting.actualWorkdays'), value: String(basis.actualWorkdays) },
        { label: t('personnel.accounting.dailyNetHours'), value: formatHours(basis.dailyNetHours) },
    ] : [];

    return (
        <div className="flex w-full flex-col gap-4">
            <div className="ofi-rise flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <Link
                        to="/personnel/accounting"
                        className="text-[12.5px] font-medium text-slate-500 transition-colors hover:text-[#1f2654] dark:text-white/60 dark:hover:text-white"
                    >
                        ← {t('personnel.accounting.backToList')}
                    </Link>
                    <h1 className="ofi-serif mt-1 truncate text-[23px] font-semibold tracking-tight text-slate-900 dark:text-white">
                        {person ? `${person.firstName} ${person.lastName}` : t('personnel.accountingDetail.title')}
                    </h1>
                    <p className="text-[12.5px] text-slate-500 dark:text-white/60">
                        {formatDate(query.startDate)} – {formatDate(query.endDate)}
                        {person?.staffNumber != null && <> · {t('personnel.field.staffNumber')} {person.staffNumber}</>}
                    </p>
                </div>
                <PrimaryButton icon={<FileDownload02 size={14} />} onClick={() => void exportPdf()} disabled={exporting || !detail}>
                    {exporting ? t('common.loading') : t('personnel.filter.generatePdf')}
                </PrimaryButton>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {cards.map((card) => (
                    <div
                        key={card.label}
                        className={`rounded-xl border bg-white px-4 py-3 dark:bg-transparent ${
                            card.strong ? 'border-[#272f67]/30 dark:border-[#f59e0b]/40' : 'border-slate-200 dark:border-white/15'
                        }`}
                    >
                        <p className="truncate text-[11.5px] font-medium text-slate-500 dark:text-white/60">{card.label}</p>
                        <p className={`mt-1 font-mono text-[21px] font-bold ${card.strong ? 'text-[#1f2654] dark:text-[#fbbf24]' : 'text-slate-900 dark:text-white'}`}>
                            {card.value}
                        </p>
                    </div>
                ))}
            </div>

            <SectionCard title={t('personnel.accountingDetail.sectionTitle')}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 120 }} />
                        <col style={{ width: 120 }} />
                        <col />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 180 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('personnel.field.shiftDate')}</th>
                            <th className="text-left">{t('personnel.accountingDetail.weekday')}</th>
                            <th className="text-left">{t('personnel.accountingDetail.spans')}</th>
                            <th className="text-right">{t('personnel.field.duration')}</th>
                            <th className="text-right">{t('personnel.accounting.dayTarget')}</th>
                            <th className="text-left">{t('personnel.field.leaveType')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || visibleDays.length === 0) && (
                            <TableStateRow
                                colSpan={6}
                                loading={loading}
                                emptyText={error ? t('personnel.accounting.loadFailed') : t('personnel.accountingDetail.empty')}
                            />
                        )}
                        {!loading && visibleDays.map((day) => {
                            const dayDate = parseDateOnly(day.date);
                            const weekday = dayDate ? isoWeekday(dayDate) : 0;
                            const short = day.seconds < day.targetSeconds;
                            return (
                                <tr key={day.date} className={day.isWorkday ? '' : 'bg-slate-50/60 dark:bg-white/5'}>
                                    <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">{formatDate(day.date)}</td>
                                    <td className="text-[12.5px] text-slate-500 dark:text-white/60">
                                        {weekday ? isoWeekdayLabel(weekday) : '—'}
                                    </td>
                                    <td className="text-[12.5px] text-slate-600 dark:text-white/70">
                                        {day.entries.length === 0
                                            ? <span className="text-slate-400">{t('personnel.accountingDetail.noSpans')}</span>
                                            : (
                                                <span className="flex flex-wrap gap-x-3 gap-y-1 font-mono">
                                                    {day.entries.map((entry, index) => (
                                                        <span key={entry.id ?? `${day.date}-${index}`}>
                                                            {formatTime(entry.startedAt)}–{entry.endedAt ? formatTime(entry.endedAt) : '…'}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                    </td>
                                    <td className={`text-right font-mono text-[13px] font-semibold ${
                                        day.isWorkday && short ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                                    }`}>
                                        {formatHoursMinutes(day.seconds)}
                                    </td>
                                    <td className="text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                        {day.targetSeconds > 0 ? formatHoursMinutes(day.targetSeconds) : '—'}
                                    </td>
                                    <td className="text-[12.5px] text-slate-600 dark:text-white/70">
                                        {day.leave ? leaveTypeLabel(day.leave.leaveType, day.leave.leaveTypeLabel) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </SectionCard>
        </div>
    );
};
