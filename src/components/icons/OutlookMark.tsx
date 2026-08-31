import { useId } from 'react';

/**
 * Outlook-Zeichen für den Menüeintrag "E-Mail" (Vorgabe 18.08.2026,
 * überarbeitet 19.08.2026).
 *
 * Eigenes SVG, keine Bilddatei: das Zeichen steht neben einem Text im Menü und
 * muss in jeder Grösse und in beiden Erscheinungsbildern sauber bleiben — eine
 * PNG-Grafik wäre bei 18 px unscharf und brächte eine weitere Datei mit.
 *
 * Bewusst eine STILISIERTE Fassung in den Hausfarben von Outlook (Kachel mit
 * dem "O", helleres Briefblatt dahinter), keine pixelgenaue Kopie des
 * geschützten Zeichens: es soll die Anbindung erkennbar machen, nicht die
 * Marke nachbilden.
 *
 * GLEICHE GEOMETRIE wie der Öffnungs-Splash des E-Mail-Bereichs
 * (`.ofi-splash-mark--mail` in index.html, siehe ui-shared/SectionSplash):
 * dort steht dasselbe Zeichen gross und gezeichnet. Ändert sich hier eine
 * Kurve, muss sie dort mitgehen — sonst öffnet der Bereich mit einem anderen
 * Zeichen, als im Menü steht.
 *
 * Die Verläufe brauchen Kennungen; `useId` hält sie je Einbindung
 * auseinander, damit zwei gleichzeitig sichtbare Zeichen (Menüleiste und
 * Schublade) sich nicht gegenseitig die Füllung ziehen.
 */
export const OutlookMark = ({ size = 18, className = '' }: { size?: number; className?: string }) => {
    const uid = useId().replace(/[:]/g, '');
    const tile = `ofi-ol-tile-${uid}`;
    const sheet = `ofi-ol-sheet-${uid}`;
    const flap = `ofi-ol-flap-${uid}`;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            <defs>
                <linearGradient id={tile} x1="0" y1="0" x2="0.65" y2="1">
                    <stop offset="0" stopColor="#2a7fe0" />
                    <stop offset="0.55" stopColor="#1462c7" />
                    <stop offset="1" stopColor="#0a3f96" />
                </linearGradient>
                <linearGradient id={sheet} x1="0.1" y1="0" x2="0.9" y2="1">
                    <stop offset="0" stopColor="#57b2f6" />
                    <stop offset="1" stopColor="#1b7fd8" />
                </linearGradient>
                <linearGradient id={flap} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#a4dbfb" />
                    <stop offset="1" stopColor="#68bcf4" />
                </linearGradient>
            </defs>

            {/* Briefblatt rechts — links eckig, weil die Kachel darüber liegt. */}
            <path d="M12.6 7.2h16A2.2 2.2 0 0 1 30.8 9.4v13.2a2.2 2.2 0 0 1-2.2 2.2H12.6z" fill={`url(#${sheet})`} />
            {/* Umschlagklappe: der helle Keil, der zur Mitte hin zuläuft. */}
            <path d="M12.6 7.2h16A2.2 2.2 0 0 1 30.8 9.4v2.2l-9.1 5.7-9.1-5.7z" fill={`url(#${flap})`} />
            {/* Kachel mit dem "O" — steht oben und unten über das Blatt hinaus. */}
            <rect x="1.4" y="4.2" width="17.2" height="23.6" rx="3.5" fill={`url(#${tile})`} />
            {/* Schmaler Lichtsaum an der Oberkante: nimmt der Kachel das Flache. */}
            <path d="M4.9 4.2h10.2a3.5 3.5 0 0 1 3.5 3.5v.5H1.4v-.5a3.5 3.5 0 0 1 3.5-3.5z" fill="#ffffff" opacity="0.16" />
            {/* Das "O" als Pfad (nicht als <ellipse>): der Splash zeichnet
                genau diesen Pfad mit `pathLength` nach. */}
            <path
                d="M10 10.8a4.3 5.2 0 0 1 0 10.4 4.3 5.2 0 0 1 0-10.4z"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.9"
            />
        </svg>
    );
};
