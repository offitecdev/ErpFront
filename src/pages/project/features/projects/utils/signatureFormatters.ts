/** Money/number formatting helpers shared across the signature attachment flows. */

export const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(Number(value || 0));

export const numberFmt = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(Number(value || 0));
