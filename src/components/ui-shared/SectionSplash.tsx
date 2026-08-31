import { useEffect, useState } from 'react';

import { isBootSplashGone, whenBootSplashGone } from '@/lib/bootSplash';
import { hasSeenSplash, markSplashSeen, type SplashScope } from '@/lib/splashOnce';

/**
 * Öffnungs-Splash EINES Bereichs (Vorgabe 17./18.08.2026, um das Postfach
 * erweitert 19.08.2026). Jeder Bereich, der eines hat, öffnet mit SEINEM
 * Zeichen:
 *
 *   tasks / calendar-tasks → das Häkchen mit den auslaufenden Wellen
 *   mail                   → das Outlook-Zeichen, wie Outlook selbst öffnet
 *
 * Es legt sich über den jeweiligen Bereich, nicht über Kopfzeile oder Menü.
 * Bühne, Halo, Wellen und die Zeichen kommen aus den `.ofi-splash-*` Regeln
 * in index.html (dort für den Start-Splash inline; sie bleiben die ganze
 * Sitzung im <head>) — hier wird nur die Hülle gebaut.
 *
 * EINMAL je Browser-Tab und Bereich (sessionStorage, siehe lib/splashOnce):
 * beim ersten Öffnen läuft es, beim Hin- und Herwechseln zwischen den Menüs
 * nicht mehr, erst ein neuer Tab zeigt es wieder. Lädt das Dokument direkt
 * auf der Seite des Bereichs (F5), zeigt schon der Start-Splash dessen
 * Zeichen und gilt als dieses eine Mal (bootSplash.ts setzt den Merker).
 *
 * Nach F5 startet die Uhr erst, wenn der Start-Splash weg ist: sonst liefe
 * das Intro unsichtbar unter dem Marken-Splash ab. Danach: mindestens
 * MIN_VISIBLE_MS auf dem Schirm, ausblenden, weg.
 */
const MIN_VISIBLE_MS = 950;
const FADE_MS = 340;

type Phase = 'wait' | 'in' | 'out' | 'gone';

/** Welches Zeichen zu welchem Bereich gehört — eine Stelle, keine Prop. */
const MARK: Record<SplashScope, 'check' | 'mail'> = {
    tasks: 'check',
    'calendar-tasks': 'check',
    mail: 'mail',
};

const reducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const SectionSplash = ({ scope, loading }: { scope: SplashScope; loading: boolean }) => {
    // Einmal entschieden, dann fest — der Merker wird erst im Effekt gesetzt,
    // damit StrictModes doppeltes Einhängen nicht das eigene Zeigen verhindert.
    const [show] = useState(() => !hasSeenSplash(scope));
    const [phase, setPhase] = useState<Phase>(() => (isBootSplashGone() ? 'in' : 'wait'));
    const [shownAt, setShownAt] = useState<number>(() => performance.now());
    const mark = MARK[scope];

    useEffect(() => {
        if (show) markSplashSeen(scope);
    }, [show, scope]);

    // Bühne erst aufbauen, wenn sie zu sehen ist (siehe oben).
    useEffect(() => {
        if (!show || phase !== 'wait') return;
        let cancelled = false;
        void whenBootSplashGone().then(() => {
            if (cancelled) return;
            setShownAt(performance.now());
            setPhase('in');
        });
        return () => { cancelled = true; };
    }, [show, phase]);

    // Ausblenden, sobald geladen UND die Mindestzeit um ist. Wechselt `loading`
    // zwischendurch, räumt die Aufräumfunktion den alten Zeitgeber ab.
    useEffect(() => {
        if (!show || phase !== 'in' || loading) return;
        const hold = reducedMotion() ? 0 : Math.max(0, shownAt + MIN_VISIBLE_MS - performance.now());
        const timer = globalThis.setTimeout(() => setPhase('out'), hold);
        return () => globalThis.clearTimeout(timer);
    }, [show, phase, loading, shownAt]);

    useEffect(() => {
        if (!show || phase !== 'out') return;
        const timer = globalThis.setTimeout(() => setPhase('gone'), FADE_MS);
        return () => globalThis.clearTimeout(timer);
    }, [show, phase]);

    if (!show || phase === 'gone') return null;

    return (
        <div className={`ofi-area-splash${phase === 'out' ? ' is-out' : ''}`} aria-hidden>
            {phase !== 'wait' && (
                <div className={`ofi-splash-stage${mark === 'mail' ? ' ofi-splash-stage--mail' : ''}`}>
                    <span className="ofi-splash-halo" />
                    <span className="ofi-splash-ring" />
                    <span className="ofi-splash-ring" />
                    <span className="ofi-splash-ring" />
                    {mark === 'check' ? <CheckMark /> : <MailMark />}
                </div>
            )}
        </div>
    );
};

const CheckMark = () => (
    <div className="ofi-splash-mark ofi-splash-mark--check">
        <svg viewBox="0 0 96 96" focusable="false">
            <path className="ofi-splash-tick" d="M27 50l14 14 28-30" pathLength={1} />
        </svg>
    </div>
);

/**
 * Dasselbe Zeichen wie im Menü (components/icons/OutlookMark.tsx), nur gross
 * und nacheinander aufgebaut. Eigene Verlauf-Kennungen, damit Menüzeichen und
 * Splash nebeneinander bestehen können. Ändert sich dort eine Kurve, muss sie
 * hier und in der Start-Markierung in index.html mitgehen.
 */
const MailMark = () => (
    <div className="ofi-splash-mark ofi-splash-mark--mail">
        <svg viewBox="0 0 32 32" fill="none" focusable="false">
            <defs>
                <linearGradient id="ofiSectionOlTile" x1="0" y1="0" x2="0.65" y2="1">
                    <stop offset="0" stopColor="#2a7fe0" />
                    <stop offset="0.55" stopColor="#1462c7" />
                    <stop offset="1" stopColor="#0a3f96" />
                </linearGradient>
                <linearGradient id="ofiSectionOlSheet" x1="0.1" y1="0" x2="0.9" y2="1">
                    <stop offset="0" stopColor="#57b2f6" />
                    <stop offset="1" stopColor="#1b7fd8" />
                </linearGradient>
                <linearGradient id="ofiSectionOlFlap" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#a4dbfb" />
                    <stop offset="1" stopColor="#68bcf4" />
                </linearGradient>
            </defs>
            <g className="ofi-splash-mail-sheet">
                <path d="M12.6 7.2h16A2.2 2.2 0 0 1 30.8 9.4v13.2a2.2 2.2 0 0 1-2.2 2.2H12.6z" fill="url(#ofiSectionOlSheet)" />
                <path d="M12.6 7.2h16A2.2 2.2 0 0 1 30.8 9.4v2.2l-9.1 5.7-9.1-5.7z" fill="url(#ofiSectionOlFlap)" />
            </g>
            <rect x="1.4" y="4.2" width="17.2" height="23.6" rx="3.5" fill="url(#ofiSectionOlTile)" />
            <path d="M4.9 4.2h10.2a3.5 3.5 0 0 1 3.5 3.5v.5H1.4v-.5a3.5 3.5 0 0 1 3.5-3.5z" fill="#ffffff" opacity="0.16" />
            <path className="ofi-splash-mail-o" d="M10 10.8a4.3 5.2 0 0 1 0 10.4 4.3 5.2 0 0 1 0-10.4z" pathLength={1} />
        </svg>
    </div>
);
