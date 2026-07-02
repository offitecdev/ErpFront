import React from 'react';

import { Field, Input } from '../../../../../components/ui-shared/Field';
import type { CostInput } from '../../../../../types/tender';
import { fmtMoney, fmtVatRate } from '../../tenderDetailUtils';
import { t } from '@/i18n/translate';

type PositionPricing = {
    quantity: number;
    unit: string;
    unitPrice: number;
    discount: number;
    taxRate: number;
};

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
}) => (
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
                <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={pricing.discount}
                    onChange={(e) => updatePricing({ discount: parseFloat(e.target.value) || 0 })}
                    disabled={!isDraft}
                />
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
            <div className="flex items-center justify-between text-slate-500">
                <span>{t('tenders.brut')}{pricing.quantity} × {fmtMoney(pricing.unitPrice)})</span>
                <span className="font-mono">{fmtMoney(pricingGross)}</span>
            </div>
            {pricing.discount > 0 && (
                <div className="flex items-center justify-between text-slate-500">
                    <span>{t('tenders.discount')}{pricing.discount}%)</span>
                    <span className="font-mono text-red-600">−{fmtMoney(pricingDiscountAmount)}</span>
                </div>
            )}
            {!isArticle && (
                <div className="flex items-center justify-between text-slate-500">
                    <span>{t('tenders.additional_cost')}</span>
                    <span className="font-mono">{cost.additionalCost > 0 ? '+' : ''}{fmtMoney(cost.additionalCost)}</span>
                </div>
            )}
            <div className="flex items-center justify-between font-semibold text-slate-700">
                <span>{t('tenders.net_amount')}</span>
                <span className="font-mono">{fmtMoney(pricingTaxBase)}</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
                <span className="flex items-center gap-1">
                    KDV
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono">
                        %{fmtVatRate(effectiveVat)}
                    </span>
                </span>
                <span className="font-mono">+{fmtMoney(pricingTaxAmount)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold text-blue-800 border-t border-slate-100 pt-1">
                <span>{t('tenders.total_kdv_dahil')}</span>
                <span className="font-mono">{fmtMoney(pricingTotalWithTax)}</span>
            </div>
        </div>

        {autoSaveDirty && (
            <div className="text-[10px] text-slate-400 text-right">
                {saving ? 'Kaydediliyor...' : t('tenders.otomatik_kaydedilecek')}
            </div>
        )}
    </div>
);
