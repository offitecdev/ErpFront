import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft, Zap } from '../icons/antIconCompat';
import { cameFrom, useBackTarget } from '../../lib/backNav';
import { useNavGuardStore } from '../../store/navGuardStore';
import type { QuickCreateItem } from './AppSidebar';

/**
 * ── BLITZ ⇄ ZURÜCK ──────────────────────────────────────────────────────────
 *
 * Der erste Knopf der Kopfleiste — direkt rechts neben dem Zeichen auf der
 * Modulleiste — kann zwei Dinge sein:
 *
 *   • auf einer HAUPTSEITE ist er der Schnellzugriff: ein Blitz, der die Liste
 *     «Schnell erstellen» aufklappt (früher die drei Punkte an derselben
 *     Stelle);
 *   • auf einer UNTERSEITE wird daraus der Zurück-Pfeil.
 *
 * Der Wechsel ist eine BEWEGUNG, kein Austausch (`styles/refine.css`,
 * `.ofi-quickback`): Blitz und Pfeil liegen im selben Rasterfeld übereinander,
 * der Blitz dreht sich klein weg, der Pfeil kommt von rechts hereingeglitten —
 * die Geste von Apfel- und Google-Oberflächen. Darum ist es EIN Knopf, der
 * seinen Zustand wechselt, und nicht zwei, die sich abwechseln: nur ein
 * bleibendes Element kann sich verwandeln.
 *
 * Vorgabe Samet, 28.08.2026: die Seiten selbst tragen keinen Zurück-Knopf mehr
 * — er stand überall an einer anderen Stelle und schob den Inhalt nach unten.
 * Der Rückweg sitzt jetzt immer HIER. Die Marke bleibt die Marke.
 *
 * WOHIN es geht, sagt `lib/backNav.ts`. WIE: führt der Rückweg genau auf die
 * zuletzt verlassene Seite, wird ein echter Verlaufsschritt gegangen — dann
 * kommt die Liste mit Suchbegriff, Seitenzahl und Scrollhöhe zurück statt neu
 * zu laden. Sonst wird die Adresse angesteuert; wer per Lesezeichen mitten in
 * einer Unterseite landet, hat so trotzdem einen Weg nach oben.
 */

/* Dieselbe Knopfschale wie die übrigen Werkzeuge links (Doppelbildschirm,
   „+“): Grösse und Kante kommen aus `.ofi-header-icon-button` (index.css),
   `.ofi-hdr-ctl` hält die eine Bedienhöhe der Leiste. */
const SHELL = 'ofi-header-icon-button ofi-hdr-ctl inline-flex items-center justify-center rounded-full border shadow-xs transition-[background-color,color,box-shadow,border-color] duration-200';
const SHELL_IDLE = 'border-slate-200/90 bg-white text-[#272f67] hover:border-[#d3e3fd] hover:bg-[#d3e3fd] hover:text-[#1f2654] dark:border-white/15 dark:bg-white/8 dark:text-white/85 dark:hover:border-white/25 dark:hover:bg-white/14 dark:hover:text-white';
const SHELL_OPEN = 'border-[#272f67] bg-[#272f67] text-white shadow-lg';

/** Blitz und Pfeil übereinander — das Stück, das sich verwandelt. */
const MorphGlyph = () => (
    <span className="ofi-quickback__stack" aria-hidden="true">
        <Zap className="ofi-quickback__glyph" strokeWidth={2.1} />
        <ArrowLeft className="ofi-quickback__arrow" strokeWidth={2.3} />
    </span>
);

export const QuickBackButton: React.FC<{
    items: QuickCreateItem[];
    onSelect: (item: QuickCreateItem) => void;
    className?: string;
}> = ({ items, onSelect, className = '' }) => {
    const { t } = useTranslation();
    const back = useBackTarget();
    const isBack = Boolean(back);
    // Bewusst `useNavigate` statt `useGuardedNavigate`: der Rückweg kann ein
    // Verlaufsschritt sein (`-1`), und den nimmt die geführte Fassung nicht
    // entgegen. Die Schranke für ungespeicherte Änderungen wird darum hier
    // selbst gefragt — dieselbe, die auch Menü und Reiter durchlaufen.
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // Wird der Knopf zum Pfeil, während die Liste offen steht, muss sie zu:
    // sie gehört dem Schnellzugriff, nicht dem Rückweg.
    useEffect(() => { if (isBack) setOpen(false); }, [isBack]);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    // Ohne Schnellzugriff UND ohne Rückweg gibt es nichts zu zeigen.
    if (!items.length && !isBack) return null;

    const targetName = back?.labelKey ? t(back.labelKey) : '';
    const backLabel = targetName ? t('nav.backTo', { page: targetName }) : t('common.back');
    const quickLabel = t('nav.quickCreate');
    const label = isBack ? backLabel : quickLabel;

    const goBack = () => {
        const to = back?.to;
        if (!to) return;
        const proceed = () => {
            /* Ein Verlaufsschritt nur, wenn er WIRKLICH auf der Zielseite
               herauskommt: hat die Seite selbst einen Eintrag in den Verlauf
               gelegt (die Angebotsmaske, sobald etwas ungespeichert ist), läge
               darauf wieder dieselbe Seite — «der Pfeil geht nicht zur
               Angebotsliste, er bleibt im Angebot» (Vorgabe Samet,
               12.09.2026). Dann wird die Adresse angesteuert. */
            if (cameFrom(to) && !useNavGuardStore.getState().historyPinned) navigate(-1);
            else navigate(to);
        };
        const { attempt } = useNavGuardStore.getState();
        if (attempt) attempt(proceed);
        else proceed();
    };

    return (
        // Der Blitz bleibt auf dem Handy verborgen wie eh und je — dort ist die
        // Leiste zu eng für Werkzeuge. Der PFEIL nicht: aus einer Unterseite
        // muss man auf jedem Bildschirm wieder herauskommen.
        <div ref={rootRef} className={`relative shrink-0 ${isBack ? '' : 'hidden lg:block'} ${className}`}>
            <button
                type="button"
                {...(isBack ? {} : { 'aria-haspopup': 'menu' as const, 'aria-expanded': open })}
                title={label}
                aria-label={label}
                /* Marke für den Rundgang der Ankündigung — siehe
                   components/updates/WhatsNewPopup.tsx. */
                data-tour="quickback"
                onClick={() => (isBack ? goBack() : setOpen((v) => !v))}
                className={`ofi-quickback ${isBack ? 'is-back' : ''} ${SHELL} ${open ? SHELL_OPEN : SHELL_IDLE}`}
            >
                <MorphGlyph />
            </button>

            {open && !isBack && (
                <div
                    role="menu"
                    className="absolute left-0 top-12 z-[60] w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg animate-in fade-in slide-in-from-top-2 dark:border-white/15 dark:bg-[#0d1220]/90 dark:shadow-[0_24px_70px_rgba(0,0,0,0.48)] dark:backdrop-blur-xl"
                >
                    <p className="px-3 pb-1.5 pt-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                        {quickLabel}
                    </p>
                    <div className="grid gap-0.5">
                        {items.map((qi) => {
                            const QIcon = qi.icon;
                            return (
                                <button
                                    key={qi.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { onSelect(qi); setOpen(false); }}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-white/85 dark:hover:bg-white/10 dark:hover:text-white"
                                >
                                    <QIcon size={16} className={`shrink-0 dark:!text-[#e6cf9e]/80 ${qi.iconClassName || ''}`} />
                                    <span className="min-w-0 flex-1 truncate">{qi.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Derselbe Pfeil für das Zweitfenster des Doppelbildschirms. Dort gibt es
 * keine Kopfleiste — also auch keinen Blitz, der sich verwandeln könnte: das
 * Feld ist entweder der Pfeil oder gar nichts. Ohne ihn käme eine Unterseite
 * im rechten Fenster nie wieder nach oben.
 */
export const PaneBackButton: React.FC = () => {
    const { t } = useTranslation();
    const back = useBackTarget();
    const navigate = useNavigate();
    if (!back) return null;

    const targetName = back.labelKey ? t(back.labelKey) : '';
    const label = targetName ? t('nav.backTo', { page: targetName }) : t('common.back');

    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            onClick={() => {
                const proceed = () => {
                    const { historyPinned } = useNavGuardStore.getState();
                    if (cameFrom(back.to) && !historyPinned) navigate(-1); else navigate(back.to);
                };
                const { attempt } = useNavGuardStore.getState();
                if (attempt) attempt(proceed); else proceed();
            }}
            className={`ofi-quickback ofi-quickback--pane is-back mb-2 ${SHELL} ${SHELL_IDLE}`}
        >
            <MorphGlyph />
        </button>
    );
};
