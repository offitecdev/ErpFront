import { useId } from 'react';
import type { CSSProperties } from 'react';

import type { GlyphKind } from './importTemplate';

/**
 * ── DIE BELEGSYMBOLE ────────────────────────────────────────────────────────
 *
 * Vorgabe Samet (07.09.2026): «Für PDF, JPG, PNG, XLSX und CSV hätte ich gern
 * farbige, drehende Symbole — im Stil von Apple, elegant hellblau — und dazu
 * einen Prozentwert, wie weit es ist.»
 *
 * Daraus werden drei Teile:
 *
 *   FileGlyph   EIN Blatt: abgerundete Karte mit Eselsohr, Verlauf in der
 *               Farbe des Dateityps, die Endung unten drauf. Reines SVG —
 *               keine Bibliothek, keine Bilddatei, kein Ladefehler.
 *   FileDeck    Die fünf Blätter als aufgefächerter Stapel im Ablagefeld.
 *               Sie wiegen sich langsam; beim Überfahren fächert der Stapel
 *               weiter auf. Das ist der ganze Zauber: eine Fläche, die
 *               antwortet, bevor man klickt.
 *   ReadingDial Der hellblaue Ring beim Lesen, mit dem Blatt in der Mitte,
 *               das sich einmal um sich selbst dreht, und dem Prozentwert
 *               gross darunter.
 *
 * Die Farben sind hier bewusst FEST und nicht aus den Token: ein PDF ist rot
 * und eine Tabelle grün — das ist die Auskunft, nicht die Hausfarbe. Alles
 * Übrige (Ring, Grund, Schrift) kommt aus `--ofi-cal-*` und wechselt im
 * Dunkelmodus mit.
 */

interface GlyphPaint {
    /** Die Endung, die auf dem Blatt steht. */
    ext: string;
    from: string;
    to: string;
}

const PAINT: Record<GlyphKind, GlyphPaint> = {
    pdf: { ext: 'PDF', from: '#ff8a8a', to: '#e5344a' },
    jpg: { ext: 'JPG', from: '#7dd8ff', to: '#0a84ff' },
    png: { ext: 'PNG', from: '#b3a6ff', to: '#5e5ce6' },
    sheet: { ext: 'XLSX', from: '#86e6ac', to: '#12a150' },
    csv: { ext: 'CSV', from: '#ffd587', to: '#f5910b' },
    file: { ext: '', from: '#c3cbd8', to: '#7c8899' },
};

/** Die Reihenfolge im Stapel — sie steht auch im Untertitel des Fensters. */
const DECK_KINDS: GlyphKind[] = ['pdf', 'jpg', 'png', 'sheet', 'csv'];

export const FileGlyph = ({ kind, size = 56 }: { kind: GlyphKind; size?: number }) => {
    const paint = PAINT[kind] ?? PAINT.file;
    /* Eigene Verlaufs-Kennung je Symbol: zwei gleich benannte Verläufe im
       selben Dokument sind ein stiller Farbfehler, kein sichtbarer. */
    const id = useId().replace(/:/g, '');
    return (
        <svg
            viewBox="0 0 56 72"
            width={size}
            height={Math.round((size * 72) / 56)}
            role="img"
            aria-label={paint.ext || undefined}
            aria-hidden={paint.ext ? undefined : true}
        >
            <defs>
                <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={paint.from} />
                    <stop offset="1" stopColor={paint.to} />
                </linearGradient>
            </defs>
            {/* Das Blatt mit dem Eselsohr — ein einziger Pfad. */}
            <path
                d="M9 1h24.6L55 22.4V65a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V7a6 6 0 0 1 6-6Z"
                fill={`url(#g${id})`}
            />
            {/* Das umgeschlagene Eck: dieselbe Farbe, nur heller. */}
            <path d="M33.6 1 55 22.4H39.6A6 6 0 0 1 33.6 16.4V1Z" fill="#fff" fillOpacity="0.42" />
            {/* Zwei angedeutete Textzeilen — das Blatt wirkt beschrieben. */}
            <rect x="12" y="30" width="24" height="3.2" rx="1.6" fill="#fff" fillOpacity="0.44" />
            <rect x="12" y="38" width="17" height="3.2" rx="1.6" fill="#fff" fillOpacity="0.3" />
            {paint.ext && (
                <text
                    x="28"
                    y="59"
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={paint.ext.length > 3 ? 12 : 14}
                    fontWeight="800"
                    letterSpacing="0.3"
                    fontFamily="'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif"
                >
                    {paint.ext}
                </text>
            )}
        </svg>
    );
};

/**
 * Der aufgefächerte Stapel. Die Drehung jedes Blattes kommt als Zahl aus dem
 * Aufbau (`--r`), damit das CSS beim Überfahren einfach weiter auffächern
 * kann: derselbe Wert, mit einem grösseren Faktor.
 */
export const FileDeck = () => (
    <span className="ofi-poi-deck" aria-hidden="true">
        {DECK_KINDS.map((kind, index) => {
            const offset = index - (DECK_KINDS.length - 1) / 2;
            return (
                <i
                    key={kind}
                    className="ofi-poi-deck-card"
                    style={{
                        ...({ '--r': offset, '--d': `${index * 115}ms` } as CSSProperties),
                        zIndex: DECK_KINDS.length - Math.abs(Math.round(offset)),
                    }}
                >
                    <span>
                        <FileGlyph kind={kind} size={50} />
                    </span>
                </i>
            );
        })}
    </span>
);

/**
 * Der Ring beim Lesen. `percent` läuft weich hoch (die Seite rechnet ihn aus
 * den erreichten Schritten), der Kreis ist reines SVG mit einer Strichlücke —
 * so bleibt er auch bei 3px Strichbreite gestochen scharf.
 */
export const ReadingDial = ({ kind, percent }: { kind: GlyphKind; percent: number }) => {
    const clamped = Math.max(0, Math.min(100, percent));
    const id = useId().replace(/:/g, '');

    return (
        <div
            className="ofi-poi-analyzer"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clamped)}
        >
            <div className="ofi-poi-analyzer-scene" aria-hidden="true">
                <span className="ofi-poi-analyzer-halo" />
                <span className="ofi-poi-analyzer-signal is-code">#</span>
                <span className="ofi-poi-analyzer-signal is-value">123</span>
                <span className="ofi-poi-analyzer-signal is-check">✓</span>

                <svg className="ofi-poi-analyzer-document" viewBox="0 0 420 260">
                    <defs>
                        <linearGradient id={`paper${id}`} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#ffffff" />
                            <stop offset="1" stopColor="#eef7ff" />
                        </linearGradient>
                        <linearGradient id={`scan${id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="#0a84ff" stopOpacity="0" />
                            <stop offset="0.52" stopColor="#0a84ff" stopOpacity="0.22" />
                            <stop offset="1" stopColor="#5ac8fa" stopOpacity="0" />
                        </linearGradient>
                        <filter id={`paperShadow${id}`} x="-40%" y="-30%" width="180%" height="190%">
                            <feDropShadow dx="0" dy="16" stdDeviation="15" floodColor="#164a7c" floodOpacity="0.18" />
                        </filter>
                    </defs>

                    <g className="ofi-poi-analyzer-paper" filter={`url(#paperShadow${id})`}>
                        <rect x="116" y="20" width="188" height="218" rx="18" fill={`url(#paper${id})`} />
                        <path d="M260 20h26a18 18 0 0 1 18 18v27Z" fill="#d9efff" />
                        <path d="M260 20v27a18 18 0 0 0 18 18h26" fill="#c9e7ff" />

                        <rect x="139" y="49" width="62" height="9" rx="4.5" fill="#2f78bd" opacity="0.88" />
                        <rect x="139" y="68" width="94" height="6" rx="3" fill="#aac8df" />
                        <rect x="139" y="79" width="72" height="6" rx="3" fill="#d0e1ed" />

                        <g className="ofi-poi-analyzer-field is-one">
                            <rect x="136" y="103" width="145" height="28" rx="7" fill="#f7fbff" stroke="#b9d6eb" />
                            <rect x="147" y="113" width="58" height="7" rx="3.5" fill="#9bbbd2" />
                            <rect x="245" y="112" width="24" height="9" rx="4.5" fill="#5eaef0" />
                        </g>
                        <g className="ofi-poi-analyzer-field is-two">
                            <rect x="136" y="139" width="145" height="28" rx="7" fill="#f7fbff" stroke="#b9d6eb" />
                            <rect x="147" y="149" width="81" height="7" rx="3.5" fill="#9bbbd2" />
                            <rect x="248" y="148" width="21" height="9" rx="4.5" fill="#7568ed" opacity="0.78" />
                        </g>
                        <g className="ofi-poi-analyzer-field is-three">
                            <rect x="136" y="175" width="145" height="39" rx="7" fill="#f7fbff" stroke="#b9d6eb" />
                            <rect x="147" y="186" width="104" height="6" rx="3" fill="#9bbbd2" />
                            <rect x="147" y="198" width="73" height="6" rx="3" fill="#c5d9e8" />
                        </g>

                        <g className="ofi-poi-analyzer-scan">
                            <rect x="123" y="50" width="174" height="62" rx="10" fill={`url(#scan${id})`} />
                            <line x1="126" y1="109" x2="294" y2="109" stroke="#168cf0" strokeWidth="2.5" strokeLinecap="round" />
                            <circle cx="294" cy="109" r="4" fill="#7bdcff" />
                        </g>
                    </g>
                </svg>
            </div>

            <div className="ofi-poi-analyzer-meter">
                <span className="ofi-poi-analyzer-file"><FileGlyph kind={kind} size={25} /></span>
                <span className="ofi-poi-analyzer-track"><span style={{ width: `${clamped}%` }} /></span>
                <b>{Math.round(clamped)}%</b>
            </div>
        </div>
    );
};
