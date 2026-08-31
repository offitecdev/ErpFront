import { useId } from 'react';

/**
 * ── DAS APPS-ZEICHEN ────────────────────────────────────────────────────────
 *
 * Nachgezeichnet nach `icons8-apps-90` (Vorgabe 28.08.2026: «Im Kopf soll
 * dieses Zeichen stehen, gross genug fuer die Reihe daneben», danach: «Das
 * Apps-Zeichen darf cooler aussehen; die Farbe gefaellt mir nicht und es ist
 * viel zu klein.»).
 *
 * Drei runde Kaestchen und OBEN RECHTS eines auf die Ecke gestellt — der Dreh
 * ist das ganze Zeichen; ohne ihn waere es wieder das gewoehnliche
 * Vierergitter.
 *
 * FLUESSIG STATT ZWEIFARBIG (Vorgabe 28.08.2026: «das Apps-Zeichen soll
 * demselben Stil folgen — fluessig, modern, kein Fremdkoerper»). Das
 * Bernstein-Karo WAR dieser Fremdkoerper: die einzige warme Farbe in einer
 * Leiste aus Glas und Navy. Jetzt laeuft alles in EINEM Blau — die drei
 * Kaestchen dunkel, das gedrehte hell, beide als Verlauf; dasselbe Gefaelle
 * in Bewegung ist das «Fluessige».
 *
 * OHNE SCHEIBE (Vorgabe 28.08.2026: «das Apps-Zeichen muss gar nicht
 * eingekreist werden — lass einfach im Dunkelmodus seine Farbe wechseln; das
 * Zeichen selbst darf Glas sein»). Es steht also frei in der Leiste, waehrend
 * Firmenfeld und Kalender auf ihrer Glasscheibe sitzen. Glas ist es trotzdem:
 * die Flaechen sind leicht durchscheinend (`fillOpacity` ueber die CSS-Regeln)
 * und laufen von einem hellen zu einem tiefen Ton.
 *
 * DIE TOENE STEHEN IN CSS, nicht hier: `stop-color` in styles/refine.css
 * (`.ofi-apps-glyph`). Nur von dort kann der Dunkelmodus sie tauschen — ein
 * `var()` in einem SVG-Attribut greift nicht, eine CSS-Regel auf `stop-color`
 * schon. Und sie muessen aus `fill`/`stop-color` kommen und nicht aus
 * `currentColor`: `.ofi-topbar svg { color: … }` in index.css ist `!important`
 * und stuende sonst darueber (MEMORY «Text-colour utility cascade»).
 *
 * SEIT 29.08.2026 LIEGT ES HIER statt in `layout/RequestsAppsMenu.tsx`: das
 * Neuigkeiten-Blatt zeigt dieselben App-Zeichen wie ein Prospekt, und zwei
 * Fassungen desselben Zeichens waeren zwei Wahrheiten. Die Verlaufskennungen
 * kommen darum aus `useId` — stuenden sie fest, zoege das zweite Zeichen auf
 * dem Schirm die Fuellung des ersten.
 */
export const AppsGlyph = ({ size = 28, className = '' }: { size?: number; className?: string }) => {
    const uid = useId().replace(/:/g, '');
    const grad = `ofi-apps-grad-${uid}`;
    const lit = `ofi-apps-grad-lit-${uid}`;

    return (
        <svg
            className={`ofi-apps-glyph ${className}`}
            viewBox="0 0 24 24"
            width={size}
            height={size}
            aria-hidden
            focusable="false"
        >
            <defs>
                <linearGradient id={grad} x1="0" y1="0" x2="0.9" y2="1">
                    <stop className="ofi-apps-a" offset="0%" />
                    <stop className="ofi-apps-b" offset="100%" />
                </linearGradient>
                <linearGradient id={lit} x1="0" y1="0" x2="0.9" y2="1">
                    <stop className="ofi-apps-c" offset="0%" />
                    <stop className="ofi-apps-d" offset="100%" />
                </linearGradient>
            </defs>
            {/* Jedes Kaestchen traegt seine eigene Klasse, weil der Dunkelmodus
                sie EINZELN faerbt (oben rot, die beiden anderen orange). */}
            <rect className="ofi-apps-tl" x="1.8" y="1.8" width="8.6" height="8.6" rx="2.5" fill={`url(#${grad})`} />
            <rect className="ofi-apps-bl" x="1.8" y="13.6" width="8.6" height="8.6" rx="2.5" fill={`url(#${grad})`} />
            <rect className="ofi-apps-br" x="13.6" y="13.6" width="8.6" height="8.6" rx="2.5" fill={`url(#${grad})`} />
            <rect className="ofi-apps-dia" x="-4.15" y="-4.15" width="8.3" height="8.3" rx="2.4" fill={`url(#${lit})`} transform="translate(17.9 6.1) rotate(45)" />
        </svg>
    );
};
