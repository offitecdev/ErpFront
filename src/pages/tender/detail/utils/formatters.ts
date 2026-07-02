export const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

export const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 4 }).format(v);

export const fmtVatRate = (v: number) =>
    new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
