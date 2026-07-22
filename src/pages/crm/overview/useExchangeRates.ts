import { useEffect, useState } from 'react';
import { apiClient } from '../../../lib/axios';
import { toCurrencyCode, type CurrencyCode } from '../../../utils/currency';

/* CHF-based conversion table: 1 CHF = RATES[code] units of `code`.
   The static values only bridge the gap until the backend FX proxy answers
   (GET /fx/rates — the browser cannot call the ECB feed directly due to CORS). */
const FALLBACK_RATES: Record<CurrencyCode, number> = {
    CHF: 1,
    EUR: 1.06,
    USD: 1.24,
    GBP: 0.9,
    TRY: 52,
};

const CACHE_KEY = 'crmOverview.fxRates.v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CachedRates {
    fetchedAt: number;
    rates: Record<string, number>;
}

const readCache = (): CachedRates | null => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedRates;
        if (!parsed?.rates || Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
};

export interface ExchangeState {
    rates: Record<CurrencyCode, number>;
    /** true once real ECB rates replaced the static fallback. */
    live: boolean;
    convert: (amount: number, from?: string | null, to?: CurrencyCode) => number;
}

/** CHF/EUR/USD/GBP/TRY conversion backed by the free ECB feed (frankfurter.app). */
export const useExchangeRates = (displayCurrency: CurrencyCode): ExchangeState => {
    const [rates, setRates] = useState<Record<CurrencyCode, number>>(() => {
        const cached = readCache();
        return cached ? { ...FALLBACK_RATES, ...cached.rates } as Record<CurrencyCode, number> : FALLBACK_RATES;
    });
    const [live, setLive] = useState(() => readCache() !== null);

    useEffect(() => {
        if (readCache()) return;
        let cancelled = false;
        apiClient
            .get('/fx/rates')
            .then((res) => {
                const data = res.data as { rates?: Record<string, number> };
                if (cancelled || !data?.rates) return;
                const next = { ...FALLBACK_RATES, ...data.rates, CHF: 1 } as Record<CurrencyCode, number>;
                setRates(next);
                setLive(true);
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), rates: data.rates }));
                } catch {
                    /* cache is best-effort */
                }
            })
            .catch(() => {
                /* backend down / upstream unreachable — the static table keeps the UI usable */
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const convert = (amount: number, from?: string | null, to: CurrencyCode = displayCurrency) => {
        const src = toCurrencyCode(from);
        if (!Number.isFinite(amount)) return 0;
        return (amount / rates[src]) * rates[to];
    };

    return { rates, live, convert };
};
