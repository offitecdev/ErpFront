import { useMemo } from 'react';
import { useTenderStore } from '../../../../store/tenderStore';
import { formatMoney, toCurrencyCode, type CurrencyCode } from '../../../../utils/currency';

/**
 * Currency of the offer currently open in the detail store. Components rendered
 * inside the tender detail all operate on this single active tender, so reading
 * it from the store keeps every amount in sync without threading props.
 */
export const useTenderCurrency = (): CurrencyCode => {
    const currency = useTenderStore((s) => (s.detail?.tender as { currency?: string | null } | undefined)?.currency);
    return toCurrencyCode(currency);
};

/**
 * Returns a `fmtMoney`-compatible formatter bound to the active offer's currency.
 * Drop-in replacement for the static `fmtMoney`: `const fmtMoney = useMoneyFormat();`
 */
export const useMoneyFormat = () => {
    const currency = useTenderCurrency();
    return useMemo(() => (v: number) => formatMoney(v, currency), [currency]);
};
