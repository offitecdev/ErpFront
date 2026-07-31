import { ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { MONTAGE_PAGE_SIZE } from '../utils/montagePaging';

/** Numbered server pager shared by appointments, completed work and reports. */
export const MontagePager = ({
    page,
    total,
    pageSize = MONTAGE_PAGE_SIZE,
    onPage,
}: {
    page: number;
    total: number;
    pageSize?: number;
    onPage: (page: number) => void;
}) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pageSafe = Math.min(Math.max(1, page), totalPages);
    if (total <= pageSize) return null;
    const from = (pageSafe - 1) * pageSize + 1;
    const to = Math.min(total, pageSafe * pageSize);
    const pageWindow = Math.min(5, totalPages);
    const firstVisible = Math.max(1, Math.min(pageSafe - 2, totalPages - pageWindow + 1));
    const numberedPages = Array.from({ length: pageWindow }, (_, index) => firstVisible + index);
    return (
        <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="font-mono text-[12px] text-slate-500 dark:text-slate-400">{from}-{to} / {total}</span>
            <nav aria-label="Pagination" className="flex items-center gap-1">
                <button
                    type="button"
                    disabled={pageSafe <= 1}
                    onClick={() => onPage(pageSafe - 1)}
                    aria-label={t('common.back')}
                    className="flex size-10 items-center justify-center rounded-[3px] border border-[#d30f15] bg-[#d30f15] text-white transition-colors hover:border-[#b90d12] hover:bg-[#b90d12] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 dark:border-amber-500 dark:bg-amber-500 dark:hover:border-amber-600 dark:hover:bg-amber-600 dark:disabled:border-white/10 dark:disabled:bg-white/5 dark:disabled:text-slate-600"
                >
                    <ChevronLeft size={18} />
                </button>
                {numberedPages.map((pageNumber) => (
                    <button
                        key={pageNumber}
                        type="button"
                        onClick={() => onPage(pageNumber)}
                        aria-current={pageNumber === pageSafe ? 'page' : undefined}
                        className={`flex size-9 items-center justify-center rounded-[3px] border text-[12.5px] font-semibold tabular-nums transition-colors ${
                            pageNumber === pageSafe
                                ? 'border-[#d30f15] bg-[#d30f15] text-white dark:border-amber-500 dark:bg-amber-500'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-[#d30f15] hover:text-[#d30f15] dark:border-white/15 dark:bg-white/5 dark:text-slate-300 dark:hover:border-amber-500 dark:hover:text-amber-300'
                        }`}
                    >
                        {pageNumber}
                    </button>
                ))}
                <button
                    type="button"
                    disabled={pageSafe >= totalPages}
                    onClick={() => onPage(pageSafe + 1)}
                    aria-label={t('common.next')}
                    className="flex size-10 items-center justify-center rounded-[3px] border border-[#d30f15] bg-[#d30f15] text-white transition-colors hover:border-[#b90d12] hover:bg-[#b90d12] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 dark:border-amber-500 dark:bg-amber-500 dark:hover:border-amber-600 dark:hover:bg-amber-600 dark:disabled:border-white/10 dark:disabled:bg-white/5 dark:disabled:text-slate-600"
                >
                    <ChevronRight size={18} />
                </button>
            </nav>
        </div>
    );
};
