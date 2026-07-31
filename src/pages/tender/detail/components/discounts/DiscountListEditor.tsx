import { useState } from 'react';
import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import {
    defaultDiscountName,
    MAX_DISCOUNT_NAME_LENGTH,
    type DiscountBreakdown,
} from '../../utils/tenderDiscounts.utils';
import { useDraftKeys, type DiscountDraft } from './discountDrafts';

type DiscountListEditorProps = {
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

const KIND_BUTTON_BASE =
    'rounded-[2px] px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors disabled:cursor-not-allowed';

/**
 * The list of stacked discounts, one editable row each: name, value, %/amount
 * toggle and the money that row removes from what the rows above it left over.
 * Shared by the per-product modal and the document-total modal so both apply
 * discounts by exactly the same rules.
 */
export const DiscountListEditor = ({
    drafts,
    onChange,
    base,
    breakdown,
    fmtMoney,
    maxEntries,
    disabled = false,
    emptyHint,
}: DiscountListEditorProps) => {
    const nextKey = useDraftKeys(drafts.length);
    // Row whose name field is being edited — the placeholder default only shows
    // while the user hasn't typed their own name.
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
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
            {drafts.length === 0 && (
                <p className="rounded-[2px] border border-dashed border-slate-200 bg-slate-50/70 px-3 py-4 text-center text-[12px] text-slate-400">
                    {emptyHint}
                </p>
            )}

            {drafts.map((draft, index) => {
                const applied = breakdown.applied[index];
                const isPercent = draft.kind === 'PERCENT';
                return (
                    <div
                        key={draft.key}
                        className="rounded-[2px] border border-slate-200 bg-white px-2.5 py-2 transition-colors hover:border-slate-300"
                    >
                        <div className="flex items-center gap-2">
                            {/* Order badge: discounts stack, so which one comes
                                first is part of the meaning, not decoration. */}
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10.5px] font-bold tabular-nums text-slate-500">
                                {index + 1}
                            </span>
                            <input
                                type="text"
                                aria-label={t('tenders.discount_name')}
                                title={t('tenders.discount_name_hint')}
                                maxLength={MAX_DISCOUNT_NAME_LENGTH}
                                disabled={disabled}
                                value={draft.name}
                                placeholder={defaultDiscountName(index)}
                                onFocus={() => setFocusedKey(draft.key)}
                                onBlur={() => setFocusedKey(null)}
                                onChange={(event) => patchRow(index, { name: event.target.value })}
                                className={`min-w-0 flex-1 rounded-[2px] border px-1.5 py-1 text-[12.5px] text-slate-800 outline-none transition-colors placeholder:text-slate-400 disabled:bg-slate-50 ${
                                    focusedKey === draft.key ? 'border-[#1f2654] bg-white' : 'border-slate-200 hover:border-slate-300'
                                }`}
                            />
                            <input
                                type="text"
                                inputMode="decimal"
                                aria-label={isPercent ? t('tenders.discount_mode_percent') : t('tenders.discount_mode_amount')}
                                disabled={disabled}
                                value={draft.value}
                                placeholder="0"
                                onChange={(event) => patchRow(index, { value: event.target.value })}
                                className="w-20 shrink-0 rounded-[2px] border border-slate-300 bg-white px-1.5 py-1 text-right text-[12.5px] tabular-nums text-slate-900 outline-none transition-colors hover:border-slate-400 focus:border-[#1f2654] disabled:bg-slate-50"
                            />
                            {/* Percentage or fixed money — the same toggle idiom as
                                the offer footer, but the choice is STORED here
                                instead of being converted away to a percentage. */}
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[2px] bg-slate-100 p-0.5">
                                <button
                                    type="button"
                                    disabled={disabled}
                                    title={t('tenders.discount_mode_percent')}
                                    aria-pressed={isPercent}
                                    onClick={() => patchRow(index, { kind: 'PERCENT' })}
                                    className={`${KIND_BUTTON_BASE} ${isPercent ? 'bg-[#1f2654] text-white' : 'text-slate-500 hover:bg-white hover:text-[#1f2654]'}`}
                                >
                                    %
                                </button>
                                <button
                                    type="button"
                                    disabled={disabled}
                                    title={t('tenders.discount_mode_amount')}
                                    aria-pressed={!isPercent}
                                    onClick={() => patchRow(index, { kind: 'AMOUNT' })}
                                    className={`${KIND_BUTTON_BASE} ${!isPercent ? 'bg-[#1f2654] text-white' : 'text-slate-500 hover:bg-white hover:text-[#1f2654]'}`}
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
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Trash01 size={13} />
                            </button>
                        </div>
                        {/* What this row actually does: the amount it takes off,
                            and the base it took it off (= what row n−1 left). */}
                        {applied && applied.amount > 0 && (
                            <div className="mt-1 flex items-center justify-between gap-2 pl-7 text-[11px] tabular-nums">
                                <span className="text-slate-400">
                                    {t('tenders.discount_applies_on', { base: fmtMoney(applied.base) })}
                                </span>
                                <span className="flex items-center gap-2">
                                    <span className="font-semibold text-rose-600">−{fmtMoney(applied.amount)}</span>
                                    <span className="text-slate-400">→ {fmtMoney(applied.remaining)}</span>
                                </span>
                            </div>
                        )}
                    </div>
                );
            })}

            <button
                type="button"
                onClick={addRow}
                disabled={disabled || atMax}
                className="flex w-full items-center justify-center gap-1.5 rounded-[2px] border border-dashed border-slate-300 px-2.5 py-2 text-[12px] font-semibold text-[#1f2654] transition-colors hover:border-[#1f2654] hover:bg-[#1f2654]/[0.06] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-transparent"
            >
                <Plus size={13} />
                {atMax ? t('tenders.discount_limit_reached', { max: maxEntries }) : t('tenders.discount_add')}
            </button>

            {base <= 0 && drafts.length > 0 && (
                <p className="text-[11px] leading-4 text-amber-600">{t('tenders.discount_base_empty')}</p>
            )}
        </div>
    );
};
