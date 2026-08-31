import type { ReactNode } from 'react';

import { isTaskStatus, type CalStatus } from '../calendarShared';

/**
 * Die Beschriftung EINER Rasterkarte — für Woche, Tag, Monat und die
 * ganztägige Zeile dieselbe (18.08.2026). Vorher stand dieselbe Zeile
 * dreimal im Code und die drei Fassungen liefen auseinander: im Monat trug
 * sie die Uhrzeit, in der ganztägigen Zeile nur den Titel, in der Woche
 * zusätzlich die Nebenzeile.
 *
 * Neu ist der KREIS vor einer Aufgabe: offen ein Ring, erledigt ein Häkchen.
 * Eine Aufgabe ist kein Termin — man muss sie erkennen, ohne die Farben Sage
 * und Basil auseinanderhalten zu müssen (und ohne Farben überhaupt).
 */

const TaskMark = ({ done }: { done: boolean }) => (
    <svg className="ofi-ucal-chip__mark" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.25" />
        {done && <path d="M5.1 8.15 L7.05 10.1 L10.95 6.2" />}
    </svg>
);

export const ChipLabel = ({ status, title, time, meta }: {
    status: CalStatus;
    title: ReactNode;
    /* Führende Uhrzeit (Monatszelle) — eine Stufe leichter als der Titel. */
    time?: string | null;
    /* Zweite Zeile (Zeitspanne · Kunde) — nur, wo die Karte hoch genug ist. */
    meta?: ReactNode;
}) => (
    <>
        <span className="ofi-ucal-chip__line">
            {isTaskStatus(status) && <TaskMark done={status === 'taskDone'} />}
            <span className="ofi-ucal-chip__title truncate">
                {time && <span className="ofi-ucal-chip__time tabular-nums">{time} </span>}
                {title}
            </span>
        </span>
        {meta ? <span className="ofi-ucal-chip__meta">{meta}</span> : null}
    </>
);
