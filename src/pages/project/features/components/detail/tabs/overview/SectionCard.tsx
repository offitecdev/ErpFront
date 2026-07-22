import type React from 'react';

// CRM-overview style chrome, shared by every overview widget so the page reads
// as one system: calm border, bigger radius, explicit dark-mode surfaces.
export const SURFACE =
    'rounded-2xl border border-[#E3E7F0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#151616]';

// Frosted variant for the sections that should stand out (orders summary,
// signature/attention areas).
export const GLASS =
    'rounded-2xl border border-white/65 bg-white/60 ring-1 ring-slate-200/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_2px_rgba(16,24,40,0.06)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-white/[0.06] dark:ring-white/10';

export const SectionCard = ({
    title,
    subtitle,
    icon,
    actions,
    glass = false,
    noPadding = false,
    className = '',
    children,
}: {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    glass?: boolean;
    noPadding?: boolean;
    className?: string;
    children: React.ReactNode;
}) => (
    <section className={`${glass ? GLASS : SURFACE} flex flex-col overflow-hidden ${className}`}>
        {(title || actions) && (
            <header className="flex items-center justify-between gap-3 px-4 pb-0 pt-3.5">
                <div className="flex min-w-0 items-center gap-2.5">
                    {icon && (
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F6] text-[#3F4350] dark:bg-[#e6cf9e]/10 dark:text-[#e6cf9e]">
                            {icon}
                        </span>
                    )}
                    <div className="min-w-0">
                        {title && (
                            <h3 className="truncate text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h3>
                        )}
                        {subtitle && <p className="mt-0.5 truncate text-[11.5px] text-slate-500 dark:text-[#aab0bb]">{subtitle}</p>}
                    </div>
                </div>
                {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
            </header>
        )}
        <div className={noPadding ? 'mt-3 flex-1' : 'flex-1 p-4'}>{children}</div>
    </section>
);
