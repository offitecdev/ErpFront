import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoginIntroEngine, type GlyphBox, type IntroChannel, type IntroGeometry } from './loginIntroEngine';

import '../../styles/login-intro.css';

/**
 * ── ERÖFFNUNG DER ANMELDESEITE ──────────────────────────────────────────────
 *
 * Das Erste, was jemand vom Programm sieht: schwarze Bühne, darauf in drei
 * Spalten je eine leuchtende TAFEL mit dem Zeichen darauf —
 *
 *     ┌───────┐    ┌───────┐    ┌───────┐
 *     │   O   │    │   C   │    │   C   │
 *     │COOLING│    │HEATING│    │SOFTWA…│
 *     └───────┘    └───────┘    └───────┘
 *      OFFITEC      CONTROL      CENTER
 *
 * Jede Spalte zündet nacheinander und bringt ihren eigenen Stoff mit, der
 * oben UND unten aus dem Zeichen fährt:
 *
 *   O · Rauch    grosse Schwaden, die aufsteigen und absacken
 *   C · Feuer    eine gewaltige Flamme samt Funkenflug
 *   C · Licht    violette Lichtkegel — zwei DREIECKE, oben und unten
 *
 * Die drei Wörter auf den Tafeln — COOLING · HEATING · SOFTWARE — nennen das
 * Geschäft; darunter buchstabieren die Spalten den Namen: OFFITEC CONTROL
 * CENTER. Beides ist Markenschrift und steht deshalb in jeder Sprache gleich
 * da (wie das Logo selbst) — es geht nicht durch die Sprachdateien.
 *
 * Arbeitsteilung:
 *   • Tafeln und Schrift sind DOM: gestochen scharf auf jedem Bildschirm und
 *     mit CSS zu beleuchten.
 *   • Rauch, Feuer und Licht rechnet `loginIntroEngine` auf zwei Leinwänden:
 *     eine HINTER den Zeichen (Kegel, Flammenkörper, Qualm) und eine DAVOR
 *     (Funken, Staub, Blendbalken). Die Zeichen stehen dadurch IM Effekt,
 *     nicht davor.
 *   • Die Quellen sitzen exakt an Ober- und Unterkante der TAFEL. Gemessen
 *     wird über `offsetTop`/`offsetLeft` — NICHT über `getBoundingClientRect`,
 *     denn die laufenden Einblend-Transformationen (und der Abgang, der die
 *     ganze Bühne skaliert) würden die Rechtecke verfälschen.
 *
 * Abbrechen: Klick, Tastendruck oder der Knopf unten. Wer die Tastatur
 * benutzt, verliert dabei nichts — die Eingabe läuft weiter ins Formular
 * dahinter, die Bühne fängt den Anschlag nicht ab.
 *
 * `prefers-reduced-motion`: keine Teilchen, kein Flackern — nur ein ruhiges
 * Auf- und Abblenden der Wortmarke in gut anderthalb Sekunden.
 */

interface LoginIntroProps {
    /**
     * Läuft, sobald die Bühne zu verschwinden BEGINNT. Die Anmeldung blendet
     * dann gleichzeitig auf — schwarze Bühne und Formular überblenden
     * ineinander, statt sich abzuwechseln.
     */
    onReveal?: () => void;
    /** Läuft, wenn die Bühne abgeräumt ist — der Aufsatz darf sie entfernen. */
    onDone: () => void;
}

/** Sekunde, in der die jeweilige Spalte zündet. */
const IGNITE: Record<IntroChannel, number> = { smoke: 0.45, fire: 1.05, light: 1.65 };
/** Die Wortmarke steigt Spalte für Spalte nach. */
const WORD_AT: Record<IntroChannel, number> = { smoke: 2.1, fire: 2.24, light: 2.38 };
/** Abgang: Rückbau der Effekte … */
const EXIT_AT = 3.9;
/** … und Ende der Bühne. */
const DONE_AT = 4.62;
/** Abgang beim Abbrechen — kurz, aber nicht ruckartig. */
const SKIP_FADE_MS = 460;
/** Ruhige Fassung für `prefers-reduced-motion`. */
const REDUCED_DONE_MS = 1600;

const CHANNELS: IntroChannel[] = ['smoke', 'fire', 'light'];
const GLYPH: Record<IntroChannel, string> = { smoke: 'O', fire: 'C', light: 'C' };
/** Markenname — keine Übersetzung, in jeder Sprache identisch. */
const WORD: Record<IntroChannel, string> = { smoke: 'Offitec', fire: 'Control', light: 'Center' };
/**
 * Das Geschäft, ein Wort je Tafel. Die Zuordnung ist nicht beliebig: der
 * Rauch kühlt, die Flamme heizt, das Licht ist das Programm.
 */
const TAG: Record<IntroChannel, string> = { smoke: 'Cooling', fire: 'Heating', light: 'Software' };

/** Systemweiter Wunsch nach ruhiger Darstellung. */
const prefersReduced = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Lage eines Elements INNERHALB der Bühne, ohne CSS-Transformationen.
 * `offsetParent` läuft nach oben, bis die (positionierte) Bühne erreicht ist.
 */
const layoutBox = (el: HTMLElement, stage: HTMLElement) => {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = el;
    while (node && node !== stage) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
};

export const LoginIntro = ({ onReveal, onDone }: LoginIntroProps) => {
    const { t } = useTranslation();

    const stageRef = useRef<HTMLDivElement>(null);
    const backRef = useRef<HTMLCanvasElement>(null);
    const frontRef = useRef<HTMLCanvasElement>(null);
    const smokeRef = useRef<HTMLSpanElement>(null);
    const fireRef = useRef<HTMLSpanElement>(null);
    const lightRef = useRef<HTMLSpanElement>(null);
    const engineRef = useRef<LoginIntroEngine | null>(null);
    const timers = useRef<number[]>([]);
    const finished = useRef(false);
    const revealed = useRef(false);
    /**
     * Die Rückrufe liegen in einer Schachtel, NICHT in den Abhängigkeiten des
     * Zeitplans. Der Aufsatz reicht sie als Pfeilfunktionen herein und legt
     * bei jedem eigenen Neuzeichnen neue an; hingen `finish`/`beginLeave`
     * daran, würde der Zeitplan mitten im Ablauf abgeräumt und von vorn
     * beginnen — die Bühne liefe dann zweimal.
     */
    const callbacks = useRef({ onReveal, onDone });

    /** Wie weit die Inszenierung ist: 0 leer · 1 O · 2 C · 3 C · 4 Wortmarke.
     *  Die ruhige Fassung steht von Anfang an fertig da. */
    const [step, setStep] = useState(() => (prefersReduced() ? 4 : 0));
    const [leaving, setLeaving] = useState(false);

    const reduced = useMemo(() => prefersReduced(), []);

    const glyphRefs = useMemo(
        () => ({ smoke: smokeRef, fire: fireRef, light: lightRef }),
        [],
    );

    useEffect(() => {
        callbacks.current = { onReveal, onDone };
    }, [onReveal, onDone]);

    const clearTimers = useCallback(() => {
        for (const id of timers.current) window.clearTimeout(id);
        timers.current = [];
    }, []);

    const after = useCallback((seconds: number, fn: () => void) => {
        timers.current.push(window.setTimeout(fn, seconds * 1000));
    }, []);

    /** Den Vorhang öffnen: ab hier läuft die Anmeldung dahinter hoch. */
    const beginLeave = useCallback(() => {
        if (revealed.current) return;
        revealed.current = true;
        setLeaving(true);
        callbacks.current.onReveal?.();
    }, []);

    /** Bühne abräumen — regulär am Ende oder vorzeitig per Abbruch. */
    const finish = useCallback(() => {
        if (finished.current) return;
        finished.current = true;
        callbacks.current.onDone();
    }, []);

    const skip = useCallback(() => {
        if (finished.current || revealed.current) return;
        clearTimers();
        engineRef.current?.beginExit();
        setStep(4);
        beginLeave();
        timers.current.push(window.setTimeout(finish, SKIP_FADE_MS));
    }, [beginLeave, clearTimers, finish]);

    /* ── Zeitplan ──────────────────────────────────────────────────────── */
    useEffect(() => {
        if (reduced) {
            timers.current.push(window.setTimeout(beginLeave, REDUCED_DONE_MS - 420));
            timers.current.push(window.setTimeout(finish, REDUCED_DONE_MS));
            return clearTimers;
        }
        after(IGNITE.smoke, () => setStep(1));
        after(IGNITE.fire, () => setStep(2));
        after(IGNITE.light, () => setStep(3));
        after(WORD_AT.smoke, () => setStep(4));
        after(EXIT_AT, () => {
            engineRef.current?.beginExit();
            beginLeave();
        });
        after(DONE_AT, finish);
        return clearTimers;
    }, [after, beginLeave, clearTimers, finish, reduced]);

    /* ── Teilchenwerk ──────────────────────────────────────────────────── */
    useLayoutEffect(() => {
        if (reduced) return;
        const stage = stageRef.current;
        const back = backRef.current;
        const front = frontRef.current;
        if (!stage || !back || !front) return;

        let engine: LoginIntroEngine;
        try {
            engine = new LoginIntroEngine(back, front, IGNITE);
        } catch {
            return; // ohne 2D-Kontext bleibt die reine Schriftfassung stehen
        }
        engineRef.current = engine;

        const measure = () => {
            const w = stage.clientWidth;
            const h = stage.clientHeight;
            if (!w || !h) return;
            engine.setSize(w, h, Math.min(window.devicePixelRatio || 1, 2));

            const geo = {} as IntroGeometry;
            for (const channel of CHANNELS) {
                const el = glyphRefs[channel].current;
                if (!el) return;
                const box = layoutBox(el, stage);
                const glyph: GlyphBox = {
                    cx: box.x + box.w / 2,
                    top: box.y,
                    bottom: box.y + box.h,
                    w: box.w,
                    h: Math.max(1, box.h),
                };
                geo[channel] = glyph;
            }
            engine.setGeometry(geo);
        };

        measure();
        engine.start();

        // Nachmessen: Schriftladung (font-display: optional tauscht spät),
        // Fenstergrösse, Drehung des Geräts.
        const ro = new ResizeObserver(measure);
        ro.observe(stage);
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        void fonts?.ready.then(measure).catch(() => undefined);

        return () => {
            ro.disconnect();
            engine.stop();
            engineRef.current = null;
        };
    }, [glyphRefs, reduced]);

    /* ── Abbrechen ─────────────────────────────────────────────────────── */
    useEffect(() => {
        if (reduced) return;
        // `keydown` bewusst OHNE preventDefault: der Anschlag landet weiter im
        // Formular dahinter, die Bühne verschwindet nur nebenbei.
        const onKey = () => skip();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [reduced, skip]);

    const rootClass = [
        'ofi-intro',
        step >= 1 && 'is-lit-smoke',
        step >= 2 && 'is-lit-fire',
        step >= 3 && 'is-lit-light',
        step >= 4 && 'is-named',
        leaving && 'is-out',
        reduced && 'is-calm',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={rootClass} onPointerDown={skip} role="presentation">
            <div className="ofi-intro__stage" ref={stageRef}>
                {/* Hinter den Zeichen: Lichtkegel, Flammenkörper, Rauch */}
                <canvas className="ofi-intro__canvas ofi-intro__canvas--back" ref={backRef} aria-hidden="true" />

                <div className="ofi-intro__mark" aria-hidden="true">
                    <div className="ofi-intro__cols">
                        {CHANNELS.map((channel) => (
                            <div key={channel} className={`ofi-intro__col ofi-intro__col--${channel}`}>
                                <span className="ofi-intro__tile-wrap">
                                    <span className="ofi-intro__spark" />
                                    <span className="ofi-intro__glow" />
                                    <span className="ofi-intro__tile" ref={glyphRefs[channel]}>
                                        <span className="ofi-intro__letter">{GLYPH[channel]}</span>
                                        <span className="ofi-intro__tag">{TAG[channel]}</span>
                                    </span>
                                </span>
                                <span className="ofi-intro__word">
                                    {WORD[channel].split('').map((letter, i) => (
                                        <span
                                            key={`${letter}-${i}`}
                                            className="ofi-intro__word-letter"
                                            style={{ animationDelay: `${i * 34}ms` }}
                                        >
                                            {letter}
                                        </span>
                                    ))}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Vor den Zeichen: Funken, Staub, Blendbalken */}
                <canvas className="ofi-intro__canvas ofi-intro__canvas--front" ref={frontRef} aria-hidden="true" />
            </div>

            <div className="ofi-intro__grain" aria-hidden="true" />
            <div className="ofi-intro__vignette" aria-hidden="true" />

            {!reduced && (
                <button type="button" className="ofi-intro__skip ofi-btn-plain" onClick={skip}>
                    {t('auth.introSkip')}
                </button>
            )}
        </div>
    );
};

export default LoginIntro;
