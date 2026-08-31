import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { FileDownload02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { PopupButton, PopupCard } from '@/components/ui-shared/PopupKit';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { DateField } from '@/components/ui-shared/DateField';
import { TableStateRow } from '@/components/ui-shared/TableKit';
import { personnelHrApi } from '@/lib/api/personnel';
import { useAuthStore } from '@/store/authStore';
import '@/styles/personnel.css';

import type { AbsenceRow } from '../types/personnel';
import { Chip } from '../components/primitives';
import { ManualEntryForm } from '../components/ManualEntryForm';
import { absenceKindChipClass, formatDate, toInputDate } from '../utils/format';

/**
 * ── FENSTER «ABWESENHEITEN» (Neuaufbau 27.08.2026, Vorgabe Samet) ────────────
 *
 * ZWEI REITER (Vorgabe: «der Knopf zum Nachtragen ist getrennt — ein eigener
 * Reiter für manuelle Einträge»):
 *
 *   ABWESENHEITEN      die ECHTEN Fehltage aller Personen — unerklärt oder
 *                      manuell erfasst; was ein bewilligter Antrag erklärt
 *                      (Urlaub, Krankheit, Homeoffice), gehört zur
 *                      Urlaubsseite und steht hier NICHT (Vorgabe
 *                      27.08.2026). Gefiltert wird über Monat, GANZES JAHR
 *                      oder frei über Von/Bis — OHNE Spannen-Grenze. Daraus
 *                      direkt das Tabellen-PDF.
 *   MANUELLE ERFASSUNG das Nachtragen eines alten Bestands: anwesend als
 *                      Stempelzeilen, abwesend als bewilligter Eintrag mit
 *                      Grund (ab dem Eintrittsdatum, OHNE Zeitraumgrenze).
 */

type PopupTab = 'list' | 'manual';

export const AbsencesPopup = ({
    open,
    onClose,
    onChanged,
}: {
    open: boolean;
    onClose: () => void;
    /** Nach einem Nachtrag: die Suche der Seite dahinter ist überholt. */
    onChanged: () => void;
}) => {
    const { i18n } = useTranslation();
    const permissions = useAuthStore((state) => state.permissions);
    const canRecord = permissions.includes('attendance.update') || permissions.includes('attendance.create');

    const [tab, setTab] = useState<PopupTab>('list');

    /* DER LETZTE MONAT als Startfenster: heute einen Monat zurück. Die
       Auswahl springt auf einen Kalendermonat oder ein ganzes Jahr, die
       Datumsfelder verfeinern frei — ohne Spannen-Grenze. */
    const today = useMemo(() => new Date(), []);
    const [from, setFrom] = useState(() => toInputDate(new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())));
    const [to, setTo] = useState(() => toInputDate(today));
    /* '' = frei gewählter Zeitraum; 'YYYY-M' = ein Kalendermonat. */
    const [monthKey, setMonthKey] = useState('');

    const [rows, setRows] = useState<AbsenceRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        personnelHrApi.absences({ startDate: from, endDate: to })
            /* Nur ECHTE Abwesenheiten — was ein Antrag erklärt, steht auf der
               Urlaubsseite. Der Filter sitzt vor dem Zustand, damit Liste und
               PDF dieselben Zeilen führen. */
            .then((value) => {
                if (cancelled) return;
                setRows(value.rows.filter((row) => row.kind === 'ABSENT' || row.kind === 'OTHER'));
            })
            .catch(() => { if (!cancelled) setRows([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, from, to, tick]);

    const locale = i18n.language || 'de-CH';
    /* Die Auswahl: die letzten zwölf Kalendermonate UND — jahresweise
       (Vorgabe 27.08.2026) — die letzten Jahre. */
    const monthOptions = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
        const options = [{ value: '', label: t('personnel.absencesPopup.freeRange') }];
        for (let back = 0; back < 12; back += 1) {
            const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
            options.push({
                value: `${date.getFullYear()}-${date.getMonth() + 1}`,
                label: formatter.format(date),
            });
        }
        for (let back = 0; back < 6; back += 1) {
            const year = today.getFullYear() - back;
            options.push({
                value: `year-${year}`,
                label: t('personnel.absencesPopup.wholeYear', { year }),
            });
        }
        return options;
    }, [locale, today]);

    const applyMonth = (key: string) => {
        setMonthKey(key);
        if (!key) return;
        if (key.startsWith('year-')) {
            const year = Number(key.slice(5));
            setFrom(toInputDate(new Date(year, 0, 1)));
            setTo(toInputDate(new Date(year, 11, 31)));
            return;
        }
        const [year, month] = key.split('-').map(Number);
        setFrom(toInputDate(new Date(year, month - 1, 1)));
        setTo(toInputDate(new Date(year, month, 0)));
    };

    /* Keine Spannen-Grenze (Vorgabe: «keine Einschränkung beim Filtern») —
       nur ein Ende vor dem Beginn wandert mit. */
    const setStart = (next: string) => {
        if (!next) return;
        setMonthKey('');
        setFrom(next);
        setTo((current) => (current < next ? next : current));
    };

    const setEnd = (next: string) => {
        if (!next) return;
        setMonthKey('');
        setTo(next < from ? from : next);
    };

    const exportPdf = async () => {
        setExporting(true);
        try {
            const { exportAbsencesPdf } = await import('@/utils/pdf/personnelTimeRecordsPdf');
            await exportAbsencesPdf(rows, { startDate: from, endDate: to });
        } catch {
            toast.error(t('personnel.pdf.failed'));
        } finally {
            setExporting(false);
        }
    };

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            title={t('personnel.absencesPopup.title')}
            subtitle={`${formatDate(from)} – ${formatDate(to)}`}
            width={780}
            closeOnOutside
            headerActions={(
                <span className="flex items-center gap-1">
                    <button
                        type="button"
                        aria-pressed={tab === 'list'}
                        onClick={() => setTab('list')}
                        className={`ofi-tr-preset ${tab === 'list' ? 'is-active' : ''}`}
                    >
                        {t('personnel.absencesPopup.listTab')}
                    </button>
                    {canRecord && (
                        <button
                            type="button"
                            aria-pressed={tab === 'manual'}
                            onClick={() => setTab('manual')}
                            className={`ofi-tr-preset ${tab === 'manual' ? 'is-active' : ''}`}
                        >
                            {t('personnel.absencesPopup.manualEntry')}
                        </button>
                    )}
                </span>
            )}
        >
            {tab === 'manual' && canRecord ? (
                <ManualEntryForm
                    defaultStart={from}
                    defaultEnd={to}
                    onSaved={() => { setTick((value) => value + 1); onChanged(); }}
                />
            ) : (
                <div className="flex flex-col gap-4">
                    {/* ── DER FILTER: Monat, Jahr ODER Von/Bis — höchstens ein Jahr ── */}
                    <div className="flex flex-wrap items-end gap-2.5">
                        <label className="ofi-req-filter" style={{ maxWidth: 190 }}>
                            <span>{t('personnel.absencesPopup.month')}</span>
                            <SelectMenu
                                value={monthKey}
                                onChange={applyMonth}
                                ariaLabel={t('personnel.absencesPopup.month')}
                                buttonClassName="ofi-cal-input ofi-pf-input"
                                listWidth={210}
                                options={monthOptions}
                            />
                        </label>
                        <label className="ofi-req-filter" style={{ maxWidth: 160 }}>
                            <span>{t('personnel.filter.startDate')}</span>
                            <DateField
                                value={from}
                                onChange={setStart}
                                ariaLabel={t('personnel.filter.startDate')}
                                buttonClassName="ofi-cal-input ofi-pf-input"
                            />
                        </label>
                        <label className="ofi-req-filter" style={{ maxWidth: 160 }}>
                            <span>{t('personnel.filter.endDate')}</span>
                            <DateField
                                value={to}
                                onChange={setEnd}
                                min={from}
                                ariaLabel={t('personnel.filter.endDate')}
                                buttonClassName="ofi-cal-input ofi-pf-input"
                            />
                        </label>
                        <span className="ml-auto">
                            <PopupButton
                                variant="primary"
                                icon={<FileDownload02 size={14} />}
                                loading={exporting}
                                disabled={rows.length === 0}
                                onClick={() => void exportPdf()}
                            >
                                {t('personnel.filter.generatePdf')}
                            </PopupButton>
                        </span>
                    </div>

                    {/* ── DIE FEHLTAGE, NACH DATUM ─────────────────────────── */}
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <col style={{ width: 110 }} />
                            <col />
                            <col style={{ width: 150 }} />
                            <col />
                            <col style={{ width: 150 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('personnel.field.shiftDate')}</th>
                                <th className="text-left">{t('personnel.field.name')}</th>
                                <th className="text-left">{t('personnel.requests.type')}</th>
                                <th className="text-left">{t('personnel.field.note')}</th>
                                <th className="text-left">{t('personnel.field.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || rows.length === 0) && (
                                <TableStateRow
                                    colSpan={5}
                                    loading={loading}
                                    emptyText={t('personnel.absencesPopup.empty')}
                                />
                            )}
                            {!loading && rows.map((row) => (
                                <tr key={`${row.employeeId}-${row.date}`}>
                                    <td className="font-mono text-[12.5px] text-slate-700 dark:text-white/80">
                                        {formatDate(row.date)}
                                    </td>
                                    <td className="truncate text-[12.5px] font-medium text-slate-800 dark:text-white">
                                        {`${row.firstName} ${row.lastName}`.trim()}
                                    </td>
                                    <td>
                                        <Chip className={absenceKindChipClass(row.kind)}>
                                            {t(`personnel.absence.${row.kind}`)}
                                        </Chip>
                                    </td>
                                    <td className="truncate text-[12.5px] text-slate-600 dark:text-white/70">
                                        {row.label ?? ''}
                                    </td>
                                    <td className="text-[12px] text-slate-500 dark:text-white/60">
                                        {row.pending
                                            ? t('personnel.leaveStatus.PENDING_MANAGER')
                                            : row.kind === 'ABSENT'
                                                ? t('personnel.leaveYear.noRequest')
                                                : t('personnel.leaveStatus.APPROVED')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </PopupCard>
    );
};
