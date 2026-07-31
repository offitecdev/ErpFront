import { useState } from 'react';
import { Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { AnchoredPopup } from '../common/AnchoredPopup';
import { useMoneyFormat } from '../../utils/useMoneyFormat';
import {
    applyDiscounts,
    formatDiscountValue,
    type TenderDiscountEntry,
} from '../../utils/tenderDiscounts.utils';

type TenderLineDiscountButtonProps = {
    /** The line's stacked discounts (empty → the button is the grey "+"). */
    entries: TenderDiscountEntry[];
    /** Quantity × unit price — the base the stack is applied to. */
    base: number;
    /** Opens the full editor. */
    onEdit: () => void;
};

/**
 * The small square in the quote's discount column.
 *
 * Grey "+"  → the line has no stacked discounts; clicking opens the editor.
 * Green [n] → discounts are active; clicking reveals them as a compact list
 *             (VALUES ONLY — the table has no room for names, which is what the
 *             PDF prints instead), with an edit action to open the editor.
 */
export const TenderLineDiscountButton = ({ entries, base, onEdit }: TenderLineDiscountButtonProps) => {
    const fmtMoney = useMoneyFormat();
    const [listAnchor, setListAnchor] = useState<HTMLElement | null>(null);
    const hasDiscounts = entries.length > 0;
    const breakdown = hasDiscounts ? applyDiscounts(base, entries) : null;

    const openEditor = () => {
        setListAnchor(null);
        onEdit();
    };

    return (
        <>
            <button
                type="button"
                aria-label={hasDiscounts ? t('tenders.product_discounts') : t('tenders.discount_add')}
                title={hasDiscounts ? t('tenders.product_discounts') : t('tenders.discount_add')}
                onClick={(event) => {
                    event.stopPropagation();
                    if (!hasDiscounts) {
                        onEdit();
                        return;
                    }
                    // Capture before the updater runs — React nulls currentTarget
                    // after dispatch and the popup needs a live anchor to measure.
                    const anchor = event.currentTarget;
                    setListAnchor((current) => (current ? null : anchor));
                }}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[2px] border text-[10px] font-bold leading-none tabular-nums transition-colors ${
                    hasDiscounts
                        ? 'border-emerald-300 bg-emerald-100 text-emerald-700 hover:border-emerald-500 hover:bg-emerald-200'
                        : 'border-slate-200 bg-slate-100 text-slate-400 hover:border-[#1f2654] hover:bg-slate-200 hover:text-[#1f2654]'
                }`}
            >
                {hasDiscounts ? entries.length : <Plus size={11} />}
            </button>

            {listAnchor && breakdown && (
                <AnchoredPopup
                    anchorEl={listAnchor}
                    onClose={() => setListAnchor(null)}
                    width={200}
                    estimatedHeight={180}
                >
                    <div onClick={(event) => event.stopPropagation()}>
                        <ul className="divide-y divide-slate-100">
                            {breakdown.applied.map((entry, index) => (
                                <li
                                    key={index}
                                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11.5px]"
                                >
                                    <span className="font-semibold tabular-nums text-slate-700">
                                        {formatDiscountValue(entry, fmtMoney)}
                                    </span>
                                    <span className="tabular-nums text-rose-600">−{fmtMoney(entry.amount)}</span>
                                </li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            onClick={openEditor}
                            className="block w-full border-t border-slate-200 bg-slate-50 px-2.5 py-1.5 text-center text-[11.5px] font-semibold text-[#1f2654] transition-colors hover:bg-[#1f2654]/[0.08]"
                        >
                            {t('common.edit')}
                        </button>
                    </div>
                </AnchoredPopup>
            )}
        </>
    );
};
