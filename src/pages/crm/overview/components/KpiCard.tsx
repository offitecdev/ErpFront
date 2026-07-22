import React from 'react';
import Tooltip from 'antd/es/tooltip';
import { InfoCircle, TrendDown01, TrendUp01 } from '@/components/icons/antIconCompat';
import { cx } from '../../../../lib/utils/cx';
import { SURFACE } from './OverviewCard';

export type KpiTone = 'brand' | 'sky' | 'amber' | 'violet' | 'emerald' | 'rose';

const TONE: Record<KpiTone, { chip: string; value: string }> = {
    brand: { chip: 'bg-[#07145c]/8 text-[#07145c] dark:bg-[#e6cf9e]/12 dark:text-[#e6cf9e]', value: 'text-[#07145c] dark:text-[#e6cf9e]' },
    sky: { chip: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/12 dark:text-sky-300', value: 'text-sky-700 dark:text-sky-300' },
    amber: { chip: 'bg-amber-500/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300', value: 'text-amber-700 dark:text-amber-300' },
    violet: { chip: 'bg-violet-500/10 text-violet-700 dark:bg-violet-400/12 dark:text-violet-300', value: 'text-violet-700 dark:text-violet-300' },
    emerald: { chip: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300', value: 'text-emerald-700 dark:text-emerald-300' },
    rose: { chip: 'bg-rose-500/10 text-rose-700 dark:bg-rose-400/12 dark:text-rose-300', value: 'text-rose-700 dark:text-rose-300' },
};

interface KpiCardProps {
    label: string;
    icon: React.ReactNode;
    tone: KpiTone;
    /** Big number — count of offers/tasks. */
    count: number;
    /** Formatted monetary value shown under the count (optional). */
    money?: string;
    /** Small print at the bottom, e.g. "3 more offers than last month". */
    footnote?: React.ReactNode;
    footnoteTrend?: 'up' | 'down' | null;
    /** Content of the "i" tooltip (how the number is calculated). */
    info?: React.ReactNode;
    onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
    label,
    icon,
    tone,
    count,
    money,
    footnote,
    footnoteTrend,
    info,
    onClick,
}) => {
    const toneCls = TONE[tone];
    return (
        <div
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={(e) => {
                if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick();
            }}
            className={cx(
                SURFACE,
                'group relative flex min-h-[124px] flex-col p-4',
                onClick &&
                    'cursor-pointer transition-colors duration-150 hover:border-[#C9D0DF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#07145c]/25',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <span className={cx('flex size-9 items-center justify-center rounded-xl', toneCls.chip)}>{icon}</span>
                {info && (
                    <Tooltip title={info} placement="topRight" styles={{ root: { maxWidth: 320 } }}>
                        <span
                            aria-label="info"
                            onClick={(e) => e.stopPropagation()}
                            className="flex size-6 cursor-help items-center justify-center rounded-full text-[#98A0AE] transition-colors hover:bg-black/5 hover:text-[#3F4350] dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            <InfoCircle size={15} />
                        </span>
                    </Tooltip>
                )}
            </div>

            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2">
                <span className={cx('text-[26px] font-bold leading-none tracking-tight tabular-nums', toneCls.value)}>{count}</span>
                {money && (
                    <span className="text-[13.5px] font-semibold tabular-nums text-[#3F4350] dark:text-[#d9dce3]">{money}</span>
                )}
            </div>
            <p className="mt-1 text-[12.5px] font-medium leading-snug text-[#6B7280] dark:text-[#aab0bb]">{label}</p>

            {footnote && (
                <p className="mt-auto flex items-center gap-1 pt-2 text-[11px] text-[#98A0AE] dark:text-[#8f95a1]">
                    {footnoteTrend === 'up' && <TrendUp01 size={12} className="text-emerald-600 dark:text-emerald-400" />}
                    {footnoteTrend === 'down' && <TrendDown01 size={12} className="text-rose-500 dark:text-rose-400" />}
                    <span className="truncate">{footnote}</span>
                </p>
            )}
        </div>
    );
};
