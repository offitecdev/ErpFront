import { memo, useEffect, useState } from 'react';

// Colorful animated three-column vertical bar chart. Heights ease in on mount
// and re-animate whenever the animate key (selected order) changes.
export type CompletionBar = {
    key: string;
    label: string;
    percent: number;
    colorClass: string;
};

export const CompletionBars = memo(({ bars, animateKey }: { bars: CompletionBar[]; animateKey: string }) => {
    // Start collapsed and grow on the next frame so switching orders re-animates.
    const [grown, setGrown] = useState(false);
    useEffect(() => {
        setGrown(false);
        const frame = requestAnimationFrame(() => setGrown(true));
        return () => cancelAnimationFrame(frame);
    }, [animateKey]);

    return (
        <div className="flex items-end justify-between gap-3">
            {bars.map((bar) => {
                const clamped = Math.max(0, Math.min(100, Math.round(bar.percent)));
                return (
                    <div key={bar.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-white">{clamped}%</span>
                        {/* Wide column so it reads as a bar chart, not a line. */}
                        <div className="relative h-28 w-full max-w-11 overflow-hidden rounded-md bg-slate-100 dark:bg-white/10">
                            <span
                                className={`absolute inset-x-0 bottom-0 rounded-t-md transition-[height] duration-700 ease-out ${bar.colorClass}`}
                                style={{ height: grown ? `${clamped}%` : '0%' }}
                            />
                        </div>
                        <span className="truncate text-center text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">{bar.label}</span>
                    </div>
                );
            })}
        </div>
    );
});
