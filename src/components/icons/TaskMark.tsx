import { useId } from 'react';

/**
 * Aufgaben-Zeichen für den Menüeintrag "Aufgaben" (Vorgabe 19.08.2026) —
 * das Gegenstück zum Outlook-Zeichen beim Postfach.
 *
 * Eigenes SVG, keine Bilddatei: es steht neben einem Text im Menü und muss
 * bei 16 px genauso sauber stehen wie in der Schublade.
 *
 * GLEICHE GESTALT wie der Öffnungs-Splash des Aufgabenbereichs
 * (`.ofi-splash-mark--check` in index.html, siehe ui-shared/SectionSplash):
 * abgerundete Kachel mit dem Verlauf Blau → Violett, darauf das weisse
 * Häkchen. Ändert sich dort die Kachel oder der Haken, muss es hier mitgehen —
 * sonst öffnet der Bereich mit einem anderen Zeichen, als im Menü steht.
 *
 * Der Verlauf braucht eine Kennung; `useId` hält sie je Einbindung
 * auseinander, damit zwei gleichzeitig sichtbare Zeichen (Leiste und
 * Schublade) sich nicht gegenseitig die Füllung ziehen.
 */
export const TaskMark = ({ size = 18, className = '' }: { size?: number; className?: string }) => {
    const uid = useId().replace(/[:]/g, '');
    const tile = `ofi-task-tile-${uid}`;
    const gloss = `ofi-task-gloss-${uid}`;

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
                {/* Entspricht dem `linear-gradient(165deg, …)` des Splashes:
                    überwiegend nach unten, leicht nach rechts gekippt. */}
                <linearGradient id={tile} x1="0" y1="0" x2="0.27" y2="1">
                    <stop offset="0" stopColor="#2f8dff" />
                    <stop offset="0.52" stopColor="#3f6cff" />
                    <stop offset="1" stopColor="#7457ff" />
                </linearGradient>
                {/* Lichtsaum an der Oberkante. Bei dieser starken Eckenrundung
                    darf er KEIN aufgesetzter Pfad sein (wie beim Outlook-
                    Zeichen): dessen gerade Unterkante zöge quer über die
                    Kachel einen sichtbaren Absatz. Also ein auslaufender
                    Verlauf über die ganze Fläche. */}
                <linearGradient id={gloss} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
                    <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* Kachel — Eckenrundung 34 % der Kantenlänge, wie im Splash. */}
            <rect x="2.2" y="2.2" width="27.6" height="27.6" rx="9.4" fill={`url(#${tile})`} />
            <rect x="2.2" y="2.2" width="27.6" height="27.6" rx="9.4" fill={`url(#${gloss})`} />
            {/* Das Häkchen — dieselbe Führung wie `.ofi-splash-tick`. */}
            <path
                d="M10.2 16.4 14.2 20.6 22.2 11.8"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};
