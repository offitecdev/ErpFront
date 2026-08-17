import { useMemo } from 'react';

import i18n from '@/i18n';
import type { ArticleStockSummary } from '@/types/inventory';

import type { SimpleTenderLine } from '../types/tenderDetail.types';
import { lineNetTotal } from '../utils/tenderCalculation.utils';
import { getArticleUnitCost, getArticleCostSourceLabel } from '../utils/tenderProduct.utils';

type UseTenderProfitabilityParams = {
    stockArticles: ArticleStockSummary[];
    displayRows: SimpleTenderLine[];
    selectedLine: SimpleTenderLine | null;
};

// Profitability is derived from every product row (article lookup + cost /
// margin math) plus two reduces. Memoized here — declaring it in the render
// body re-ran the whole pass on every keystroke / selection change.
export const useTenderProfitability = ({ stockArticles, displayRows, selectedLine }: UseTenderProfitabilityParams) => {
    const stockArticleById = useMemo(
        () => new Map(stockArticles.map((article) => [article.id, article])),
        [stockArticles],
    );
    const profitabilityRows = useMemo(
        () => displayRows
            .filter((row) => row.kind === 'PRODUCT')
            .map((row) => {
                const article = row.position.sourceArticleId ? stockArticleById.get(row.position.sourceArticleId) : undefined;
                const quantity = Number(row.position.quantity || 0);
                const unitCost = getArticleUnitCost(article);
                const cost = quantity * unitCost;
                const revenue = lineNetTotal(row.position);
                const result = revenue - cost;
                const resultRate = revenue > 0 ? (result / revenue) * 100 : 0;
                return {
                    ...row,
                    article,
                    unitCost,
                    cost,
                    revenue,
                    result,
                    resultRate,
                    costSource: getArticleCostSourceLabel(article),
                };
            }),
        // i18n.language is a dep because getArticleCostSourceLabel() returns
        // translated labels that must refresh when the language changes.
        [displayRows, stockArticleById, i18n.language],
    );
    const profitabilityRevenue = useMemo(() => profitabilityRows.reduce((sum, row) => sum + row.revenue, 0), [profitabilityRows]);
    const profitabilityCost = useMemo(() => profitabilityRows.reduce((sum, row) => sum + row.cost, 0), [profitabilityRows]);
    const profitabilityResult = profitabilityRevenue - profitabilityCost;
    const profitabilityRate = profitabilityRevenue > 0 ? (profitabilityResult / profitabilityRevenue) * 100 : 0;
    const selectedProfitabilityLine = useMemo(
        () => (selectedLine ? profitabilityRows.find((row) => row.id === selectedLine.id) || null : null),
        [selectedLine, profitabilityRows],
    );

    return {
        stockArticleById,
        profitabilityRows,
        profitabilityRevenue,
        profitabilityCost,
        profitabilityResult,
        profitabilityRate,
        selectedProfitabilityLine,
    };
};
