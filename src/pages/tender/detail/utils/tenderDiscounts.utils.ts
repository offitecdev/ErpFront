/**
 * ── STACKED DISCOUNTS (line level + document level) ─────────────────────────
 *
 * A quote line and the quote total can each carry a LIST of named discounts
 * instead of a single percentage. They are applied SEQUENTIALLY: every discount
 * bites into what the previous ones left over (100 → −20% → 80 → −10% → 72),
 * exactly like the older `directDiscount` + `extraDiscount` pair did. VAT is
 * always computed on the discounted net, so it follows the same reduction.
 *
 * A discount is either a PERCENT of the running remainder or a fixed AMOUNT of
 * money taken off it (clamped so a line can never go negative).
 *
 * ⚠ The backend keeps a byte-for-byte equivalent of this math in
 * `Erp_Backend/src/presentation/controllers/tender.discounts.ts`. It re-derives
 * the legacy single-percent columns from these lists on save, so the two files
 * must be changed together — otherwise the screen and the stored total drift.
 *
 * BACKWARD COMPATIBILITY: `Position.discount` and `Tender.directDiscount` still
 * hold the COMBINED effect of their list as one percentage. Every existing
 * consumer (order totals, project positions, profitability, reports) keeps
 * reading those columns and stays correct without knowing about the lists.
 */

import { t } from '@/i18n/translate';

export type DiscountKind = 'PERCENT' | 'AMOUNT';

export interface TenderDiscountEntry {
    /** Display name. Empty → the default "Rabatt n" is shown instead. */
    name: string;
    kind: DiscountKind;
    /** Percentage (0–100) for PERCENT, money for AMOUNT. */
    value: number;
}

/** One entry with the figures it produces against its own (running) base. */
export interface AppliedDiscount extends TenderDiscountEntry {
    /** Amount this discount was applied to (what the previous ones left). */
    base: number;
    /** Money this discount removes. */
    amount: number;
    /** What is left after it. */
    remaining: number;
    /** Effective percentage of `base` — an AMOUNT entry reads as a % too. */
    percent: number;
}

export interface DiscountBreakdown {
    applied: AppliedDiscount[];
    /** Sum of every discount's money. */
    totalAmount: number;
    /** Base minus every discount. */
    remaining: number;
    /** Combined effect as ONE percentage of the base. */
    combinedPercent: number;
}

/** Product lines take at most five discounts; the quote total is unbounded. */
export const MAX_LINE_DISCOUNTS = 5;
/** Hard cap on the document-level list — a bound on the stored JSON, not a UX limit. */
export const MAX_TOTAL_DISCOUNTS = 20;

export const MAX_DISCOUNT_NAME_LENGTH = 80;

const round2 = (value: number) => Math.round(value * 100) / 100;
// An amount → percent conversion keeps 6 decimals so the money recomputed from
// the stored percentage lands back on the typed value to the cent.
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

const clampPercent = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, parsed));
};

const clampAmount = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/** Default name of the n-th discount (1-based) — editable, never stored as-is. */
export const defaultDiscountName = (index: number): string =>
    t('tenders.discount_default_name', { index: index + 1 });

/** The name to print: the user's own, falling back to the positional default. */
export const discountDisplayName = (entry: TenderDiscountEntry, index: number): string =>
    (entry.name || '').trim() || defaultDiscountName(index);

export const createDiscountEntry = (index: number, kind: DiscountKind = 'PERCENT'): TenderDiscountEntry => ({
    name: defaultDiscountName(index),
    kind,
    value: 0,
});

const normalizeEntry = (raw: unknown): TenderDiscountEntry | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const kind: DiscountKind = String(record.kind ?? '').toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'PERCENT';
    return {
        name: String(record.name ?? '').trim().slice(0, MAX_DISCOUNT_NAME_LENGTH),
        kind,
        value: kind === 'AMOUNT' ? clampAmount(record.value) : clampPercent(record.value),
    };
};

/**
 * Reads the stored JSON column. Anything unparseable degrades to an empty list
 * rather than breaking the quote — a malformed column must never blank a page.
 */
export const parseDiscountList = (raw?: string | null, max = MAX_TOTAL_DISCOUNTS): TenderDiscountEntry[] => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(normalizeEntry)
            .filter((entry): entry is TenderDiscountEntry => Boolean(entry))
            .slice(0, max);
    } catch {
        return [];
    }
};

/** Serializes for storage. An empty list is stored as NULL, not "[]". */
export const serializeDiscountList = (list: TenderDiscountEntry[], max = MAX_TOTAL_DISCOUNTS): string | null => {
    const kept = list
        .map((entry) => normalizeEntry(entry))
        .filter((entry): entry is TenderDiscountEntry => Boolean(entry) && entry!.value > 0)
        .slice(0, max);
    return kept.length > 0 ? JSON.stringify(kept) : null;
};

/** Sequential application — each entry works on what the previous ones left. */
export const applyDiscounts = (base: number, list: TenderDiscountEntry[]): DiscountBreakdown => {
    const safeBase = Number.isFinite(base) && base > 0 ? base : 0;
    let remaining = safeBase;
    const applied = list.map((entry) => {
        const from = remaining;
        const amount = entry.kind === 'AMOUNT'
            ? Math.min(clampAmount(entry.value), from)
            : from * (clampPercent(entry.value) / 100);
        remaining = from - amount;
        return {
            ...entry,
            base: from,
            amount,
            remaining,
            percent: from > 0 ? round6((amount / from) * 100) : 0,
        };
    });
    return {
        applied,
        totalAmount: safeBase - remaining,
        remaining,
        combinedPercent: safeBase > 0 ? round6((1 - remaining / safeBase) * 100) : 0,
    };
};

/**
 * The single percentage that reproduces the whole list against `base` — this is
 * what gets mirrored into the legacy `discount` / `directDiscount` columns.
 */
export const combinedDiscountPercent = (base: number, list: TenderDiscountEntry[]): number =>
    applyDiscounts(base, list).combinedPercent;

/** "10%" / "CHF 50.00" — the compact value badge shown in lists and the PDF. */
export const formatDiscountValue = (
    entry: TenderDiscountEntry,
    fmtMoney: (value: number) => string,
): string => (entry.kind === 'AMOUNT'
    ? fmtMoney(clampAmount(entry.value))
    : `${round2(clampPercent(entry.value)).toLocaleString('de-CH')}%`);

/** Undiscounted line base: quantity × unit price (0 for non-priced rows). */
export const lineDiscountBase = (position: { quantity?: number | null; unitPrice?: number | null }): number => {
    const quantity = Number(position.quantity || 0);
    const unitPrice = position.unitPrice == null ? 0 : Number(position.unitPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
    return quantity > 0 && unitPrice > 0 ? quantity * unitPrice : 0;
};

/**
 * The `discount` percentage a line SHOULD carry given its stack and its current
 * quantity/unit price — `null` when the line has no stack and the percentage is
 * whatever the user typed into the column.
 *
 * This has to be re-derived whenever the base moves: a fixed-AMOUNT discount
 * keeps its money but its percentage of a changed base does not, so leaving the
 * old percentage behind would quietly re-price the line.
 */
export const deriveLineDiscountPercent = (position: {
    quantity?: number | null;
    unitPrice?: number | null;
    discounts?: string | null;
}): number | null => {
    const list = parseDiscountList(position.discounts, MAX_LINE_DISCOUNTS);
    if (list.length === 0) return null;
    return combinedDiscountPercent(lineDiscountBase(position), list);
};

/**
 * A line that has never been opened in the discount modal but carries a plain
 * `discount` percentage is seeded with that percentage as its first entry, so
 * the modal starts from what the quote already shows instead of silently
 * dropping it.
 */
export const seedLineDiscounts = (position: {
    discounts?: string | null;
    discount?: number | null;
}): TenderDiscountEntry[] => {
    const stored = parseDiscountList(position.discounts, MAX_LINE_DISCOUNTS);
    if (stored.length > 0) return stored;
    const legacy = clampPercent(position.discount);
    return legacy > 0 ? [{ name: defaultDiscountName(0), kind: 'PERCENT', value: legacy }] : [];
};

/** Same idea for the document total: the old direct + extra pair seeds the list. */
export const seedTotalDiscounts = (tender: {
    totalDiscounts?: string | null;
    directDiscount?: number | null;
    directDiscountLabel?: string | null;
    extraDiscount?: number | null;
    extraDiscountLabel?: string | null;
}): TenderDiscountEntry[] => {
    const stored = parseDiscountList(tender.totalDiscounts);
    if (stored.length > 0) return stored;
    const seeded: TenderDiscountEntry[] = [];
    const direct = clampPercent(tender.directDiscount);
    if (direct > 0) {
        seeded.push({
            name: (tender.directDiscountLabel || '').trim() || t('tenders.direct_discount'),
            kind: 'PERCENT',
            value: direct,
        });
    }
    const extra = clampPercent(tender.extraDiscount);
    if (extra > 0) {
        seeded.push({
            name: (tender.extraDiscountLabel || '').trim() || t('tenders.extra_discount'),
            kind: 'PERCENT',
            value: extra,
        });
    }
    return seeded;
};
