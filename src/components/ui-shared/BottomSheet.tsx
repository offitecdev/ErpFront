import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * Fenster, das von UNTEN hereinfährt. Die Optik kommt aus den globalen Klassen
 * `ofi-sheet` / `ofi-sheet-up` / `ofi-sheet-backdrop` (siehe index.css) —
 * dieselben, die die Sheets in Lager, Montage und Terminplanung benutzen, damit
 * alle Untenfenster gleich aussehen und dark.css sie gleich behandelt.
 *
 * Von Hand gebaut statt über antd: Form (quadratisch) und Grösse müssen exakt
 * steuerbar sein, und die Einfahr-Animation sitzt auf `transform` — eine eigene
 * Zentrierung per `translateX` würde genau diese Animation überschreiben. Darum
 * zentriert der Rahmen per Flexbox, das Fenster selbst bleibt transform-frei.
 *
 * Gegenüber den Sheet-Kopien in den Modulen kommen Escape, Fokus-Falle und
 * Scroll-Sperre hinzu — wie in `layout/SlidePanel.tsx`, nur andere Richtung.
 */

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface BottomSheetProps {
    open: boolean;
    title: string;
    description?: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /**
     * Kantenlänge des quadratischen Fensters in px. Ist der Bildschirm kleiner,
     * folgt die Seite der Bildschirmgrösse — dann bleibt es fast quadratisch,
     * statt oben aus dem Bild zu laufen.
     */
    size?: number;
    /** Standard: aus. Ein Klick daneben soll ein halb gefülltes Formular nicht wegwerfen. */
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
    open,
    title,
    description,
    onClose,
    children,
    footer,
    size = 860,
    closeOnBackdrop = false,
    closeOnEscape = true,
}) => {
    const panelRef = useRef<HTMLElement>(null);
    const titleId = useId();

    // `onClose` ist an den Aufrufstellen meist eine inline-Pfeilfunktion, also
    // bei jedem Render eine neue Referenz. Als Effekt-Abhängigkeit würde der
    // Effekt bei jedem Tastendruck neu aufgebaut und den Fokus aus dem Feld
    // zurück auf das Fenster ziehen — Tippen wäre unmöglich. Darum per ref.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const closeOnEscapeRef = useRef(closeOnEscape);
    closeOnEscapeRef.current = closeOnEscape;

    useEffect(() => {
        if (!open) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (!closeOnEscapeRef.current) return;
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab' || !panelRef.current) return;

            // `offsetParent === null` filtert die versteckten Helfer heraus (z. B.
            // den unsichtbaren Absende-Knopf für die Enter-Taste).
            const focusable = Array.from(
                panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).filter((element) => element.offsetParent !== null);
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus();
        };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[650] flex items-end justify-center px-3">
            <div
                className="ofi-sheet-backdrop absolute inset-0 animate-in fade-in duration-200"
                aria-hidden
                onMouseDown={closeOnBackdrop ? onClose : undefined}
            />
            <section
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                style={{ width: `min(100%, ${size}px)`, height: `min(${size}px, 92vh)` }}
                /* `.ofi-pop.is-sheet` = die gemeinsame Fensteroberfläche
                   (index.css, "FENSTER-OBERFLÄCHE") mit den zwei OBEREN Ecken:
                   `rounded-t-2xl` kam als 4px an, das Fenster stand also
                   scharfkantig neben dem runden Kalenderfenster. */
                className="ofi-sheet ofi-sheet-up ofi-pop is-sheet relative flex flex-col overflow-hidden outline-none"
            >
                <header className="ofi-pop__rule flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
                    <div className="min-w-0">
                        {/* Grundschrift statt `.ofi-serif`: die Fenster der
                            Anwendung schreiben ihre Titel jetzt alle so wie das
                            Kalenderfenster — klein, halbfett, eine Schrift. */}
                        <h2 id={titleId} className="ofi-pop__title">{title}</h2>
                        {description && <p className="ofi-pop__subtitle">{description}</p>}
                    </div>
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        onClick={onClose}
                        className="ofi-float-card__iconbtn shrink-0"
                    >
                        <X size={16} />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">{children}</div>

                {footer && (
                    <footer className="ofi-pop__rule shrink-0 border-t px-6 py-3">{footer}</footer>
                )}
            </section>
        </div>,
        document.body,
    );
};
