import { t } from '@/i18n/translate';

import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { formatDiscountPercent, type TenderPricingSummary } from '../../utils/tenderPricing.utils';

type TenderPriceSummaryProps = {
    summary: TenderPricingSummary;
    canEdit: boolean;
    onDirectDiscountChange: (value: number) => void;
};

// Plain footer at the bottom of the quote lines (inside the same card, not a
// separate card): discount on the price, amount excl. VAT, VAT amount and the
// final total incl. VAT.
export const TenderPriceSummary = ({ summary, canEdit, onDirectDiscountChange }: TenderPriceSummaryProps) => {
    const fmtMoney = useMoneyFormat();
    const commitDirectDiscount = (raw: string) => {
        const value = Math.min(100, Math.max(0, Number(raw) || 0));
        if (value !== summary.directDiscount) onDirectDiscountChange(value);
    };

    return (
        <div className="px-3 py-3">
            <div className="ml-auto w-full max-w-sm space-y-1 text-[12.5px]">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">{t('tenders.direct_discount')}</span>
                    <span className="flex items-center gap-2">
                        {summary.directDiscountAmount > 0 && (
                            <span className="tabular-nums text-rose-600">−{fmtMoney(summary.directDiscountAmount)}</span>
                        )}
                        {canEdit ? (
                            <span className="inline-flex items-center gap-1">
                                <input
                                    key={summary.directDiscount}
                                    aria-label={t('tenders.direct_discount')}
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.1"
                                    defaultValue={summary.directDiscount || ''}
                                    onBlur={(event) => commitDirectDiscount(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            (event.target as HTMLInputElement).blur();
                                        }
                                    }}
                                    className="w-16 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-right text-[12px] tabular-nums text-slate-800 outline-none transition-colors focus:border-[#1f2654]"
                                />
                                <span className="text-slate-400">%</span>
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
