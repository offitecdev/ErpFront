import React from 'react';
import Tag from 'antd/es/tag';

type Variant = 'active' | 'approved' | 'passive' | 'info' | 'warning' | 'danger' | 'neutral' | 'order';

interface StatusBadgeProps {
    variant?: Variant;
    children: React.ReactNode;
    dot?: boolean;
}

const tagColorMap: Record<Variant, string> = {
    active: 'success',
    approved: 'processing',
    passive: 'default',
    info: 'blue',
    warning: 'warning',
    danger: 'error',
    neutral: 'default',
    order: 'success',
};

const chipClassMap: Record<Variant, string> = {
    active: 'bg-[#059669] text-white border-transparent',
    approved: 'bg-[#272f67] text-white border-transparent',
    passive: 'bg-[#64748b] text-white border-transparent',
    info: 'bg-[#3b82f6] text-white border-transparent',
    warning: 'bg-[#f59e0b] text-white border-transparent',
    danger: 'bg-[#dc2626] text-white border-transparent',
    neutral: 'bg-[#64748b] text-white border-transparent',
    order: 'bg-[#059669] text-white border-transparent',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
    variant = 'neutral',
    children,
}) => (
    <Tag
        color={tagColorMap[variant]}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 13 }}
    >
        {children}
    </Tag>
);

export const StatusChip: React.FC<StatusBadgeProps> = ({
    variant = 'neutral',
    children,
}) => (
    <span className={`inline-flex size-max items-center whitespace-nowrap rounded-[13px] border px-2.5 py-0.5 text-[11px] font-semibold ${chipClassMap[variant]}`}>
        {children}
    </span>
);
