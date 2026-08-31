import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CalendarDate, ChevronRight, FileCheck02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { PopupCard } from '@/components/ui-shared/PopupKit';
import { personnelHrApi } from '@/lib/api/personnel';
import '@/styles/personnel.css';

import type { LeaveYear, PersonApproval, PersonLeave } from '../../types/personnel';
import { formatDate, formatDays, formatLeaveDays } from '../../utils/format';
import { PersonLeavesTab } from './PersonLeavesTab';

/**
 * ── REITER «URLAUB UND ABWESENHEITEN» (Neuaufbau 27.08.2026, Vorgabe) ────────
 *
 * DAS KONTO BLEIBT AUF DER SEITE, alles Weitere öffnet sich als FENSTER
 * (Vorgabe: «keine aufklappbaren Abschnitte — anklickbare Pop-ups»): zwei
 * Kacheln — Feiertage und Anträge — tragen die Zahl und öffnen auf Klick die
 * Tabelle als Karte über der Seite. ABWESENHEITEN stehen hier NICHT mehr
 * (Vorgabe 27.08.2026: «aus den Urlaubs-Optionen entfernen») — sie sind der
 * eigene Reiter der Arbeitszeiten, samt Nachtrag.
 *
 * JAHRESWEISE AB EINTRITT (Vorgabe): wählbar sind nur die Jahre seit dem
 * Eintrittsjahr; im Eintrittsjahr beginnt der ausgewiesene Zeitraum am
 * Eintrittstag, nicht am 1. Januar — davor gab es nichts zu zählen.
 *
 * Das Konto ist eine RECHNUNG, kein Saldo: es wird bei jedem Aufruf aus den
 * Stempelungen, den bewilligten Anträgen und der Urlaubsregel neu gebildet.
 */

const yearOptions = (hireDate: string | null): number[] => {
    const current = new Date().getFullYear();
    const hired = hireDate ? new Date(hireDate).getFullYear() : current;
    const first = Number.isFinite(hired) ? Math.min(hired, current) : current;
    const years: number[] = [];
    for (let year = current; year >= first && years.length < 12; year -= 1) years.push(year);
    return years;
};

const Stat = ({
    label,
    value,
    hint,
    strong,
}: {
    label: string;
    value: string;
    hint?: string;
    strong?: boolean;
}) => (
    <div className={`ofi-ly-stat ${strong ? 'is-strong' : ''}`}>
        <span className="ofi-ly-stat__value">{value}</span>
        <span className="ofi-ly-stat__label">{label}</span>
        {hint && <span className="ofi-ly-stat__hint">{hint}</span>}
    </div>
);

/** Eine der drei Kacheln — Zahl gross, Klick öffnet das Fenster. */
const OpenTile = ({
    icon,
    label,
    count,
    badge,
    onClick,
}: {
    icon: React.ReactNode;
    label: string;
    count: number;
    badge?: number;
    onClick: () => void;
}) => (
    <button type="button" onClick={onClick} className="ofi-me-card ofi-ly-tile">
        <span className="flex w-full items-center gap-3">
            <span className="ofi-pf-upload__icon">{icon}</span>
            <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white">{label}</span>
                <span className="block text-[11.5px] text-slate-500 dark:text-white/55">
                    {t('personnel.leaveYear.tileCount', { count })}
                </span>
            </span>
            {Boolean(badge) && (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                    {badge}
                </span>
            )}
            <ChevronRight size={15} className="shrink-0 text-slate-300 dark:text-white/30" />
        </span>
    </button>
);

type PopupKey = 'holidays' | 'requests' | null;

export const PersonLeaveYearTab = ({
    employeeId,
    hireDate = null,
    leaves,
    approvals,
}: {
    employeeId: string;
    /** Eintrittsdatum — es bestimmt Jahre und Zeitraumbeginn. */
    hireDate?: string | null;
    leaves: PersonLeave[];
    approvals: PersonApproval[];
}) => {
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [data, setData] = useState<LeaveYear | null>(null);
    const [loading, setLoading] = useState(true);
    const [popup, setPopup] = useState<PopupKey>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        personnelHrApi.leaveYear(employeeId, year)
            .then((value) => { if (!cancelled) setData(value); })
            .catch((error) => {
                if (cancelled) return;
                setData(null);
                toast.error(
                    (error as { response?: { data?: { error?: string } } })?.response?.data?.error
                    || t('personnel.leaveYear.loadFailed'),
                );
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [employeeId, year]);

    /* Der ZEITRAUM des gewählten Jahres: im Eintrittsjahr beginnt er am
       Eintrittstag (Vorgabe «ab dem ersten Arbeitstag»). */
    const hire = hireDate ? new Date(hireDate) : null;
    const periodStart = hire && hire.getFullYear() === year ? hire : new Date(year, 0, 1);
    const periodEnd = new Date(year, 11, 31);
    const isHireYear = Boolean(hire && hire.getFullYear() === year);

    return (
        <div className="ofi-ly flex flex-col gap-4">
            <SectionCard
                title={t('personnel.leaveYear.title')}
                action={(
                    <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-white/70">
                        {t('personnel.leaveYear.year')}
                        <SelectMenu
                            value={String(year)}
                            onChange={(next) => setYear(Number(next))}
                            ariaLabel={t('personnel.leaveYear.year')}
                            className="w-24"
                            listWidth={104}
                            options={yearOptions(hireDate).map((value) => ({ value: String(value), label: String(value) }))}
                        />
                    </span>
                )}
            >
                {loading && !data ? (
                    <div className="ofi-shimmer m-4 h-24 rounded-lg" />
                ) : data ? (
                    <>
                        {/* Der Zeitraum, über den unten gerechnet wurde — im
                            Eintrittsjahr ab dem Eintrittstag. */}
                        <p className="px-4 pt-3 text-[12px] text-slate-500 dark:text-white/55">
                            {isHireYear
                                ? t('personnel.leaveYear.periodSinceHire', {
                                    from: formatDate(periodStart),
                                    to: formatDate(periodEnd),
                                })
                                : t('personnel.leaveYear.period', {
                                    from: formatDate(periodStart),
                                    to: formatDate(periodEnd),
                                })}
                        </p>
                        <div className="ofi-ly-stats">
                            <Stat
                                label={t('personnel.leaveYear.remaining')}
                                value={formatLeaveDays(data.entitlement.remainingDays)}
                                hint={t('personnel.leaveYear.remainingHint')}
                                strong
                            />
                            <Stat
                                label={t('personnel.leaveYear.earned')}
                                value={formatLeaveDays(data.entitlement.earnedDays)}
                                hint={t('personnel.leaveYear.earnedHint', {
                                    full: formatLeaveDays(data.entitlement.fullYearDays),
                                })}
                            />
                            <Stat
                                label={t('personnel.leaveYear.used')}
                                value={formatLeaveDays(data.entitlement.usedDays)}
                            />
                            <Stat
                                label={t('personnel.leaveYear.pending')}
                                value={formatLeaveDays(data.entitlement.pendingDays)}
                                hint={t('personnel.leaveYear.pendingHint')}
                            />
                            <Stat
                                label={t('personnel.leaveYear.workedDays')}
                                value={String(data.entitlement.workedDays)}
                                hint={t('personnel.leaveYear.workedHint', {
                                    reference: formatDays(data.entitlement.referenceWorkdays),
                                })}
                            />
                        </div>

                        {/* Die REGEL, nach der oben gerechnet wurde. Ohne sie ist
                            der Anspruch eine Zahl, die vom Himmel fällt. */}
                        <p className="ofi-ly-rule">
                            {data.policy.accrueByWorkdays
                                ? t('personnel.leaveYear.ruleAccrued', {
                                    days: formatLeaveDays(data.policy.annualLeaveDays),
                                    workdays: data.policy.annualWorkdays,
                                })
                                : t('personnel.leaveYear.ruleFull', {
                                    days: formatLeaveDays(data.policy.annualLeaveDays),
                                })}
                            {data.policy.carryOverDays > 0 && ` ${t('personnel.leaveYear.ruleCarry', {
                                days: formatLeaveDays(data.policy.carryOverDays),
                            })}`}
                        </p>
                    </>
                ) : (
                    <p className="px-4 py-6 text-center text-[12.5px] text-slate-400 dark:text-white/45">
                        {t('personnel.leaveYear.loadFailed')}
                    </p>
                )}
            </SectionCard>

            {/* ── ZWEI KACHELN — je ein Klick, je ein Fenster. Abwesenheiten
                stehen im Reiter «Arbeitszeiten», nicht hier. ─────────────── */}
            <div className="grid gap-2.5 sm:grid-cols-2">
                <OpenTile
                    icon={<CalendarDate size={16} />}
                    label={t('personnel.leaveYear.holidaysTile')}
                    count={data?.holidays.length ?? 0}
                    onClick={() => setPopup('holidays')}
                />
                <OpenTile
                    icon={<FileCheck02 size={16} />}
                    label={t('personnel.leaveYear.requestsTile')}
                    count={leaves.length}
                    badge={approvals.length || undefined}
                    onClick={() => setPopup('requests')}
                />
            </div>

            {/* ── FENSTER: FEIERTAGE ───────────────────────────────────────── */}
            <PopupCard
                open={popup === 'holidays'}
                onClose={() => setPopup(null)}
                title={t('personnel.leaveYear.holidaysTile')}
                subtitle={String(year)}
                width={640}
                closeOnOutside
            >
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 130 }} />
                        <col />
                        <col style={{ width: 150 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('personnel.field.shiftDate')}</th>
                            <th className="text-left">{t('personnel.holidays.name')}</th>
                            <th className="text-left">{t('personnel.holidays.kind')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(data?.holidays.length ?? 0) === 0 && (
                            <TableStateRow colSpan={3} loading={false} emptyText={t('personnel.holidays.empty')} />
                        )}
                        {(data?.holidays ?? []).map((holiday) => (
                            <tr key={holiday.id}>
                                <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">
                                    {formatDate(holiday.date)}
                                </td>
                                <td className="truncate text-[12.5px] font-medium text-slate-800 dark:text-white">
                                    {holiday.name}
                                </td>
                                <td className="text-[12px] text-slate-500 dark:text-white/60">
                                    {holiday.religious
                                        ? t('personnel.holidays.religious')
                                        : t('personnel.holidays.official')}
                                    {holiday.halfDay && ` · ${t('personnel.holidays.halfDay')}`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </PopupCard>

            {/* ── FENSTER: ANTRÄGE (eigene + wartende) ─────────────────────── */}
            <PopupCard
                open={popup === 'requests'}
                onClose={() => setPopup(null)}
                title={t('personnel.leaveYear.requestsTile')}
                width={900}
                closeOnOutside
            >
                <PersonLeavesTab leaves={leaves} approvals={approvals} />
            </PopupCard>
        </div>
    );
};
