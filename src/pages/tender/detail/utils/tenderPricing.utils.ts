import type { SimpleTenderLine } from '../types/tenderDetail.types';
import { lineNetTotal, lineTotal } from './tenderCalculation.utils';

export interface TenderPricingSummary {
    productLineCount: number;
    // Simple mean of the product lines' discount percentages.
    averageDiscount: number;
    // Document-level direct discount (%) applied on top of the line discounts.
    directDiscount: number;
    netBeforeDirectDiscount: number;
    directDiscountAmount: number;
    // Pre-VAT total after the direct discount.
    netTotal: number;
    // VAT amount after the direct discount (scaled proportionally per line rate).
    vatTotal: number;
    // Post-VAT grand total.
    grossTotal: number;
}

export const computeTenderPricingSummary = (
    rows: SimpleTenderLine[],
    fallbackTaxRate: number,
    directDiscountRaw?: number | null,
): TenderPricingSummary => {
    const productRows = rows.filter((row) => row.kind === 'PRODUCT');
    const discounts = productRows.map((row) => Number(row.position.discount || 0));
    const averageDiscount = discounts.length
        ? discounts.reduce((sum, value) => sum + value, 0) / discounts.length
        : 0;

    const netBefore = productRows.reduce((sum, row) => sum + lineNetTotal(row.position), 0);
    const grossBefore = productRows.reduce((sum, row) => sum + lineTotal(row.position, fallbackTaxRate), 0);
    const vatBefore = grossBefore - netBefore;

    const directDiscount = Math.min(100, Math.max(0, Number(directDiscountRaw || 0)));
    const factor = 1 - directDiscount / 100;
    const netTotal = netBefore * factor;
    const vatTotal = vatBefore * factor;

    return {
        productLineCount: productRows.length,
        averageDiscount,
        directDiscount,
        netBeforeDirectDiscount: netBefore,
        directDiscountAmount: netBefore - netTotal,
        netTotal,
        vatTotal,
        grossTotal: netTotal + vatTotal,
    };
};

export const formatDiscountPercent = (value: number): string =>
    `${(Math.round(value * 10) / 10).toLocaleString('de-CH')}%`;
