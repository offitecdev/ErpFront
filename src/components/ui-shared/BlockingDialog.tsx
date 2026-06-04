import React from 'react';
import { LoadingIndicator } from '@/components/application/loading-indicator/loading-indicator';

interface BlockingDialogProps {
    open: boolean;
    title: string;
    description?: string;
}

export const BlockingDialog: React.FC<BlockingDialogProps> = ({ open, title, description }) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay/40 px-4 font-sans">
            <div className="w-full max-w-md rounded-xl bg-primary p-6 text-primary shadow-xl ring-1 ring-secondary_alt">
                <div className="flex items-start gap-4">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-primary_alt">
                        <LoadingIndicator type="line-simple" size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold text-primary">{title}</h2>
                        {description && <p className="mt-1.5 text-sm leading-relaxed text-tertiary">{description}</p>}
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-solid" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
