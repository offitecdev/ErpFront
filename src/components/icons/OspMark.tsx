import { useId } from 'react';

/**
 * ── DAS OSP-ZEICHEN ─────────────────────────────────────────────────────────
 *
 * Die Marke der Offitec Selection Platform: der Schriftzug OSP, dunkelblau
 * hinterlegt, mit dem Rautenzeichen der OSP-Seite (`OspRhombus`) als Prägung
 * darin. Es steht überall dort, wo etwas AUS der OSP kommt und das auf einen
 * Blick zu sehen sein muss:
 *
 *  • in der Offertenliste neben der Offertnummer — die Offerte hat drüben
 *    ihren Ursprung,
 *  • auf der OSP-Seite am Datenblatt ("OSP PDF"),
 *  • auf der Offerte selbst, an ihrer Herkunftszeile.
 *
 * Gezeichnet statt geladen: als Bild wäre es bei 14 px ein Fleck. Zwei
 * Fassungen, weil zwei Orte Verschiedenes brauchen:
 *
 *  • `plain` (Vorgabe) — NUR der Schriftzug, in `currentColor`. So steht er in
 *    der Offertenliste neben der Nummer: eine dunkle Kachel wäre dort ein Loch
 *    in der Zeile, kein Zeichen. Er ist breiter als hoch, also gibt `size` die
 *    HÖHE und die Breite folgt dem Seitenverhältnis.
 *  • `tile` — der Schriftzug auf der Marineblau-Fläche der Anwendung, mit der
 *    Raute der OSP-Seite als Prägung. Für Köpfe und farbige Flächen, wo das
 *    Zeichen als Marke auftreten soll.
 */
const PLAIN_RATIO = 46 / 16;

export const OspMark = ({
    size = 16,
    className = '',
    /** `plain` zeichnet nur den Schriftzug — ohne Fläche, in `currentColor`. */
    variant = 'plain',
    title,
}: {
    size?: number;
    className?: string;
    variant?: 'tile' | 'plain';
    title?: string;
}) => {
    const gradientId = `ofi-osp-mark-${useId().replace(/:/g, '')}`;
    const plain = variant === 'plain';

    return (
        <svg
            viewBox={plain ? '0 0 46 16' : '0 0 48 48'}
            width={plain ? Math.round(size * PLAIN_RATIO) : size}
            height={size}
            className={className}
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : true}
            aria-label={title}
            focusable="false"
        >
            {title && <title>{title}</title>}
            {plain ? (
                <text
                    x="23"
                    y="8.6"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="ui-sans-serif, system-ui, 'Segoe UI', Arial, sans-serif"
                    fontSize="15.5"
                    fontWeight="800"
                    letterSpacing="-0.3"
                    fill="currentColor"
                >
                    OSP
                </text>
            ) : (
                <>
                    <defs>
                        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="48" y2="48">
                            <stop offset="0%" stopColor="#3d4a92" />
                            <stop offset="55%" stopColor="#272f67" />
                            <stop offset="100%" stopColor="#1b2049" />
                        </linearGradient>
                    </defs>
                    <rect x="0" y="0" width="48" height="48" rx="11" fill={`url(#${gradientId})`} />
                    {/* Die Raute der OSP-Seite, als leise Prägung hinter der Schrift. */}
                    <path d="M24 6 L34 17 L24 28 L14 17 Z" fill="#fff" fillOpacity="0.09" />
                    <text
                        x="24"
                        y="24"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontFamily="ui-sans-serif, system-ui, 'Segoe UI', Arial, sans-serif"
                        fontSize="19"
                        fontWeight="800"
                        letterSpacing="-0.5"
                        fill="#ffffff"
                    >
                        OSP
                    </text>
                </>
            )}
        </svg>
    );
};


/**
 * ── DAS OSP-DATENBLATT ALS ZEICHEN ──────────────────────────────────────────
 *
 * Ein Blatt mit umgeschlagener Ecke, Textzeilen und dem Fähnchen "OSP" — die
 * Form, an der ein PDF überall erkannt wird, nur mit unserer Marke statt des
 * roten PDF-Fähnchens.
 *
 * Es steht in der Dokumente-Spalte der OSP-Liste ANSTELLE eines Dateinamens
 * (Vorgabe 19.09.2026: "die Spalte darf schmaler sein, nur das Datenblatt, als
 * Symbol"). Die OSP vergibt ihren Dateien Kennnummern — als Text sagen sie
 * niemandem etwas und laufen quer durch die Spalte; als Zeichen sagt das Blatt
 * in einem Blick, was es ist und woher es kommt. Die Aufschrift "OSP PDF"
 * bleibt: sie steht im `title`, wo sie den Platz nicht braucht.
 */
export const OspPdfIcon = ({
    size = 40,
    className = '',
    title,
}: {
    size?: number;
    className?: string;
    title?: string;
}) => (
    <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        className={className}
        role={title ? 'img' : undefined}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        focusable="false"
    >
        {title && <title>{title}</title>}
        {/* Das Blatt mit umgeschlagener Ecke. */}
        <path
            d="M9 4h14l8 8v24a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
            fill="#ffffff"
            stroke="#cbd2dd"
            strokeWidth="1.6"
            strokeLinejoin="round"
        />
        <path d="M23 4v8h8" fill="#eef1f6" stroke="#cbd2dd" strokeWidth="1.6" strokeLinejoin="round" />
        {/* Die Textzeilen des Datenblatts. */}
        <g fill="#d5dae2">
            <rect x="12" y="26" width="16" height="2.1" rx="1.05" />
            <rect x="12" y="30.5" width="11" height="2.1" rx="1.05" />
        </g>
        {/* Das Fähnchen — dort, wo ein PDF sein rotes trägt. */}
        <g>
            <path d="M4 13h20a1.6 1.6 0 0 1 1.6 1.6v6.2A1.6 1.6 0 0 1 24 22.4H4Z" fill="#272f67" />
            <text
                x="14.4"
                y="17.9"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="ui-sans-serif, system-ui, 'Segoe UI', Arial, sans-serif"
                fontSize="8.6"
                fontWeight="800"
                letterSpacing="-0.2"
                fill="#ffffff"
            >
                OSP
            </text>
        </g>
    </svg>
);

export default OspMark;
