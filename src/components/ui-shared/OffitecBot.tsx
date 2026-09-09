import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { t } from '@/i18n/translate';
import '@/styles/bot.css';

/**
 * ── OFFI, DER RATGEBER (Vorgabe Samet, 09.09.2026) ───────────────────────────
 *
 * «Mach einen KI-Berater-Roboter, der beim Laden erscheint — etwas Eigenes für
 *  Offitec, gern niedlich, angelehnt an das Zeichen oder das Aussehen.»
 *
 * Also kein fremdes Maskottchen und kein gekauftes Bild: Offi ist AUS DEM
 * HAUSZEICHEN gebaut. Der Offitec-Stern — drei gekreuzte Speichen mit
 * Widerhaken und einem Punkt in der Mitte (siehe `icons/OffitecMark.tsx`) —
 * sitzt ihm als Antenne auf dem Kopf und dreht sich langsam, während er
 * nachdenkt. Der Kopf trägt die Hausfarbe, das Visier die helle Fläche
 * darunter, die Augen sind zwei Striche, die blinzeln und umherschauen.
 *
 * Warum ein Gesicht und nicht der übliche Ring: ein Ring sagt «es läuft». Offi
 * sagt zusätzlich, WAS gerade läuft, und gibt in der Wartezeit einen Tipp — die
 * Sekunden am Ladebalken sind die einzigen, in denen jemand einen Hinweis auch
 * wirklich liest. Genau das ist der «Berater» im Namen.
 *
 * ALLES IST SVG UND CSS. Keine Bilddatei (sie wäre in beiden Themen falsch
 * getönt), keine Bibliothek (Hausregel), und bei
 * `prefers-reduced-motion: reduce` steht Offi still — er bleibt dann ein
 * ruhiges Bild statt einer Zappelei (`styles/bot.css`).
 */

export type BotMood = 'thinking' | 'happy';

export const OffitecBot = ({
    size = 104,
    mood = 'thinking',
    className = '',
}: {
    size?: number;
    /** `happy` hebt die Mundlinie — für «fertig», nicht für «lädt». */
    mood?: BotMood;
    className?: string;
}) => (
    <span
        className={`ofi-bot ofi-bot--${mood} ${className}`}
        style={{ '--ofi-bot-size': `${size}px` } as CSSProperties}
        aria-hidden="true"
    >
        <svg viewBox="0 0 120 128" width={size} height={size * (128 / 120)} fill="none">
            {/* Der Schatten atmet mit dem Schweben — er wird flacher, wenn Offi
                oben ist. Ohne ihn sähe das Schweben aus wie ein Ruckeln. */}
            <ellipse className="ofi-bot__shadow" cx="60" cy="119" rx="26" ry="5" />

            <g className="ofi-bot__float">
                {/* ── DIE ANTENNE: DAS HAUSZEICHEN ────────────────────────────
                    Dieselbe Geometrie wie `OffitecMark` — drei Speichen mit
                    Widerhaken, Punkt in der Mitte —, nur klein und in Bewegung.
                    Ändert sich das Zeichen dort, gehört es hier mit geändert. */}
                <path className="ofi-bot__stalk" d="M60 26v-8" />
                <g className="ofi-bot__star">
                    {/* Die DREI SPEICHENFARBEN sind die des Startvorhangs
                        (`--ofi-spoke-*` in index.html): navy, rot, graublau, und
                        der Punkt in der Mitte. Damit ist die Antenne nicht «ein
                        Stern», sondern DAS Hauszeichen. */}
                    <g strokeWidth="5" strokeLinecap="square" fill="none">
                        <path className="ofi-bot__spoke ofi-bot__spoke--1" d="M32 7v50M32 18 23 9m9 9 9-9M32 46l-9 9m9-9 9 9" transform="translate(-32 -32)" />
                        <path className="ofi-bot__spoke ofi-bot__spoke--2" d="M32 7v50M32 18 23 9m9 9 9-9M32 46l-9 9m9-9 9 9" transform="translate(-32 -32) rotate(60 32 32)" />
                        <path className="ofi-bot__spoke ofi-bot__spoke--3" d="M32 7v50M32 18 23 9m9 9 9-9M32 46l-9 9m9-9 9 9" transform="translate(-32 -32) rotate(120 32 32)" />
                    </g>
                    <circle className="ofi-bot__stardot" cx="0" cy="0" r="4.6" />
                </g>

                {/* ── DER KOPF ────────────────────────────────────────────────
                    Ein weiches Rechteck in der Hausfarbe, breiter als hoch:
                    das ist der Unterschied zwischen «niedlich» und «technisch».
                    Die zwei Ohren sind Kappen, keine Antennen — sonst hätte er
                    drei davon. */}
                <rect className="ofi-bot__ear" x="14" y="60" width="9" height="18" rx="4.5" />
                <rect className="ofi-bot__ear" x="97" y="60" width="9" height="18" rx="4.5" />
                <rect className="ofi-bot__head" x="20" y="26" width="80" height="66" rx="22" />

                {/* Das Visier: die dunkle Fläche, in der die Augen wohnen. */}
                <rect className="ofi-bot__visor" x="30" y="38" width="60" height="34" rx="15" />

                <g className="ofi-bot__look">
                    <g className="ofi-bot__blink">
                        {/* Grosse runde Augen mit einem Glanzpunkt oben links —
                            das ist der ganze Unterschied zwischen «Gerät» und
                            «jemand». */}
                        <circle className="ofi-bot__eye" cx="47" cy="55" r="6.5" />
                        <circle className="ofi-bot__eye" cx="73" cy="55" r="6.5" />
                        <circle className="ofi-bot__glint" cx="45" cy="52.5" r="2" />
                        <circle className="ofi-bot__glint" cx="71" cy="52.5" r="2" />
                    </g>
                </g>

                {/* Wangen: zwei weiche Flecken in der Hausfarbe, halb durchsichtig. */}
                <circle className="ofi-bot__cheek" cx="35" cy="78" r="5" />
                <circle className="ofi-bot__cheek" cx="85" cy="78" r="5" />

                {/* Der Mund: ein kleiner Bogen — im «happy»-Zustand ein grösserer. */}
                <path className="ofi-bot__mouth" d="M53 79q7 5 14 0" />

                {/* ── DER KÖRPER ──────────────────────────────────────────────
                    Nur angedeutet: Offi ist ein Kopf mit Schultern. Ein ganzer
                    Körper würde in einer Ladefläche zu viel Platz brauchen. */}
                <path className="ofi-bot__body" d="M36 112a24 24 0 0 1 48 0z" />
                {/* Die drei Lämpchen laufen wie ein Gedanke von links nach rechts. */}
                <circle className="ofi-bot__lamp" cx="50" cy="106" r="2.6" style={{ '--ofi-bot-lamp': 0 } as CSSProperties} />
                <circle className="ofi-bot__lamp" cx="60" cy="106" r="2.6" style={{ '--ofi-bot-lamp': 1 } as CSSProperties} />
                <circle className="ofi-bot__lamp" cx="70" cy="106" r="2.6" style={{ '--ofi-bot-lamp': 2 } as CSSProperties} />
            </g>
        </svg>
    </span>
);

/** Die Hinweise, die Offi beim Warten gibt — im Haus gepflegt, nicht erfunden. */
const TIP_KEYS = ['bot.tips.1', 'bot.tips.2', 'bot.tips.3', 'bot.tips.4', 'bot.tips.5', 'bot.tips.6'] as const;

/**
 * OFFI FÜLLT EINE FLÄCHE, DIE NOCH LEER IST — die Seite, die gerade lädt, das
 * Blatt, das seinen Inhalt holt.
 *
 * Der Tipp wechselt alle paar Sekunden und läuft die Liste der Reihe nach
 * durch. Er beginnt bewusst IMMER beim ersten: ein Zufallsstart wäre schöner,
 * verlangte aber eine unreine Rechnung mitten im Zeichnen — und React verbietet
 * das inzwischen zu Recht (`react-hooks/purity`). Wer lange wartet, sieht
 * ohnehin mehrere.
 *
 * Ein Ladezustand, der in einer halben Sekunde vorbei ist, soll gar nichts
 * zeigen — `delayMs` hält Offi so lange zurück; erst wenn es wirklich dauert,
 * erscheint er. Sonst blitzte er bei jedem schnellen Seitenwechsel auf.
 */
export const BotLoadingPanel = ({
    label,
    tips,
    minHeight = 280,
    size = 104,
    delayMs = 350,
    className = '',
}: {
    label?: string;
    /** Eigene Hinweise; ohne Angabe die allgemeinen aus dem Wörterbuch. */
    tips?: string[];
    minHeight?: number;
    size?: number;
    /** Erst nach dieser Zeit erscheinen — kurze Wartezeiten bleiben ruhig. */
    delayMs?: number;
    className?: string;
}) => {
    const [shown, setShown] = useState(delayMs === 0);
    useEffect(() => {
        if (delayMs === 0) return undefined;
        const timer = window.setTimeout(() => setShown(true), delayMs);
        return () => window.clearTimeout(timer);
    }, [delayMs]);

    const lines = tips?.length ? tips : TIP_KEYS.map((key) => t(key));
    const [step, setStep] = useState(0);
    useEffect(() => {
        if (!shown || lines.length < 2) return undefined;
        // Der Zähler läuft NUR im Taktgeber weiter — nichts wird im Rumpf des
        // Effekts gesetzt, sonst zöge das eine Kaskade nach sich.
        const timer = window.setInterval(() => setStep((value) => value + 1), 4200);
        return () => window.clearInterval(timer);
    }, [shown, lines.length]);

    if (!shown) return <div style={{ minHeight }} className={className} />;

    const tip = lines[step % lines.length];
    return (
        <div
            role="status"
            aria-live="polite"
            style={{ minHeight }}
            className={`flex flex-col items-center justify-center gap-3 px-6 py-8 text-center ${className}`}
        >
            <OffitecBot size={size} />
            <span className="text-[13px] font-semibold text-slate-700 dark:text-white/85">
                {label ?? t('common.loadingData')}
            </span>
            {/* Der Hinweis wechselt mit einer Blende; der Schlüssel erzwingt sie,
                sonst tauschte React nur den Text und nichts bewegte sich. */}
            <span key={tip} className="ofi-bot-tip max-w-[42ch] text-[12px] leading-relaxed text-slate-400 dark:text-white/50">
                {tip}
            </span>
        </div>
    );
};
