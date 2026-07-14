// Currency types an offer can be denominated in. Symbol-only: switching the
// currency changes how amounts are *displayed*, it does not convert them via an
// exchange rate (the entered figures are treated as already being in the target
// currency).
export const CURRENCY_CODES = ['CHF', 'EUR', 'USD', 'GBP', 'TRY'] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const DEFAULT_CURRENCY: CurrencyCode = 'CHF';

// Short glyphs for compact UI (the dropdown, chips). The full monetary format
// still comes from Intl in `formatMoney`.
export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
    CHF: 'CHF',
    EUR: '€',
    USD: '$',
    GBP: '£',
    TRY: '₺',
};

export const isCurrencyCode = (value: unknown): value is CurrencyCode =>
    typeof value === 'string' && (CURRENCY_CODES as readonly string[]).includes(value);

/** Normalise any stored/optimistic value to a valid code, falling back to CHF. */
export const toCurrencyCode = (value: unknown): CurrencyCode =>
    isCurrencyCode(value) ? value : DEFAULT_CURRENCY;

// Swiss number layout ('1'234.00') is kept regardless of currency so the offer
// reads consistently; only the currency glyph changes. `narrowSymbol` yields €,
// $, £, ₺ where available and falls back to "CHF" for the franc.
export const formatMoney = (v: number, currency: CurrencyCode | string = DEFAULT_CURRENCY): string => {
    const code = toCurrencyCode(currency);
    return new Intl.NumberFormat('de-CH', {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 2,
    }).format(v);
};
