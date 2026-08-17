import type { SimpleTenderLine } from '../types/tenderDetail.types';
import { lineNetTotal, lineTotal } from './tenderCalculation.utils';
import { applyDiscounts, type AppliedDiscount, type TenderDiscountEntry } from './tenderDiscounts.utils';

export interface TenderPricingSummary {
    productLineCount: number;
    // Simple mean of the product lines' discount percentages.
    averageDiscount: number;
    /**
     * Document-level discounts, applied SEQUENTIALLY on the net: each one bites
     * into what the previous ones left (100 → -20% → 80 → -10% → 72). Both the
     * amounts and the percentages here are already resolved against the running
     * base, so the UI and the PDF just print them.
     */
    discounts: AppliedDiscount[];
    // Pre-VAT total BEFORE any document-level discount.
    netBeforeDiscounts: number;
    // Combined effect of every document discount, on the net.
    totalDiscountAmount: number;
    combinedDiscountPercent: number;
    // Pre-VAT total after the document discounts.
    netTotal: number;
    // VAT amount after the discounts (scaled proportionally per line rate).
    vatTotal: number;
    // Post-VAT grand total.
    grossTotal: number;
}

/**
 * Offer footer figures. `documentDiscounts` is the tender's stacked discount
 * list; VAT is reduced by exactly the same factor as the net, so the ratio
 * between the two never changes when a discount is added.
 */
export const computeTenderPricingSummary = (
    rows: SimpleTenderLine[],
    fallbackTaxRate: number,
    documentDiscounts: TenderDiscountEntry[] = [],
): TenderPricingSummary => {
    const productRows = rows.filter((row) => row.kind === 'PRODUCT');
    const discounts = productRows.map((row) => Number(row.position.discount || 0));
    const averageDiscount = discounts.length
        ? discounts.reduce((sum, value) => sum + value, 0) / discounts.length
        : 0;

    const netBefore = productRows.reduce((sum, row) => sum + lineNetTotal(row.position), 0);
    const grossBefore = productRows.reduce((sum, row) => sum + lineTotal(row.position, fallbackTaxRate), 0);
    const vatBefore = grossBefore - netBefore;

    const breakdown = applyDiscounts(netBefore, documentDiscounts);
    const netFactor = netBefore > 0 ? breakdown.remaining / netBefore : 1;
    const netTotal = breakdown.remaining;
    const vatTotal = vatBefore * netFactor;

    return {
        productLineCount: productRows.length,
        averageDiscount,
        discounts: breakdown.applied,
        netBeforeDiscounts: netBefore,
        totalDiscountAmount: breakdown.totalAmount,
        combinedDiscountPercent: breakdown.combinedPercent,
        netTotal,
        vatTotal,
        grossTotal: netTotal + vatTotal,
    };
};

export const formatDiscountPercent = (value: number): string =>
    `${(Math.round(value * 10) / 10).toLocaleString('de-CH')}%`;
