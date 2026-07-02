import React from 'react';
import Empty from 'antd/es/empty';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
    <div className="px-6 py-10 text-center">
        <Empty
            image={icon ? <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">{icon}</div> : Empty.PRESENTED_IMAGE_SIMPLE}
            description={
                <div>
                    <h3 className="text-sm font-semibold text-primary">{title}</h3>
                    {description && <p className="mt-1 text-sm text-tertiary">{description}</p>}
                </div>
            }
        >
            {action}
        </Empty>
    </div>
);
