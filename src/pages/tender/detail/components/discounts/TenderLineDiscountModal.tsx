import { useMemo, useState } from 'react';

import { Button } from '@/components/ui-shared/Button';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';
import { t } from '@/i18n/translate';

import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { formatDiscountPercent } from '../../utils/tenderPricing.utils';
import {
    lineDiscountBase,
    MAX_LINE_DISCOUNTS,
    seedLineDiscounts,
    serializeDiscountList,
    type TenderDiscountEntry,
} from '../../utils/tenderDiscounts.utils';
import { DEFAULT_VAT } from '../../utils/tenderDetail.constants';
import type { InlinePositionPatch } from '../../types/tenderDetail.types';
import type { PositionDto } from '../../../../../types/tender';
import { DiscountListEditor } from './DiscountListEditor';
import { toDrafts, toEntries, useDraftBreakdown, type DiscountDraft } from './discountDrafts';

type TenderLineDiscountModalProps = {
    open: boolean;
    onClose: () => void;
    position: PositionDto;
    fallbackTaxRate: number;
    canEdit: boolean;
    /**
     * Emits BOTH halves of the line's discount state: the editable list and the
     * combined percentage mirrored into `discount`, which is what every other
     * screen (totals, order conversion, profitability, reports) reads.
     */
    onSave: (patch: InlinePositionPatch) => void;
};

/**
 * Per-product discounts: up to five named discounts applied one after another
 * on the line's quantity × unit price. Opened from the light-grey "+" square in
 * the quote's discount column.
 *
 * Rises from the bottom as a sheet (the app-wide `BottomSheet`, same shell as
 * the inventory and CRM sheets) rather than a centred dialog, so the quote rows
 * behind it stay where they are while a discount is being priced.
 */
export const TenderLineDiscountModal = ({
    open,
    onClose,
    position,
    fallbackTaxRate,
    canEdit,
    onSave,
}: TenderLineDiscountModalProps) => {
    const fmtMoney = useMoneyFormat();
    const base = lineDiscountBase(position);
    const taxRate = Number(position.taxRate || fallbackTaxRate || DEFAULT_VAT);

    // Seeded once per opening: the sheet is unmounted between openings (see the
    // `open` guard at the call site), so this runs fresh each time. Keyed on the
    // row id alone — re-seeding whenever the row object changes identity would
    // throw away the edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialEntries = useMemo<TenderDiscountEntry[]>(() => seedLineDiscounts(position), [position.id]);
    const [drafts, setDrafts] = useState<DiscountDraft[]>(() => toDrafts(initialEntries, `line-${position.id}`));
    const breakdown = useDraftBreakdown(drafts, base);

    const net = breakdown.remaining;
    const vat = net * (taxRate / 100);

    const handleSave = () => {
        const entries = toEntries(drafts);
        onSave({
            discounts: serializeDiscountList(entries, MAX_LINE_DISCOUNTS),
            // Mirror: the stack's single-percentage equivalent against this
            // line's base. Keeps `quantity × unitPrice × (1 − discount/100)`
            // — the formula the rest of the app uses — exact.
            discount: breakdown.combinedPercent,
        });
        onClose();
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={t('tenders.product_discounts')}
            subtitle={position.shortDescription || t('tenders.product')}
            width={680}
            height={660}
            zIndex={90}
            footer={(
                <>
                    <span className="text-[11.5px] text-slate-400 dark:text-white/50">
                        {t('tenders.discount_sequential_note')}
                    </span>
                    <span className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
                        <Button variant="primary" size="sm" disabled={!canEdit} onClick={handleSave}>{t('common.save')}</Button>
                    </span>
                </>
            )}
        >
            <div className="space-y-3 p-4">
                {/* The base every discount below works from. */}
                <div className="flex items-center justify-between gap-3 rounded-[2px] border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-white/10">
                    <span className="text-[12px] font-medium text-slate-500">{t('tenders.line_amount_before_discount')}</span>
                    <span className="font-mono text-[15px] font-bold tabular-nums text-slate-900">{fmtMoney(base)}</span>
                </div>

                <DiscountListEditor
                    drafts={drafts}
                    onChange={setDrafts}
                    base={base}
                    breakdown={breakdown}
                    fmtMoney={fmtMoney}
                    maxEntries={MAX_LINE_DISCOUNTS}
                    disabled={!canEdit}
                    emptyHint={t('tenders.line_discount_empty_hint')}
                />

                {/* Result: net after the stack, its VAT, and the line's gross. */}
                <div className="space-y-1 rounded-[2px] border border-slate-200 bg-white px-3 py-2.5 text-[12.5px] dark:border-white/10">
                    {breakdown.totalAmount > 0 && (
                        <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-200 pb-1.5 dark:border-white/10">
                            <span className="font-medium text-slate-600">{t('tenders.total_discount')}</span>
                            <span className="flex items-center gap-2">
                                <span className="font-semibold tabular-nums text-rose-600">−{fmtMoney(breakdown.totalAmount)}</span>
                                <span className="font-medium tabular-nums text-slate-500">
                                    {formatDiscountPercent(breakdown.combinedPercent)}
                                </span>
                            </span>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">{t('tenders.net_total')}</span>
                        <span className="font-medium tabular-nums text-slate-800">{fmtMoney(net)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500">{`${t('tenders.vat_amount')} ${formatDiscountPercent(taxRate)}`}</span>
                        <span className="font-medium tabular-nums text-slate-800">{fmtMoney(vat)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-1.5 dark:border-white/10">
                        <span className="text-[13px] font-bold text-slate-700">{t('tenders.total_incl_vat')}</span>
                        <span className="text-[16px] font-extrabold tabular-nums text-slate-900">{fmtMoney(net + vat)}</span>
                    </div>
                </div>
            </div>
        </BottomSheet>
    );
};
