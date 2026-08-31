import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { useDraftKeys, type DiscountDraft } from '../../components/discounts/discountDrafts';
import {
    defaultDiscountName,
    MAX_DISCOUNT_NAME_LENGTH,
    type DiscountBreakdown,
} from '../../utils/tenderDiscounts.utils';

type DiscountStackEditorProps = {
    drafts: DiscountDraft[];
    onChange: (next: DiscountDraft[]) => void;
    /** Money the stack applies to — each row's effect is shown against it. */
    base: number;
    breakdown: DiscountBreakdown;
    fmtMoney: (value: number) => string;
    /** Hard cap on rows; the add button disables once reached. */
    maxEntries: number;
    disabled?: boolean;
    /** Shown in place of the rows while the list is empty. */
    emptyHint: string;
};

/**
 * The stacked discounts, one row each: order badge, name, value, %/amount
 * toggle, delete — and under it what that row takes off the money the rows
 * above left over. Same rules as the document-total pricing helpers; only the
 * look changed (calendar-style grey fields, hairline rows).
 */
export const DiscountStackEditor = ({
    drafts,
    onChange,
    base,
    breakdown,
    fmtMoney,
    maxEntries,
    disabled = false,
    emptyHint,
}: DiscountStackEditorProps) => {
    const nextKey = useDraftKeys(drafts.length);
    const atMax = drafts.length >= maxEntries;

    const patchRow = (index: number, patch: Partial<DiscountDraft>) => {
        onChange(drafts.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
    };

    const addRow = () => {
        if (atMax || disabled) return;
        onChange([...drafts, { key: nextKey(), name: defaultDiscountName(drafts.length), kind: 'PERCENT', value: '' }]);
    };

    const removeRow = (index: number) => {
        onChange(drafts.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2">
            {drafts.length === 0 && <div className="ofi-cal-emptyline">{emptyHint}</div>}

            {drafts.map((draft, index) => {
                const applied = breakdown.applied[index];
                const isPercent = draft.kind === 'PERCENT';
                return (
                    <div key={draft.key} className="ofi-tp-list px-3 py-2">
                        <div className="flex items-center gap-2">
                            {/* Order badge: discounts stack, so which one comes
                                first is part of the meaning, not decoration. */}
                            <span className="ofi-tp-ordinal">{index + 1}</span>
                            <input
                                type="text"
                                aria-label={t('tenders.discount_name')}
                                title={t('tenders.discount_name_hint')}
                                maxLength={MAX_DISCOUNT_NAME_LENGTH}
                                disabled={disabled}
                                value={draft.name}
                                placeholder={defaultDiscountName(index)}
                                onChange={(event) => patchRow(index, { name: event.target.value })}
                                className="ofi-cal-input min-w-0 flex-1"
                                style={{ height: 32, minHeight: 32 }}
                            />
                            <input
                                type="text"
                                inputMode="decimal"
                                aria-label={isPercent ? t('tenders.discount_mode_percent') : t('tenders.discount_mode_amount')}
                                disabled={disabled}
                                value={draft.value}
                                placeholder="0"
                                onChange={(event) => patchRow(index, { value: event.target.value })}
                                className="ofi-cal-input w-[84px] shrink-0 text-right tabular-nums"
                                style={{ height: 32, minHeight: 32 }}
                            />
                            {/* Percentage or fixed money — the choice is STORED,
                                not converted away to a percentage. */}
                            <span className="ofi-tp-kind">
                                <button
                                    type="button"
                                    disabled={disabled}
                                    title={t('tenders.discount_mode_percent')}
                                    aria-pressed={isPercent}
                                    onClick={() => patchRow(index, { kind: 'PERCENT' })}
                                    className={isPercent ? 'is-on' : ''}
                                >
                                    %
                                </button>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    title={t('tenders.discount_mode_amount')}
                                    aria-pressed={!isPercent}
                                    onClick={() => patchRow(index, { kind: 'AMOUNT' })}
                                    className={!isPercent ? 'is-on' : ''}
                                >
                                    {t('tenders.discount_mode_amount_short')}
                                </button>
                            </span>
                            <button
                                type="button"
                                disabled={disabled}
                                aria-label={t('common.delete')}
                                title={t('common.delete')}
                                onClick={() => removeRow(index)}
                                className="ofi-tp-rowbtn is-danger"
                            >
                                <Trash01 size={14} />
                            </button>
                        </div>
                        {/* What this row actually does: the amount it takes off,
                            and the base it took it off (= what row n−1 left). */}
                        {applied && applied.amount > 0 && (
                            <div className="mt-1 flex items-center justify-between gap-2 pl-8 text-[11.5px] tabular-nums" style={{ color: 'var(--ofi-cal-muted)' }}>
                                <span>{t('tenders.discount_applies_on', { base: fmtMoney(applied.base) })}</span>
                                <span className="flex items-center gap-2">
                                    <span className="ofi-tp-neg font-semibold">−{fmtMoney(applied.amount)}</span>
                                    <span>→ {fmtMoney(applied.remaining)}</span>
                                </span>
                            </div>
                        )}
                    </div>
                );
            })}

            <button type="button" onClick={addRow} disabled={disabled || atMax} className="ofi-tp-addline">
                <Plus size={14} />
                {atMax ? t('tenders.discount_limit_reached', { max: maxEntries }) : t('tenders.discount_add')}
            </button>

            {base <= 0 && drafts.length > 0 && (
                <p className="text-[11.5px] leading-4" style={{ color: '#b06000' }}>{t('tenders.discount_base_empty')}</p>
            )}
        </div>
    );
};
