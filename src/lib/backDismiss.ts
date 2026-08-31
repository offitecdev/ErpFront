import { useEffect, useRef } from 'react';

/**
 * ── DER ZURÜCK-GRIFF SCHLIESST DAS FENSTER ──────────────────────────────────
 *
 * Vorgabe Samet, 12.09.2026: steht auf dem Aufgabenbrett oder im Kalender ein
 * Fenster offen, soll der Zurück-Griff — der Pfeil des Browsers, die Taste des
 * Telefons, die Wischgeste — dieses FENSTER schliessen und nicht die Seite
 * darunter verlassen. Wer eine Aufgabenkarte offen hat und zurückdrückt,
 * meint die Karte; die Liste dahinter hat er ja gerade erst geöffnet.
 *
 * WIE es geht: beim Öffnen wird EIN Eintrag in den Verlauf gelegt, der
 * dieselbe Adresse trägt und eine eigene Marke im Zustand hat. Der Zurück-Griff
 * springt dann auf den Eintrag davor — die Adresse bleibt also, wo sie war,
 * und wir hören es am `popstate` und schliessen das Fenster.
 *
 * DREI FALLEN, und wie sie umgangen sind:
 *
 *   1. Von Hand geschlossen (X, Escape, gespeichert): unser Eintrag steht noch
 *      im Verlauf, und der nächste Zurück-Griff täte scheinbar nichts. Darum
 *      räumen wir ihn beim Aufräumen selbst weg — aber NUR, wenn oben auf dem
 *      Stapel noch unsere eigene Marke liegt.
 *   2. Das Fenster schliesst, WEIL es weiternavigiert (ein Knopf im Fenster
 *      führt auf den Auftrag). Dann trägt der oberste Eintrag die Marke des
 *      Routers und nicht mehr unsere — dieselbe Prüfung schützt also auch hier:
 *      wir nehmen die Reise nicht zurück.
 *   3. Der Zustand des Routers (`idx`) darf nicht verloren gehen, sonst zählt
 *      er seine Einträge falsch. Wir legen unsere Marke DAZU, statt ihn zu
 *      ersetzen.
 *
 * Der Eintrag trägt bewusst dieselbe Adresse: die Seite darunter soll sich
 * nicht bewegen, und ein Lesezeichen auf «Aufgabe offen» gibt es nicht.
 */

/** Woran wir unseren eigenen Verlaufseintrag wiedererkennen. */
const MARK = 'ofiBackDismiss';

/* ── DIE VIERTE FALLE: unsere eigene Rücknahme trifft das NÄCHSTE Fenster ────
   `history.back()` wirkt nicht sofort, sondern im nächsten Durchlauf. Wer auf
   dem Aufgabenbrett von einer Karte direkt auf die nächste klickt, löst darum
   diese Reihenfolge aus:

     alte Karte ab  → `back()` VORGEMERKT
     neue Karte an  → ihr Eintrag liegt oben
     jetzt erst     → der vorgemerkte `popstate` kommt an

   Er gehört der alten Karte, aber horchen tut die neue — und schloss sich
   augenblicklich wieder. Von aussen sah das aus, als liesse sich die Aufgabe
   gar nicht öffnen.

   Darum wird eine eigene Rücknahme angemeldet: das nächste `popstate` gilt als
   verbraucht und schliesst nichts. Die Marke fällt nach kurzer Zeit von selbst
   weg — käme der Griff nie an (der Eintrag war schon fort), dürfte sie nicht
   liegen bleiben und den nächsten ECHTEN Zurück-Griff schlucken. */
let unwinding = false;
/** Wie lange eine angemeldete Rücknahme höchstens gilt (ms). */
const UNWIND_GRACE_MS = 600;

const newMark = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const topMark = (): string | null => {
    const state = window.history.state as Record<string, unknown> | null;
    const mark = state?.[MARK];
    return typeof mark === 'string' ? mark : null;
};

/**
 * Solange `open` gilt, schliesst der Zurück-Griff über `close` — sonst tut
 * dieser Haken gar nichts.
 */
export const useBackDismiss = (open: boolean, close: () => void) => {
    /* Der Griff wird bei jedem Zeichnen neu gebaut; als Merker gelesen bleibt
       die Wirkung an `open` hängen und legt nicht bei jedem Zeichnen einen
       neuen Verlaufseintrag an. */
    const closeRef = useRef(close);
    closeRef.current = close;

    useEffect(() => {
        if (!open || typeof window === 'undefined') return undefined;

        const mark = newMark();
        const base = (window.history.state ?? {}) as Record<string, unknown>;
        window.history.pushState({ ...base, [MARK]: mark }, '');

        let popped = false;
        const onPop = () => {
            // Die Rücknahme eines gerade geschlossenen Fensters — sie gehört
            // nicht diesem hier (siehe oben, «die vierte Falle»).
            if (unwinding) { unwinding = false; return; }
            popped = true;
            closeRef.current();
        };
        window.addEventListener('popstate', onPop);

        return () => {
            window.removeEventListener('popstate', onPop);
            // Von Hand geschlossen: unseren Eintrag wieder abräumen, damit der
            // nächste Zurück-Griff nicht ins Leere greift. Liegt oben eine
            // andere Marke (weitergereist, ein zweites Fenster darüber), bleibt
            // der Verlauf unangetastet.
            if (!popped && topMark() === mark) {
                unwinding = true;
                window.setTimeout(() => { unwinding = false; }, UNWIND_GRACE_MS);
                window.history.back();
            }
        };
    }, [open]);
};
