import { useState } from 'react';

import { t } from '@/i18n/translate';

import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { formatDiscountPercent, type TenderPricingSummary } from '../../utils/tenderPricing.utils';
import { parseInlineNumber } from '../../utils/tenderLine.utils';

type TenderPriceSummaryProps = {
    summary: TenderPricingSummary;
    canEdit: boolean;
    /** Custom display name for the direct discount (null → default label). */
    discountLabel?: string | null;
    onDirectDiscountChange: (value: number) => void;
    onDiscountLabelChange: (value: string | null) => void;
};

const DISCOUNT_MODE_KEY = 'offitec:tender-detail:direct-discount-mode';

type DiscountMode = 'percent' | 'amount';

const readStoredMode = (): DiscountMode => {
    try {
        return localStorage.getItem(DISCOUNT_MODE_KEY) === 'amount' ? 'amount' : 'percent';
    } catch {
        return 'percent';
    }
};

const round2 = (value: number) => Math.round(value * 100) / 100;
// Conversion precision: an amount → percent conversion keeps 6 decimals so the
// amount recomputed from the stored percent lands back on the typed value to
// the cent. Displays still round to 2 decimals.
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

// Plain footer at the bottom of the quote lines (inside the same card, not a
// separate card): discount on the price, amount excl. VAT, VAT amount and the
// final total incl. VAT. The discount row's name is editable (e.g. a campaign
// name like "Winteraktion") and its value can be entered as a percentage or as
// an absolute amount capped at the pre-discount net total; either way it is
// stored as a percentage, so totals stay proportional if lines change later.
export const TenderPriceSummary = ({ summary, canEdit, discountLabel, onDirectDiscountChange, onDiscountLabelChange }: TenderPriceSummaryProps) => {
    const fmtMoney = useMoneyFormat();
    const [mode, setMode] = useState<DiscountMode>(readStoredMode);

    const switchMode = (next: DiscountMode) => {
        setMode(next);
        try {
            localStorage.setItem(DISCOUNT_MODE_KEY, next);
        } catch {
            /* persistence is best-effort */
        }
    };

    const commitDirectDiscount = (raw: string) => {
        // parseInlineNumber accepts both "49.99" and "49,99" (and 1'000 apostrophes).
        let percent: number;
        if (mode === 'amount') {
            const amount = parseInlineNumber(raw, summary.netBeforeDirectDiscount);
            percent = summary.netBeforeDirectDiscount > 0
                ? round6((amount / summary.netBeforeDirectDiscount) * 100)
                : 0;
        } else {
            percent = parseInlineNumber(raw, 100);
        }
        if (percent !== summary.directDiscount) onDirectDiscountChange(percent);
    };

    const commitLabel = (raw: string) => {
        const next = raw.trim().slice(0, 80) || null;
        if (next !== (discountLabel || null)) onDiscountLabelChange(next);
    };

    const displayLabel = (discountLabel || '').trim() || t('tenders.direct_discount');
    const modeButtonClass = (active: boolean) =>
        `rounded px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors ${
            active ? 'bg-[#1f2654] text-white' : 'text-slate-500 hover:bg-white hover:text-[#1f2654]'
        }`;

    return (
        <div className="px-3 py-3">
            <div className="ml-auto w-full max-w-sm space-y-1 text-[12.5px]">
                <div className="flex items-center justify-between gap-3">
                    {canEdit ? (
                        <input
                            key={discountLabel || ''}
                            aria-label={t('tenders.discount_name')}
                            type="text"
                            maxLength={80}
                            defaultValue={discountLabel || ''}
                            placeholder={t('tenders.direct_discount')}
                            onBlur={(event) => commitLabel(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    (event.target as HTMLInputElement).blur();
                                }
                            }}
                            title={t('tenders.discount_name_hint')}
                            className="w-32 min-w-0 flex-1 rounded-md border border-slate-200/80 bg-transparent px-1.5 py-0.5 text-[12px] text-slate-600 outline-none transition-colors placeholder:text-slate-400 focus:border-[#1f2654] focus:bg-white"
                        />
                    ) : (
                        <span className="text-slate-500">{displayLabel}</span>
                    )}
                    <span className="flex items-center gap-2">
                        {summary.directDiscountAmount > 0 && (
                            <span className="whitespace-nowrap tabular-nums text-rose-600">−{fmtMoney(summary.directDiscountAmount)}</span>
                        )}
                        {canEdit ? (
                            <span className="inline-flex items-center gap-1">
                                {/* Text inputs with decimal keypad: type="number" would render
                                    the value with the browser locale's decimal comma, clashing
                                    with the app-wide de-CH dot formatting. */}
                                {mode === 'percent' ? (
                                    <input
                                        key={`pct-${summary.directDiscount}`}
                                        aria-label={displayLabel}
                                        type="text"
                                        inputMode="decimal"
                                        defaultValue={summary.directDiscount ? String(round2(summary.directDiscount)) : ''}
                                        onBlur={(event) => {
                                            // Untouched field → nothing to commit (the display is
                                            // rounded; re-committing it would clobber precision).
                                            if (event.target.value !== event.target.defaultValue) commitDirectDiscount(event.target.value);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                (event.target as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="w-16 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[12px] tabular-nums text-slate-800 outline-none transition-colors focus:border-[#1f2654]"
                                    />
                                ) : (
                                    <input
                                        key={`amt-${summary.directDiscount}-${round2(summary.netBeforeDirectDiscount)}`}
                                        aria-label={displayLabel}
                                        type="text"
                                        inputMode="decimal"
                                        defaultValue={summary.directDiscountAmount > 0 ? String(round2(summary.directDiscountAmount)) : ''}
                                        onBlur={(event) => {
                                            if (event.target.value !== event.target.defaultValue) commitDirectDiscount(event.target.value);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                (event.target as HTMLInputElement).blur();
                                            }
                                        }}
                                        className="w-24 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[12px] tabular-nums text-slate-800 outline-none transition-colors focus:border-[#1f2654]"
                                    />
                                )}
                                {/* %/amount entry toggle. An amount is converted to its
                                    percentage equivalent before saving. */}
                                <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
                                    <button
                                        type="button"
                                        title={t('tenders.discount_mode_percent')}
                                        aria-pressed={mode === 'percent'}
                                        onClick={() => switchMode('percent')}
                                        className={modeButtonClass(mode === 'percent')}
                                    >
                                        %
                                    </button>
                                    <button
                                        type="button"
                                        title={t('tenders.discount_mode_amount')}
                                        aria-pressed={mode === 'amount'}
                                        onClick={() => switchMode('amount')}
                                        className={modeButtonClass(mode === 'amount')}
                                    >
                                        {t('tenders.discount_mode_amount_short')}
                                    </button>
                                </span>
                                {mode === 'amount' && (
                                    <span className="whitespace-nowrap text-[11px] tabular-nums text-slate-400">
                                        = {formatDiscountPercent(summary.directDiscount)}
                                    </span>
                                )}
                            </span>
                        ) : (
                            <span className="font-medium tabular-nums text-slate-700">{formatDiscountPercent(summary.directDiscount)}</span>
                        )}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t('tenders.subtotal_excl_vat')}</span>
                    <span className="font-mono font-medium tabular-nums text-slate-800">{fmtMoney(summary.netTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t('tenders.vat_amount')}</span>
                    <span className="font-mono font-medium tabular-nums text-slate-800">{fmtMoney(summary.vatTotal)}</span>
                </div>
                {/* No rule above the final total — the weight of the figure itself
                    separates it from the rows above. */}
                <div className="flex items-center justify-between pt-1">
                    <span className="font-semibold text-slate-700">{t('tenders.total_incl_vat')}</span>
                    <span className="font-mono text-[13.5px] font-bold tabular-nums text-slate-900">{fmtMoney(summary.grossTotal)}</span>
                </div>
            </div>
        </div>
    );
};
