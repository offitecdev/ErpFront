import React, { useEffect } from 'react';
import { X } from '@untitledui/icons';
import { cx } from '../../lib/utils/cx';

interface SlidePanelProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children: React.ReactNode;
    width?: string;
}

export const SlidePanel: React.FC<SlidePanelProps> = ({
    open,
    onClose,
    title,
    subtitle,
    children,
    width = 'w-[520px]',
}) => {
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (open) document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [open, onClose]);

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 z-[60] bg-overlay/30 transition-opacity duration-300 ${
                    open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className={`fixed inset-y-0 right-0 z-[61] ${width} max-w-[100vw] border-l border-secondary bg-primary shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
                    open ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-secondary px-6 py-5">
                    <div className="min-w-0">
                        {title && (
                            <h2 className="truncate text-lg font-semibold text-primary">{title}</h2>
                        )}
                        {subtitle && (
                            <p className="mt-1 text-sm text-tertiary">{subtitle}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className={cx(
                            'flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition-colors',
                            'hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2',
                        )}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {children}
                </div>
            </div>
        </>
    );
};
