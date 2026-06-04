import React from 'react';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
        {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">{icon}</div>}
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        {description && <p className="mt-1 max-w-md text-sm text-tertiary">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
    </div>
);
