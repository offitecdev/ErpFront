/**
 * Shared geometry for every resizable HTML table in the app.
 *
 * A resize handle represents the boundary BETWEEN two columns. Moving the
 * boundary gives width to one side and takes the same amount from the other;
 * the table itself therefore keeps filling its card and can never leave a
 * blank strip behind. The last column has no outer-edge handle.
 */

const px = (value: string | null | undefined) => Number.parseFloat(value || '');

export const colsOf = (table: HTMLTableElement): HTMLTableColElement[] => {
    const group = table.querySelector(':scope > colgroup');
    if (!group) return [];
    return Array.from(group.children).filter((el): el is HTMLTableColElement => el.tagName === 'COL');
};

/** Content width of the element directly around the table. */
export const roomFor = (table: HTMLTableElement) => {
    const host = table.parentElement;
    if (!host) return 0;
    const style = window.getComputedStyle(host);
    return Math.max(
        0,
        host.clientWidth - (px(style.paddingLeft) || 0) - (px(style.paddingRight) || 0),
    );
};

/** Small utility columns retain their natural size; text columns stay usable. */
const TEXT_COLUMN_FLOOR = 72;
export const flexFloorFor = (natural: number) =>
    Math.max(24, Math.min(Math.round(natural), TEXT_COLUMN_FLOOR));

/** How much wider the table is made for one unpainted measurement. */
const PROBE_PX = 240;

export type ColumnPlan = {
    /** The table's initial column widths, used by double-click reset. */
    natural: number[];
    /** Current widths. Their sum always equals the table's used width. */
    widths: number[];
    /** Which columns naturally absorb a change in card width. */
    weight: number[];
    /** Per-column resize floor. */
    floor: number[];
    /** Authored CSS min-width (for example min-w-[960px]). */
    minTableWidth: number;
    /** Last card width applied; used only to skip redundant layout work. */
    room: number;
};

const plans = new WeakMap<HTMLTableElement, ColumnPlan>();

export const setColumnPlan = (table: HTMLTableElement, plan: ColumnPlan) => plans.set(table, plan);
export const getColumnPlan = (table: HTMLTableElement) => plans.get(table);
export const clearColumnPlan = (table: HTMLTableElement) => plans.delete(table);

/**
 * Measure which columns the browser grows when the table gets more room.
 * Explicit checkbox/action columns normally report zero; an unsized name or
 * description column reports the growth share. No frame is painted stretched.
 */
export const probeWeights = (table: HTMLTableElement, cells: HTMLTableCellElement[]) => {
    const before = cells.map((cell) => cell.getBoundingClientRect().width);
    const total = before.reduce((sum, width) => sum + width, 0);
    if (total <= 0) return before.map(() => 0);

    const style = table.style;
    const previous = { width: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth };
    style.width = `${total + PROBE_PX}px`;
    style.minWidth = `${total + PROBE_PX}px`;
    style.maxWidth = 'none';
    const after = cells.map((cell) => cell.getBoundingClientRect().width);
    style.width = previous.width;
    style.minWidth = previous.minWidth;
    style.maxWidth = previous.maxWidth;

    const growth = after.map((width, index) => Math.max(0, width - before[index]));
    const growthTotal = growth.reduce((sum, width) => sum + width, 0);
    if (growthTotal < PROBE_PX * 0.5) return before.map(() => 0);
    return growth.map((width) => width / growthTotal);
};

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Fit widths to an exact total without crossing column floors. Growth follows
 * the table's natural flexible columns. Shrink is taken from columns that have
 * actual room above their floor. A final one-pixel correction prevents browser
 * rounding from creating a scrollbar or a pale strip at the card edge.
 */
export const fitColumnWidths = (
    source: readonly number[],
    target: number,
    floors: readonly number[],
    weights: readonly number[],
) => {
    const widths = source.map((value, index) => Math.max(floors[index] ?? 24, Number(value) || 0));
    const minimum = sum(floors.map((value) => Math.max(0, value)));
    const exactTarget = Math.max(Math.round(target), Math.ceil(minimum));
    let remaining = exactTarget - sum(widths);

    if (remaining > 0.5) {
        let pool = weights
            .map((weight, index) => ({ index, weight }))
            .filter(({ weight }) => weight > 0);
        if (pool.length === 0 && widths.length > 0) {
            // Fully authored tables still need one elastic column so the card is
            // filled. Prefer the widest content column, not a narrow action cell.
            const index = widths.reduce((best, width, candidate) =>
                (width > widths[best] ? candidate : best), 0);
            pool = [{ index, weight: 1 }];
        }
        const totalWeight = pool.reduce((total, entry) => total + entry.weight, 0) || 1;
        for (const { index, weight } of pool) widths[index] += (remaining * weight) / totalWeight;
    } else if (remaining < -0.5) {
        // Give room back from the same structural columns that received it.
        // Utility/QR/action columns keep their authored size until the content
        // columns have reached their floors.
        const shrink = (preferredOnly: boolean) => {
            for (let pass = 0; pass < 6 && remaining < -0.5; pass += 1) {
                const pool = widths
                    .map((width, index) => ({
                        index,
                        slack: width - (floors[index] ?? 24),
                        share: preferredOnly ? (weights[index] || 0) : Math.max(1, width),
                    }))
                    .filter(({ slack, share }) => slack > 0.5 && share > 0);
                const shareTotal = pool.reduce((total, entry) => total + entry.share, 0);
                if (shareTotal <= 0) break;
                let moved = 0;
                for (const { index, slack, share } of pool) {
                    const take = Math.min(slack, (-remaining * share) / shareTotal);
                    widths[index] -= take;
                    moved += take;
                }
                if (moved <= 0.5) break;
                remaining += moved;
            }
        };
        shrink(true);
        if (remaining < -0.5) shrink(false);
    }

    const rounded = widths.map((width) => Math.round(width));
    if (rounded.length > 0) {
        const drift = exactTarget - sum(rounded);
        if (drift !== 0) {
            const candidates = rounded
                .map((width, index) => ({ index, room: width - (floors[index] ?? 24) }))
                .filter(({ room }) => drift > 0 || room + drift >= 0);
            const receiver = candidates.reduce(
                (best, entry) => (!best || entry.room > best.room ? entry : best),
                undefined as { index: number; room: number } | undefined,
            );
            if (receiver) rounded[receiver.index] += drift;
        }
    }
    return rounded;
};

const writePlan = (table: HTMLTableElement, plan: ColumnPlan) => {
    const cols = colsOf(table);
    if (cols.length !== plan.widths.length) return;
    cols.forEach((col, index) => {
        const width = `${plan.widths[index]}px`;
        if (col.style.width !== width) col.style.width = width;
    });

    const total = sum(plan.widths);
    const width = `${total}px`;
    // An exact used width avoids the browser redistributing a sub-pixel remainder
    // over every column. It is at least the card width, so there is no blank area.
    if (table.style.width !== width) table.style.width = width;
    table.dataset.colRoom = String(Math.round(plan.room));
};

/** Keep the table flush with its current card (or its authored minimum). */
export const applyColumnLayout = (table: HTMLTableElement) => {
    const plan = plans.get(table);
    const cols = colsOf(table);
    if (!plan || cols.length !== plan.widths.length) return;

    const room = roomFor(table);
    if (room <= 0) return;
    const target = Math.max(room, plan.minTableWidth, sum(plan.floor));
    const currentTotal = sum(plan.widths);
    if (Math.abs(currentTotal - target) > 0.5) {
        plan.widths = fitColumnWidths(plan.widths, target, plan.floor, plan.weight);
    }
    plan.room = room;
    writePlan(table, plan);
};

/**
 * Move boundary `index` while keeping the pair and table totals unchanged.
 * Returns the actual left width after both columns' minimums are honoured.
 */
export const resizeColumnBoundary = (table: HTMLTableElement, index: number, wantedLeft: number) => {
    const plan = plans.get(table);
    if (!plan || index < 0 || index >= plan.widths.length - 1) return null;

    const pairTotal = plan.widths[index] + plan.widths[index + 1];
    const leftFloor = plan.floor[index] ?? 24;
    const rightFloor = plan.floor[index + 1] ?? 24;
    const left = Math.round(Math.min(pairTotal - rightFloor, Math.max(leftFloor, wantedLeft)));
    plan.widths[index] = left;
    plan.widths[index + 1] = pairTotal - left;
    writePlan(table, plan);
    return left;
};

/** Restore one boundary to the table's original left/right proportion. */
export const resetColumnBoundary = (table: HTMLTableElement, index: number) => {
    const plan = plans.get(table);
    if (!plan || index < 0 || index >= plan.widths.length - 1) return;
    const pairTotal = plan.widths[index] + plan.widths[index + 1];
    const naturalTotal = plan.natural[index] + plan.natural[index + 1];
    const naturalLeft = naturalTotal > 0
        ? pairTotal * (plan.natural[index] / naturalTotal)
        : pairTotal / 2;
    resizeColumnBoundary(table, index, naturalLeft);
};
