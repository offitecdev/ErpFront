import React from 'react';

/**
 * The ONE loading skeleton. Used both as the router's lazy-chunk fallback and by
 * pages that fetch before first paint (e.g. the CRM overview), so navigation
 * shows a single uninterrupted pulse instead of two different placeholders.
 */
export const PageSkeleton: React.FC = () => (
    <div className="animate-pulse space-y-5">
        <div className="border-b border-slate-200/60 pb-4 dark:border-white/10">
            <div className="mb-2 h-3 w-36 rounded bg-slate-100 dark:bg-white/5" />
            <div className="h-6 w-60 rounded bg-slate-200 dark:bg-white/10" />
            <div className="mt-2 h-3 w-80 max-w-full rounded bg-slate-100 dark:bg-white/5" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 rounded-md border border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-white/5" />
            ))}
        </div>
        <div className="h-72 rounded-md border border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-white/5" />
    </div>
);
