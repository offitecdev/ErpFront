import dayjs from 'dayjs';

/**
 * ANFANG UND ENDE EINER AUFGABE, zwischen Formularfeldern und ISO-Zeitpunkten
 * (11.09.2026, Vorgabe Samet: «die Aufgabe braucht eine Startzeit und eine
 * Endzeit; sie darf sich über mehrere Tage ziehen»).
 *
 * EIN Ort für diese Umrechnung, weil sie an ZWEI Stellen gebraucht wird — im
 * Anlegen-Fenster und in der Erledigungskarte. Zwei Kopien dieser Regeln
 * liefen unweigerlich auseinander, und sie sind schon für sich heikel genug:
 *
 *   • GANZTÄGIG heisst 00:00 bis 23:59 desselben (bzw. des End-)Tages. Nicht
 *     00:00 bis 00:00 des Folgetages: `dueDate` ist das ENDE und wird überall
 *     als «letzter Zeitpunkt» gelesen — vom Verfalldienst, der eine offene
 *     Aufgabe kippt, sobald ihr Ende vorbei ist, bis zum Zeitraumfilter.
 *     Mitternacht des Folgetages hiesse, die Aufgabe wäre am ganzen letzten
 *     Tag bereits abgelaufen bzw. würde einen Tag zu lang zählen.
 *
 *   • MITTAG für den Anfang einer ganztägigen Aufgabe wäre falsch, obwohl es
 *     die Regel der alten Terminwahl war (`dateInputToIso`). Dort ging es um
 *     EINEN Tag, den die Umrechnung in UTC nicht auf den Vortag ziehen darf.
 *     Hier geht es um eine SPANNE: der Anfang muss der Tagesanfang sein, sonst
 *     fiele der halbe erste Tag heraus. Beide Zeitpunkte werden in ORTSZEIT
 *     gebaut und danach als ISO geschickt — `dayjs(...).toISOString()` rechnet
 *     die Zone korrekt mit, und der Server speichert wieder Ortszeit.
 *
 *   • VERDREHTES wird getauscht, nicht abgewiesen (der Server tut dasselbe).
 */

export interface TaskSpanFields {
    /** `YYYY-MM-DD`, leer = ohne Termin. */
    startDate: string;
    endDate: string;
    /** `HH:mm`; zählt nur, wenn `allDay` falsch ist. */
    startTime: string;
    endTime: string;
    allDay: boolean;
}

export interface TaskSpanIso {
    startAt: string | null;
    dueDate: string | null;
}

const at = (date: string, time: string): dayjs.Dayjs | null => {
    if (!date) return null;
    const [hour, minute] = (time || '00:00').split(':').map((part) => Number(part) || 0);
    const day = dayjs(date);
    return day.isValid() ? day.hour(hour).minute(minute).second(0).millisecond(0) : null;
};

/** Formularfelder → die zwei Zeitpunkte, die an den Server gehen. */
export const spanToIso = (fields: TaskSpanFields): TaskSpanIso => {
    const startDate = fields.startDate || fields.endDate;
    const endDate = fields.endDate || fields.startDate;
    if (!startDate && !endDate) return { startAt: null, dueDate: null };

    let start = fields.allDay ? at(startDate, '00:00') : at(startDate, fields.startTime);
    let end = fields.allDay ? at(endDate, '23:59') : at(endDate, fields.endTime);
    if (start && end && start.isAfter(end)) [start, end] = [end, start];

    return {
        startAt: start ? start.toISOString() : null,
        dueDate: end ? end.toISOString() : null,
    };
};

/**
 * Und zurück: was in der Zeile steht → was in den Feldern stehen soll. Eine
 * Aufgabe ohne Anfang ist eintägig — dann trägt der Endtag beide Felder.
 */
export const isoToSpan = (task: { startAt?: string | null; dueDate?: string | null; allDay?: boolean }): TaskSpanFields => {
    const end = task.dueDate ? dayjs(task.dueDate) : null;
    const start = task.startAt ? dayjs(task.startAt) : null;
    const first = start?.isValid() ? start : end;
    const last = end?.isValid() ? end : start;
    const allDay = task.allDay !== false;
    return {
        startDate: first?.isValid() ? first.format('YYYY-MM-DD') : '',
        endDate: last?.isValid() ? last.format('YYYY-MM-DD') : '',
        // Bei ganztägig stehen 00:00/23:59 in der Zeile; im Feld wären sie eine
        // sinnlose Auskunft, sobald jemand die Uhrzeiten einschaltet.
        startTime: !allDay && first?.isValid() ? first.format('HH:mm') : '08:00',
        endTime: !allDay && last?.isValid() ? last.format('HH:mm') : '17:00',
        allDay,
    };
};
