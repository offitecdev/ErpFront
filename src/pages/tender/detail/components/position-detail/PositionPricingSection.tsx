import React, { useState } from 'react';

import { Field, Input } from '../../../../../components/ui-shared/Field';
import type { CostInput } from '../../../../../types/tender';
import { fmtVatRate } from '../../tenderDetailUtils';
import { parseInlineNumber } from '../../utils/tenderLine.utils';
import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { AutoFitAmount } from '../common/AutoFitAmount';
import { t } from '@/i18n/translate';

type PositionPricing = {
    quantity: number;
    unit: string;
    unitPrice: number;
    discount: number;
    taxRate: number;
};

const LINE_DISCOUNT_MODE_KEY = 'offitec:tender-detail:line-discount-mode';
type LineDiscountMode = 'percent' | 'amount';

const readStoredLineDiscountMode = (): LineDiscountMode => {
    try {
        return localStorage.getItem(LINE_DISCOUNT_MODE_KEY) === 'amount' ? 'amount' : 'percent';
    } catch {
        return 'percent';
    }
};

const round2 = (value: number) => Math.round(value * 100) / 100;
// Amount → percent conversions keep 6 decimals so the recomputed amount lands
// back on the typed value to the cent; displays still round to 2.
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export const PositionPricingSection: React.FC<{
    isDraft: boolean;
    isArticle?: boolean;
    pricing: PositionPricing;
    updatePricing: (patch: Partial<PositionPricing>) => void;
    cost: CostInput;
    setCost: React.Dispatch<React.SetStateAction<CostInput>>;
    effectiveVat: number;
    pricingGross: number;
    pricingDiscountAmount: number;
    pricingTaxBase: number;
    pricingTaxAmount: number;
    pricingTotalWithTax: number;
    autoSaveDirty: boolean;
    saving: boolean;
}> = ({
    isDraft,
    isArticle,
    pricing,
    updatePricing,
    cost,
    setCost,
    effectiveVat,
    pricingGross,
    pricingDiscountAmount,
    pricingTaxBase,
    pricingTaxAmount,
    pricingTotalWithTax,
    autoSaveDirty,
    saving,
}) => {
    const fmtMoney = useMoneyFormat();
    // The discount is stored as a percentage of the unit price; "amount" mode
    // lets the user type an absolute per-unit amount (capped at the unit price)
    // which is converted to its percentage equivalent on entry.
    const [discountMode, setDiscountMode] = useState<LineDiscountMode>(readStoredLineDiscountMode);
    const switchDiscountMode = (next: LineDiscountMode) => {
        setDiscountMode(next);
        try {
            localStorage.setItem(LINE_DISCOUNT_MODE_KEY, next);
        } catch {
            /* persistence is best-effort */
        }
    };
    // Draft so the % field can stay live-committing while accepting "12,5" or
    // "12.5" as typed text (a number input would render the browser locale's
    // decimal comma, clashing with the app-wide de-CH dot formatting).
    const [discountPctDraft, setDiscountPctDraft] = useState<string | null>(null);
    const commitDiscountAmount = (raw: string) => {
        const amount = parseInlineNumber(raw, pricing.unitPrice);
        updatePricing({ discount: pricing.unitPrice > 0 ? round6((amount / pricing.unitPrice) * 100) : 0 });
    };
    const discountModeButtonClass = (active: boolean) =>
        `rounded px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors ${
            active ? 'bg-[#1f2654] text-white' : 'text-slate-500 hover:bg-white hover:text-[#1f2654]'
        }`;
    return (
    <div className="border border-slate-200/70 rounded-md p-3 bg-white space-y-2.5">
        <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('tenders.line_price')}</h4>
            <span className="text-[10px] text-slate-400">{t('tenders.tabloya_yansir')}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <Field label={t('common.quantity')} className="sm:col-span-2">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        disabled={!isDraft}
                        onClick={() => updatePricing({ quantity: Math.max(0, pricing.quantity - 1) })}
                        className="w-6 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 flex items-center justify-center text-sm leading-none disabled:opacity-50"
                    >−</button>
                    <Input
                        type="number"
                        step="1"
                        min={0}
                        value={pricing.quantity}
                        onChange={(e) => updatePricing({ quantity: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        disabled={!isDraft}
                        className="text-center"
                    />
                    <button
                        type="button"
                        disabled={!isDraft}
                        onClick={() => updatePricing({ quantity: pricing.quantity + 1 })}
                        className="w-6 h-7 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-500 flex items-center justify-center text-sm leading-none disabled:opacity-50"
                    >+</button>
                </div>
            </Field>
            {!isArticle && (
                <>
                    <Field label={t('tenders.unit')} className="sm:col-span-2">
                        <Input
                            value={pricing.unit}
                            placeholder={t('tenders.stk_m_kg')}
                            onChange={(e) => updatePricing({ unit: e.target.value })}
                            disabled={!isDraft}
                        />
                    </Field>
                    <Field label={t('tenders.unit_price_chf')} className="sm:col-span-4">
                        <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={pricing.unitPrice}
                            onChange={(e) => updatePricing({ unitPrice: parseFloat(e.target.value) || 0 })}
                            disabled={!isDraft}
                        />
                    </Field>
                </>
            )}
            <Field label={t('tenders.discount')} className="sm:col-span-2">
                <div className="flex items-center gap-1.5">
                    {discountMode === 'percent' ? (
                        <Input
                            type="text"
                            inputMode="decimal"
                            value={discountPctDraft ?? (pricing.discount ? String(round2(pricing.discount)) : '')}
                            onChange={(e) => {
                                setDiscountPctDraft(e.target.value);
                                updatePricing({ discount: parseInlineNumber(e.target.value, 100) });
                            }}
                            onBlur={() => setDiscountPctDraft(null)}
                            disabled={!isDraft}
                        />
                    ) : (
                        <Input
                            key={`amt-${pricing.discount}-${pricing.unitPrice}`}
                            type="text"
                            inputMode="decimal"
                            defaultValue={pricing.discount > 0 ? String(round2((pricing.unitPrice * pricing.discount) / 100)) : ''}
                            onBlur={(e) => {
                                // Untouched field → nothing to commit (display is rounded).
                                if (e.target.value !== e.target.defaultValue) commitDiscountAmount(e.target.value);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            disabled={!isDraft}
                        />
                    )}
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
                        <button
                            type="button"
                            title={t('tenders.discount_mode_percent')}
                            aria-pressed={discountMode === 'percent'}
                            onClick={() => switchDiscountMode('percent')}
                            className={discountModeButtonClass(discountMode === 'percent')}
                        >
                            %
                        </button>
                        <button
                            type="button"
                            title={t('tenders.discount_mode_amount_unit')}
                            aria-pressed={discountMode === 'amount'}
                            onClick={() => switchDiscountMode('amount')}
                            className={discountModeButtonClass(discountMode === 'amount')}
                        >
                            {t('tenders.discount_mode_amount_short')}
                        </button>
                    </span>
                </div>
                {discountMode === 'amount' && pricing.discount > 0 && (
                    <div className="mt-1 text-[10.5px] tabular-nums text-slate-400">= {round2(pricing.discount)}%</div>
                )}
            </Field>
            {!isArticle && (
                <Field label={t('tenders.additional_cost')}>
                    <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={cost.additionalCost}
                        onChange={(e) => setCost({ ...cost, additionalCost: parseFloat(e.target.value) || 0 })}
                        disabled={!isDraft}
                    />
                </Field>
            )}
            <Field label={t('tenders.kdv_fixed')} className="sm:col-span-2">
                <div className="flex items-center gap-2 h-[34px] px-2.5 rounded border border-slate-200 bg-slate-50 cursor-not-allowed">
                    <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono"
                    >
                        %{fmtVatRate(effectiveVat)}
                    </span>
                    <span className="text-[11px] text-slate-500">{t('tenders.fixed_rate_applies_to_each_product')}</span>
                </div>
            </Field>
        </div>

        {/* Live summary */}
        <div className="border-t border-slate-100 pt-2 space-y-1 text-[11.5px]">
            <div className="flex items-center justify-between gap-2 text-slate-500">
                <span className="shrink-0">{t('tenders.brut')}{pricing.quantity} × {fmtMoney(pricing.unitPrice)})</span>
                <AutoFitAmount value={fmtMoney(pricingGross)} basePx={11.5} className="font-mono" />
            </div>
            {pricing.discount > 0 && (
                <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span className="shrink-0">{t('tenders.discount')}{pricing.discount}%)</span>
                    <AutoFitAmount value={`−${fmtMoney(pricingDiscountAmount)}`} basePx={11.5} className="font-mono text-red-600" />
                </div>
            )}
            {!isArticle && (
                <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span className="shrink-0">{t('tenders.additional_cost')}</span>
                    <AutoFitAmount value={`${cost.additionalCost > 0 ? '+' : ''}${fmtMoney(cost.additionalCost)}`} basePx={11.5} className="font-mono" />
                </div>
            )}
            <div className="flex items-center justify-between gap-2 font-semibold text-slate-700">
                <span className="shrink-0">{t('tenders.net_amount')}</span>
                <AutoFitAmount value={fmtMoney(pricingTaxBase)} basePx={11.5} className="font-mono" />
            </div>
            <div className="flex items-center justify-between gap-2 text-slate-500">
                <span className="flex shrink-0 items-center gap-1">
                    KDV
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono">
                        %{fmtVatRate(effectiveVat)}
                    </span>
                </span>
                <AutoFitAmount value={`+${fmtMoney(pricingTaxAmount)}`} basePx={11.5} className="font-mono" />
            </div>
            <div className="flex items-center justify-between gap-2 font-semibold text-blue-800 border-t border-slate-100 pt-1">
                <span className="shrink-0">{t('tenders.total_kdv_dahil')}</span>
                <AutoFitAmount value={fmtMoney(pricingTotalWithTax)} basePx={11.5} className="font-mono" />
            </div>
        </div>

        {autoSaveDirty && (
            <div className="text-[10px] text-slate-400 text-right">
                {saving ? 'Kaydediliyor...' : t('tenders.otomatik_kaydedilecek')}
            </div>
        )}
    </div>
    );
};
