import React from 'react';

import { Field, Input } from '../../../../../components/ui-shared/Field';
import type { CostInput } from '../../../../../types/tender';
import { fmtNumber, fmtVatRate, type TreeNode } from '../../tenderDetailUtils';
import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { t } from '@/i18n/translate';

export const PositionAdvancedCostSection: React.FC<{
    isDraft: boolean;
    canCalc: boolean;
    cost: CostInput;
    setCost: React.Dispatch<React.SetStateAction<CostInput>>;
    marginMode: 'amount' | 'percent';
    setMarginMode: React.Dispatch<React.SetStateAction<'amount' | 'percent'>>;
    marginPercent: number;
    setMarginPercent: React.Dispatch<React.SetStateAction<number>>;
    subtotal: number;
    total: number;
    effectiveVat: number;
    totalWithTax: number;
    position: Pick<TreeNode, 'quantity' | 'unit'>;
    unitPrice: number;
}> = ({
    isDraft,
    canCalc,
    cost,
    setCost,
    marginMode,
    setMarginMode,
    marginPercent,
    setMarginPercent,
    subtotal,
    total,
    effectiveVat,
    totalWithTax,
    position,
    unitPrice,
}) => {
    const fmtMoney = useMoneyFormat();
    return (
    <details className="border border-slate-200/70 rounded-[2px] bg-white">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hover:bg-slate-50/60 select-none">{t('tenders.additional_cost_opsiyonel')}</summary>
        <div className="px-3 pb-3 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
                <Field label={t('tenders.material')}>
                    <Input type="number" step="0.01" value={cost.materialCost}
                        onChange={(e) => setCost({ ...cost, materialCost: parseFloat(e.target.value) || 0 })}
                        disabled={!isDraft || !canCalc} />
                </Field>
                <Field label={t('tenders.iscilik')}>
                    <Input type="number" step="0.01" value={cost.laborCost}
                        onChange={(e) => setCost({ ...cost, laborCost: parseFloat(e.target.value) || 0 })}
                        disabled={!isDraft || !canCalc} />
                </Field>
                <Field label={t('tenders.general_gider')}>
                    <Input type="number" step="0.01" value={cost.overheadCost}
                        onChange={(e) => setCost({ ...cost, overheadCost: parseFloat(e.target.value) || 0 })}
                        disabled={!isDraft || !canCalc} />
                </Field>
                <Field label={t('tenders.risk')}>
                    <Input type="number" step="0.01" value={cost.riskAmount}
                        onChange={(e) => setCost({ ...cost, riskAmount: parseFloat(e.target.value) || 0 })}
                        disabled={!isDraft || !canCalc} />
                </Field>
                <Field label={t('tenders.additional_cost')}>
                    <Input type="number" step="0.01" value={cost.additionalCost}
                        onChange={(e) => setCost({ ...cost, additionalCost: parseFloat(e.target.value) || 0 })}
                        disabled={!isDraft || !canCalc} />
                </Field>
            </div>

            <div className="bg-slate-50/60 border border-slate-200/60 rounded-[2px] p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-500">{t('tenders.cost_total_without_margin')}</span>
                    <span className="font-mono font-semibold text-slate-700">{fmtMoney(subtotal)}</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setMarginMode('amount')}
                        className={`flex-1 py-1 text-[11.5px] rounded ${marginMode === 'amount' ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
                    >{t('common.amount')}</button>
                    <button
                        onClick={() => setMarginMode('percent')}
                        className={`flex-1 py-1 text-[11.5px] rounded ${marginMode === 'percent' ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
                    >{t('tenders.yuzde')}</button>
                </div>
                {marginMode === 'amount' ? (
                    <Field label={t('tenders.profit_margin_amount')}>
                        <Input type="number" step="0.01" value={cost.profitMargin}
                            onChange={(e) => setCost({ ...cost, profitMargin: parseFloat(e.target.value) || 0 })}
                            disabled={!isDraft || !canCalc} />
                    </Field>
                ) : (
                    <Field label={t('tenders.profit_margin')}>
                        <Input type="number" step="0.1" value={marginPercent}
                            onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                            disabled={!isDraft || !canCalc} />
                    </Field>
                )}
            </div>

            <div className="bg-blue-50 border border-blue-200/60 rounded-[2px] p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[12px]">
                    <span className="text-blue-900">{t('tenders.hesaplanan_total_price_net')}</span>
                    <span className="font-mono font-bold text-blue-900 text-[14px]">{fmtMoney(total)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">KDV <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200 font-mono">%{fmtVatRate(effectiveVat)}</span></span>
                    <span className="font-mono">+{fmtMoney(total * effectiveVat / 100)}</span>
                </div>
                <div className="flex items-center justify-between text-[12px] pt-1 border-t border-blue-200/40">
                    <span className="text-blue-900 font-semibold">{t('tenders.total_kdv_dahil')}</span>
                    <span className="font-mono font-bold text-blue-900">{fmtMoney(totalWithTax)}</span>
                </div>
                {position.quantity > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-blue-700/80 mt-1">
                        <span>{t('tenders.unit_price')}{fmtNumber(position.quantity)} {position.unit || ''})</span>
                        <span className="font-mono">{fmtMoney(unitPrice)}</span>
                    </div>
                )}
            </div>

        </div>
    </details>
    );
};
