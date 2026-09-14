import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Der Druckknopf des Moduls (28px, 6px Ecke, umrandet) — `primary` ist das EINE
 * Systemblau einer Ansicht, `danger` nur rote Schrift. `ofi-btn-plain` hält den
 * Hausknopf (styles/buttons.css) fern; die Form steht in tasksModule.css.
 */
export const TaskButton = ({
    variant = 'default',
    icon,
    children,
    className = '',
    type = 'button',
    ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
    variant?: 'default' | 'primary' | 'danger';
    icon?: ReactNode;
    type?: 'button' | 'submit';
}) => (
    <button
        {...rest}
        type={type}
        className={`ofi-gv-btn ofi-btn-plain ofi-nosize ${variant === 'primary' ? 'is-primary' : variant === 'danger' ? 'is-danger' : ''} ${className}`.trim()}
    >
        {icon}
        {children}
    </button>
);

/** Quadratischer Symbolknopf (28px, `small` = 22px). `label` ist Pflicht (Titel + Vorlesehilfe). */
export const TaskIconButton = ({
    label,
    active = false,
    danger = false,
    small = false,
    className = '',
    children,
    ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label'> & {
    label: string;
    active?: boolean;
    danger?: boolean;
    small?: boolean;
    children: ReactNode;
}) => (
    <button
        {...rest}
        type="button"
        aria-label={label}
        title={rest.title ?? label}
        aria-pressed={active || undefined}
        className={`ofi-gv-iconbtn ofi-btn-plain ofi-nosize ${active ? 'is-on' : ''} ${danger ? 'is-danger' : ''} ${small ? 'is-small' : ''} ${className}`.trim()}
    >
        {children}
    </button>
);
