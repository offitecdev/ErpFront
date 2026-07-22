import React from 'react';
import { cx } from '../../../../lib/utils/cx';

/* The overview deliberately uses a slightly softer chrome than the standard
   Card: bigger radius, calmer border, more inner air. Every widget shares it so
   the page reads as one system. */
export const SURFACE =
    'rounded-2xl border border-[#E3E7F0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#151616]';

interface OverviewCardProps {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    bodyClassName?: string;
}

export const OverviewCard: React.FC<OverviewCardProps> = ({
    title,
    subtitle,
    icon,
    actions,
    children,
    className,
    bodyClassName,
}) => (
    <section className={cx(SURFACE, 'flex flex-col overflow-hidden', className)}>
        {(title || actions) && (
            <header className="flex items-center justify-between gap-3 px-5 pb-0 pt-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    {icon && (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F6] text-[#3F4350] dark:bg-[#e6cf9e]/10 dark:text-[#e6cf9e]">
                            {icon}
                        </span>
                    )}
                    <div className="min-w-0">
                        {title && (
                            <h3 className="truncate text-[15px] font-semibold tracking-tight text-[#1A1A1A] dark:text-white">
                                {title}
                            </h3>
                        )}
                        {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-[#6B7280] dark:text-[#aab0bb]">{subtitle}</p>}
                    </div>
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
            </header>
        )}
        <div className={cx('flex-1 p-5', bodyClassName)}>{children}</div>
    </section>
);
