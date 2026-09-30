import { t } from '@/i18n/translate';
import { isRequestTimeout } from '@/lib/axios';
import { productionBomErrorOf, productionBomErrorText } from '@/lib/api/productionBom';

/* ── Kleine Helfer der Seite «Satın alma» (Mail und PDF macht seit dem 29.09.2026 die Bestellseite selbst). ── */

/** Die Meldung zu einem Fehler — Kennungen der BOM übersetzt, sonst der Text des Bestellwegs. */
export const failureText = (failure: unknown): string => {
    if (isRequestTimeout(failure)) return t('common.mailTimeout');
    if (productionBomErrorOf(failure).code) return productionBomErrorText(failure);
    const message = (failure as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message.trim() ? message : productionBomErrorText(failure);
};

/** Eine Zahl, wie der Mensch sie tippt: «1’234,50», «1234.5» → 1234.5; leer/ungültig → null. */
export const parseAmount = (text: string): number | null => {
    const raw = String(text ?? '').trim().replace(/['’\s]/g, '');
    if (!raw) return null;
    if (!/^[+]?(?:\d[\d.,]*|[.,]\d+)$/.test(raw)) return null;
    const comma = raw.lastIndexOf(',');
    const dot = raw.lastIndexOf('.');
    // Mixed formats: 1.234,50 and 1,234.50. The final separator is decimal.
    const normalized = comma >= 0 && dot >= 0
        ? (comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, ''))
        : comma >= 0 ? raw.replace(',', '.') : raw;
    const value = Number(normalized);
    return Number.isFinite(value) && value >= 0 ? value : null;
};
