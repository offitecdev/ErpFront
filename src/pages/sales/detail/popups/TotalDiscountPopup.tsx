import { useMemo, useState } from 'react';

import { t } from '@/i18n/translate';
import type { TenderListItem } from '@/types/tender';

import { toDrafts, toEntries, useDraftBreakdown, type DiscountDraft } from '../components/discounts/discountDrafts';
import {
    discountDisplayName,
    MAX_TOTAL_DISCOUNTS,
    seedTotalDiscounts,
    serializeDiscountList,
    type TenderDiscountEntry,
} from '../utils/tenderDiscounts.utils';
import { formatDiscountPercent, type TenderPricingSummary } from '../utils/tenderPricing.utils';
import { useMoneyFormat } from '../utils/useMoneyFormat';
import { DiscountStackEditor } from './discounts/DiscountStackEditor';
import { PopupActions, PopupButton, PopupCaption, TenderFloatCard } from './shell/TenderPopupShell';

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

type TotalDiscountPopupProps = {
    open: boolean;
    onClose: () => void;
    tender: TenderListItem;
    /** Current footer figures — supplies the pre-discount net and the VAT ratio. */
    summary: TenderPricingSummary;
    canEdit: boolean;
    onSave: (patch: TotalDiscountPatch) => void;
};

/**
 * Document-total discounts, opened from "Apply discount" under the quote. A
 * floating card beside that button, so the totals it re-prices stay in view.
 * Two panes: the editable stack on the LEFT (with what each discount takes
 * off), the resulting price on the RIGHT — the effect of an edit and the number
 * it produces are visible at the same time.
 *
 * The discounts reduce the net; VAT follows by the same factor, so the ratio
 * between them is unchanged and the gross total stays consistent with the
 * per-line VAT rates.
 */
export const TotalDiscountPopup = ({
    open,
    onClose,
    tender,
    summary,
    canEdit,
    onSave,
}: TotalDiscountPopupProps) => {
    const fmtMoney = useMoneyFormat();
    const base = summary.netBeforeDiscounts;
    // VAT per unit of net, held constant while the discounts move the net —
    // matches how the offer footer scales VAT with the document discount.
    const vatRatio = summary.netTotal > 0 ? summary.vatTotal / summary.netTotal : 0;

    // Seeded once per opening; the popup owns the draft from then on, so it
    // must not re-seed when the tender object changes identity underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initialEntries = useMemo<TenderDiscountEntry[]>(() => seedTotalDiscounts(tender), [tender.id]);
    const [drafts, setDrafts] = useState<DiscountDraft[]>(() => toDrafts(initialEntries, `total-${tender.id}`));
    const breakdown = useDraftBreakdown(drafts, base);

    const net = breakdown.remaining;
    const vat = net * vatRatio;
    const gross = net + vat;
    // Delta against what the offer currently shows — the reason for the popup.
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
        <TenderFloatCard
            open={open}
            onClose={onClose}
            title={t('tenders.apply_discount')}
            subtitle={t('tenders.total_discount_description')}
            width={860}
            footer={(
                <PopupActions start={<span className="truncate">{t('tenders.discount_sequential_note')}</span>}>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="primary" disabled={!canEdit} onClick={handleSave}>{t('common.save')}</PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-tp-split">
                {/* LEFT — the stack and what each entry removes. */}
                <div className="min-w-0">
                    <PopupCaption>{t('tenders.discounts')}</PopupCaption>
                    <DiscountStackEditor
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

                {/* RIGHT — the price as it will stand once this is saved. Sticky:
                    a long list scrolls the card, the price must stay in view. */}
                <aside className="ofi-tp-aside h-fit md:sticky md:top-0">
                    <PopupCaption className="pt-0">{t('tenders.price_status')}</PopupCaption>
                    <dl className="m-0">
                        <div className="ofi-tp-kv">
                            <dt>{t('tenders.subtotal_excl_vat')}</dt>
                            <dd className="font-medium">{fmtMoney(base)}</dd>
                        </div>
                        {breakdown.applied.map((entry, index) => (
                            entry.amount > 0 ? (
                                <div key={drafts[index]?.key ?? index} className="ofi-tp-kv">
                                    <dt title={discountDisplayName(entry, index)}>{discountDisplayName(entry, index)}</dt>
                                    <dd className="ofi-tp-neg">−{fmtMoney(entry.amount)}</dd>
                                </div>
                            ) : null
                        ))}
                        {breakdown.totalAmount > 0 && (
                            <div className="ofi-tp-kv" style={{ borderTop: '1px dashed var(--ofi-cal-border)', marginTop: 4, paddingTop: 6 }}>
                                <dt style={{ color: 'var(--ofi-cal-text)', fontWeight: 600 }}>{t('tenders.total_discount')}</dt>
                                <dd className="flex items-center gap-1.5">
                                    <span className="ofi-tp-neg font-semibold">−{fmtMoney(breakdown.totalAmount)}</span>
                                    <span style={{ color: 'var(--ofi-cal-muted)' }}>{formatDiscountPercent(breakdown.combinedPercent)}</span>
                                </dd>
                            </div>
                        )}
                        <div className="ofi-tp-kv" style={{ borderTop: '1px solid var(--ofi-cal-border-soft)', marginTop: 4, paddingTop: 6 }}>
                            <dt>{t('tenders.net_total')}</dt>
                            <dd className="font-medium">{fmtMoney(net)}</dd>
                        </div>
                        <div className="ofi-tp-kv">
                            <dt>{t('tenders.vat_amount')}</dt>
                            <dd className="font-medium">{fmtMoney(vat)}</dd>
                        </div>
                        <div className="ofi-tp-kv is-total">
                            <dt>{t('tenders.total_incl_vat')}</dt>
                            <dd>{fmtMoney(gross)}</dd>
                        </div>
                    </dl>
                    {/* Only shown once the edit actually moves the total. */}
                    {Math.abs(grossDelta) >= 0.005 && (
                        <div className={`pt-1 text-right text-[12px] font-semibold tabular-nums ${grossDelta < 0 ? 'ofi-tp-neg' : 'ofi-tp-pos'}`}>
                            {grossDelta < 0 ? '−' : '+'}{fmtMoney(Math.abs(grossDelta))}
                        </div>
                    )}
                </aside>
            </div>
        </TenderFloatCard>
    );
};
