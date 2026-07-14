import { formatMoney, DEFAULT_CURRENCY } from '../../../../utils/currency';

// Currency-agnostic default formatter (CHF). Reactive, offer-aware formatting
// lives in `useMoneyFormat` — components inside the offer detail should use that
// hook so amounts follow the offer's selected currency.
export const fmtMoney = (v: number) => formatMoney(v, DEFAULT_CURRENCY);

export const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 4 }).format(v);

export const fmtVatRate = (v: number) =>
    new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
