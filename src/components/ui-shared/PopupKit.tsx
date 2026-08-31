import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { FloatingCard } from '@/pages/calendar/components/FloatingCard';

/* ─────────────────────────────────────────────────────────────────────────────
   The app's two popup shapes — first built for the quote module (17.08.2026,
   "modernise every quote popup like the calendar popup — cleaner, simpler,
   Google-style"), lifted here on 18.08.2026 so the project detail screen wears
   the same clothes instead of its own dialogs.

   • PopupCard — the calendar's floating card: a free card that opens in the
     CENTRE of the screen, is dragged anywhere by its header strip, stretched by
     its top/bottom edge, no backdrop. Readouts, editors and pickers use it, so
     the page underneath stays readable and clickable.

   • PopupDialog — a centred card over a light scrim, for the moments that must
     interrupt: destructive confirmations, "unsaved changes", decisions, a
     preview. Same surface, radius and type as the floating card; actions
     right-aligned as text / filled pill buttons.

   Both paint from the calendar tokens (`--ofi-cal-*`, index.css "CALENDAR
   MODULE SHELL"), so dark mode is the same variable swap. Module CSS lives in
   index.css under "APP POPUPS" (`.ofi-tp-*`).

   The quote module keeps its old names (`TenderFloatCard` / `TenderDialog`) —
   pages/sales/detail/popups/shell/TenderPopupShell.tsx re-exports these.
   ───────────────────────────────────────────────────────────────────────── */

export type PopupCardProps = {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    width?: number;
    headerActions?: ReactNode;
    footer?: ReactNode;
    /* Read-only cards close on an outside click; forms never do. */
    closeOnOutside?: boolean;
    closeOnEscape?: boolean;
    bodyClassName?: string;
    children: ReactNode;
};

/* Opens in the middle of the screen and can then be dragged anywhere by its
   header strip. */
export const PopupCard = ({ bodyClassName, children, ...rest }: PopupCardProps) => (
    <FloatingCard centered bodyClassName={`ofi-tp-body ${bodyClassName || ''}`} {...rest}>
        {children}
    </FloatingCard>
);

/* Right-aligned action strip used by both shapes. */
export const PopupActions = ({ children, start }: { children: ReactNode; start?: ReactNode }) => (
    <div className="ofi-tp-actions">
        <div className="ofi-tp-actions__start">{start}</div>
        <div className="ofi-tp-actions__end">{children}</div>
    </div>
);

export type PopupTone = 'neutral' | 'danger' | 'success' | 'warning';

export type PopupDialogProps = {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    /* Leading icon in a tinted circle — confirmations use it. */
    icon?: ReactNode;
    tone?: PopupTone;
    width?: number;
    /* Stacked above floating cards (z 120) by default. */
    z?: number;
    headerActions?: ReactNode;
    footer?: ReactNode;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    /* Hide the X — for a state that must not be dismissed (auto-save). */
    hideClose?: boolean;
    bodyClassName?: string;
    /* Optional: a confirmation whose subtitle says it all has no body. */
    children?: ReactNode;
};

export const PopupDialog = ({
    open,
    onClose,
    title,
    subtitle,
    icon,
    tone = 'neutral',
    width = 480,
    z = 750,
    headerActions,
    footer,
    closeOnBackdrop = true,
    closeOnEscape = true,
    hideClose = false,
    bodyClassName,
    children,
}: PopupDialogProps) => {
    useEffect(() => {
        if (!open || !closeOnEscape) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            onClose();
        };
        // Capture: runs before a floating card behind the dialog sees the key.
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, closeOnEscape, onClose]);

    if (!open) return null;

    return createPortal(
        // `data-cal-stacked` — a floating card underneath leaves Escape alone
        // while this dialog is open (FloatingCard reads it).
        <section data-cal-stacked="1" className="ofi-tp-scrim" style={{ zIndex: z }}>
            <div
                className="ofi-tp-scrim__hit"
                onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}
            />
            <section
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === 'string' ? title : undefined}
                className="ofi-tp-dialog"
                style={{ maxWidth: width }}
            >
                <header className={`ofi-tp-dialog__head ${icon ? 'has-icon' : ''}`}>
                    {icon && <span className={`ofi-tp-iconbadge is-${tone}`}>{icon}</span>}
                    <div className="min-w-0 flex-1">
                        <h2 className="ofi-tp-dialog__title">{title}</h2>
                        {subtitle && <p className="ofi-tp-dialog__subtitle">{subtitle}</p>}
                    </div>
                    {/* Eigene Reihe, damit sie auf dem kleinen Schirm als GANZES
                        unter den Titel rutscht (index.css, "FENSTER AUF TELEFON
                        UND TABLET") — neben dem Kreuz waere sie mitgewandert. */}
                    {headerActions ? <span className="ofi-tp-dialog__actions">{headerActions}</span> : null}
                    <span className="flex shrink-0 items-center gap-1">
                        {!hideClose && (
                            <button type="button" aria-label={t('common.close')} onClick={onClose} className="ofi-float-card__iconbtn">
                                <X size={18} />
                            </button>
                        )}
                    </span>
                </header>
                {children
                    ? <div className={`ofi-tp-dialog__body ofi-tp-body ${bodyClassName || ''}`}>{children}</div>
                    : <div className="ofi-tp-dialog__spacer" />}
                {footer && <div className="ofi-tp-dialog__foot">{footer}</div>}
            </section>
        </section>,
        document.body,
    );
};

/* ── small building blocks shared by the popups ─────────────────────────── */

/* Pill button in the calendar's language: text by default, filled when
   primary, red when destructive. */
export const PopupButton = ({
    variant = 'text',
    loading = false,
    disabled,
    icon,
    className,
    children,
    type = 'button',
    ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
    variant?: 'text' | 'primary' | 'danger';
    loading?: boolean;
    icon?: ReactNode;
    type?: 'button' | 'submit' | 'reset';
}) => (
    <button
        {...rest}
        type={type}
        disabled={disabled || loading}
        className={`ofi-cal-btn ${variant === 'primary' ? 'is-primary' : variant === 'danger' ? 'is-danger' : ''} ${className || ''}`}
    >
        {loading
            ? <span aria-hidden className="ofi-tp-spinner" />
            : icon}
        {children}
    </button>
);

/* Labelled block: label on top, control below, optional hint in the label. */
export const PopupField = ({
    label,
    hint,
    required,
    className,
    children,
}: {
    label: ReactNode;
    hint?: ReactNode;
    required?: boolean;
    className?: string;
    children: ReactNode;
}) => (
    <div className={`ofi-cal-field block ${className || ''}`}>
        <span className="ofi-cal-field__label">
            {label}
            {required && <span className="ofi-tp-required" aria-hidden> *</span>}
            {hint ? <span className="ofi-cal-field__hint"> · {hint}</span> : null}
        </span>
        {children}
    </div>
);

/* Quiet informational line (grey block). `tone` colours it for a warning. */
export const PopupNote = ({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'danger' | 'success'; className?: string }) => (
    <div className={`ofi-tp-note is-${tone} ${className || ''}`}>{children}</div>
);

/* Section caption inside a popup body. */
export const PopupCaption = ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={`ofi-tp-caption ${className || ''}`}>{children}</div>
);

/* Centred loading / empty text. */
export const PopupEmpty = ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={`ofi-tp-empty ${className || ''}`}>{children}</div>
);

/* ── readout pieces (project detail screen, 18.08.2026) ─────────────────── */

/* One "label → value" line; `total` draws the summing rule above it. */
export const PopupKv = ({
    label,
    value,
    total,
    className,
}: {
    label: ReactNode;
    value: ReactNode;
    total?: boolean;
    className?: string;
}) => (
    <div className={`ofi-tp-kv ${total ? 'is-total' : ''} ${className || ''}`}>
        <dt>{label}</dt>
        <dd>{value}</dd>
    </div>
);

/* Labelled progress bar — the popup's way of showing a percentage. */
export const PopupMeter = ({
    label,
    percent,
    tone = 'accent',
}: {
    label: ReactNode;
    percent: number;
    tone?: 'accent' | 'technical' | 'billing';
}) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <div className="ofi-tp-meter">
            <div className="ofi-tp-meter__head">
                <span className="ofi-tp-meter__label">{label}</span>
                <span className="ofi-tp-meter__value">{clamped}%</span>
            </div>
            <div className="ofi-tp-meter__track">
                <span className={`ofi-tp-meter__fill is-${tone}`} style={{ width: `${clamped}%` }} />
            </div>
        </div>
    );
};
