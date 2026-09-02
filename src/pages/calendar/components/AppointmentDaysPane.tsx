import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';

import { AUTOSAVE_NOTICE, type PaneSaveReport, type PaneSaveState } from '@/components/ui-shared/AppointmentDocuments';

import { DayPlanRows, daysValid, sortDays, type DaySpan } from './DayPlanRows';
import { gmtOffsetLabel, timeZoneId } from '../calendarShared';

/**
 * DER EINSATZPLAN ALS SPALTE, NICHT ALS FENSTER (24.08.2026).
 *
 * Vorgabe Samet: «Die Tage sollen so erscheinen wie die Unterlagen — kein
 * eigenes Fenster, das aufspringt.» Also dieselbe Fläche wie dort: eine Spalte
 * NEBEN den Angaben, die einfach da ist, wenn man sie aufklappt. Kein
 * Aufblenden, kein Springen, keine zweite Karte über der ersten.
 *
 * Der Inhalt ist derselbe wie beim Anlegen (DayPlanRows): eine Zeile je Tag mit
 * Datum, von und bis. Gespeichert wird mit dem breiten Knopf ganz am Schluss im
 * Fuss der Karte — die Spalte reicht ihm dafür diesen Griff. Und NUR mit ihm:
 * von selbst geht hier nichts hinaus (01.09.2026, siehe unten).
 */
export type DaysPaneHandle = {
    dirty: boolean;
    save: () => Promise<boolean>;
    /** Sichern — was der Knopf im Fuss der Karte drückt. */
    saveNow: () => void;
    /** Immer `false`: das Zumachen der Spalte sichert hier nichts nach. */
    saveOnClose?: boolean;
};

export const AppointmentDaysPane = ({ appointmentId, canEdit, handleRef, onSaved, onSaveState }: {
    appointmentId: string;
    canEdit: boolean;
    handleRef?: MutableRefObject<DaysPaneHandle | null>;
    onSaved?: () => void;
    /** Für den Speichern-Knopf im Fuss der Karte: was er anzeigen soll. */
    onSaveState?: PaneSaveReport;
}) => {
    const [days, setDays] = useState<DaySpan[] | null>(null);
    const [lockedIds, setLockedIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    /* Der Stand, wie er vom Server kam — daran erkennt der Knopf im Fuss, ob es
       überhaupt etwas zu speichern gibt. */
    const original = useRef<string>('');

    const fingerprint = (list: DaySpan[]) =>
        list.map((day) => `${day.appointmentId || 'new'}:${day.start.valueOf()}:${day.end.valueOf()}`).join('|');

    useEffect(() => {
        let cancelled = false;
        projectApi.getAppointmentSeries(appointmentId)
            .then((series) => {
                if (cancelled) return;
                const loaded = sortDays(series.days.map((day) => ({
                    appointmentId: day.id,
                    start: dayjs(day.startTime),
                    end: dayjs(day.endTime),
                })));
                setDays(loaded);
                original.current = fingerprint(loaded);
                setLockedIds(series.days.filter((day) => day.status === 'COMPLETED').map((day) => day.id));
            })
            .catch(() => { if (!cancelled) setDays([]); });
        return () => { cancelled = true; };
    }, [appointmentId]);

    const save = async (): Promise<boolean> => {
        if (!days?.length || !daysValid(days)) {
            setError(t('calendar.days.invalid'));
            return false;
        }
        setError(null);
        try {
            const result = await projectApi.saveAppointmentDays(appointmentId, {
                days: days.map((day) => ({
                    ...(day.appointmentId ? { appointmentId: day.appointmentId } : {}),
                    startTime: day.start.toISOString(),
                    endTime: day.end.toISOString(),
                })),
            });
            const saved = sortDays(result.days.map((day) => ({
                appointmentId: day.id,
                start: dayjs(day.startTime),
                end: dayjs(day.endTime),
            })));
            setDays(saved);
            original.current = fingerprint(saved);
            onSaved?.();
            return true;
        } catch (saveError: any) {
            const message = saveError?.response?.data?.error || t('calendar.days.saveFailed');
            setError(message);
            toast.error(message);
            return false;
        }
    };

    const dirty = days ? fingerprint(days) !== original.current : false;

    /**
     * KEIN SELBSTSICHERN MEHR (01.09.2026, Vorgabe Samet: «Änderungen werden
     * nicht automatisch gespeichert — sobald gelöscht oder hinzugefügt wird,
     * wird der graue Knopf aktiv und anklickbar»).
     *
     * Vom 25.08.2026 bis heute sicherte der Plan sich selbst, kurz nach der
     * letzten Änderung. Beim Begleitwort ist das richtig — dort tippt man einen
     * Satz. Beim Einsatzplan war es falsch: ein Tag, der aus der Liste
     * verschwindet, IST eine Löschung, und an ihm hängen Rapport, Spesen und
     * Material. So etwas löst niemand aus, indem er eine Sekunde lang nichts
     * tut.
     *
     * Der Knopf im Fuss der Karte ist jetzt der EINZIGE Weg hinaus (PaneSaveButton):
     * grau, solange nichts geändert wurde, aktiv ab der ersten Änderung. Wer
     * die Spalte zumacht, ohne ihn zu drücken, hat nichts geändert — auf dem
     * Server steht weiter der Plan, der beim Aufklappen geladen wurde, und beim
     * nächsten Aufklappen steht er wieder da.
     *
     * Damit fällt auch das Netz beim Verlassen weg: es sicherte, was niemand
     * abgeschickt hatte, und wäre damit ein zweiter, unsichtbarer Speichern-Knopf.
     */

    const [notice, setNotice] = useState(false);
    const wasSaving = useRef(false);
    useEffect(() => {
        if (wasSaving.current && !saving && !dirty) setNotice(true);
        wasSaving.current = saving;
    }, [saving, dirty]);
    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(false), AUTOSAVE_NOTICE);
        return () => window.clearTimeout(timer);
    }, [notice]);
    const saveState: PaneSaveState = saving ? 'saving' : notice ? 'saved' : 'idle';
    /** Was der Knopf im Fuss drückt — der einzige Weg auf den Server. */
    const saveNow = () => {
        if (!days || !daysValid(days)) { setError(t('calendar.days.invalid')); return; }
        setSaving(true);
        void save().finally(() => setSaving(false));
    };

    /* Bei JEDER Änderung nachgeführt: sein Speichern-Knopf fragt den Griff bei
       jedem Druck, und er muss den Plan kennen, der gerade dasteht.
       `saveOnClose: false` — das X der Spalte sichert hier nichts nach. */
    useEffect(() => {
        if (handleRef) handleRef.current = { dirty, save, saveNow, saveOnClose: false };
    });
    /* Was der Knopf im Fuss anzeigt: nur diese zwei Angaben gehen hinauf. */
    useEffect(() => { onSaveState?.(dirty, saveState); }, [dirty, saveState]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!days) {
        return (
            <div className="space-y-1.5">
                {[0, 1].map((row) => <div key={row} className="ofi-shimmer h-9 rounded-lg bg-slate-100 dark:bg-white/5" />)}
            </div>
        );
    }

    return (
        <>
            <DayPlanRows days={days} onChange={setDays} lockedIds={lockedIds} disabled={!canEdit} />
            <div className="ofi-cal-tznote" title={timeZoneId() || undefined}>
                {t('calendar.timeZone')}: {gmtOffsetLabel()}{timeZoneId() ? ` · ${timeZoneId()}` : ''}
            </div>
            {error && <div className="ofi-cal-warn">{error}</div>}
            {/* Neue Tage werden aufgeboten: die Teammail geht mit dem ganzen
                Einsatzplan noch einmal raus. Reine Zeitverschiebungen bleiben
                still (Hausregel seit 19.08.2026). */}
            {canEdit && <p className="ofi-cal-invitehint">{t('calendar.days.mailHint')}</p>}
            {/* Kein Knopf mehr in der Spalte — er steht im Fuss der Karte,
                rechts neben dem Pfeil, und gilt dort für beide Spalten
                (25.08.2026, Vorgabe Samet). */}
        </>
    );
};
