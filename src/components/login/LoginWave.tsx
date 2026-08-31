import { useId, useMemo } from 'react';

/**
 * ── LOGIN-WELLE (Fusszeile der Anmeldeseite) ────────────────────────────────
 *
 * Motiv v3 (15.08.2026): DREI durchscheinende Wellenflächen, streng
 * regelmässig — alle drei haben dieselbe Wellenlänge und denselben
 * Ausschlag und sind nur gegeneinander versetzt (in der Höhe und in der
 * Phase). Dadurch laufen die Kämme parallel wie versetzte Kopien einer
 * einzigen Welle: ruhig, gleichmässig, modern. Farbverlauf wie im
 * ModernTender-PDF: Marineblau links, Rot rechts, dazu eine helle Kammlinie
 * auf der vordersten Lage.
 *
 * Bewusst REINE Sinusform (keine Oberwelle, keine zufälligen Kämme) und nur
 * 1,5 Perioden über die ganze Breite — wenige, grosse Bögen mit kräftigem
 * Auf und Ab statt vieler kleiner Hügel. Die Flächen sind stark durchscheinend und sitzen
 * hoch im Band, damit alle drei Kämme sichtbar bleiben und der Hintergrund
 * durchschimmert.
 *
 * Die Pfade entstehen zur Laufzeit aus `LAYERS` + den Konstanten darüber —
 * Wellenlänge, Ausschlag und Abstände lassen sich an einer Stelle ändern.
 *
 * `preserveAspectRatio="none"`: die Flächen dehnen sich auf jede Container-
 * grösse; am Handy wird die Welle flacher, bleibt aber gleich kräftig.
 *
 * Die Welle steht ZWEIMAL auf der Anmeldeseite: oben als Kopfband (in CSS
 * senkrecht gespiegelt, `.ofi-login__wave--top`) und unten als Fusszeile.
 * Deshalb bekommt der Farbverlauf pro Instanz eine eigene ID — zwei gleiche
 * IDs im Dokument wären ungültig und die zweite Welle würde auf den Verlauf
 * der ersten zeigen.
 */

const VIEW_W = 1600;
const VIEW_H = 320;
/** Abtastschritt in x — 10 Einheiten sind glatt genug und halten das DOM klein. */
const STEP = 10;

interface Layer {
    /** Ruhehöhe der Lage (grösser = tiefer). */
    base: number;
    /** Ausschlag der Grundwelle. */
    amp: number;
    /** Wellenlänge der Grundwelle. */
    len: number;
    /** Phasenverschiebung — versetzt die Kämme der Lagen gegeneinander. */
    phase: number;
    /** Deckkraft der Fläche. */
    opacity: number;
}

/** Wellenlänge: 1,5 Perioden über die volle Breite. */
const WAVE_LEN = VIEW_W / 1.5;
/** Ausschlag — für alle Lagen gleich, das hält die Kämme parallel.
    Bewusst gross: mit kleinem Ausschlag wirkt das Band flach wie ein Streifen,
    erst ein deutliches Auf und Ab macht daraus eine Welle. */
const WAVE_AMP = 74;

const LAYERS: Layer[] = [
    { base: 104, amp: WAVE_AMP, len: WAVE_LEN, phase: 0, opacity: 0.11 },
    { base: 158, amp: WAVE_AMP, len: WAVE_LEN, phase: 0.62, opacity: 0.2 },
    { base: 212, amp: WAVE_AMP, len: WAVE_LEN, phase: 1.24, opacity: 0.34 },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** y der Wellenlinie an der Stelle x — reine Sinusform. */
const waveY = (x: number, { base, amp, len, phase }: Layer) => base + amp * Math.sin((2 * Math.PI * x) / len + phase);

/** Nur die Wellenlinie (Kammlinie der vordersten Lage). */
const crestLine = (layer: Layer) => {
    const points: string[] = [];
    for (let x = 0; x <= VIEW_W; x += STEP) {
        points.push(`${points.length ? 'L' : 'M'}${x} ${round1(waveY(x, layer))}`);
    }
    return points.join(' ');
};

/** Wellenlinie, nach unten zur geschlossenen Fläche ergänzt. */
const areaPath = (layer: Layer) => `${crestLine(layer)} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z`;

export const LoginWave = ({ className = '' }: { className?: string }) => {
    const gradientId = `ofi-login-wave-${useId().replace(/:/g, '')}`;
    const { areas, crest } = useMemo(
        () => ({
            areas: LAYERS.map(areaPath),
            crest: crestLine(LAYERS[LAYERS.length - 1]),
        }),
        [],
    );

    return (
        <svg
            className={className}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VIEW_W} y2="0">
                    <stop offset="0%" style={{ stopColor: 'var(--lg-wave-a)' }} />
                    <stop offset="38%" style={{ stopColor: 'var(--lg-wave-a)' }} />
                    <stop offset="74%" style={{ stopColor: 'var(--lg-wave-b)' }} />
                    <stop offset="100%" style={{ stopColor: 'var(--lg-wave-b)' }} />
                </linearGradient>
            </defs>

            {areas.map((d, i) => (
                <path key={i} d={d} fill={`url(#${gradientId})`} fillOpacity={LAYERS[i].opacity} />
            ))}

            {/* Helle Kammlinie auf der vordersten Lage — gibt der Welle eine Kante. */}
            <path
                d={crest}
                fill="none"
                stroke="#ffffff"
                strokeOpacity="0.45"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
};
