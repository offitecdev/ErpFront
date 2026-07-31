import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { X } from '@/components/icons/antIconCompat';

// Square pop-up that slides up from the bottom of the page. Deliberately modal:
// no backdrop click, no Escape — it only closes through the X (or a button the
// content renders, e.g. the wizard's "Close" on the success screen).
export const BottomSheet = ({
    open,
    onClose,
    title,
    subtitle,
    headerActions,
    width = 700,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Rendered on the right of the header, before the X (e.g. "Create new appointment"). */
    headerActions?: ReactNode;
    width?: number;
    children: ReactNode;
}) => {
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center px-3">
            {/* Intentionally inert: clicking outside must NOT close the sheet. */}
            <div className="ofi-sheet-backdrop absolute inset-0" aria-hidden />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-sheet ofi-sheet-up relative flex w-full flex-col overflow-hidden rounded-t-2xl"
                style={{ maxWidth: width, height: 'min(700px, 90vh)' }}
            >
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                    <div className="min-w-0">
                        <h2 className="truncate text-[14px] font-bold text-slate-900">{title}</h2>
                        {subtitle && <div className="mt-0.5 truncate text-[11.5px] text-slate-500">{subtitle}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {headerActions}
                        <button
                            type="button"
                            aria-label="close"
                            onClick={onClose}
                            className="flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </header>
                {/* Flex column so a view can stretch to fill the whole sheet. */}
                <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
            </section>
        </div>,
        document.body,
    );
};
