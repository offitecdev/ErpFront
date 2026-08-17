import { useMemo, useState } from 'react';

import { Button } from '@/components/ui-shared/Button';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';
import { t } from '@/i18n/translate';

import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { formatDiscountPercent, type TenderPricingSummary } from '../../utils/tenderPricing.utils';
import {
    discountDisplayName,
    MAX_TOTAL_DISCOUNTS,
    seedTotalDiscounts,
    serializeDiscountList,
    type TenderDiscountEntry,
} from '../../utils/tenderDiscounts.utils';
import type { TenderListItem } from '../../../../../types/tender';
import { DiscountListEditor } from './DiscountListEditor';
import { toDrafts, toEntries, useDraftBreakdown, type DiscountDraft } from './discountDrafts';

export type TotalDiscountPatch = {
    /** JSON list — the editable source of truth. */
    totalDiscounts: string | null;
    /** Combined percentage mirrored into the legacy column. */
    directDiscount: number;
    /** Superseded by the list; zeroed so it can never double-apply. */
    extraDiscount: number;
    directDiscountLabel: string | null;
    extraDiscountLabel: string | null;
};

type TenderTotalDiscountModalProps = {
    open: boolean;
    onClose: () => void;
    tender: TenderListItem;
    /** Current footer figures — supplies the pre-discount net and the VAT ratio. */
    summary: TenderPricingSummary;
    canEdit: boolean;
    onSave: (patch: TotalDiscountPatch) => void;
};

/**
 * Document-total discounts, opened from the "Apply discount" button under the
 * quote. Rises from the bottom as a sheet (the app-wide `BottomSheet`), so the
 * quote it is re-pricing stays put behind it. Two panes: the editable stack on
 * the LEFT (with what each discount takes off), the resulting price on the
 * RIGHT — so the effect of an edit and the number it produces are visible at
 * the same time.
 *
 * The discounts reduce the net; VAT follows by the same factor, so the ratio
 * between them is unchanged and the gross total stays consistent with the
 * per-line VAT rates.
 */
export const TenderTotalDiscountModal = ({
    open,
    onClose,
    tender,
    summary,
    canEdit,
    onSave,
}: TenderTotalDiscountModalProps) => {
    const fmtMoney = useMoneyFormat();
    const base = summary.netBeforeDiscounts;
    // VAT per unit of net, held constant while the discounts move the net —
    // matches how the offer footer scales VAT with the document discount.
    const vatRatio = summary.netTotal > 0 ? summary.vatTotal / summary.netTotal : 0;

    // Seeded once per opening; the pop-up owns the draft from then on, so it
    // must not re-seed when the tender object changes identity underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialEntries = useMemo<TenderDiscountEntry[]>(() => seedTotalDiscounts(tender), [tender.id]);
    const [drafts, setDrafts] = useState<DiscountDraft[]>(() => toDrafts(initialEntries, `total-${tender.id}`));
    const breakdown = useDraftBreakdown(drafts, base);

    const net = breakdown.remaining;
    const vat = net * vatRatio;
    const gross = net + vat;
    // Delta against what the offer currently shows — the reason for the pop-up.
    const grossDelta = gross - summary.grossTotal;

    const handleSave = () => {
        const entries = toEntries(drafts);
        onSave({
            totalDiscounts: serializeDiscountList(entries, MAX_TOTAL_DISCOUNTS),
            directDiscount: breakdown.combinedPercent,
            // The list replaces the old two-discount pair outright. Leaving a
            // stale extraDiscount behind would silently reduce the total twice.
            extraDiscount: 0,
            directDiscountLabel: null,
            extraDiscountLabel: null,
        });
        onClose();
    };

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={t('tenders.apply_discount')}
            subtitle={t('tenders.total_discount_description')}
            width={920}
            height={640}
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
            <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_260px]">
                {/* LEFT — the stack and what each entry removes. */}
                <div className="min-w-0">
                    <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                        {t('tenders.discounts')}
                    </h3>
                    <DiscountListEditor
                        drafts={drafts}
                        onChange={setDrafts}
                        base={base}
                        breakdown={breakdown}
                        fmtMoney={fmtMoney}
                        maxEntries={MAX_TOTAL_DISCOUNTS}
                        disabled={!canEdit}
                        emptyHint={t('tenders.total_discount_empty_hint')}
                    />
                </div>

                {/* RIGHT — the price as it will stand once this is saved. */}
                {/* Sticky: a long discount list scrolls the sheet, and the price
                    it is producing has to stay in view while it does. */}
                <aside className="h-fit rounded-[2px] border border-slate-200 bg-slate-50/70 px-3 py-3 md:sticky md:top-0 dark:border-white/10">
                    <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                        {t('tenders.price_status')}
                    </h3>
                    <dl className="space-y-1 text-[12.5px]">
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-slate-500">{t('tenders.subtotal_excl_vat')}</dt>
                            <dd className="font-medium tabular-nums text-slate-800">{fmtMoney(base)}</dd>
                        </div>
                        {breakdown.applied.map((entry, index) => (
                            entry.amount > 0 ? (
                                <div key={drafts[index]?.key ?? index} className="flex items-center justify-between gap-2">
                                    <dt className="min-w-0 truncate text-slate-500" title={discountDisplayName(entry, index)}>
                                        {discountDisplayName(entry, index)}
                                    </dt>
                                    <dd className="shrink-0 tabular-nums text-rose-600">−{fmtMoney(entry.amount)}</dd>
                                </div>
                            ) : null
                        ))}
                        {breakdown.totalAmount > 0 && (
                            <div className="flex items-center justify-between gap-2 border-t border-dashed border-slate-300 pt-1 dark:border-white/10">
                                <dt className="font-medium text-slate-600">{t('tenders.total_discount')}</dt>
                                <dd className="flex items-center gap-1.5">
                                    <span className="font-semibold tabular-nums text-rose-600">−{fmtMoney(breakdown.totalAmount)}</span>
                                    <span className="tabular-nums text-slate-500">{formatDiscountPercent(breakdown.combinedPercent)}</span>
                                </dd>
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-1 dark:border-white/10">
                            <dt className="text-slate-500">{t('tenders.net_total')}</dt>
                            <dd className="font-medium tabular-nums text-slate-800">{fmtMoney(net)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-slate-500">{t('tenders.vat_amount')}</dt>
                            <dd className="font-medium tabular-nums text-slate-800">{fmtMoney(vat)}</dd>
                        </div>
                    </dl>
                    <div className="mt-2 border-t border-slate-300 pt-2 dark:border-white/10">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                            {t('tenders.total_incl_vat')}
                        </div>
                        <div className="mt-0.5 text-[20px] font-extrabold leading-none tabular-nums text-slate-900">
                            {fmtMoney(gross)}
                        </div>
                        {/* Only shown once the edit actually moves the total. */}
                        {Math.abs(grossDelta) >= 0.005 && (
                            <div className={`mt-1 text-[11.5px] font-semibold tabular-nums ${grossDelta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {grossDelta < 0 ? '−' : '+'}{fmtMoney(Math.abs(grossDelta))}
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </BottomSheet>
    );
};
