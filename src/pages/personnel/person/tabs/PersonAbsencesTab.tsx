import { useEffect, useMemo, useState } from 'react';

import { Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { DateField } from '@/components/ui-shared/DateField';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { PopupCard } from '@/components/ui-shared/PopupKit';
import { personnelHrApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import '@/styles/personnel.css';

import type { AbsenceDay } from '../../types/personnel';
import { Chip, GhostButton } from '../../components/primitives';
import { ManualEntryForm } from '../../components/ManualEntryForm';
import { absenceKindChipClass, formatDate, toInputDate } from '../../utils/format';

/**
 * ── REITER «ABWESENHEITEN» (27.08.2026, Vorgabe Samet) ───────────────────────
 *
 * EIN EIGENER REITER der Personenseite — getrennt vom Urlaub (Vorgabe:
 * «Urlaub und Abwesenheiten sind zwei Seiten, auf dem Profil UND auf der
 * Personalseite»). Er zeigt die Fehltage der Person NACH DATUM.
 *
 * GESUCHT WIRD JAHRESWEISE (Vorgabe 27.08.2026): die Jahreswahl — vom
 * Eintrittsjahr bis heute — setzt den Zeitraum auf das ganze Jahr (im
 * Eintrittsjahr ab dem Eintrittstag); Von/Bis verfeinern OHNE jede Grenze
 * (Vorgabe: «keine Einschränkung beim Filtern»).
 *
 * NUR ECHTE ABWESENHEITEN (Vorgabe: «Urlaub und Abwesenheit nicht mischen»):
 * Tage, die ein bewilligter Urlaubs-, Krankheits- oder Homeoffice-Antrag
 * erklärt, stehen auf der URLAUBSSEITE — hier stehen die unerklärten
 * Fehltage und die manuell erfassten Abwesenheiten.
 *
 * DER NACHTRAG ist ein eigener Handgriff oben rechts (nur mit Recht): über
 * sein Fenster lassen sich ab dem EINTRITTSDATUM Arbeitstage als anwesend
 * nachtragen oder ein Zeitraum mit Grund als abwesend ablegen — etwa rund um
 * die Einstellung, wenn der alte Bestand noch fehlt.
 *
 * Die Fehltage sind ABGELEITET (geplanter Arbeitstag ohne Leistung); die
 * Zeilen kommen aus demselben Nachweis wie der Arbeitszeiten-Reiter.
 */

export const PersonAbsencesTab = ({
    employeeId,
    hireDate = null,
}: {
    employeeId: string;
    /** Eintrittsdatum — der früheste Tag, für den sich etwas nachtragen lässt. */
    hireDate?: string | null;
}) => {
    const permissions = useAuthStore((state) => state.permissions);
    const canRecord = permissions.includes('attendance.update')
        || permissions.includes('attendance.create')
        || permissions.includes('employees.update');

    /* Vorbelegung: das LAUFENDE JAHR — ab dem 1. Januar bzw. dem Eintritt,
       wenn er in dieses Jahr fällt (davor gab es keine Arbeitspflicht). */
    const hireKey = hireDate ? toInputDate(hireDate) : '';
    const currentYear = new Date().getFullYear();
    const yearStart = (year: number): string => {
        const first = toInputDate(new Date(year, 0, 1));
        return hireKey && hireKey > first ? hireKey : first;
    };
    const [yearSel, setYearSel] = useState(String(currentYear));
    const [startDate, setStartDate] = useState(() => yearStart(currentYear));
    const [endDate, setEndDate] = useState(() => toInputDate(new Date(currentYear, 11, 31)));

    const [absences, setAbsences] = useState<AbsenceDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [manualOpen, setManualOpen] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!startDate || !endDate || endDate < startDate) return;
        let cancelled = false;
        setLoading(true);
        personnelHrApi.timeLog(employeeId, { startDate, endDate })
            .then((value) => { if (!cancelled) setAbsences(value.absences); })
            .catch(() => { if (!cancelled) setAbsences([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [employeeId, startDate, endDate, tick]);

    /* Die wählbaren Jahre: vom Eintrittsjahr bis heute — wie beim Urlaub. */
    const yearOptions = useMemo(() => {
        const hired = hireKey ? Number(hireKey.slice(0, 4)) : currentYear;
        const first = Number.isFinite(hired) ? Math.min(hired, currentYear) : currentYear;
        const years: Array<{ value: string; label: string }> = [];
        for (let year = currentYear; year >= first && years.length < 15; year -= 1) {
            years.push({ value: String(year), label: String(year) });
        }
        return years;
    }, [hireKey, currentYear]);

    const applyYear = (next: string) => {
        setYearSel(next);
        const year = Number(next);
        if (!Number.isFinite(year)) return;
        setStartDate(yearStart(year));
        setEndDate(toInputDate(new Date(year, 11, 31)));
    };

    /* Von/Bis verfeinern frei — dann ist kein Jahr mehr «gewählt». Keine
       Spannen-Grenze (Vorgabe); nur ein Ende vor dem Beginn wandert mit. */
    const setStart = (next: string) => {
        if (!next) return;
        setYearSel('');
        setStartDate(next);
        setEndDate((current) => (current < next ? next : current));
    };

    /* NUR echte Abwesenheiten: unerklärt (ABSENT) und manuell erfasst
       (OTHER). Urlaub, Krankheit und Homeoffice erklärt der Antrag — sie
       gehören auf die Urlaubsseite, nicht hierher. */
    const sorted = useMemo(
        () => absences
            .filter((row) => row.kind === 'ABSENT' || row.kind === 'OTHER')
            .sort((a, b) => a.date.localeCompare(b.date)),
        [absences],
    );

    return (
        <div className="ofi-tr flex flex-col gap-4">
            {/* ── DIE SUCHE: Jahr oder Von/Bis — ohne Spannen-Grenze ──────── */}
            <section className="ofi-tr-search" aria-label={t('personnel.leaveYear.absencesTile')}>
                <div className="ofi-tr-fields">
                    <label className="ofi-req-filter" style={{ maxWidth: 120 }}>
                        <span>{t('personnel.leaveYear.year')}</span>
                        <SelectMenu
                            value={yearSel}
                            onChange={applyYear}
                            ariaLabel={t('personnel.leaveYear.year')}
                            placeholder="—"
                            buttonClassName="ofi-cal-input ofi-pf-input"
                            listWidth={110}
                            options={yearOptions}
                        />
                    </label>
                    <label className="ofi-req-filter">
                        <span>{t('personnel.filter.startDate')}</span>
                        <DateField
                            value={startDate}
                            onChange={setStart}
                            min={hireKey || undefined}
                            ariaLabel={t('personnel.filter.startDate')}
                            buttonClassName="ofi-cal-input ofi-pf-input"
                        />
                    </label>
                    <label className="ofi-req-filter">
                        <span>{t('personnel.filter.endDate')}</span>
                        <DateField
                            value={endDate}
                            onChange={(next) => { if (next) { setYearSel(''); setEndDate(next); } }}
                            min={startDate}
                            ariaLabel={t('personnel.filter.endDate')}
                            buttonClassName="ofi-cal-input ofi-pf-input"
                        />
                    </label>
                    {canRecord && (
                        <GhostButton
                            icon={<Plus size={14} />}
                            onClick={() => setManualOpen(true)}
                            className="ml-auto self-end"
                        >
                            {t('personnel.absencesPopup.manualEntry')}
                        </GhostButton>
                    )}
                </div>
            </section>

            <SectionCard title={t('personnel.leaveYear.absences', { count: sorted.length })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 130 }} />
                        <col style={{ width: 170 }} />
                        <col />
                        <col style={{ width: 150 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('personnel.field.shiftDate')}</th>
                            <th className="text-left">{t('personnel.requests.type')}</th>
                            <th className="text-left">{t('personnel.field.note')}</th>
                            <th className="text-left">{t('personnel.field.status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || sorted.length === 0) && (
                            <TableStateRow
                                colSpan={4}
                                loading={loading}
                                emptyText={t('personnel.leaveYear.noAbsences')}
                            />
                        )}
                        {!loading && sorted.map((absence) => (
                            <tr key={`${absence.date}-${absence.requestId ?? 'none'}`}>
                                <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">
                                    {formatDate(absence.date)}
                                </td>
                                <td>
                                    <Chip className={absenceKindChipClass(absence.kind)}>
                                        {t(`personnel.absence.${absence.kind}`)}
                                    </Chip>
                                </td>
                                <td className="truncate text-[12.5px] text-slate-600 dark:text-white/70">
                                    {absence.label ?? ''}
                                </td>
                                <td className="text-[12px] text-slate-500 dark:text-white/60">
                                    {absence.pending
                                        ? t('personnel.leaveStatus.PENDING_MANAGER')
                                        : absence.kind === 'ABSENT'
                                            ? t('personnel.leaveYear.noRequest')
                                            : t('personnel.leaveStatus.APPROVED')}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>

            {/* ── FENSTER: NACHTRAG (Arbeitstage/Abwesenheit ab Eintritt) ─── */}
            <PopupCard
                open={manualOpen}
                onClose={() => setManualOpen(false)}
                title={t('personnel.absencesPopup.manualEntry')}
                width={620}
                closeOnOutside
            >
                <ManualEntryForm
                    employeeId={employeeId}
                    defaultStart={startDate}
                    defaultEnd={endDate}
                    minDate={hireKey || undefined}
                    onSaved={() => setTick((value) => value + 1)}
                />
            </PopupCard>
        </div>
    );
};
