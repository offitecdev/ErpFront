import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * ── UNTENFENSTER DES PERSONALMODULS ──────────────────────────────────────────
 *
 * JEDES Fenster dieses Moduls fährt von unten herein (Vorgabe). Die Optik kommt
 * aus den globalen Klassen `ofi-sheet` / `ofi-sheet-up` / `ofi-sheet-backdrop`,
 * damit es genauso aussieht wie die Fenster in Lager, Verkauf und Montage.
 *
 * Gegenüber `ui-shared/BottomSheet` (quadratisch, eine Kantenlänge) sind Breite
 * UND Höhe getrennt steuerbar: die Tabletflächen dieses Moduls brauchen breite,
 * flache Fenster (Wochenübersicht), die Formulare schmale, hohe.
 *
 * Der Rahmen zentriert per Flexbox und das Fenster selbst bleibt transform-frei:
 * die Einfahr-Animation sitzt auf `transform`, eine eigene Zentrierung per
 * `translateX` würde sie überschreiben.
 */

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface PersonnelSheetProps {
    open: boolean;
    title: ReactNode;
    subtitle?: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    headerActions?: ReactNode;
    /** Höchstbreite in px. */
    width?: number;
    /** Höhe in px, gedeckelt auf 92 % der Bildschirmhöhe. */
    height?: number;
    zIndex?: number;
    /**
     * Standard: aus. Ein Klick daneben darf ein halb ausgefülltes Formular nicht
     * wegwerfen — am Tablet passiert so ein Fehlgriff dauernd.
     */
    closeOnBackdrop?: boolean;
    /** Innenabstand des Inhalts abschalten (Tabellen sitzen bündig). */
    flush?: boolean;
}

export const PersonnelSheet = ({
    open,
    title,
    subtitle,
    onClose,
    children,
    footer,
    headerActions,
    width = 880,
    height = 640,
    zIndex = 90,
    closeOnBackdrop = false,
    flush = false,
}: PersonnelSheetProps) => {
    const panelRef = useRef<HTMLElement | null>(null);
    const titleId = useId();

    // `onClose` ist meist eine inline-Pfeilfunktion, also bei jedem Zeichnen
    // eine neue Referenz. Als Effekt-Abhängigkeit würde der Effekt bei jedem
    // Tastendruck neu aufgebaut und den Fokus aus dem Feld ziehen.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab' || !panelRef.current) return;
            const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
                .filter((element) => element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0]!;
            const last = focusable[focusable.length - 1]!;
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
            previouslyFocused?.focus();
        };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 flex items-end justify-center px-2 sm:px-3" style={{ zIndex }}>
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
                style={{ width: `min(100%, ${width}px)`, height: `min(${height}px, 92vh)` }}
                className="ofi-sheet ofi-sheet-up relative flex flex-col overflow-hidden rounded-t-2xl outline-none"
            >
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-white/10">
                    <div className="min-w-0">
                        <h2 id={titleId} className="ofi-serif truncate text-[16px] font-bold text-slate-900 dark:text-white">
                            {title}
                        </h2>
                        {subtitle && <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-white/60">{subtitle}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {headerActions}
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={onClose}
                            className="ofi-rs-nav flex size-8 items-center justify-center rounded-md transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </header>

                <div className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${flush ? '' : 'px-5 py-4'}`}>
                    {children}
                </div>

                {footer && (
                    <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-white/10">
                        {footer}
                    </footer>
                )}
            </section>
        </div>,
        document.body,
    );
};
