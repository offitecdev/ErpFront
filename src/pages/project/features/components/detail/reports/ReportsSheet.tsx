import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { ArrowLeft, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * The Reports popup shell — hand-rolled (no antd): a large square sheet that
 * slides up from the bottom with the exact planning-popup animation
 * (`ofi-sheet` / `ofi-sheet-up`). Its size never changes between views; the
 * content slides sideways inside instead (the caller keys its view element and
 * applies `ofi-slide-in-right` / `ofi-slide-in-left`). `footer` is the bottom
 * bar that carries the "+" actions and the back/next navigation.
 */
export const ReportsSheet = ({
    open,
    title,
    subtitle,
    onBack,
    onClose,
    headerActions,
    footer,
    width,
    zIndex = 80,
    children,
}: {
    open: boolean;
    title: ReactNode;
    subtitle?: ReactNode;
    /** When set, an arrow appears left of the title — the sideways "back". */
    onBack?: () => void;
    onClose: () => void;
    headerActions?: ReactNode;
    footer?: ReactNode;
    width?: number;
    /** Raise above another sheet (e.g. the material picker over the editor). */
    zIndex?: number;
    children: ReactNode;
}) => {
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 flex items-end justify-center overflow-hidden" style={{ zIndex }}>
            <button
                type="button"
                aria-label={t('common.close')}
                onClick={onClose}
                className="ofi-sheet-backdrop absolute inset-0 cursor-default border-0 p-0"
            />
            <div className="ofi-viewport-sheet-shadow pointer-events-none absolute inset-x-0 top-[40px] h-px" aria-hidden />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-sheet ofi-sheet-up ofi-reports-sheet ofi-viewport-sheet relative flex w-full flex-col overflow-hidden"
                /* Tall as well as wide: the sheet used to be square (height tied to
                   its own width), which left the editor scrolling inside a short
                   box. It now takes the screen like the calendar's modal does. */
                style={{ maxWidth: width, height: 'calc(100dvh - 40px)' }}
            >
                <header className="relative border-b border-slate-200 dark:border-white/10">
                    <div className="mx-auto flex min-h-[64px] w-full max-w-[1400px] items-center justify-between gap-4 px-6 py-3 pr-16 sm:px-8 sm:pr-20">
                        <div className="flex min-w-0 items-center gap-2.5">
                            {onBack && (
                                <button
                                    type="button"
                                    aria-label={t('common.back')}
                                    title={t('common.back')}
                                    onClick={onBack}
                                    className="ofi-rs-nav flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
                                >
                                    <ArrowLeft size={16} />
                                </button>
                            )}
                            <div className="min-w-0">
                                <h2 className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{title}</h2>
                                {subtitle && <div className="mt-1 truncate text-[12px] text-slate-500 dark:text-white/60">{subtitle}</div>}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
                    </div>
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        onClick={onClose}
                        className="ofi-rs-nav absolute right-4 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md transition-colors sm:right-5"
                    >
                        <X size={18} />
                    </button>
                </header>

                {/* The sliding stage: views mount keyed inside and animate sideways. */}
                <div className="ofi-viewport-sheet-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden">
                    <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-1 flex-col">
                        {children}
                    </div>
                </div>

                {footer && (
                    <footer className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 border-t border-slate-200 px-6 py-3 dark:border-white/10 sm:px-8">
                        {footer}
                    </footer>
                )}
            </section>
        </div>,
        document.body,
    );
};
