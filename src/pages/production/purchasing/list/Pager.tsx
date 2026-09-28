import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/i18n/translate';

/** Seitenzahlen mit Lücken: 1 … 4 5 6 … 12. */
const pageWindow = (page: number, pages: number): Array<number | 'gap'> => {
    if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
    const near = [page - 1, page, page + 1].filter((value) => value > 1 && value < pages);
    const steps: Array<number | 'gap'> = [1];
    if ((near[0] ?? pages) > 2) steps.push('gap');
    steps.push(...near);
    if ((near[near.length - 1] ?? 1) < pages - 1) steps.push('gap');
    steps.push(pages);
    return steps;
};

/** «1–20 / 137» · ‹ 1 2 3 › · «Sayfa başına 20». */
export const Pager = ({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) => {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const from = total ? (page - 1) * pageSize + 1 : 0;
    const to = Math.min(total, page * pageSize);
    return (
        <footer className="ofi-buy-pager">
            <span>{t('productionBom.purchasing.pageRange', { from, to, total })}</span>
            <span className="ofi-buy-pager__steps">
                <button type="button" className="ofi-buy-pg ofi-nosize" disabled={page <= 1} aria-label={t('productionBom.purchasing.prevPage')} onClick={() => onPage(page - 1)}>
                    <ChevronLeft aria-hidden />
                </button>
                {pageWindow(page, pages).map((step, index) => (step === 'gap'
                    ? <span key={`gap-${index}`} className="ofi-buy-pager__gap">…</span>
                    : (
                        <button
                            key={step}
                            type="button"
                            className={`ofi-buy-pg ofi-nosize${step === page ? ' is-on' : ''}`}
                            aria-current={step === page ? 'page' : undefined}
                            onClick={() => onPage(step)}
                        >
                            {step}
                        </button>
                    )))}
                <button type="button" className="ofi-buy-pg ofi-nosize" disabled={page >= pages} aria-label={t('productionBom.purchasing.nextPage')} onClick={() => onPage(page + 1)}>
                    <ChevronRight aria-hidden />
                </button>
            </span>
            <span className="ofi-buy-pager__per">{t('productionBom.purchasing.perPage', { count: pageSize })}</span>
        </footer>
    );
};
