import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

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

    return createPortal(
        <div
            className="fixed inset-0 z-[100] bg-slate-950/30 dark:bg-black/60"
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
                style={{ width: panelWidth, maxWidth: 'calc(100vw - 24px)' }}
                className="absolute inset-y-0 right-0 flex flex-col bg-white shadow-2xl outline-none dark:bg-[#151616]"
            >
                <header className="flex shrink-0 items-start gap-4 border-b border-slate-100 px-6 py-5 dark:border-white/10">
                    <div className="min-w-0 flex-1">
                        {title && (
                            <div id={titleId} className="text-lg font-semibold text-primary">
                                {title}
                            </div>
                        )}
                        {subtitle && <p className="mt-1 text-sm font-normal text-tertiary">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Kapat"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        ×
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
            </section>
        </div>,
        document.body,
    );
};
