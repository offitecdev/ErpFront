/**
 * ── ZEITRÄUME PER KLICK (26.08.2026, Vorgabe Samet) ──────────────────────────
 *
 *   «Ein Arbeitszeitnachweis, in dem sich über die Wahl eines Datums schnell
 *    eine Auswertung erzeugen lässt: täglich, wöchentlich, monatlich oder ein
 *    bestimmter Zeitraum; zum Beispiel „Di" (der letzte Dienstag), um die
 *    Arbeitszeiten anzuzeigen.»
 *
 * Diese Datei rechnet NUR Zeiträume aus. Sie kennt weder eine Tabelle noch
 * einen Serverweg — beide Seiten (die Arbeitszeiterfassung über alle Personen
 * und der Reiter «Arbeitszeiten» einer Person) sollen dieselben Knöpfe haben
 * und dabei nicht zwei Rechnungen führen.
 *
 * Alle Rückgaben sind ein Paar aus "YYYY-MM-DD" — genau das, was ein
 * `<input type="date">` trägt und was der Server als Filter erwartet.
 */
import { toInputDate } from './format';

export interface DateRange {
    startDate: string;
    endDate: string;
}

/** Die Schnellwahlen des Kopfs. `custom` ist der frei gesetzte Zeitraum. */
export const RANGE_PRESETS = [
    'today',
    'yesterday',
    'thisWeek',
    'lastWeek',
    'thisMonth',
    'lastMonth',
    'thisYear',
    'custom',
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) => {
    const next = startOfDay(date);
    next.setDate(next.getDate() + days);
    return next;
};

/** ISO-Wochentag: Mo=1 … So=7 (JavaScript liefert So=0). */
export const isoWeekday = (date: Date): number => (date.getDay() === 0 ? 7 : date.getDay());

/** Montag der Woche, in der `date` liegt. */
const startOfIsoWeek = (date: Date) => addDays(date, -(isoWeekday(date) - 1));

const range = (from: Date, to: Date): DateRange => ({
    startDate: toInputDate(from),
    endDate: toInputDate(to),
});

/**
 * Der Zeitraum einer Schnellwahl. `custom` liefert den laufenden Monat — es
 * ist der Startwert, den die Seite zeigt, bis jemand die Daten selbst setzt.
 */
export const resolvePreset = (preset: RangePreset, reference = new Date()): DateRange => {
    const today = startOfDay(reference);
    switch (preset) {
        case 'today':
            return range(today, today);
        case 'yesterday': {
            const day = addDays(today, -1);
            return range(day, day);
        }
        case 'thisWeek':
            return range(startOfIsoWeek(today), addDays(startOfIsoWeek(today), 6));
        case 'lastWeek': {
            const monday = addDays(startOfIsoWeek(today), -7);
            return range(monday, addDays(monday, 6));
        }
        case 'lastMonth': {
            const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            return range(first, new Date(today.getFullYear(), today.getMonth(), 0));
        }
        case 'thisYear':
            return range(new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear(), 11, 31));
        case 'thisMonth':
        case 'custom':
        default:
            return range(
                new Date(today.getFullYear(), today.getMonth(), 1),
                new Date(today.getFullYear(), today.getMonth() + 1, 0),
            );
    }
};

/**
 * DER WOCHENTAG-KNOPF: «Di» heisst der ZULETZT vergangene Dienstag — heute
 * eingeschlossen, wenn heute Dienstag ist. Er setzt einen EINZELNEN Tag, nicht
 * eine Woche: gefragt war «der letzte Dienstag», nicht «alle Dienstage».
 */
export const lastWeekdayRange = (isoDay: number, reference = new Date()): DateRange => {
    const today = startOfDay(reference);
    const diff = (isoWeekday(today) - isoDay + 7) % 7;
    const day = addDays(today, -diff);
    return range(day, day);
};

/** Der ganze Monat, in dem `date` liegt — die Schnellwahl «monatlich». */
export const monthRangeOf = (date: Date): DateRange => range(
    new Date(date.getFullYear(), date.getMonth(), 1),
    new Date(date.getFullYear(), date.getMonth() + 1, 0),
);

/** Die Woche, in der `date` liegt — die Schnellwahl «wöchentlich». */
export const weekRangeOf = (date: Date): DateRange => {
    const monday = startOfIsoWeek(date);
    return range(monday, addDays(monday, 6));
};

/**
 * ── HÖCHSTENS EIN MONAT (27.08.2026, Vorgabe) ────────────────────────────────
 * Die Zeitfilter des Moduls nehmen höchstens einen Monat an («z. B.
 * 01.08 – 31.08»). `maxRangeEnd` ist der späteste erlaubte Endtag zu einem
 * Beginn; `clampRangeEnd` zieht ein zu weites oder zu frühes Ende darauf
 * zurück. Beide Seiten (Arbeitszeiten der Person, Erfassung über alle) rechnen
 * hiermit — nicht jede für sich.
 */
export const maxRangeEnd = (startDate: string, months = 1): string => {
    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return startDate;
    const end = new Date(start.getFullYear(), start.getMonth() + months, start.getDate() - 1);
    return toInputDate(end);
};

export const clampRangeEnd = (startDate: string, endDate: string, months = 1): string => {
    if (!startDate) return endDate;
    if (!endDate || endDate < startDate) return startDate;
    const limit = maxRangeEnd(startDate, months);
    return endDate > limit ? limit : endDate;
};

/** Kalendertage im Zeitraum, beide Enden eingeschlossen. */
export const daysInRange = (from: string, to: string): number => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
};
