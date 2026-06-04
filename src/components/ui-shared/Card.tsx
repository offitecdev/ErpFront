import React from 'react';
import { cx } from '../../lib/utils/cx';

interface CardProps {
    title?: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    bodyClassName?: string;
    noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
    title,
    description,
    icon,
    actions,
    children,
    className = '',
    bodyClassName = '',
    noPadding,
}) => (
    <section data-ui-card className={cx('overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary', className)}>
        {(title || actions) && (
            <div className="flex items-center justify-between gap-3 border-b border-secondary bg-primary px-4 py-4 md:px-6">
                <div className="flex min-w-0 items-center gap-2.5">
                    {icon && <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary_alt text-fg-brand-primary">{icon}</span>}
                    <div className="min-w-0">
                        {title && <h3 className="truncate text-md font-semibold text-primary">{title}</h3>}
                        {description && <p className="mt-0.5 truncate text-sm text-tertiary">{description}</p>}
                    </div>
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
            </div>
        )}
        <div data-ui-card-body className={cx(noPadding ? '' : 'p-4 md:p-6', bodyClassName)}>{children}</div>
    </section>
);
