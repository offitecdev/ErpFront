import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/* Modal shells of the calendar module. Both are plain portals + CSS (no antd).
   Calendar dialogs intentionally stay still: the content changes frequently
   while selecting a customer, project or person, so transform animations make
   the form feel as if it is jumping. */

export const CenterModal = ({ open, onClose, title, subtitle, width = 1400, z = 130, headerActions, footer, children, bodyClassName }: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    width?: number;
    /* Stacked pickers open above the wizard: pass a higher z. */
    z?: number;
    headerActions?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    bodyClassName?: string;
}) => {
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-4 py-4 md:px-6" style={{ zIndex: z }}>
            <div
                className="absolute inset-0 bg-slate-950/30 dark:bg-black/55"
                onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
            />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-calendar-dialog relative flex max-h-[94vh] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/15 dark:bg-[#151616]"
                style={{ maxWidth: width }}
            >
                <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 md:px-6 dark:border-white/10">
                    <div className="min-w-0">
                        <h3 className="truncate text-[13.5px] font-bold text-slate-900 dark:text-white">{title}</h3>
                        {subtitle && <div className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-white/55">{subtitle}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {headerActions}
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={onClose}
                            className="flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            <X size={15} />
                        </button>
                    </div>
                </header>
                <div className={`ofi-pop-body relative flex min-h-0 flex-1 flex-col overflow-y-auto ${bodyClassName || ''}`}>{children}</div>
                {footer && <div className="border-t border-slate-200 px-5 py-4 md:px-6 dark:border-white/10">{footer}</div>}
            </section>
        </div>,
        document.body,
    );
};

/* Bottom sheet — the primary popup shape of the calendar (wizard, meeting,
   detail, today). Closes only via the X — deliberate. */
export const SheetShell = ({ open, onClose, title, subtitle, headerActions, footer, width = 1400, height = '90vh', children }: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    headerActions?: ReactNode;
    footer?: ReactNode;
    width?: number;
    height?: string;
    children: ReactNode;
}) => {
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center px-4 md:px-6">
            <div className="ofi-sheet-backdrop absolute inset-0" aria-hidden />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-calendar-dialog ofi-sheet relative flex w-full flex-col overflow-hidden rounded-t-2xl"
                style={{ maxWidth: width, height }}
            >
                <header className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6 dark:border-white/10">
                    <div className="min-w-0">
                        <h2 className="truncate text-[14px] font-bold text-slate-900 dark:text-white">{title}</h2>
                        {subtitle && <div className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-white/55">{subtitle}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {headerActions}
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={onClose}
                            className="flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </header>
                <div className="ofi-pop-body relative flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
                {footer && <div className="border-t border-slate-200 px-5 py-4 md:px-6 dark:border-white/10">{footer}</div>}
            </section>
        </div>,
        document.body,
    );
};
