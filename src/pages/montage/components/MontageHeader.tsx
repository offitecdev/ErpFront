import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * Page-level navigation strip: big, consistent Back / Forward icons on every
 * montage page, the page title, and optional right-side actions.
 */
export const MontageHeader = ({
    title,
    subtitle,
    backTo,
    actions,
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    /** Explicit back target; falls back to history back. */
    backTo?: string;
    actions?: ReactNode;
}) => {
    const navigate = useNavigate();
    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    aria-label={t('common.back')}
                    onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
                    className="grid size-11 place-items-center rounded-[3px] border border-[#d30f15] bg-[#d30f15] text-white transition-colors hover:border-[#b90d12] hover:bg-[#b90d12] active:bg-[#a40b10] dark:border-amber-500 dark:bg-amber-500 dark:hover:border-amber-600 dark:hover:bg-amber-600 dark:active:bg-amber-700"
                >
                    <ChevronLeft size={20} />
                </button>
                <button
                    type="button"
                    aria-label={t('montage.forward')}
                    onClick={() => navigate(1)}
                    className="grid size-11 place-items-center rounded-[3px] border border-[#d30f15] bg-[#d30f15] text-white transition-colors hover:border-[#b90d12] hover:bg-[#b90d12] active:bg-[#a40b10] dark:border-amber-500 dark:bg-amber-500 dark:hover:border-amber-600 dark:hover:bg-amber-600 dark:active:bg-amber-700"
                >
                    <ChevronRight size={20} />
                </button>
            </div>
            <div className="min-w-0 flex-1">
                <h1 className="truncate text-[17px] font-bold leading-tight text-slate-900 dark:text-slate-50">{title}</h1>
                {subtitle && <div className="truncate text-[12.5px] text-slate-500 dark:text-slate-400">{subtitle}</div>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
};
