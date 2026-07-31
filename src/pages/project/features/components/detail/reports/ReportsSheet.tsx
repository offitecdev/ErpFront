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
    width = 860,
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
        <div className="fixed inset-0 flex items-end justify-center px-3" style={{ zIndex }}>
            {/* Inert backdrop — the sheet only closes through the X. */}
            <div className="ofi-sheet-backdrop absolute inset-0" aria-hidden />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-sheet ofi-sheet-up ofi-reports-sheet relative flex w-full flex-col overflow-hidden rounded-t-2xl"
                style={{ maxWidth: width, height: `min(${width}px, 92vh)` }}
            >
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                    <div className="flex min-w-0 items-center gap-2">
                        {onBack && (
                            <button
                                type="button"
                                aria-label={t('common.back')}
                                title={t('common.back')}
                                onClick={onBack}
                                className="ofi-rs-nav flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
                            >
                                <ArrowLeft size={15} />
                            </button>
                        )}
                        <div className="min-w-0">
                            <h2 className="truncate text-[14px] font-bold text-slate-900">{title}</h2>
                            {subtitle && <div className="mt-0.5 truncate text-[11.5px] text-slate-500">{subtitle}</div>}
                        </div>
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

                {/* The sliding stage: views mount keyed inside and animate sideways. */}
                <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
                    {children}
                </div>

                {footer && (
                    <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2.5 dark:border-white/10">
                        {footer}
                    </footer>
                )}
            </section>
        </div>,
        document.body,
    );
};
