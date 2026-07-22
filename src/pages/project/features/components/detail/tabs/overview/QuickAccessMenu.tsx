import { memo } from 'react';
import type React from 'react';

import { ChevronRight } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ProjectDetailView } from '../../../../types/projectDetailNavigation';

export type QuickAccessItem = {
    key: string;
    label: string;
    icon?: React.ReactNode;
    view: ProjectDetailView;
};

// Quick-access chips: jump straight to the corresponding tab of the top menu
// (planning, field reports, billing, …) — no scrolling involved.
export const QuickAccessMenu = memo(({
    items,
    onNavigate,
}: {
    items: QuickAccessItem[];
    onNavigate: (view: ProjectDetailView) => void;
}) => (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#E3E7F0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#151616]">
        <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            {t('projects.detail.quickAccess')}
        </span>
        {items.map((item) => (
            <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.view)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white/80"
            >
                {item.icon}
                {item.label}
                <ChevronRight size={11} className="text-slate-300 dark:text-white/40" />
            </button>
        ))}
    </div>
));
