import { useEffect, useState, type ReactNode } from 'react';

import { FloatingCard } from '@/pages/calendar/components/FloatingCard';

/**
 * ── DAS FENSTER EINER CHECKLISTE ─────────────────────────────────────────────
 * Vorgabe Samet (02.09.2026): «Nicht als senkrechte Liste, sondern als Fenster
 * — so wie die Karten im Kalender.» Also die SCHWEBENDE KARTE des Kalenders
 * (FloatingCard): sie geht mittig auf, wird am Kopfstreifen gezogen, an der
 * Ober- und Unterkante gestreckt und mit dem Symbol im Kopf auf den ganzen
 * Schirm vergrössert. Kein Vorhang — die Liste dahinter bleibt lesbar.
 *
 * Dieselbe Hülle trägt die Checkliste zum Ausfüllen und die Vorschau des
 * Vorlagen-Editors; die Rapport-Karte (`reports/ReportPopup`) ist das Vorbild.
 *
 * Gemalt wird der INHALT im iOS-Kleid (`.ofi-chk`, index.css «CHECKLISTEN IM
 * APPLE-KLEID»): grauer Grund, weisse runde Gruppen, eingerückte Haarlinien.
 */
const gutterFor = (vw: number) => (vw <= 640 ? 12 : vw <= 1024 ? 32 : 56);
const MAX_WIDTH = 1360;

const readViewport = () => (typeof window === 'undefined'
    ? { w: 1440, h: 900 }
    : { w: window.innerWidth, h: window.innerHeight });

const cardSize = (maximised: boolean, width: number, viewport: { w: number; h: number }) => {
    const vw = viewport.w;
    const vh = viewport.h;
    const gutter = gutterFor(vw);
    const available = Math.max(320, vw - 2 * gutter);
    if (maximised) {
        return {
            width: Math.min(available, MAX_WIDTH),
            height: Math.max(320, vh - 2 * Math.min(gutter, 40)),
        };
    }
    // Eine Checkliste soll GROSS aufgehen — halb leer wäre sie nie, ihr Inhalt
    // ist eine Liste. Die Höhe folgt dem Schirm, nicht dem Inhalt: so springt
    // die Karte nicht, während man tippt (Kalender-Regel vom 25.08.2026).
    return {
        width: Math.min(width, available),
        height: Math.max(360, Math.min(780, vh - 2 * gutter)),
    };
};

export const ChecklistWindow = ({
    open,
    title,
    subtitle,
    width = 920,
    onClose,
    headerActions,
    footer,
    leading,
    children,
}: {
    open: boolean;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Bestellte Breite am Schreibtisch; kleinere Schirme kürzen sie. */
    width?: number;
    onClose: () => void;
    headerActions?: ReactNode;
    footer?: ReactNode;
    leading?: ReactNode;
    children: ReactNode;
}) => {
    const [maximised, setMaximised] = useState(false);
    /* Nur die Schirmgrösse steht im Zustand — sie ändert sich AUSSERHALB von
       React, das gehört in einen Effekt. Die Masse der Karte werden daraus beim
       Rendern gerechnet: ein `setState` im Effekt löste hier eine zweite
       Renderrunde je Öffnen aus (react-hooks/set-state-in-effect). */
    const [viewport, setViewport] = useState(readViewport);
    useEffect(() => {
        if (!open) return;
        const onResize = () => setViewport(readViewport());
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [open]);

    // Geschlossen wird die Vergrösserung zurückgenommen — beim RENDERN, damit
    // das nächste Öffnen nicht kurz noch das alte Mass zeigt.
    const [seenOpen, setSeenOpen] = useState(open);
    if (seenOpen !== open) {
        setSeenOpen(open);
        if (!open && maximised) setMaximised(false);
    }

    const box = cardSize(maximised, width, viewport);

    return (
        <FloatingCard
            open={open}
            onClose={onClose}
            centered
            className="ofi-chk-window"
            width={box.width}
            initialHeight={box.height}
            expanded={maximised}
            onToggleExpand={() => setMaximised((on) => !on)}
            leading={leading}
            title={title}
            subtitle={subtitle}
            headerActions={headerActions}
            footer={footer}
            bodyClassName="ofi-chk-window__body"
            /* Eine halb ausgefüllte Checkliste darf nie durch einen Klick daneben
               verschwinden; Escape schliesst (und sichert still, s. Aufrufer). */
            closeOnOutside={false}
            closeOnEscape
            closeOnBack
        >
            {children}
        </FloatingCard>
    );
};
