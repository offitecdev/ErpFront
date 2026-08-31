import { useEffect, useRef } from 'react';
import type React from 'react';
import clsx from 'clsx';

// Plain TypeScript/Tailwind stand-ins for the Ant-Design-backed ui-shared
// wrappers (Card / Button / Checkbox), so the quote detail surface renders
// without antd. Same prop shapes as the wrappers, only the subset the quote
// page actually uses.

type PlainButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    icon?: React.ReactNode;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
};

// Buttons of the fresh look (17.08.2026): filled navy for the primary action,
// a hairline outline for secondary, plain text for ghost — with a modest 6px
// corner (user request: "significantly reduce the radius of Save / Export /
// Confirm"); `.ofi-quote-btn` in index.css pins that corner against the
// app-wide button radius rule.
const BUTTON_VARIANT_CLASS: Record<NonNullable<PlainButtonProps['variant']>, string> = {
    primary: 'ofi-quote-btn is-primary border border-transparent bg-[#1f2654] text-white hover:bg-[#2a3470]',
    secondary: 'ofi-quote-btn is-secondary border border-[#dadce0] bg-white text-[#1f2654] hover:bg-[#1f2654]/[0.05]',
    ghost: 'ofi-quote-btn is-ghost border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'ofi-quote-btn is-danger border border-transparent bg-[#c5221f] text-white hover:bg-[#a50e0e]',
};

/* PILLEN, und `rounded-full` ist hier PFLICHT statt `rounded-[999px]`:
   index.css zwingt in `@layer utilities` JEDE Klasse, die `rounded-[`
   enthaelt, per !important auf 2px (MEMORY «Radius utilities are
   flattened») — der alte `rounded-[6px]` kam nie an, die Knoepfe standen
   in Wahrheit auf 2px. `rounded-full` ist ausgenommen, und es nimmt sie
   zugleich aus dem App-Grundradius (`button:not([class~="rounded-full"])`)
   heraus. */
const BUTTON_SIZE_CLASS: Record<NonNullable<PlainButtonProps['size']>, string> = {
    sm: 'h-8 gap-1.5 rounded-full px-3 text-[12.5px]',
    md: 'h-9 gap-2 rounded-full px-3.5 text-[13px]',
};

export const PlainButton = ({
    variant = 'primary',
    size = 'md',
    icon,
    loading,
    disabled,
    type = 'button',
    className,
    children,
    ...rest
}: PlainButtonProps) => (
    <button
        {...rest}
        type={type}
        disabled={disabled || loading}
        className={clsx(
            'inline-flex items-center justify-center whitespace-nowrap font-medium transition-all duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
            BUTTON_VARIANT_CLASS[variant],
            BUTTON_SIZE_CLASS[size],
            className,
        )}
    >
        {loading
            ? <span aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            : icon && <span className="inline-flex shrink-0 items-center">{icon}</span>}
        {children}
    </button>
);

type PlainCardProps = {
    title?: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    bodyClassName?: string;
    noPadding?: boolean;
};

// The data-ui-card attributes are kept so the shared `.ofi-*` / dark-mode
// surface CSS keeps targeting this card exactly like the wrapper it replaces.
export const PlainCard = ({
    title,
    description,
    icon,
    actions,
    children,
    className,
    bodyClassName,
    noPadding,
}: PlainCardProps) => (
    <section
        data-ui-card
        className={clsx('ofi-quote-card overflow-hidden rounded-lg border border-[#e6e8eb] bg-white', className)}
    >
        {(title || actions) && (
            <div data-ui-card-header className="ofi-quote-card__head flex items-center justify-between gap-3 border-b border-[#eef0f2] bg-white px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                    {icon && <span className="ofi-quote-card__icon flex size-6 shrink-0 items-center justify-center rounded-full text-[#1f2654]">{icon}</span>}
                    <div className="min-w-0">
                        {title && <h3 className="truncate text-[13.5px] font-semibold text-primary">{title}</h3>}
                        {description && <p className="mt-0.5 truncate text-[12px] text-tertiary">{description}</p>}
                    </div>
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
            </div>
        )}
        <div data-ui-card-body className={clsx(noPadding ? '' : 'p-4 md:p-5', bodyClassName)}>{children}</div>
    </section>
);

type PlainCheckboxProps = {
    size?: 'sm' | 'md';
    isSelected?: boolean;
    isIndeterminate?: boolean;
    isDisabled?: boolean;
    onChange?: (checked: boolean) => void;
    onClick?: React.MouseEventHandler<HTMLInputElement>;
    className?: string;
    'aria-label'?: string;
};

export const PlainCheckbox = ({
    size = 'md',
    isSelected = false,
    isIndeterminate = false,
    isDisabled,
    onChange,
    onClick,
    className,
    'aria-label': ariaLabel,
}: PlainCheckboxProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    // `indeterminate` is a DOM property only — there is no attribute for it.
    useEffect(() => {
        if (inputRef.current) inputRef.current.indeterminate = isIndeterminate && !isSelected;
    }, [isIndeterminate, isSelected]);

    return (
        <input
            ref={inputRef}
            type="checkbox"
            aria-label={ariaLabel}
            checked={isSelected}
            disabled={isDisabled}
            onChange={(event) => onChange?.(event.target.checked)}
            onClick={onClick}
            // `ofi-quote-check` overrides the app-wide checkbox rule in index.css,
            // which rounds every checkbox to 10px and pins it to 16px square.
            className={clsx(
                'ofi-quote-check cursor-pointer accent-[#1f2654] disabled:cursor-not-allowed disabled:opacity-50',
                size === 'sm' ? 'ofi-quote-check-sm' : '',
                className,
            )}
        />
    );
};
