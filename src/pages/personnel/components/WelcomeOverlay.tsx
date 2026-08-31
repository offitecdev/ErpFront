import { t } from '@/i18n/translate';
import type { ClockScanResult } from '../types/personnel';
import { formatHoursMinutes, formatTime } from '../utils/format';

/**
 * ── DIE BEGRÜSSUNG NACH DEM SCAN ─────────────────────────────────────────────
 *
 * „Willkommen [Name]" in TIMES NEW ROMAN, fünf Sekunden lang, dann sanft aus
 * (Vorgabe). Die Schrift steht ABSICHTLICH direkt am Element und nicht in einer
 * Hilfsklasse: sie ist eine ausdrückliche Vorgabe für genau diesen einen
 * Bildschirm und darf nicht mit dem Rest der Oberfläche mitwandern, wenn dort
 * einmal die Hausschrift getauscht wird.
 *
 * Das Ausblenden übernimmt die CSS-Animation `ofi-welcome-fade`
 * (styles/refine.css); der Zeitgeber, der die Einblendung wieder abräumt, sitzt
 * in `useTransientValue` und läuft genauso lange.
 *
 * Die Fläche ist NICHT klickbar (`pointer-events: none`): darunter läuft die
 * Erfassung weiter, und die nächste Person soll ihren Code sofort vorhalten
 * können, ohne dass die Begrüssung ihr im Weg steht.
 */
export const WelcomeOverlay = ({ result }: { result: ClockScanResult | null }) => {
    if (!result) return null;

    const name = [result.employee.firstName, result.employee.lastName].filter(Boolean).join(' ');
    /* Vier Ereignisse, vier Farben: Arbeitsbeginn (grün), Pausenbeginn
       (bernstein), Pausenende (limette), Feierabend (blau). Die Farbe ist aus
       zwei Metern Entfernung schneller gelesen als das Wort darunter. */
    const toneClass = {
        IN: 'text-emerald-600 dark:text-emerald-400',
        BREAK_START: 'text-amber-600 dark:text-amber-400',
        BREAK_END: 'text-lime-600 dark:text-lime-400',
        OUT: 'text-sky-600 dark:text-sky-400',
    }[result.action];

    return (
        <div
            aria-live="polite"
            className="pointer-events-none fixed inset-0 z-[120] flex items-center justify-center px-6"
        >
            <div className="ofi-welcome-fade flex flex-col items-center gap-3 rounded-3xl bg-white/95 px-14 py-12 text-center shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop-blur-sm dark:bg-slate-900/95">
                <span className={`text-[15px] font-semibold uppercase tracking-[0.22em] ${toneClass}`}>
                    {t(`personnel.clock.tag.${result.action}`)}
                </span>

                <p
                    style={{ fontFamily: '"Times New Roman", Times, serif' }}
                    className="text-[46px] leading-tight text-slate-900 sm:text-[62px] dark:text-white"
                >
                    {t('personnel.clock.welcome', { name })}
                </p>

                <p className="text-[16px] text-slate-500 dark:text-white/60">
                    {formatTime(result.at)}
                    {result.todaySeconds > 0 && (
                        <> · {t('personnel.clock.todayTotal', { value: formatHoursMinutes(result.todaySeconds) })}</>
                    )}
                </p>
            </div>
        </div>
    );
};
