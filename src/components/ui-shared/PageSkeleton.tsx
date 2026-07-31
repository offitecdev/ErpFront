import React from 'react';
import { SkeletonBar } from './Loader';

/**
 * The ONE loading skeleton. Used both as the router's lazy-chunk fallback and by
 * pages that fetch before first paint (e.g. the CRM overview), so navigation
 * shows a single uninterrupted shimmer instead of two different placeholders.
 *
 * The bars come from `Loader`'s `SkeletonBar`, which is the same building block
 * the tables load with (`TableStateRow`) — a route change and a table page turn
 * therefore animate identically.
 */
export const PageSkeleton: React.FC = () => (
    <div className="space-y-5" role="status" aria-live="polite">
        <div className="border-b border-slate-200/60 pb-4 dark:border-white/10">
            <SkeletonBar className="mb-2 h-3 rounded" width="9rem" />
            <SkeletonBar className="h-6 rounded" width="15rem" delayMs={80} />
            <SkeletonBar className="mt-2 h-3 max-w-full rounded" width="20rem" delayMs={160} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((column) => (
                <SkeletonBar key={column} className="h-20 rounded-md" delayMs={240 + column * 80} />
            ))}
        </div>
        <SkeletonBar className="h-72 rounded-md" delayMs={560} />
    </div>
);
