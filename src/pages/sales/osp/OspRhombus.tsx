import { useId, useMemo } from 'react';

/**
 * ── OSP-RAUTENMUSTER (04.09.2026) ────────────────────────────────────────────
 * Das Erkennungszeichen der OSP-Seite: statt der Wellen der übrigen Anwendung
 * trägt ihre eigene Seitenleiste ein RAUTENGITTER — versetzte Reihen aus
 * Diamanten im Marken-Farbverlauf (Marineblau → Rot, wie die Login-Welle).
 *
 * Wie bei `LoginWave` entsteht die Geometrie zur Laufzeit aus wenigen
 * Konstanten; "Zufall" ist eine deterministische Streuung aus den Indizes,
 * damit jeder Render dasselbe Bild zeichnet. `preserveAspectRatio="none"`
 * dehnt das Gitter auf jede Containergrösse.
 */

const VIEW_W = 320;
const VIEW_H = 760;
/** Rautenraster: Abstand der Mittelpunkte. */
const CELL_W = 64;
const CELL_H = 84;
/** Halbe Diagonalen der Grundraute. */
const RX = 22;
const RY = 30;

/** Deterministische Streuung 0..1 aus den Gitterindizes. */
const scatter = (col: number, row: number, salt: number): number => {
    const value = Math.sin(col * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453;
    return value - Math.floor(value);
};

interface Diamond {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    opacity: number;
    outline: boolean;
}

const buildDiamonds = (): Diamond[] => {
    const diamonds: Diamond[] = [];
    const cols = Math.ceil(VIEW_W / CELL_W) + 2;
    const rows = Math.ceil(VIEW_H / CELL_H) + 2;
    for (let row = -1; row < rows; row += 1) {
        for (let col = -1; col < cols; col += 1) {
            // Versetzte Reihen — jede zweite rückt eine halbe Zelle ein.
            const cx = col * CELL_W + (row % 2 ? CELL_W / 2 : 0);
            const cy = row * CELL_H;
            const size = 0.55 + scatter(col, row, 1) * 0.75;
            // Nach unten hin dichter/deckender — oben bleibt Luft für den Inhalt.
            const depth = cy / VIEW_H;
            const opacity = 0.05 + depth * 0.26 + scatter(col, row, 2) * 0.1;
            diamonds.push({
                cx,
                cy,
                rx: RX * size,
                ry: RY * size,
                opacity: Math.min(0.42, opacity),
                // Ein Teil der Rauten ist nur UMRISS — das macht das Gitter leicht.
                outline: scatter(col, row, 3) > 0.72,
            });
        }
    }
    return diamonds;
};

const diamondPath = ({ cx, cy, rx, ry }: Diamond): string =>
    `M${cx} ${cy - ry} L${cx + rx} ${cy} L${cx} ${cy + ry} L${cx - rx} ${cy} Z`;

export const OspRhombus = ({ className = '' }: { className?: string }) => {
    const gradientId = `ofi-osp-rhombus-${useId().replace(/:/g, '')}`;
    const diamonds = useMemo(buildDiamonds, []);

    return (
        <svg
            className={className}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VIEW_W} y2={VIEW_H}>
                    <stop offset="0%" stopColor="#8ea3dc" />
                    <stop offset="52%" stopColor="#5a6db8" />
                    <stop offset="100%" stopColor="#e05656" />
                </linearGradient>
            </defs>
            {diamonds.map((diamond, index) => diamond.outline ? (
                <path
                    key={index}
                    d={diamondPath(diamond)}
                    fill="none"
                    stroke={`url(#${gradientId})`}
                    strokeOpacity={Math.min(0.5, diamond.opacity + 0.12)}
                    strokeWidth="1.1"
                />
            ) : (
                <path
                    key={index}
                    d={diamondPath(diamond)}
                    fill={`url(#${gradientId})`}
                    fillOpacity={diamond.opacity}
                />
            ))}
        </svg>
    );
};

/**
 * Kleine Rautenreihe als Schmuckzeile (Kopf der Leiste, Trennstellen):
 * drei Diamanten, der mittlere betont.
 */
export const OspRhombusRow = ({ className = '' }: { className?: string }) => (
    <svg className={className} viewBox="0 0 64 14" aria-hidden="true" focusable="false">
        <path d="M10 2 L16 7 L10 12 L4 7 Z" fill="currentColor" opacity="0.35" />
        <path d="M32 1 L39 7 L32 13 L25 7 Z" fill="currentColor" opacity="0.85" />
        <path d="M54 2 L60 7 L54 12 L48 7 Z" fill="currentColor" opacity="0.35" />
    </svg>
);
