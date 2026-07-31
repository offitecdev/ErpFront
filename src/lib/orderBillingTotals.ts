import type { MyOrderDto, MyOrderListAddonDto, OrderBillingFiguresDto } from '../types/billing';

/**
 * Single source of truth for an order group's billing figures, shared by the
 * My Orders list and the order detail page so the two can never disagree.
 *
 * An "order group" is a main order plus its additional orders. The backend
 * gives every order its own summary with `baseAmount = that order's
 * totalAmount`, so the group figures are plain sums.
 *
 * `remaining` is derived as `total - billed` and deliberately NOT clamped at
 * zero per order. Summing each order's own `remainingAmount` (which the backend
 * clamps) loses the excess whenever a single order is over-invoiced, which is
 * how "invoiced + remaining" stopped adding up to the total. Keeping it derived
 * guarantees the identity `billed + remaining === total`, and an over-invoiced
 * group shows a negative remainder instead of silently swallowing it.
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

/** Derived, never clamped — so it always closes against the line total. */
export const lineRemaining = (line: OrderBillingLine) => round2(lineTotal(line) - lineBilled(line));

/** One line's invoiced share, derived from its own amounts. */
export const linePercent = (line: OrderBillingLine) => sharePercent(lineBilled(line), lineTotal(line));

export const orderBillingTotals = (lines: OrderBillingLine[]): OrderBillingTotals => {
    const total = round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
    const billed = round2(lines.reduce((sum, line) => sum + lineBilled(line), 0));
    return {
        total,
        billed,
        remaining: round2(total - billed),
        percent: sharePercent(billed, total),
    };
};
