import { useEffect, useState, type ReactNode } from 'react';

import { FloatingCard } from '@/pages/calendar/components/FloatingCard';

/**
 * Fenster-Schale des Rechnungsmoduls (19.08.2026, Vorgabe Samet: „die Karten
 * und die Fenster modern, minimalistisch, im Google-Stil — wie Projekte,
 * Aufträge, Kalender, Termine und der Rapporte-Reiter").
 *
 * Es ist die SCHWEBENDE KARTE des Kalenders — dieselbe, die die Termin-, die
 * Offert- und die Rapport-Fenster tragen: sie geht mittig auf, wird am
 * Kopfstreifen irgendwohin gezogen, an der oberen/unteren Kante gestreckt und
 * mit dem Knopf im Kopf auf den ganzen Bildschirm aufgeblasen. KEIN Vorhang —
 * die Rechnungsliste dahinter bleibt lesbar, und genau dafür gibt es eine
 * schwebende Karte. Das alte Bodenblatt (`BottomSheet`) ist damit aus dem
 * Modul verschwunden.
 *
 * Der Inhalt bestimmt die Höhe; nur die AUFGEBLASENE Karte bekommt eine, sonst
 * ginge die schmale Vorschau als halbleerer Kasten auf.
 */

/** Eine Ablesung ('compact') braucht viel weniger Platz als eine Liste ('wide'). */
export type InvoicePopupSize = 'compact' | 'wide';

const cardSize = (maximised: boolean, size: InvoicePopupSize) => {
    const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
    if (maximised) return { width: Math.max(320, vw - 32), height: Math.max(320, vh - 32) };
    return {
        width: Math.min(size === 'compact' ? 780 : 1180, Math.max(320, vw - 64)),
        height: undefined as number | undefined,
    };
};

export const InvoicePopup = ({
    open,
    title,
    subtitle,
    size = 'wide',
    onClose,
    headerActions,
    footer,
    bodyClassName,
    /** Ein Blatt (PDF) füllt die Karte — es soll wachsen, nicht scrollen. */
    fill = false,
    closeOnOutside = true,
    children,
}: {
    open: boolean;
    title: ReactNode;
    subtitle?: ReactNode;
    size?: InvoicePopupSize;
    onClose: () => void;
    headerActions?: ReactNode;
    footer?: ReactNode;
    bodyClassName?: string;
    fill?: boolean;
    closeOnOutside?: boolean;
    children: ReactNode;
}) => {
    const [maximised, setMaximised] = useState(false);
    const [box, setBox] = useState(() => cardSize(false, size));

    /* Neu messen beim Öffnen, beim Umschalten und wenn sich das Fenster ändert
       — die Karte ist fest positioniert, sonst hielte sie nichts im Bild. */
    useEffect(() => {
        if (!open) return;
        setBox(cardSize(maximised, size));
        const onResize = () => setBox(cardSize(maximised, size));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [open, maximised, size]);

    useEffect(() => {
        if (!open) setMaximised(false);
    }, [open]);

    /* Eine gefüllte Karte (PDF) braucht IMMER eine Höhe — sonst fiele der
       Rahmen auf seine Mindesthöhe zusammen. */
    const height = box.height ?? (fill ? Math.max(420, Math.round((typeof window === 'undefined' ? 900 : window.innerHeight) * 0.78)) : undefined);

    return (
        <FloatingCard
            open={open}
            onClose={onClose}
            centered
            className="ofi-inv-popup"
            width={box.width}
            initialHeight={height}
            expanded={maximised}
            onToggleExpand={() => setMaximised((on) => !on)}
            title={title}
            subtitle={subtitle}
            headerActions={headerActions}
            footer={footer}
            bodyClassName={`ofi-inv-pop ofi-inv-scope ${fill ? 'ofi-inv-pop--fill' : ''} ${bodyClassName || ''}`}
            closeOnOutside={closeOnOutside}
        >
            {children}
        </FloatingCard>
    );
};
