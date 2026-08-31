import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { PopupButton, PopupNote } from '@/components/ui-shared/PopupKit';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { DateField } from '@/components/ui-shared/DateField';
import { personnelApi, personnelHrApi } from '@/lib/api/personnel';
import { fetchStaffDirectory, type StaffDirectoryRow } from '@/lib/api/directory';

import { toInputDate } from '../utils/format';

/**
 * ── MANUELLE ERFASSUNG (27.08.2026, Vorgabe Samet) ───────────────────────────
 *
 * EIN Formular für beides — ein alter Bestand wird nachgetragen:
 *
 *   ANWESEND   je geplantem, vergangenem, noch leerem Arbeitstag des Zeitraums
 *              entsteht eine manuelle Stempelzeile mit den Planzeiten.
 *   ABWESEND   der Zeitraum wird als bereits bewilligter Antrag mit Grund
 *              abgelegt («etwa beim Eintritt» — der Beginn darf nicht vor dem
 *              Eintrittsdatum liegen, das prüft der Server).
 *
 * Das Bauteil steht an ZWEI Orten — im Abwesenheitsfenster der
 * Arbeitszeiterfassung (mit Personenwahl) und im Abwesenheits-Fenster der
 * Personenseite (Person steht fest) — und darf dort nicht auseinanderlaufen.
 */

const INPUT = 'ofi-cal-input ofi-pf-input';

type EntryMode = 'PRESENT' | 'ABSENT';

export const ManualEntryForm = ({
    employeeId,
    defaultStart,
    defaultEnd,
    minDate,
    onSaved,
}: {
    /** Steht die Person fest (Personenseite), entfällt die Auswahl. */
    employeeId?: string;
    defaultStart: string;
    defaultEnd: string;
    /** Frühester Beginn — das Eintrittsdatum, wenn es bekannt ist. */
    minDate?: string;
    onSaved: () => void;
}) => {
    const fixedPerson = Boolean(employeeId);
    /* NACHGETRAGEN WIRD VERGANGENES — OHNE Zeitraumgrenze (Vorgabe
       27.08.2026: «beim manuellen Nachtragen gibt es keine Beschränkung»).
       Die Kalender bieten trotzdem nichts an, was der Server ablehnen würde:
       nichts nach heute, nichts vor dem Eintritt — dazwischen ist alles
       erlaubt, und sei es die ganze Anstellung. */
    const todayKey = toInputDate(new Date());
    const clampEnd = (start: string, end: string): string => {
        if (end < start) return start;
        return end > todayKey ? todayKey : end;
    };
    const [mode, setMode] = useState<EntryMode>('PRESENT');
    const [people, setPeople] = useState<StaffDirectoryRow[]>([]);
    const [personId, setPersonId] = useState(employeeId ?? '');
    const [from, setFrom] = useState(defaultStart);
    const [to, setTo] = useState(() => clampEnd(defaultStart, defaultEnd));
    const [label, setLabel] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFrom(defaultStart);
        setTo(clampEnd(defaultStart, defaultEnd));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultStart, defaultEnd]);
    useEffect(() => { if (employeeId) setPersonId(employeeId); }, [employeeId]);

    // Die Personenliste nur, wenn überhaupt gewählt wird.
    useEffect(() => {
        if (fixedPerson || people.length > 0) return;
        void fetchStaffDirectory().then(setPeople);
    }, [fixedPerson, people.length]);

    const submit = async () => {
        if (!personId) {
            toast.error(t('personnel.absencesPopup.personRequired'));
            return;
        }
        if (!from || !to || to < from) {
            toast.error(t('personnel.leave.rangeInvalid'));
            return;
        }
        setSaving(true);
        try {
            if (mode === 'PRESENT') {
                const result = await personnelApi.bulkCreateTimeEntries({ employeeId: personId, startDate: from, endDate: to });
                toast.success(t('personnel.absencesPopup.recorded', { count: result.created }));
            } else {
                const result = await personnelHrApi.createManualAbsence({
                    employeeId: personId,
                    startDate: from,
                    endDate: to,
                    label: label.trim() || undefined,
                });
                toast.success(t('personnel.absencesPopup.absentRecorded', { count: result.totalDays }));
                setLabel('');
            }
            onSaved();
        } catch (error) {
            toast.error(
                (error as { response?: { data?: { error?: string } } })?.response?.data?.error
                || t('personnel.absencesPopup.recordFailed'),
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-white/15">
            {/* Die ART zuerst — sie sagt, was darunter gebraucht wird. */}
            <div className="flex items-center gap-1.5">
                {(['PRESENT', 'ABSENT'] as EntryMode[]).map((key) => (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={mode === key}
                        onClick={() => setMode(key)}
                        className={`ofi-tr-preset ${mode === key ? 'is-active' : ''}`}
                    >
                        {t(`personnel.absencesPopup.mode.${key}`)}
                    </button>
                ))}
            </div>

            <div className={`grid gap-3 ${fixedPerson ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
                {!fixedPerson && (
                    <label className="ofi-req-filter">
                        <span>{t('personnel.field.name')}</span>
                        <SelectMenu
                            value={personId}
                            onChange={setPersonId}
                            ariaLabel={t('personnel.field.name')}
                            placeholder={t('personnel.absencesPopup.personPlaceholder')}
                            buttonClassName={INPUT}
                            listWidth={280}
                            options={people.map((person) => ({
                                value: person.id,
                                label: `${person.firstName} ${person.lastName}`.trim() || person.email || person.id,
                            }))}
                        />
                    </label>
                )}
                <label className="ofi-req-filter">
                    <span>{t('personnel.filter.startDate')}</span>
                    <DateField
                        value={from}
                        onChange={(next) => { if (next) { setFrom(next); setTo((current) => clampEnd(next, current)); } }}
                        min={minDate}
                        max={todayKey}
                        ariaLabel={t('personnel.filter.startDate')}
                        buttonClassName={INPUT}
                    />
                </label>
                <label className="ofi-req-filter">
                    <span>{t('personnel.filter.endDate')}</span>
                    <DateField
                        value={to}
                        onChange={(next) => { if (next) setTo(clampEnd(from, next)); }}
                        min={from}
                        max={todayKey}
                        ariaLabel={t('personnel.filter.endDate')}
                        buttonClassName={INPUT}
                    />
                </label>
            </div>

            {mode === 'ABSENT' && (
                <label className="ofi-req-filter">
                    <span>{t('personnel.absencesPopup.reason')}</span>
                    <input
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        maxLength={120}
                        placeholder={t('personnel.absencesPopup.reasonPlaceholder')}
                        className={`${INPUT} w-full`}
                    />
                </label>
            )}

            <PopupNote>
                {mode === 'PRESENT'
                    ? t('personnel.absencesPopup.recordHint')
                    : t('personnel.absencesPopup.absentHint')}
            </PopupNote>
            <div className="flex justify-end">
                <PopupButton variant="primary" loading={saving} onClick={() => void submit()}>
                    {mode === 'PRESENT'
                        ? t('personnel.absencesPopup.recordSubmit')
                        : t('personnel.absencesPopup.absentSubmit')}
                </PopupButton>
            </div>
        </div>
    );
};
