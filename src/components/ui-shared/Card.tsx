import React from 'react';
import AntCard from 'antd/es/card';
import { cx } from '../../lib/utils/cx';

import { t } from '@/i18n/translate';

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
    <AntCard
        data-ui-card
        variant="borderless"
        className={cx(t('auto.overflow_hidden_rounded_xl_border_border_slate_2'), className)}
        styles={{ body: { padding: 0 } }}
    >
        {(title || actions) && (
            <div data-ui-card-header className="flex items-center justify-between gap-3 border-b border-secondary bg-primary px-4 py-4 md:px-6">
                <div className="flex min-w-0 items-center gap-2.5">
                    {icon && <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[#272f67]">{icon}</span>}
                    <div className="min-w-0">
                        {title && <h3 className="truncate text-md font-semibold text-primary">{title}</h3>}
                        {description && <p className="mt-0.5 truncate text-sm text-tertiary">{description}</p>}
                    </div>
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
            </div>
        )}
        <div data-ui-card-body className={cx(noPadding ? '' :"p-4 md:p-6", bodyClassName)}>{children}</div>
    </AntCard>
);
