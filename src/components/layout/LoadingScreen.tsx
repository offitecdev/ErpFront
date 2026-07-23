import React from 'react';

interface LoadingScreenProps {
    label?: string;
    fullscreen?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
    label,
    fullscreen = true,
}) => {
    return (
        <div
            className={`${fullscreen ? 'h-screen w-screen' : 'h-full min-h-[200px] w-full'} flex items-center justify-center bg-white dark:bg-[#08090a]`}
            role="status"
            aria-live="polite"
        >
            <div className="flex flex-col items-center gap-3">
                <span
                    className="size-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#272f67] dark:border-white/15 dark:border-t-[#e6cf9e]"
                    aria-hidden="true"
                />
                {label && <span className="text-sm font-medium text-slate-500 dark:text-slate-300">{label}</span>}
            </div>
        </div>
    );
};
