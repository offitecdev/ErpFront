import { useId } from 'react';

/**
 * ── DAS RAUTENZEICHEN, GESCHLIFFEN ───────────────────────────────────────────
 *
 * Vorgabe Samet: „nicht diese Rautenform — die, die ein bisschen 3D und
 * eigenständig aussieht, statt nur Punkte; etwas Besonderes, besonders für den
 * Dunkelmodus."
 *
 * Es ist darum keine Zeichnung einer Raute mehr, sondern ein GESCHLIFFENER
 * STEIN: vier Facetten treffen sich in der Mitte, jede fängt das Licht anders,
 * und eine schmale Glanzkante läuft über die obere linke Fläche. Dieselbe Form
 * wie zuvor, nur mit Tiefe — deshalb wirkt sie plastisch, ohne dass ein
 * Schlagschatten nötig wäre.
 *
 * Die Facettenfarben stehen als `--ofi-gem-*` im Stylesheet und NICHT hier:
 * so ist der Dunkelmodus ein Variablentausch. Dort leuchtet der Stein zusätzlich
 * (`filter` in der `.dark`-Regel) — im Hellen wäre dasselbe Leuchten Kitsch, im
 * Dunkeln ist es das, was ihn überhaupt sichtbar macht.
 */
export const GemMark = ({
    size = 24,
    /** Noch nicht erreichte Schritte tragen den Stein ungeschliffen — still. */
    muted = false,
    className,
}: {
    size?: number;
    muted?: boolean;
    className?: string;
}) => {
    // Eigene Namen je Instanz: zwei gleich benannte Verläufe im selben Dokument
    // sind ein Verlauf, und alle Steine der Seite hingen am ersten.
    const uid = useId().replace(/:/g, '');
    const sheenId = `gem-sheen-${uid}`;

    const pad = 1;
    const top = pad;
    const bottom = size - pad;
    const left = pad;
    const right = size - pad;
    const cx = size / 2;
    const cy = size / 2;
    const p = (points: Array<[number, number]>) => points.map(([x, y]) => `${x},${y}`).join(' ');

    return (
        <svg
            className={`ofi-gem ${muted ? 'is-muted' : ''} ${className || ''}`}
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {/* Die Glanzkante: ein schmaler Streifen Licht auf der oberen
                    linken Facette, der nach unten ausläuft. */}
                <linearGradient id={sheenId} x1="0" y1="0" x2="0.6" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Oben links: die Lichtfläche. */}
            <polygon points={p([[cx, top], [left, cy], [cx, cy]])} fill="var(--ofi-gem-light)" />
            {/* Oben rechts: der Übergang in die Hausfarbe. */}
            <polygon points={p([[cx, top], [cx, cy], [right, cy]])} fill="var(--ofi-gem-mid)" />
            {/* Unten rechts: die rote Facette — dieselbe Wanderung Navy → Rot
                wie im Briefkopf. */}
            <polygon points={p([[cx, cy], [right, cy], [cx, bottom]])} fill="var(--ofi-gem-accent)" />
            {/* Unten links: der Schatten des Steins. */}
            <polygon points={p([[left, cy], [cx, cy], [cx, bottom]])} fill="var(--ofi-gem-deep)" />
            {/* Der Glanz liegt ÜBER den Facetten, aber nur auf der oberen
                linken — sonst wäre es kein Licht, sondern Nebel. */}
            <polygon points={p([[cx, top], [left, cy], [cx, cy]])} fill={`url(#${sheenId})`} />
            {/* Die Kante hält den Stein bei kleiner Grösse zusammen. */}
            <polygon
                points={p([[cx, top], [right, cy], [cx, bottom], [left, cy]])}
                fill="none"
                stroke="var(--ofi-gem-edge)"
                strokeWidth="0.75"
                strokeLinejoin="round"
            />
        </svg>
    );
};
