import type { MyOrderDto, MyOrderListAddonDto, OrderBillingFiguresDto } from '../types/billing';

/**
 * Single source of truth for an order group's billing figures, shared by the
 * My Orders list and the order detail page so the two can never disagree.
 *
 * An "order group" is a main order plus its additional orders. The backend
 * gives every order its own summary with `baseAmount = that order's
 * totalAmount`, so the group figures are plain sums.
 *
 * `remaining` is derived from the amounts and deliberately NOT clamped at zero
 * per order. Reading each order's `remainingAmount` off the backend (which
 * clamps) loses the excess whenever a single order is over-invoiced, which is
 * how "invoiced + remaining" stopped adding up to the total. Keeping it derived
 * lets an over-invoiced group show a negative remainder instead of silently
 * swallowing it. The one adjustment on top is `openAmount`: a fully billed
 * order owes nothing, so its cent-rounding dust reads as 0.00.
 */
/**
 * `S` is whatever summary the caller's feed actually carries. The money helpers
 * below only ever read `baseAmount` / `billedAmount`, so the My Orders list can
 * pass the two-figure list summary, while the order detail page keeps the full
 * `BillingSummaryDto` (invoices, payment stages) on its lines.
 */
export type OrderBillingLine<S extends OrderBillingFiguresDto = OrderBillingFiguresDto> = {
    id: string;
    orderNumber: string;
    isAddon: boolean;
    summary: S | null | undefined;
    /** The order's own contract value, used when no summary came back. */
    totalAmount: number;
};

export type OrderBillingTotals = {
    total: number;
    billed: number;
    /** total - billed; may be negative when a group is over-invoiced. */
    remaining: number;
    /** Invoiced share derived from the money — see `sharePercent`. */
    percent: number;
};

/**
 * The invoiced share, derived from the amounts rather than read off the stored
 * `billedPercent`.
 *
 * This matters: the backend freezes `invoice.amount = totalAmount * percent`
 * at the moment of issue. If the order's total later grows, the stored percent
 * goes stale — an invoice issued at 100% of CHF 4'095.00 still says 100% even
 * though the order is now CHF 4'426.70, which is how a row could read
 * "100% invoiced" while still showing CHF 331.70 outstanding. Deriving the
 * share from billed/total keeps the badge, the bar and the remainder telling
 * the same story, and the gap resurfaces as the ~7% still to invoice.
 */
export const sharePercent = (billed: number, total: number) =>
    total > 0 ? Math.max(0, Math.min(100, Math.round((billed / total) * 100))) : 0;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Cent rounding — mirror of Erp_Backend/src/application/utils/billingRounding.ts,
 * keep in sync.
 *
 * Every invoice freezes its money at issue time as `round2(base * percent/100)`,
 * so a target billed in instalments can miss its contract value by up to half a
 * rappen per invoice (33.33% + 33.33% + 33.34% of CHF 4'095.00 adds up to
 * CHF 4'094.99). Once the invoiced share reaches 100% that leftover is NOT an
 * open balance — it is rounding dust, and nobody can work it off (the backend
 * refuses to invoice under 0.005% and cent-rounds every amount it writes).
 * A fully billed order therefore closes at exactly 0.00, never at 0.01
 * (Vorgabe 19.08.2026).
 *
 * The franc slack stays tight on purpose: a wider gap is a REAL remainder — the
 * order total grew after the invoices were issued — and must stay on screen.
 */
export const FULLY_BILLED_EPSILON = 0.005;
export const CENT_ROUNDING_SLACK = 0.05;

/**
 * True when the invoiced share has reached 100% and the francs are within
 * rounding dust of the contract value. The percentage is required: without it a
 * tiny order (base CHF 0.08, half invoiced) would read as fully billed just
 * because its franc gap is small.
 */
export const isFullyBilled = (billedPercent: number | null | undefined, baseAmount: number, billedAmount: number) =>
    typeof billedPercent === 'number'
    && Number.isFinite(billedPercent)
    && round2(billedPercent) >= 100 - FULLY_BILLED_EPSILON
    && Math.abs(round2(baseAmount - billedAmount)) <= CENT_ROUNDING_SLACK;

/** The open balance: 0 once fully billed, otherwise the plain franc difference. */
export const openAmount = (billedPercent: number | null | undefined, baseAmount: number, billedAmount: number) =>
    isFullyBilled(billedPercent, baseAmount, billedAmount) ? 0 : round2(baseAmount - billedAmount);

/** Flattens a main order and its additional orders into billing lines. */
export const orderBillingLines = <S extends OrderBillingFiguresDto = OrderBillingFiguresDto>(
    order: Pick<MyOrderDto, 'id' | 'orderNumber' | 'totalAmount'> & {
        billingSummary?: S | null;
        addonSalesOrders?: Array<Omit<MyOrderListAddonDto, 'billingSummary'> & { billingSummary?: S | null }> | null;
    },
): OrderBillingLine<S>[] => [
    {
        id: order.id,
        orderNumber: order.orderNumber,
        isAddon: false,
        summary: order.billingSummary,
        totalAmount: Number(order.totalAmount || 0),
    },
    ...(order.addonSalesOrders || []).map((addon) => ({
        id: addon.id,
        orderNumber: addon.orderNumber,
        isAddon: true,
        summary: addon.billingSummary,
        totalAmount: Number(addon.totalAmount || 0),
    })),
];

/** The contract value of one line — the summary's base, or the raw order total. */
export const lineTotal = (line: OrderBillingLine) =>
    Number(line.summary?.baseAmount ?? line.totalAmount ?? 0);

/** What has actually been invoiced on one line (cancelled invoices excluded upstream). */
export const lineBilled = (line: OrderBillingLine) => Number(line.summary?.billedAmount ?? 0);

/**
 * Derived, never clamped — so it always closes against the line total — and 0
 * on a fully billed line, where the last rappen is only rounding dust.
 */
export const lineRemaining = (line: OrderBillingLine) =>
    openAmount(line.summary?.billedPercent, lineTotal(line), lineBilled(line));

/** One line's invoiced share, derived from its own amounts. */
export const linePercent = (line: OrderBillingLine) => sharePercent(lineBilled(line), lineTotal(line));

export const orderBillingTotals = (lines: OrderBillingLine[]): OrderBillingTotals => {
    const total = round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
    const billed = round2(lines.reduce((sum, line) => sum + lineBilled(line), 0));
    return {
        total,
        billed,
        // Sum of the lines' own open balances rather than `total - billed`: each
        // line already dropped its rounding dust, and adding the dust back at
        // group level is how a fully billed group would show CHF 0.03 open.
        // Over-invoiced lines still contribute a negative, so nothing is lost.
        remaining: round2(lines.reduce((sum, line) => sum + lineRemaining(line), 0)),
        percent: sharePercent(billed, total),
    };
};
