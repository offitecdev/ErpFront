/**
 * ── DAS HAUSZEICHEN ─────────────────────────────────────────────────────────
 *
 * Der Offitec-Stern: drei gekreuzte Speichen mit Widerhaken an den Enden und
 * einem Punkt in der Mitte — dasselbe Zeichen, das der Startvorhang gross
 * zeichnet (`.ofi-splash-star` in index.html). Geometrie und Reihenfolge der
 * Speichen stehen dort und hier IDENTISCH; ändert sich eine Kurve, muss sie
 * dort mitgehen, sonst startet die Anwendung mit einem anderen Zeichen, als
 * das Neuigkeiten-Blatt trägt.
 *
 * Es kam am 29.08.2026 dazu, weil das Blatt ein Prospekt ist: ein Prospekt
 * ohne Hauszeichen ist ein Zettel.
 *
 * Die drei Speichen dürfen eigene Farben tragen (der Vorhang gibt ihnen drei
 * Töne). Ohne Angabe laufen alle in `currentColor` — so fügt es sich in jede
 * Fläche, auf die man es legt.
 */
export const OffitecMark = ({
    size = 40,
    className = '',
    spokes,
    dot,
}: {
    size?: number;
    className?: string;
    /** Drei Speichenfarben; fehlt eine, gilt `currentColor`. */
    spokes?: [string, string, string];
    /** Farbe des Punkts in der Mitte; sonst `currentColor`. */
    dot?: string;
}) => {
    const spoke = 'M32 7v50M32 18 23 9m9 9 9-9M32 46l-9 9m9-9 9 9';
    return (
        <svg
            viewBox="0 0 64 64"
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
            focusable="false"
            fill="none"
            strokeWidth="5"
            strokeLinecap="square"
            strokeLinejoin="miter"
        >
            <path d={spoke} stroke={spokes?.[0] ?? 'currentColor'} />
            <path d={spoke} transform="rotate(60 32 32)" stroke={spokes?.[1] ?? 'currentColor'} />
            <path d={spoke} transform="rotate(120 32 32)" stroke={spokes?.[2] ?? 'currentColor'} />
            <circle cx="32" cy="32" r="4.6" fill={dot ?? 'currentColor'} stroke="none" />
        </svg>
    );
};
