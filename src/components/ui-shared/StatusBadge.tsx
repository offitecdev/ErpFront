import React from 'react';
import { BadgeWithDot } from '../base/badges/badges';
import { cx } from '../../lib/utils/cx';

type Variant = 'active' | 'approved' | 'passive' | 'info' | 'warning' | 'danger' | 'neutral' | 'order';

interface StatusBadgeProps {
    variant?: Variant;
    children: React.ReactNode;
    dot?: boolean;
}

const colorMap: Record<Variant, React.ComponentProps<typeof BadgeWithDot>['color']> = {
    active: 'success',
    approved: 'blue',
    passive: 'gray',
    info: 'brand',
    warning: 'warning',
    danger: 'error',
    neutral: 'gray',
    order: 'success',
};

const chipClassMap: Record<Variant, string> = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    approved: 'border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700',
    passive: 'border-gray-200 bg-gray-50 text-gray-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700',
    warning: 'border-yellow-200 bg-yellow-50 text-yellow-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    neutral: 'border-gray-200 bg-gray-50 text-gray-700',
    order: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
    variant = 'neutral',
    children,
    dot = true,
}) => (
    dot ? (
        <BadgeWithDot type="modern" color={colorMap[variant]} size="sm">
            {children}
        </BadgeWithDot>
    ) : (
        <span className="text-sm font-medium text-secondary">{children}</span>
    )
);

export const StatusChip: React.FC<StatusBadgeProps> = ({
    variant = 'neutral',
    children,
}) => (
    <span className={cx('inline-flex size-max items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium shadow-xs', chipClassMap[variant])}>
        {children}
    </span>
);
