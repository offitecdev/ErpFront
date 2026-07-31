import { useEffect, useRef } from 'react';
import type React from 'react';
import { cx } from '@/lib/utils/cx';

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

const BUTTON_VARIANT_CLASS: Record<NonNullable<PlainButtonProps['variant']>, string> = {
    primary: 'border border-transparent bg-[#1f2654] text-white hover:bg-[#2a3470]',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:border-[#1f2654] hover:bg-slate-50 hover:text-[#1f2654]',
    ghost: 'border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'border border-transparent bg-rose-600 text-white hover:bg-rose-700',
};

const BUTTON_SIZE_CLASS: Record<NonNullable<PlainButtonProps['size']>, string> = {
    sm: 'h-7 gap-1.5 rounded-[2px] px-2.5 text-[12px]',
    md: 'h-8 gap-2 rounded-[2px] px-3 text-[12.5px]',
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
        className={cx(
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
        className={cx('overflow-hidden rounded-[2px] border border-slate-300 bg-white', className)}
    >
        {(title || actions) && (
            <div data-ui-card-header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3.5 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                    {icon && <span className="flex size-5 shrink-0 items-center justify-center rounded-[2px] border border-slate-300 bg-white text-[#272f67]">{icon}</span>}
                    <div className="min-w-0">
                        {title && <h3 className="truncate text-[13.5px] font-semibold text-primary">{title}</h3>}
                        {description && <p className="mt-0.5 truncate text-[12px] text-tertiary">{description}</p>}
                    </div>
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
            </div>
        )}
        <div data-ui-card-body className={cx(noPadding ? '' : 'p-4 md:p-5', bodyClassName)}>{children}</div>
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
            className={cx(
                'ofi-quote-check cursor-pointer accent-[#1f2654] disabled:cursor-not-allowed disabled:opacity-50',
                size === 'sm' ? 'ofi-quote-check-sm' : '',
                className,
            )}
        />
    );
};
