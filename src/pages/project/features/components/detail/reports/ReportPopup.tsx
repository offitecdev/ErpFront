import { useEffect, useState, type ReactNode } from 'react';

import { ArrowLeft } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { FloatingCard } from '@/pages/calendar/components/FloatingCard';

/**
 * Popup shell of the project-detail Rapporte hub (18.08.2026, user request:
 * "like the calendar's appointment view — bigger, but still flexible").
 *
 * It is the calendar's FLOATING CARD, only sized for real work: it opens large
 * in the middle of the screen, is dragged anywhere by its header strip,
 * stretched by its top/bottom edge and blown up to the full viewport with the
 * header's maximise toggle. No backdrop — the appointment lanes stay readable
 * behind it, which is the whole point of a floating card.
 *
 * The old bottom sheet (`ReportsSheet`) stays where it belongs: the montage
 * tablet UI, maintenance, services and billing are full-screen work surfaces,
 * not popups.
 */

/** A readout ('compact') needs far less room than an editor ('wide'). */
export type PopupSize = 'compact' | 'wide';

/* Comfortable size vs. the current viewport. Only the MAXIMISED card is given
   a height — the normal one follows its content (capped at the viewport by
   `.ofi-float-card`), so the compact overview stays compact while the field
   editor grows the card by itself. A fixed height would open every view as a
   half-empty box.

   RAND (20.08.2026, Vorgabe: "die Mitte nimmt auf dem Projektschirm viel Platz
   weg; wenn sie nach rechts aufgeht, ein wenig kleiner, damit sie genau
   passt"): die Karte laesst rundherum Luft, statt sich bis an den Bildrand zu
   schieben — auch im Vollbild. Deshalb ist der Rand am Schreibtisch am
   groessten und faellt zum Telefon hin, wo jeder Punkt Breite zaehlt. */
const gutterFor = (vw: number) => (vw <= 640 ? 12 : vw <= 1024 ? 32 : 56);

/* Selbst im Vollbild bleibt die Karte lesbar breit: ein Rapport ueber 1560px
   reisst die Tabellenzeilen so weit auseinander, dass Beschriftung und Wert
   nichts mehr miteinander zu tun haben. */
const MAX_WIDTH = 1560;

const cardSize = (maximised: boolean, size: PopupSize) => {
    const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
    const gutter = gutterFor(vw);
    const available = Math.max(320, vw - 2 * gutter);
    if (maximised) {
        return {
            width: Math.min(available, MAX_WIDTH),
            height: Math.max(320, vh - 2 * Math.min(gutter, 40)),
        };
    }
    return {
        width: Math.min(size === 'compact' ? 820 : 1080, available),
        height: undefined as number | undefined,
    };
};

export const ReportPopup = ({
    open,
    title,
    subtitle,
    size = 'wide',
    openAt = 'center',
    onBack,
    onClose,
    headerActions,
    footer,
    bodyClassName,
    children,
}: {
    open: boolean;
    title: ReactNode;
    subtitle?: ReactNode;
    /** A readout needs less room than an editor — the card follows the view. */
    size?: PopupSize;
    /**
     * Wo die Karte aufgeht. 'top' für eine Ansicht, deren Inhalt beim Arbeiten
     * WÄCHST (der Abnahme-Rapport bekommt je Checkliste einen Block dazu):
     * mittig platziert würde die Karte mit jedem Block nach oben rutschen.
     */
    openAt?: 'center' | 'top';
    /** When set, an arrow appears left of the title — the sideways "back". */
    onBack?: () => void;
    onClose: () => void;
    headerActions?: ReactNode;
    footer?: ReactNode;
    bodyClassName?: string;
    children: ReactNode;
}) => {
    const [maximised, setMaximised] = useState(false);
    const [box, setBox] = useState(() => cardSize(false, size));

    /* Re-measure on open, on the toggle and whenever the window changes — the
       card is a fixed-position element, so nothing else would keep it inside
       the viewport. */
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

    return (
        <FloatingCard
            open={open}
            onClose={onClose}
            centered
            openAt={openAt}
            className="ofi-rep-popup"
            width={box.width}
            initialHeight={box.height}
            expanded={maximised}
            onToggleExpand={() => setMaximised((on) => !on)}
            leading={onBack ? (
                <button
                    type="button"
                    aria-label={t('common.back')}
                    title={t('common.back')}
                    onClick={onBack}
                    className="ofi-float-card__iconbtn"
                >
                    <ArrowLeft size={17} />
                </button>
            ) : undefined}
            title={title}
            subtitle={subtitle}
            headerActions={headerActions}
            footer={footer}
            bodyClassName={bodyClassName}
            /* A half-written field report must never vanish on a stray click. */
            closeOnOutside={false}
            closeOnEscape={false}
        >
            {children}
        </FloatingCard>
    );
};
