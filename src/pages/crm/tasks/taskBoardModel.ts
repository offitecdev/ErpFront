import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import { t } from '@/i18n/translate';
import type { CrmTaskRow } from '@/lib/api/crm';

dayjs.extend(isoWeek);

/* Reine Regeln des Aufgabenbretts — getrennt von der Komponente, damit Fast
   Refresh die Karten sauber tauschen kann und Zeitraum, Seiten und Farben
   überall (eigene Seite UND Kalendermodul) gleich gerechnet werden. */

/**
 * Wessen Aufgaben:
 *   • `me`  — MIT MIR: ich stehe in den Verantwortlichen (ob von jemand anderem
 *             zugewiesen oder von mir selbst).
 *   • `by`  — OHNE MICH: ich habe sie zugewiesen, bin aber nicht verantwortlich.
 * Ein "Alle" gibt es nicht (Vorgabe 19.08.2026); beide Sichten zeigen nur
 * Beteiligung und brauchen darum keine CRM-Rechte.
 */
export type TaskScope = 'me' | 'by';

/**
 * Wie eine Karte aussieht:
 *   • `self`     — ich habe sie mir SELBST gegeben (erfasst und verantwortlich)
 *   • `incoming` — jemand anderes hat sie mir gegeben
 *   • `outgoing` — ich habe sie jemand anderem gegeben
 *   • `plain`    — weder noch
 */
export type TaskOrigin = 'self' | 'incoming' | 'outgoing' | 'plain';

export const taskOrigin = (task: Pick<CrmTaskRow, 'createdBy' | 'assignees'>, userId?: string | null): TaskOrigin => {
    if (!userId) return 'plain';
    const mine = task.createdBy?.id === userId;
    const forMe = task.assignees.some((person) => person.id === userId);
    // Eine Aufgabe ohne Verantwortliche gehört der Person, die sie erfasst hat.
    if (mine && (forMe || task.assignees.length === 0)) return 'self';
    if (forMe) return 'incoming';
    if (mine) return 'outgoing';
    return 'plain';
};

/* ── Termin einer Karte ───────────────────────────────────────────────────
   Auf JEDER Karte stand "17.8.2026" — acht Zeichen, die man lesen und mit
   heute vergleichen muss, bevor sie etwas bedeuten. Was in den naechsten
   Tagen liegt, bekommt darum sein Wort ("Heute", "Morgen", "Gestern"), alles
   uebrige ein kurzes Datum; das Jahr steht nur, wenn es nicht das laufende
   ist. Rein numerisch und darum in jeder Sprache lesbar — Monatsnamen waeren
   in einer tuerkischen Sitzung deutsch geblieben. */
export const formatTaskDue = (value?: string | null): string => {
    if (!value) return t('calendar.tasks.groupUndated');
    const due = dayjs(value);
    if (!due.isValid()) return t('calendar.tasks.groupUndated');
    const days = due.startOf('day').diff(dayjs().startOf('day'), 'day');
    if (days === 0) return t('common.today');
    if (days === 1) return t('common.tomorrow');
    if (days === -1) return t('common.yesterday');
    return due.year() === dayjs().year() ? due.format('DD.MM.') : due.format('DD.MM.YYYY');
};

/**
 * DIE SPANNE EINER AUFGABE (11.09.2026) — Anfang und Ende in EINEM Wort, so
 * kurz wie die Karte es zulaesst.
 *
 * Eintaegig steht wie bisher nur der eine Tag da ("Heute", "28.08."). Ueber
 * mehrere Tage steht die Spanne: "28.08. – 30.08.". Sind Uhrzeiten gesetzt
 * (nicht ganztaegig), stehen sie dahinter — am selben Tag einmal als
 * "Heute, 08:00–17:00", ueber Tage hinweg an jedem Ende.
 *
 * Rein numerisch und darum in jeder Sprache lesbar — Monatsnamen waeren in
 * einer tuerkischen Sitzung deutsch geblieben.
 */
export const formatTaskSpan = (task: Pick<CrmTaskRow, 'startAt' | 'dueDate' | 'allDay'>): string => {
    const end = task.dueDate ? dayjs(task.dueDate) : null;
    const start = task.startAt ? dayjs(task.startAt) : null;
    if (!end?.isValid() && !start?.isValid()) return t('calendar.tasks.groupUndated');

    const first = (start?.isValid() ? start : end)!;
    const last = (end?.isValid() ? end : start)!;
    const sameDay = first.isSame(last, 'day');
    const timed = task.allDay === false;
    const clock = (value: dayjs.Dayjs) => value.format('HH:mm');

    if (sameDay) {
        const day = formatTaskDue(last.toISOString());
        if (!timed) return day;
        return first.isSame(last, 'minute')
            ? `${day}, ${clock(last)}`
            : `${day}, ${clock(first)}–${clock(last)}`;
    }
    const from = formatTaskDue(first.toISOString());
    const to = formatTaskDue(last.toISOString());
    return timed
        ? `${from} ${clock(first)} – ${to} ${clock(last)}`
        : `${from} – ${to}`;
};

/** Zieht sich die Aufgabe ueber mehr als einen Tag? (Die Karte markiert sie.) */
export const isMultiDayTask = (task: Pick<CrmTaskRow, 'startAt' | 'dueDate'>): boolean => {
    if (!task.startAt || !task.dueDate) return false;
    const start = dayjs(task.startAt);
    const end = dayjs(task.dueDate);
    return start.isValid() && end.isValid() && !start.isSame(end, 'day');
};

/* ── Zeitraum ─────────────────────────────────────────────────────────────
   Ein GEWÖHNLICHER Zeitraum (Vorgabe 19.08.2026): Von-Datum und Bis-Datum, beide
   aus dem Kalenderfenster gewählt — und sonst nichts. Schnellwahl-Knöpfe gibt es
   nicht mehr; gerechnet wird immer mit den zwei Feldern. Der Zeitraum gilt für
   BEIDE Spalten des Bretts, das Offene und das Erledigte. */

export interface TaskRange {
    /** YYYY-MM-DD in Ortszeit — genau das, was in den Datumsfeldern steht. */
    from: string;
    to: string;
}

/** Die Vorauswahl beim Öffnen: die laufende Woche (Montag bis Sonntag). */
export const defaultRange = (today = dayjs()): TaskRange => {
    const start = today.startOf('isoWeek');
    return { from: start.format('YYYY-MM-DD'), to: start.add(6, 'day').format('YYYY-MM-DD') };
};

/**
 * Der Zeitraum als Fenster für den Server: [von 00:00, bis + 1 Tag 00:00) in
 * Ortszeit — halboffen, damit der letzte Tag ganz dazugehört. Ein verdrehter
 * Zeitraum (bis vor von) wird getauscht statt leer zu bleiben; ein unlesbares
 * Datum gibt ein leeres Fenster, dann fragt der Aufrufer gar nicht.
 */
export const rangeWindow = (range: TaskRange): { from: string; to: string } => {
    const first = dayjs(range.from);
    const last = dayjs(range.to);
    if (!first.isValid() || !last.isValid()) return { from: '', to: '' };
    const start = (first.isAfter(last) ? last : first).startOf('day');
    const end = (first.isAfter(last) ? first : last).startOf('day').add(1, 'day');
    return { from: start.toISOString(), to: end.toISOString() };
};

/* ── Reihenfolge und Seiten ───────────────────────────────────────────────── */

/** Innerhalb einer Gruppe: verstrichenes zuerst, dann nach Termin, ohne Termin zuletzt. */
const byUrgency = (left: CrmTaskRow, right: CrmTaskRow) => {
    const rank = (task: CrmTaskRow) => (task.status === 'INCOMPLETE' ? 0 : 1);
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) return byRank;
    /* Sortiert wird nach dem ANFANG der Spanne (11.09.2026): eine Aufgabe, die
       heute beginnt und Freitag endet, gehoert vor eine, die Donnerstag
       anfaengt — nach dem Ende gerechnet stuende sie hinter ihr. */
    const startOf = (task: CrmTaskRow) => {
        const value = task.startAt || task.dueDate;
        return value ? dayjs(value).valueOf() : Number.MAX_SAFE_INTEGER;
    };
    const leftDue = startOf(left);
    const rightDue = startOf(right);
    if (leftDue !== rightDue) return leftDue - rightDue;
    return dayjs(left.createdAt).valueOf() - dayjs(right.createdAt).valueOf();
};

/**
 * Karten je Seite und Abschnitt, bevor `TaskBoard` aus der gemessenen Höhe
 * nachrechnet. Sechs = zwei Spalten mal drei Reihen; mehr würde alles auf
 * Seite 1 packen und die Blätterleiste bliebe auf der "1" stehen.
 */
export const PAGE_SIZE = 6;

/** Die beiden SPALTEN des Bretts — sie stehen neben einander (Vorgabe). */
export type BoardColumn = 'open' | 'done';

/**
 * Eine Spalte in Seiten geschnitten. Beide Spalten füllen ihre Hälfte des
 * Schirms; gerollt wird nicht — was nicht hineinpasst, kommt auf eine weitere
 * Seite (siehe `boardPages`).
 */
export const columnPages = (tasks: CrmTaskRow[], column: BoardColumn, size = PAGE_SIZE): CrmTaskRow[][] => {
    const rows = tasks
        .filter((task) => (column === 'done' ? task.status === 'DONE' : task.status !== 'DONE'))
        .sort(byUrgency);
    if (rows.length === 0) return [[]];
    const pages: CrmTaskRow[][] = [];
    for (let index = 0; index < rows.length; index += size) pages.push(rows.slice(index, index + size));
    return pages;
};

/**
 * Welche Seitenzahlen die Leiste zeigt. Bei wenigen Seiten alle; bei vielen ein
 * Fenster um die aktuelle, damit die Leiste nicht zur Zahlenschlange wird.
 * `-1` steht für die Auslassung ("…").
 */
export const pageWindow = (current: number, count: number, span = 7): number[] => {
    if (count <= span) return Array.from({ length: count }, (_, index) => index);
    const half = Math.floor((span - 2) / 2);
    const end = Math.min(count - 2, Math.max(1, current - half) + (span - 3));
    // Am Ende der Reihe rutscht das Fenster nach vorn, damit es voll bleibt.
    const start = Math.max(1, Math.min(current - half, end - (span - 3)));
    const pages: number[] = [0];
    if (start > 1) pages.push(-1);
    for (let index = start; index <= end; index += 1) pages.push(index);
    if (end < count - 2) pages.push(-1);
    pages.push(count - 1);
    return pages;
};

/**
 * Wie weit der Zeitraum abgearbeitet ist — die Zahlen der Leiste
 * ("5 offen · 3 erledigt") und der Balken darunter.
 */
export const progressOf = (tasks: CrmTaskRow[]): { open: number; done: number; total: number; percent: number } => {
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === 'DONE').length;
    return { open: total - done, done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
};
