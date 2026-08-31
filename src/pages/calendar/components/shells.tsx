import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/* Centred modal shell — a plain portal + CSS (no antd). Used by the stacked
   pickers of the calendar (customers, people/CC, "show all" lists) and by a few
   other modules that adopted the same dialog language.

   The calendar's own popups are floating cards (FloatingCard.tsx); this shell
   stays for the pickers that must open ABOVE such a card, which is why it
   carries `data-cal-stacked` — FloatingCard reads it to leave Escape alone
   while a picker is on top.

   Calendar dialogs intentionally stay still: the content changes frequently
   while selecting a customer, project or person, so transform animations make
   the form feel as if it is jumping. */

export const CenterModal = ({ open, onClose, title, subtitle, width = 1400, z = 750, headerActions, footer, children, bodyClassName, closeOnBackdrop = true, compact = false }: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    width?: number;
    /* Stacked pickers open above the floating cards (z 120): pass 150. */
    z?: number;
    headerActions?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    bodyClassName?: string;
    /* false = a click beside the dialog does NOT close it (forms that must
       not lose half-typed input); the X and the footer buttons still do. */
    closeOnBackdrop?: boolean;
    /* true = keep the `width` above instead of the app-wide viewport-wide popup
       surface (index.css `.ofi-compact-modal`). For small forms: a four-field
       dialog blown up to 1280 px leaves its content stranded in the middle. */
    compact?: boolean;
}) => {
    if (!open) return null;
    return createPortal(
        <div data-cal-stacked="1" className="fixed inset-0 flex items-center justify-center px-4 py-4 md:px-6" style={{ zIndex: z }}>
            <div
                className="absolute inset-0 bg-slate-950/30 dark:bg-black/55"
                onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}
            />
            <section
                role="dialog"
                aria-modal="true"
                /* KEIN `rounded-*` und kein `bg-white`: die Anwendung biegt jede
                   Tailwind-Rundung auf ihre eigenen Werte um (2px bzw. 8px, beides
                   mit `!important` und teils aus einer Lage heraus), das Fenster
                   kam also nie bei `rounded-2xl` an — und `bg-white` liess die
                   Decke `.dark .bg-white` in dark.css seinen Schatten löschen.
                   Kante, Fläche, Haarlinie und Schatten kommen jetzt aus `.ofi-pop`
                   (index.css, "FENSTER-OBERFLÄCHE"), demselben Kleid, das jedes
                   Fenster der Anwendung trägt — ein Wert für Fenster und Felder
                   (`--ofi-modal-radius`). */
                className={`ofi-calendar-dialog ofi-pop relative flex max-h-[94vh] w-full min-w-0 flex-col overflow-hidden${compact ? ' ofi-compact-modal' : ''}`}
                style={{ maxWidth: width }}
            >
                <header className="ofi-pop__rule flex min-h-16 items-center justify-between gap-3 border-b px-5 py-4 md:px-6">
                    <div className="min-w-0">
                        <h3 className="ofi-pop__title">{title}</h3>
                        {subtitle && <div className="ofi-pop__subtitle">{subtitle}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {headerActions}
                        <button
                            type="button"
                            aria-label={t('common.close')}
                            onClick={onClose}
                            className="ofi-float-card__iconbtn shrink-0"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </header>
                <div className={`ofi-pop-body relative flex min-h-0 flex-1 flex-col overflow-y-auto ${bodyClassName || ''}`}>{children}</div>
                {footer && <div className="ofi-pop__rule border-t px-5 py-4 md:px-6">{footer}</div>}
            </section>
        </div>,
        document.body,
    );
};
