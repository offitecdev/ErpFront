import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { X } from '@/components/icons/antIconCompat';

// Full-width pop-up that slides up from the bottom. The short backdrop strip
// above it is intentionally clickable so the sheet can be dismissed quickly.
export const BottomSheet = ({
    open,
    onClose,
    title,
    subtitle,
    headerActions,
    width,
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
        <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-hidden">
            <button
                type="button"
                aria-label="close"
                onClick={onClose}
                className="ofi-sheet-backdrop absolute inset-0 cursor-default border-0 p-0"
            />
            <div className="ofi-viewport-sheet-shadow pointer-events-none absolute inset-x-0 top-[40px] h-px" aria-hidden />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-sheet ofi-sheet-up ofi-viewport-sheet relative flex w-full min-w-0 flex-col overflow-hidden"
                style={{ maxWidth: width, height: 'calc(100dvh - 40px)' }}
            >
                <header className="relative border-b border-slate-200 dark:border-white/10">
                    <div className="mx-auto flex min-h-[64px] w-full max-w-[1400px] items-center justify-between gap-4 px-6 py-3 pr-16 sm:px-8 sm:pr-20">
                        <div className="min-w-0">
                            <h2 className="truncate text-[15px] font-bold text-slate-900">{title}</h2>
                            {subtitle && <div className="mt-1 truncate text-[12px] text-slate-500">{subtitle}</div>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
                    </div>
                    <button
                        type="button"
                        aria-label="close"
                        onClick={onClose}
                        className="absolute right-4 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 sm:right-5"
                    >
                        <X size={18} />
                    </button>
                </header>
                {/* Flex column so a view can stretch to fill the whole sheet. */}
                <div className="ofi-viewport-sheet-scroll relative flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto">
                    <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-1 flex-col">{children}</div>
                </div>
            </section>
        </div>,
        document.body,
    );
};
