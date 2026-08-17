import { Percent01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { formatDiscountPercent, type TenderPricingSummary } from '../../utils/tenderPricing.utils';
import { discountDisplayName } from '../../utils/tenderDiscounts.utils';

type TenderPriceSummaryProps = {
    summary: TenderPricingSummary;
    canEdit: boolean;
    /** Opens the document-total discount pop-up. */
    onOpenDiscounts: () => void;
};

/**
 * Plain footer at the bottom of the quote lines (inside the same card, not a
 * separate card): the document-level discounts, amount excl. VAT, VAT amount
 * and the final total incl. VAT.
 *
 * The discounts are READ-ONLY here — they are edited in the pop-up behind
 * "Apply discount", because a stack of named percentage/amount entries no
 * longer fits inline. Each row is printed in the order it is applied; every
 * entry works on what the ones above it left over.
 */
export const TenderPriceSummary = ({ summary, canEdit, onOpenDiscounts }: TenderPriceSummaryProps) => {
    const fmtMoney = useMoneyFormat();
    const hasDiscounts = summary.discounts.some((entry) => entry.amount > 0);
    const showCombined = summary.discounts.filter((entry) => entry.amount > 0).length > 1;

    return (
        <div className="flex justify-end border-t border-slate-200 bg-slate-50">
            {/* Sits flush in the table's bottom-right corner — same hairlines, so
                the totals read as the table's last block rather than a card
                floating under it. */}
            <div className="w-full max-w-[330px] space-y-0.5 border-l border-slate-200 bg-white px-3 py-2 text-[12.5px]">
                {hasDiscounts && (
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">{t('tenders.subtotal_excl_vat')}</span>
                        <span className="tabular-nums text-slate-600">{fmtMoney(summary.netBeforeDiscounts)}</span>
                    </div>
                )}
                {summary.discounts.map((entry, index) => (
                    entry.amount > 0 ? (
                        <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-slate-500" title={discountDisplayName(entry, index)}>
                                {discountDisplayName(entry, index)}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                                <span className="whitespace-nowrap tabular-nums text-rose-600">−{fmtMoney(entry.amount)}</span>
                                <span className="font-medium tabular-nums text-slate-500">{formatDiscountPercent(entry.percent)}</span>
                            </span>
                        </div>
                    ) : null
                ))}
                {showCombined && (
                    <div className="flex items-center justify-between gap-3 border-t border-dashed border-slate-200 pt-1">
                        <span className="font-medium text-slate-600">{t('tenders.total_discount')}</span>
                        <span className="flex items-center gap-2">
                            <span className="whitespace-nowrap font-medium tabular-nums text-rose-600">
                                −{fmtMoney(summary.totalDiscountAmount)}
                            </span>
                            <span className="font-medium tabular-nums text-slate-700">
                                {formatDiscountPercent(summary.combinedDiscountPercent)}
                            </span>
                        </span>
                    </div>
                )}
                {canEdit && (
                    <div className="pt-0.5 pb-1">
                        <button
                            type="button"
                            onClick={onOpenDiscounts}
                            className="inline-flex items-center gap-1.5 rounded-[2px] border border-slate-200 px-2 py-1 text-[11.5px] font-semibold text-[#1f2654] transition-colors hover:border-[#1f2654] hover:bg-[#1f2654]/[0.06]"
                        >
                            <Percent01 size={12} />
                            {t('tenders.apply_discount')}
                        </button>
                    </div>
                )}
                {/* Figures are right-aligned and tabular so the amounts stack
                    into one readable column of digits. */}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">{t('tenders.net_total')}</span>
                    <span className="font-medium tabular-nums text-slate-800">{fmtMoney(summary.netTotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">{t('tenders.vat_amount')}</span>
                    <span className="font-medium tabular-nums text-slate-800">{fmtMoney(summary.vatTotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 pb-0.5">
                    <span className="text-[13px] font-bold text-slate-700">{t('tenders.total_incl_vat')}</span>
                    <span className="text-[17px] font-extrabold tabular-nums text-slate-900">{fmtMoney(summary.grossTotal)}</span>
                </div>
            </div>
        </div>
    );
};
