import type React from 'react';

/**
 * Macht eine Tabellenzeile der Übersicht anklickbar — MIT Tastatur.
 *
 * Eine `<tr>` ist von sich aus kein Knopf: ohne `role`, `tabIndex` und die
 * beiden Tasten wäre die Zeile nur für die Maus da, und genau daran scheitern
 * anklickbare Zeilen sonst. Das sichtbare Verhalten (Ton beim Überfahren,
 * dunklere Beschriftung, Ring beim Tabben) hängt an `.is-link` in index.css,
 * damit jede Zeile der Seite gleich antwortet.
 *
 * `spoken` MUSS TRAGEN, WAS DIE ZEILE ZEIGT — nicht nur ihre Beschriftung. Mit
 * `role="button"` ist die Zeile keine Zeile mehr, ihre Zellen sind für die
 * Vorlesehilfe nur noch Inhalt des Knopfes; stünde hier bloss „Lieferschein",
 * ginge „Nicht unterschrieben" verloren, also genau die Auskunft, wegen der die
 * Zeile da ist.
 */
export const linkRow = (onOpen: () => void, spoken: string) => ({
    className: 'is-link',
    role: 'button',
    tabIndex: 0,
    'aria-label': spoken,
    onClick: onOpen,
    onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // Die Leertaste rollt die Seite, wenn man sie lässt.
        event.preventDefault();
        onOpen();
    },
});
