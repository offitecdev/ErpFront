import { useMemo, useRef } from 'react';

import { parseInlineNumber } from '../../utils/tenderLine.utils';
import {
    applyDiscounts,
    defaultDiscountName,
    MAX_DISCOUNT_NAME_LENGTH,
    type DiscountBreakdown,
    type DiscountKind,
    type TenderDiscountEntry,
} from '../../utils/tenderDiscounts.utils';

/**
 * Editing shape behind {@link DiscountListEditor}: the value is kept as RAW TEXT
 * while the user types, so a half-entered "12." or a cleared field doesn't
 * collapse to 0 under the cursor. `toEntries` converts a draft list into
 * storable entries.
 */
export type DiscountDraft = {
    /** Stable key for React — drafts are reordered/removed, indexes are not keys. */
    key: string;
    name: string;
    kind: DiscountKind;
    value: string;
};

const formatDraftValue = (value: number) =>
    value > 0 ? String(Math.round(value * 100) / 100) : '';

export const toDrafts = (entries: TenderDiscountEntry[], keyPrefix = 'd'): DiscountDraft[] =>
    entries.map((entry, index) => ({
        key: `${keyPrefix}-${index}`,
        name: entry.name,
        kind: entry.kind,
        value: formatDraftValue(entry.value),
    }));

export const toEntries = (drafts: DiscountDraft[]): TenderDiscountEntry[] =>
    drafts.map((draft, index) => ({
        name: (draft.name || '').trim().slice(0, MAX_DISCOUNT_NAME_LENGTH) || defaultDiscountName(index),
        kind: draft.kind,
        // Percentages are capped at 100; a fixed amount is capped by the running
        // remainder at application time, not here (the base can still change).
        value: parseInlineNumber(draft.value, draft.kind === 'PERCENT' ? 100 : undefined),
    }));

/** Live breakdown of a draft list against its base — drives every preview. */
export const useDraftBreakdown = (drafts: DiscountDraft[], base: number): DiscountBreakdown =>
    useMemo(() => applyDiscounts(base, toEntries(drafts)), [drafts, base]);

/** Fresh keys for appended rows, so removing row 2 can't collide with a new row 2. */
export const useDraftKeys = (initial: number) => {
    const counter = useRef(initial);
    return () => {
        counter.current += 1;
        return `d-new-${counter.current}`;
    };
};
