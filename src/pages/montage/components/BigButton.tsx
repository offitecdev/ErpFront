import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'brand' | 'navy' | 'navyOutline' | 'neutral' | 'success' | 'danger' | 'amber' | 'outline';

const TONES: Record<Tone, string> = {
    brand: 'bg-[#d30f15] text-white hover:bg-[#b90d12] active:bg-[#a40b10] dark:bg-amber-500 dark:hover:bg-amber-600 dark:active:bg-amber-700',
    navy: 'bg-[#1f2654] text-white hover:bg-[#171d43] active:bg-[#111634] dark:bg-amber-500 dark:hover:bg-amber-600 dark:active:bg-amber-700',
    navyOutline: 'border border-[#1f2654] bg-white text-[#1f2654] hover:bg-[#f1f4fa] dark:border-amber-500/70 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10',
    neutral: 'bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
    amber: 'bg-[#d30f15] text-white hover:bg-[#b90d12] active:bg-[#a40b10] dark:bg-amber-500 dark:hover:bg-amber-600 dark:active:bg-amber-700',
    outline: 'border border-[#d30f15]/70 bg-white text-[#d30f15] hover:bg-red-50 dark:border-amber-500/70 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10',
};

/**
 * One-tap tablet button. Still a comfortable touch target (~40px), but scaled
 * to the panel's general UI — the first version's 56px+ slabs read absurdly
 * large next to the rest of the app.
 */
export const BigButton = ({
    tone = 'brand',
    icon,
    active,
    className,
    children,
    ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; icon?: ReactNode; active?: boolean }) => (
    <button
        type="button"
        {...rest}
        className={clsx(
            'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-45',
            TONES[tone],
            active && 'ring-2 ring-[#d30f15] ring-offset-2 dark:ring-amber-500 dark:ring-offset-transparent',
            className,
        )}
    >
        {icon}
        {children}
    </button>
);
