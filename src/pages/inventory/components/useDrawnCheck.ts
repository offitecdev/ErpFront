import { useCallback, useEffect, useState } from 'react';
import { createElement } from 'react';
import { createPortal } from 'react-dom';

import { DrawnCheck } from './DrawnCheck';

/**
 * ── DER HAKEN, AUF ABRUF ────────────────────────────────────────────────────
 *
 * Vorgabe Samet (07.09.2026): «Nach dem Hinzufuegen soll ein Haken kommen — und
 * er soll wirklich auf den Schirm GEZEICHNET werden.»
 *
 * Gebrauch:
 *   const check = useDrawnCheck();
 *   …
 *   check.show();            // nach dem Hinzufuegen
 *   return <>{check.node}</>;
 *
 * Das Zeichen liegt in einem Portal ueber allem, faengt keine Klicks ab und
 * raeumt sich nach 1.2 s selbst weg.
 *
 * ⚠ Der Haken selbst wohnt in `DrawnCheck.tsx`: eine Datei, die eine Komponente
 *   UND einen Haken exportiert, verliert das schnelle Nachladen im Entwicklungs-
 *   modus (`react-refresh/only-export-components`).
 */
export const useDrawnCheck = () => {
    /* Der Zaehler ist der Schluessel des Knotens: zweimal hintereinander
       hinzufuegen soll das Haekchen NEU zeichnen, nicht das halb verblasste
       stehen lassen. */
    const [tick, setTick] = useState(0);
    const [open, setOpen] = useState(false);

    const show = useCallback(() => {
        setTick((current) => current + 1);
        setOpen(true);
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        const timer = window.setTimeout(() => setOpen(false), 1200);
        return () => window.clearTimeout(timer);
    }, [open, tick]);

    const node = open
        ? createPortal(createElement(DrawnCheck, { key: tick }), document.body)
        : null;

    return { show, node };
};
