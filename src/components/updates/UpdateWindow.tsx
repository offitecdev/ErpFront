import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { OffitecMark } from '@/components/icons/OffitecMark';
import {
    LuBriefcase,
    LuCalendarDays,
    LuCamera,
    LuChevronRight,
    LuLayers,
    LuListChecks,
    LuMail,
    LuPackage,
    LuReceipt,
    LuScan,
    LuShieldCheck,
    LuShoppingCart,
    LuTrendingUp,
    LuUsers,
    LuZap,
    type LocalIconProps,
} from '@/components/icons/lucideLocal';
import { isPathAllowed } from '@/lib/pageAccess';
import { useAuthStore } from '@/store/authStore';
import { useGuardedNavigate } from '@/store/navGuardStore';

import { UPDATE_NOTES, type UpdateAccent } from './updateNotes';
import { useWhatsNewStore } from './whatsNewStore';

/**
 * ── DAS NEUIGKEITEN-FENSTER (09.09.2026) ────────────────────────────────────
 *
 * Vorgabe Samet, 09.09.2026: «beim Anmelden ein Update über das neue Design
 * und die neuen Funktionen veröffentlichen — als einmaliges Fenster im
 * Apple-Stil; NICHT das alte Prospekt, sondern etwas Eigenes, sauber».
 *
 * Es ist das «Neu in …»-Blatt, wie es macOS und iOS nach einem Update zeigen:
 * ein mittiges Fenster, das Hauszeichen als App-Kachel, ein grosser Titel,
 * darunter die Neuerungen als Zeilen — links ein blaues Zeichen, rechts
 * Überschrift und ein ruhiger Satz — und unten EIN blauer Knopf «Weiter».
 * Keine Welle, kein Marineblau, keine Tour: ein Blatt, einmal gelesen,
 * fertig.
 *
 * Es zeigt genau die NEUESTE Mitteilung aus `updateNotes.ts` und kommt genau
 * EINMAL (`WhatsNewHost` + `whatsNewStore`: gelesen ist es beim Schliessen).
 * Die Texte sind deutsch und werden nicht übersetzt (siehe `updateNotes.ts`);
 * die Beschriftung des Fensters läuft über i18n (`updates.*`).
 *
 * Die Fassung vom 29.08.2026 (`WhatsNewPopup.tsx`, Prospekt + Rundgang) ist
 * nicht mehr eingehängt; sie bleibt als Bauteil für eine Mitteilung, die
 * wieder eine Stelle im Kopf zeigen will.
 */

const ACCENT_ICONS: Record<UpdateAccent, ComponentType<LocalIconProps>> = {
    apps: LuLayers,
    calendar: LuCalendarDays,
    sales: LuTrendingUp,
    invoice: LuReceipt,
    mail: LuMail,
    tasks: LuListChecks,
    people: LuUsers,
    inventory: LuPackage,
    project: LuBriefcase,
    security: LuShieldCheck,
    orders: LuShoppingCart,
    ai: LuScan,
    design: LuLayers,
    camera: LuCamera,
    general: LuZap,
};

export const UpdateWindow = () => {
    const { t } = useTranslation();
    const navigate = useGuardedNavigate();
    const open = useWhatsNewStore((state) => state.open);
    const closeStore = useWhatsNewStore((state) => state.close);
    const pageAccess = useAuthStore((state) => state.pageAccess);
    const [moreOpen, setMoreOpen] = useState(false);
    const primaryRef = useRef<HTMLButtonElement | null>(null);
    /* Beim Schliessen zuklappen, damit der nächste Auftritt (Benutzerwechsel)
       wieder kurz beginnt. */
    const close = useCallback(() => { setMoreOpen(false); closeStore(); }, [closeStore]);

    const note = UPDATE_NOTES[0];

    useEffect(() => {
        if (!open) return;
        const frame = window.requestAnimationFrame(() => primaryRef.current?.focus());
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            close();
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [open, close]);

    if (!open || !note) return null;

    const highlights = note.highlights ?? [];
    const lines = note.lines ?? [];

    const go = (to: string) => {
        close();
        navigate(to);
    };

    return createPortal(
        <div className="ofi-nw-scrim ofi-win-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
            <section className="ofi-nw" role="dialog" aria-modal="true" aria-labelledby="ofi-nw-title">
                <div className="ofi-nw__body">
                    <header className="ofi-nw__head">
                        <span className="ofi-nw__app" aria-hidden="true">
                            <OffitecMark size={40} />
                        </span>
                        <p className="ofi-nw__eyebrow">{note.badge ?? t('updates.badgeNew')} · {note.date}</p>
                        <h1 id="ofi-nw-title" className="ofi-nw__title">{t('updates.newIn')}</h1>
                        {note.intro && <p className="ofi-nw__intro">{note.intro}</p>}
                    </header>

                    <ul className="ofi-nw__list">
                        {highlights.map((item) => {
                            const Icon = ACCENT_ICONS[item.accent] ?? LuZap;
                            const canOpen = item.to && isPathAllowed(pageAccess, item.to);
                            const inner = (
                                <>
                                    <span className="ofi-nw__icon" aria-hidden="true"><Icon size={22} /></span>
                                    <span className="ofi-nw__text">
                                        <span className="ofi-nw__item-title">{item.title}</span>
                                        <span className="ofi-nw__item-text">{item.text}</span>
                                    </span>
                                    {canOpen && <LuChevronRight size={16} className="ofi-nw__chev" aria-hidden="true" />}
                                </>
                            );
                            return (
                                <li key={item.title} className="ofi-nw__item">
                                    {canOpen
                                        ? <button type="button" className="ofi-nw__row is-link" onClick={() => go(item.to!)}>{inner}</button>
                                        : <div className="ofi-nw__row">{inner}</div>}
                                </li>
                            );
                        })}
                    </ul>

                    {lines.length > 0 && (
                        <div className="ofi-nw__more">
                            <button type="button" className="ofi-nw__more-btn" aria-expanded={moreOpen} onClick={() => setMoreOpen((value) => !value)}>
                                {moreOpen ? t('updates.hideAll') : t('updates.showAll', { count: lines.length })}
                                <LuChevronRight size={14} className={`ofi-nw__more-chev${moreOpen ? ' is-open' : ''}`} aria-hidden="true" />
                            </button>
                            {moreOpen && (
                                <ul className="ofi-nw__lines">
                                    {lines.map((line) => <li key={line}>{line}</li>)}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <footer className="ofi-nw__foot">
                    <button ref={primaryRef} type="button" className="ofi-nw__primary" onClick={close}>
                        {t('updates.next')}
                    </button>
                </footer>
            </section>
        </div>,
        document.body,
    );
};
