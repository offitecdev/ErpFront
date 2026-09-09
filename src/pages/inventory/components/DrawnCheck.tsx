/**
 * ── DAS GEZEICHNETE HAeKCHEN ────────────────────────────────────────────────
 *
 * Vorgabe Samet (07.09.2026): «Nach dem Hinzufuegen soll ein Haken kommen — und
 * er soll wirklich auf den Schirm GEZEICHNET werden.»
 *
 * Also kein Symbol, das erscheint, sondern eines, das ENTSTEHT: der Kreis
 * laeuft in einem Zug herum, dann faehrt der Haken hinein. Beides ist ein
 * Strich mit einer wandernden Luecke (`stroke-dasharray` / `-dashoffset`,
 * siehe styles/orderDetails.css) — darum bleibt es bei jeder Groesse
 * gestochen scharf und kostet keine Datei.
 *
 * Ausgeloest wird es ueber `useDrawnCheck()` nebenan.
 */
export const DrawnCheck = () => (
    <div className="ofi-ord-check" role="status" aria-live="polite">
        <svg viewBox="0 0 72 72" aria-hidden="true">
            <circle className="ofi-ord-check__ring" cx="36" cy="36" r="30" />
            <path className="ofi-ord-check__tick" d="M22 37.5 32 47l18-21" />
        </svg>
    </div>
);
