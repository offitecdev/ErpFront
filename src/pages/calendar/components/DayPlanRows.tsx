import dayjs from 'dayjs';

import { useEffect, useState } from 'react';

import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { crossesMidnight, spanOnDay } from '../calendarShared';

/**
 * DER EINSATZPLAN — EINE ZEILE JE TAG (24.08.2026).
 *
 * Vorgabe Samet: «Termine sollen über mehrere aufeinanderfolgende Tage gehen
 * können, jeder Tag mit eigenen Uhrzeiten.» Genau das steht hier: Nummer,
 * Datum, von, bis — und ein Knopf, der einen weiteren Tag anhängt.
 *
 * Bewusst KEIN «von–bis»-Bereich als eigene Eingabe: der Bereich wäre eine
 * zweite Wahrheit neben den Zeilen, und geplant wird ohnehin je Tag. Mehrere
 * Tage auf einmal kommen aus dem Raster (seitwärts ziehen) — dort ist die
 * Geste natürlich, hier wäre sie ein Formular mehr.
 *
 * DASSELBE BAUTEIL an zwei Stellen: beim Anlegen (CreatePopup) und beim
 * Ausdehnen eines bestehenden Einsatzes (AppointmentDaysPane — die Spalte
 * neben den Angaben, kein eigenes Fenster). Ein Tag, der schon läuft, trägt
 * seine `appointmentId` mit — daran erkennt der Server, was fortgeschrieben
 * und was neu angelegt wird.
 */

export type DaySpan = {
    start: dayjs.Dayjs;
    end: dayjs.Dayjs;
    /** Gesetzt = dieser Tag existiert schon; leer = er kommt neu dazu. */
    appointmentId?: string;
};

/** Immer nach Datum sortiert — auch der Server ordnet so. */
export const sortDays = (days: DaySpan[]): DaySpan[] =>
    [...days].sort((a, b) => a.start.valueOf() - b.start.valueOf());

export const daysValid = (days: DaySpan[]): boolean => {
    if (!days.length) return false;
    // Höchstens 24 Stunden am Stück, kein Anfangstag zweimal — und kein Tag,
    // der beginnt, bevor die Nachtschicht davor zu Ende ist. Dieselben drei
    // Regeln prüft der Server (appointmentSeries.ts).
    if (!days.every((day) => day.end.isAfter(day.start) && day.end.diff(day.start, 'hour', true) <= 24)) return false;
    if (new Set(days.map((day) => day.start.format('YYYY-MM-DD'))).size !== days.length) return false;
    const sorted = sortDays(days);
    return sorted.every((day, index) => index === 0 || !day.start.isBefore(sorted[index - 1].end));
};

/**
 * Der nächste freie Tag nach dem letzten — mit DESSEN Zeiten (Vorgabe
 * 24.08.2026: «beim neuen Tag bleibt die Zeit für alle gleich»). So plant man
 * einen Einsatz wirklich: «Montag bis Donnerstag, jeweils 08:00 bis 17:00».
 * Wer einen einzelnen Tag anders braucht, stellt genau diesen um; wer die
 * Zeiten nachträglich angleichen will, nimmt «Gleiche Zeiten für alle».
 */
export const appendDay = (days: DaySpan[]): DaySpan[] => {
    const last = days[days.length - 1];
    if (!last) return days;
    const taken = new Set(days.map((day) => day.start.format('YYYY-MM-DD')));
    let next = last.start.add(1, 'day');
    while (taken.has(next.format('YYYY-MM-DD'))) next = next.add(1, 'day');
    return sortDays([...days, spanOnDay(last, next)]);
};

export const patchDay = (days: DaySpan[], index: number, patch: { date?: string; from?: string; to?: string }): DaySpan[] =>
    sortDays(days.map((day, position) => {
        if (position !== index) return day;
        let { start, end } = day;
        if (patch.date) {
            const picked = dayjs(patch.date);
            if (!picked.isValid()) return day;
            const moved = spanOnDay({ start, end }, picked);
            start = moved.start;
            end = moved.end;
        }
        if (patch.from) {
            const [hour, minute] = patch.from.split(':').map(Number);
            if (Number.isNaN(hour) || Number.isNaN(minute)) return day;
            // Die Länge bleibt, auch wenn sie über Mitternacht reicht.
            const length = Math.max(15, end.diff(start, 'minute'));
            start = start.hour(hour).minute(minute).second(0).millisecond(0);
            end = start.add(length, 'minute');
        }
        if (patch.to) {
            const [hour, minute] = patch.to.split(':').map(Number);
            if (Number.isNaN(hour) || Number.isNaN(minute)) return day;
            /* NACHTMONTAGE (24.08.2026). Eine Endzeit VOR der Anfangszeit meint
               den nächsten Morgen — «20:00 bis 02:00» ist eine Schicht und
               nicht ein Tippfehler. Der Termin bleibt dabei EIN Termin (eine
               Karte, ein Rapport); zwei Zeilen wären zwei Arbeitstage. */
            end = start.hour(hour).minute(minute).second(0).millisecond(0);
            if (!end.isAfter(start)) end = end.add(1, 'day');
        }
        return { ...day, start, end };
    }));

/**
 * SEITWÄRTS AUSGEDEHNT (24.08.2026): der Einsatz soll von `firstDay` bis
 * `lastDay` laufen. Schon geplante Tage bleiben unangetastet — mit ihren
 * Zeiten und, wenn sie bereits existieren, mit ihrer `appointmentId`. Neue Tage
 * übernehmen die Zeiten des NÄCHSTGELEGENEN geplanten Tages; wer rechts
 * anhängt, bekommt so die Zeiten des letzten, wer links anhängt die des ersten.
 *
 * Es wird nur hinzugefügt: Tage ausserhalb der Spanne bleiben stehen. Streichen
 * ist eine ausdrückliche Geste (der Papierkorb in der Liste) — daran hängen
 * Rapport, Spesen und Material.
 */
export const extendDays = (days: DaySpan[], firstDay: dayjs.Dayjs, lastDay: dayjs.Dayjs): DaySpan[] => {
    if (!days.length) return days;
    const known = new Set(days.map((day) => day.start.format('YYYY-MM-DD')));
    const out = [...days];
    let cursor = firstDay.startOf('day');
    const stop = lastDay.startOf('day');
    while (!cursor.isAfter(stop, 'day')) {
        const key = cursor.format('YYYY-MM-DD');
        if (!known.has(key)) {
            const reference = days.reduce((closest, day) => (
                Math.abs(day.start.startOf('day').diff(cursor, 'day')) < Math.abs(closest.start.startOf('day').diff(cursor, 'day'))
                    ? day
                    : closest
            ), days[0]);
            out.push(spanOnDay(reference, cursor));
            known.add(key);
        }
        cursor = cursor.add(1, 'day');
    }
    return sortDays(out);
};

/** Die Zeiten des ersten Tages auf alle übrigen übertragen. */
export const sameTimesForAll = (days: DaySpan[]): DaySpan[] => {
    const first = days[0];
    if (!first) return days;
    return days.map((day, index) => (index === 0 ? day : { ...day, ...spanOnDay(first, day.start) }));
};

/**
 * EIN TAG WIRD IN ZWEI SCHRITTEN GESTRICHEN (25.08.2026).
 *
 * Solange es einen Speichern-Knopf gab, war er die Rückfrage: einen Tag
 * herausnehmen und nicht speichern hiess, es war nie passiert. Seit das Blatt
 * sich selbst sichert (Vorgabe Samet: «kein Speichern-Knopf — es soll von
 * selbst sichern»), würde EIN Klick auf den Papierkorb den Tag eine Sekunde
 * später wirklich löschen — mitsamt Rapport, Spesen und Material.
 *
 * Also fragt der Papierkorb selbst: der erste Klick macht ihn rot, der zweite
 * streicht den Tag. Ein Klick daneben, und er ist wieder still. Die übrigen
 * Änderungen (Datum, Zeiten, ein Tag mehr) brauchen das nicht — sie nehmen
 * nichts weg.
 */
const ARM_TIMEOUT = 4000;

export const DayPlanRows = ({ days, onChange, lockedIds = [], disabled = false }: {
    days: DaySpan[];
    onChange: (next: DaySpan[]) => void;
    /** Tage, die nicht mehr gestrichen werden dürfen (abgeschlossene Arbeit). */
    lockedIds?: string[];
    disabled?: boolean;
}) => {
    const multiDay = days.length > 1;
    const locked = new Set(lockedIds);
    /** Welcher Papierkorb gerade gefragt hat. */
    const [armed, setArmed] = useState<number | null>(null);

    useEffect(() => {
        if (armed === null) return;
        const timer = window.setTimeout(() => setArmed(null), ARM_TIMEOUT);
        return () => window.clearTimeout(timer);
    }, [armed]);

    return (
        <>
            <div className="ofi-cal-days">
                {/* JEDE ZEILE EIN RASTER, keine Flucht aus aneinandergereihten
                    Feldern (Vorgabe 24.08.2026: «die Papierkörbe müssen
                    ausgerichtet sein — die Nummern, alles»). Feste Spalten
                    heisst: Nummer unter Nummer, Datum unter Datum, Papierkorb
                    unter Papierkorb, egal wie lang der Inhalt ist. Der
                    Papierkorb-Platz bleibt auch dann stehen, wenn die Zeile
                    keinen hat — sonst rutschte die ganze Zeile. */}
                {days.map((day, index) => (
                    <div key={day.appointmentId || `${day.start.valueOf()}-${index}`} className="ofi-cal-dayrow">
                        <span className="ofi-cal-dayrow__num">{t('calendar.days.dayNumber', { index: index + 1 })}</span>
                        <input
                            type="date"
                            value={day.start.format('YYYY-MM-DD')}
                            disabled={disabled}
                            onChange={(event) => onChange(patchDay(days, index, { date: event.target.value }))}
                            className="ofi-cal-input"
                        />
                        <input
                            type="time"
                            value={day.start.format('HH:mm')}
                            disabled={disabled}
                            onChange={(event) => onChange(patchDay(days, index, { from: event.target.value }))}
                            className="ofi-cal-input"
                        />
                        <span className="ofi-cal-dayrow__dash">–</span>
                        <span className="ofi-cal-dayrow__end">
                            <input
                                type="time"
                                value={day.end.format('HH:mm')}
                                disabled={disabled}
                                onChange={(event) => onChange(patchDay(days, index, { to: event.target.value }))}
                                className="ofi-cal-input"
                            />
                            {/* «+1» = die Schicht endet am nächsten Morgen. Ohne
                                dieses Zeichen läse sich «20:00 – 02:00» wie ein
                                Fehler; es bleibt EIN Termin. */}
                            {crossesMidnight(day) && (
                                <span className="ofi-cal-nextday" title={t('calendar.days.overnight')}>+1</span>
                            )}
                        </span>
                        {multiDay && !disabled && !locked.has(day.appointmentId || '') ? (
                            <button
                                type="button"
                                onClick={() => {
                                    if (armed !== index) { setArmed(index); return; }
                                    setArmed(null);
                                    onChange(days.filter((_, position) => position !== index));
                                }}
                                onBlur={() => setArmed((current) => (current === index ? null : current))}
                                className={`ofi-cal-dayrow__drop ${armed === index ? 'is-armed' : ''}`}
                                aria-label={t('calendar.days.remove')}
                                title={armed === index ? t('calendar.days.removeConfirm') : t('calendar.days.remove')}
                            >
                                <Trash01 size={13} />
                            </button>
                        ) : <span aria-hidden />}
                    </div>
                ))}
            </div>

            {!disabled && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => onChange(appendDay(days))} className="ofi-cal-btn">
                        <Plus size={13} />
                        {t('calendar.days.add')}
                    </button>
                    {multiDay && (
                        <button type="button" onClick={() => onChange(sameTimesForAll(days))} className="ofi-cal-btn">
                            {t('calendar.days.sameTimes')}
                        </button>
                    )}
                </div>
            )}
        </>
    );
};
