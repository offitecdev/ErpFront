import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface SlidePanelProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children: React.ReactNode;
    width?: string | number;
}

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export const SlidePanel: React.FC<SlidePanelProps> = ({
    open,
    onClose,
    title,
    subtitle,
    children,
    width = 520,
}) => {
    const { t } = useTranslation();
    const panelRef = useRef<HTMLElement>(null);
    const titleId = useId();

    // onClose çoğu çağrı yerinde satır içi ok fonksiyonudur (her render'da yeni
    // referans). Efektin bağımlılığı olsaydı her tuş vuruşunda temizlik +
    // yeniden kurulum çalışır, odak input'tan panele geri çalınırdı — yazmak
    // imkânsız hâle gelirdi. Bu yüzden ref üzerinden okunur.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!open) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        panelRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab' || !panelRef.current) return;

            const focusable = Array.from(
                panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            );
            if (focusable.length === 0) {
                event.preventDefault();
                panelRef.current.focus();
                return;
            }

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

    const panelWidth = typeof width === 'number' ? `${width}px` : width;

    // Fläche, Kanten und Ecken stehen in `index.css` (`.ofi-slide-*`) auf den
    // `--ofi-cal-*`-Tokens: der Dunkelmodus bleibt damit ein Variablentausch,
    // und der Radius der linken Ecken überlebt die Radius-Regeln der Anwendung
    // (die jede `rounded-*`-Klasse platt drücken).
    //
    // `ofi-compact-modal` ist KEIN Schmuck: eine Regel in `index.css` zwingt
    // JEDEM `section[role="dialog"][aria-modal="true"]` in einem Portal die
    // Breite `min(100% - 40px, 1280px)` auf — mit `!important`, also stärker
    // als der eingebaute Stil hier. Ohne diese Klasse war das Fenster immer
    // 1280px breit, egal welche Breite der Aufrufer wünschte (das ist der
    // Grund, warum es beim Verschmälern nie schmaler wurde). Die Klasse ist
    // der vorgesehene Ausstieg; die Breite reicht zusätzlich als Variable an
    // die Lage `utilities` weiter, wo sie jede `!important`-Regel schlägt.
    return createPortal(
        <div
            className="ofi-slide-scrim"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                tabIndex={-1}
                style={{ '--ofi-slide-width': panelWidth, width: panelWidth } as React.CSSProperties}
                className="ofi-slide-panel ofi-compact-modal"
            >
                <header className="ofi-slide-panel__head">
                    <div className="min-w-0 flex-1">
                        {title && (
                            <div id={titleId} className="ofi-slide-panel__title">
                                {title}
                            </div>
                        )}
                        {subtitle && <p className="ofi-slide-panel__sub">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="ofi-slide-panel__close rounded-full"
                    >
                        ×
                    </button>
                </header>
                <div className="ofi-slide-panel__body">{children}</div>
            </section>
        </div>,
        document.body,
    );
};
