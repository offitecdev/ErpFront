/**
 * The geometry every resizable table column shares — one rule, both paths
 * (`useColumnWidths` in React and the app-wide `autoColumnResize` layer).
 *
 * TWO RULES LIVE HERE, and they must not be confused with each other:
 *
 * 1. THE DRAG (user, 2026-08-16): a column is grabbed by its OWN RIGHT EDGE,
 *    and dragging it changes the width of THAT column only. Drag right, it gets
 *    wider; drag left, narrower. The cells next to it keep the width they had —
 *    they only slide along — and the table as a whole grows with the drag, so
 *    the edge under the cursor stays under the cursor. A dragged column is
 *    PINNED: from then on it keeps that width and stops taking part in rule 2.
 *
 * 2. THE ROOM (user, 2026-08-19: "tables must widen on a big screen and go back
 *    to their old size on a small one, otherwise there are big empty gaps"):
 *    when the card around the table gets wider or narrower, the difference is
 *    handed to the columns that were FLEXIBLE before this layer froze anything —
 *    in the same proportions the browser itself would have used. A page-sized
 *    column (a 40 px checkbox, a 144 px action column) never scales, and a
 *    pinned column never scales either.
 *
 * Why the proportions are MEASURED and not guessed: with `table-layout: fixed`
 * the browser hands a table's spare width out linearly — every column grows by
 * its own fixed share of each added pixel. `probeWeights` reads exactly those
 * shares off the real table, once, while it still has its natural layout: widen
 * the table by a known amount, see who moved and by how much, put it back. From
 * then on `applyColumnLayout` can reproduce the browser's own answer for ANY
 * room, which is why a table narrowed from 2400 to 1100 px lands on the same
 * widths it would have had if the page had loaded at 1100 in the first place.
 *
 * Why the widths cannot simply be left to the browser: a column can only be
 * dragged if it has a width of its own, and the moment one column is sized the
 * others must be too — `table-layout: fixed` splits any leftover room over ALL
 * columns (4 × 100 px in a 600 px box → 150 px each), and a column left without
 * a width collapses to zero as soon as the others grow past the card.
 */

const px = (value: string | null | undefined) => Number.parseFloat(value || '');

export const colsOf = (table: HTMLTableElement): HTMLTableColElement[] => {
    const group = table.querySelector(':scope > colgroup');
    if (!group) return [];
    return Array.from(group.children).filter((el): el is HTMLTableColElement => el.tagName === 'COL');
};

/** Content width of the box the table lays itself out in — its "card". */
export const roomFor = (table: HTMLTableElement) => {
    const host = table.parentElement;
    if (!host) return 0;
    const style = window.getComputedStyle(host);
    return host.clientWidth - (px(style.paddingLeft) || 0) - (px(style.paddingRight) || 0);
};

/**
 * How narrow a flexible column may get when the card shrinks. Below its own
 * natural width it is never squeezed further than this — at that point the
 * table stops shrinking and its card scrolls sideways instead, because columns
 * ground down to slivers are worse than a scrollbar.
 */
const FLEX_FLOOR = 120;
export const flexFloorFor = (natural: number) => Math.min(Math.round(natural), FLEX_FLOOR);

/** How much wider the table is made for one frame to read its growth shares. */
const PROBE_PX = 240;

export type ColumnPlan = {
    /** Width per column as the browser laid it out, before anything was frozen. */
    natural: number[];
    /** Per column: how much of one added pixel of room it takes (shares sum to 1). */
    weight: number[];
    /** Per column: the width it is never shrunk below by a narrowing card. */
    floor: number[];
    /** Per column: may this layer write the width, or does React own it? */
    own: boolean[];
    /** Per column: the width the user dragged it to, and therefore keeps. */
    pinned: Array<number | null>;
    /** The card width the natural layout was measured at — bookkeeping only. */
    room: number;
};

const plans = new WeakMap<HTMLTableElement, ColumnPlan>();

export const setColumnPlan = (table: HTMLTableElement, plan: ColumnPlan) => plans.set(table, plan);
export const getColumnPlan = (table: HTMLTableElement) => plans.get(table);
export const clearColumnPlan = (table: HTMLTableElement) => plans.delete(table);

/** Pin a column to a width — what a drag does. `null` releases it again. */
export const pinColumn = (table: HTMLTableElement, index: number, width: number | null) => {
    const plan = plans.get(table);
    if (!plan || index < 0 || index >= plan.pinned.length) return;
    plan.pinned[index] = width == null ? null : Math.round(width);
};

/**
 * Read every column's share of the table's spare width off the live table.
 *
 * Runs while the table still has its own layout (no width has been frozen yet)
 * and inside one task, so the two measurements are separated by a forced reflow
 * and never by a paint — nothing flashes on screen.
 *
 * A table whose columns are ALL page-sized reports no growth at all; its
 * columns then keep their widths at every screen size, which is exactly what
 * the page asked for by sizing them.
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

    const grown = after.map((width, index) => Math.max(0, width - before[index]));
    const sum = grown.reduce((all, width) => all + width, 0);
    // Under a hair of movement the table did not really stretch (a popup that
    // is as wide as its content, a table already at its maximum): treat every
    // column as page-sized rather than dividing rounding noise between them.
    if (sum < PROBE_PX * 0.5) return before.map(() => 0);
    return grown.map((width) => width / sum);
};

/**
 * The room the card holds BESIDES the columns — the gap of a table that is
 * deliberately narrower than its card. Taken once, while the table still has its
 * natural layout, so the layout below reproduces the width it started with.
 *
 * Never negative: with collapsed borders the heading cells measure a pixel or
 * two MORE than the table they sit in, and paying that back would leave every
 * table in the app with a two-pixel scrollbar.
 */
export const rememberChrome = (table: HTMLTableElement, columnTotal: number) => {
    const room = roomFor(table);
    table.dataset.colChrome = String(room > 0 ? Math.max(0, Math.round(room - columnTotal)) : 0);
};

export type ApplyOptions = {
    /**
     * `true` while a drag is in flight: the other columns may only GROW into
     * room the drag freed, never give room back to it. That is rule 1 — the drag
     * moves one column and one column only, and the table is allowed to grow
     * past its card (the card scrolls, see `data-col-fill` in index.css).
     */
    growOnly?: boolean;
    /**
     * Index of the column being dragged. Only the columns AFTER it may take the
     * room it freed: the user grabbed its RIGHT edge, so that edge has to follow
     * the cursor. Letting a column on the LEFT absorb instead would hold the
     * grabbed edge still and move the one on the other side of the cell — which
     * is exactly the behaviour the right-edge rule replaced.
     */
    after?: number;
};

/**
 * Lay the columns out for the room the card has right now — rule 2.
 *
 * Called after preparing a table, on every room change, and during a drag. It
 * writes only the columns this layer owns and only when a width really changed,
 * so a table nobody is touching costs one measurement.
 */
export const applyColumnLayout = (table: HTMLTableElement, options: ApplyOptions = {}) => {
    const plan = plans.get(table);
    const cols = colsOf(table);
    if (!plan || cols.length !== plan.natural.length) return;

    const room = roomFor(table);
    if (room <= 0) return;
    const chrome = px(table.dataset.colChrome) || 0;
    const target = room - chrome;

    // Where every column starts from: its pinned width if the user set one, the
    // width React gave it if the page owns it, otherwise its natural width.
    const widths = cols.map((col, index) => {
        if (!plan.own[index]) {
            const current = px(col.style.width);
            return Number.isFinite(current) ? current : plan.natural[index];
        }
        return plan.pinned[index] ?? plan.natural[index];
    });

    let remaining = target - widths.reduce((sum, width) => sum + width, 0);
    const after = options.after ?? -1;
    // A pinned column is out of the game — the user set that width on purpose.
    let pool = plan.weight
        .map((weight, index) => ({ index, weight }))
        .filter(({ index, weight }) =>
            weight > 0 && index > after && plan.own[index] && plan.pinned[index] == null)
        .map(({ index }) => index);

    if (options.growOnly && remaining < 0) remaining = 0;

    if (pool.length === 0) {
        // Nothing flexible left (every column page-sized, or the user has pinned
        // the flexible ones). The difference still has to go somewhere, or the
        // browser would hand it out over ALL columns and move cells nobody
        // touched — the last column takes it, the way it always did, and gives
        // it back down to its floor when the card shrinks.
        const tail = cols.length - 1;
        if (Math.abs(remaining) > 0.5 && tail > after && plan.own[tail] && plan.pinned[tail] == null) {
            widths[tail] = Math.max(plan.floor[tail], widths[tail] + remaining);
        }
    } else {
        // Several passes: a column that hits its floor drops out and hands the
        // rest of the shrink back to the columns that still have room to give.
        for (let pass = 0; pass < 4 && Math.abs(remaining) > 0.5 && pool.length > 0; pass += 1) {
            const share = pool.reduce((sum, index) => sum + plan.weight[index], 0);
            if (share <= 0) break;
            const next: number[] = [];
            let moved = 0;
            for (const index of pool) {
                const wanted = widths[index] + (remaining * plan.weight[index]) / share;
                const capped = Math.max(plan.floor[index], wanted);
                moved += capped - widths[index];
                widths[index] = capped;
                if (capped > plan.floor[index]) next.push(index);
            }
            remaining -= moved;
            pool = next;
        }
    }

    const rounded = widths.map((width) => Math.round(width));
    // Rounding leaves up to one pixel per column on the table; give it to the
    // widest flexible column so the table ends flush with its card. ONLY that
    // rounding: a bigger gap means the table is deliberately wider than its card
    // (a drag) or cannot fill it (no column left to absorb), and correcting
    // either of those here would undo the very thing that produced it.
    const flexible = plan.weight
        .map((weight, index) => ({ index, weight }))
        .filter(({ index, weight }) =>
            weight > 0 && index > after && plan.own[index] && plan.pinned[index] == null);
    if (flexible.length > 0) {
        const widest = flexible.reduce((best, entry) => (rounded[entry.index] > rounded[best.index] ? entry : best));
        const drift = Math.round(target) - rounded.reduce((sum, width) => sum + width, 0);
        if (drift !== 0 && Math.abs(drift) <= cols.length && rounded[widest.index] + drift >= plan.floor[widest.index]) {
            rounded[widest.index] += drift;
        }
    }

    cols.forEach((col, index) => {
        if (!plan.own[index]) return;
        const width = `${rounded[index]}px`;
        if (col.style.width !== width) col.style.width = width;
    });

    // Nothing could take the leftover — the user dragged the LAST column
    // narrower, and there is no column to its right. The table then has to state
    // its own width: left at `width: 100%` the browser would hand that leftover
    // out over ALL columns and quietly undo the drag. Below the app's `lg`
    // breakpoint the responsive block owns the table's width (it is content-sized
    // and scrolls there), so this stays out of its way.
    const total = rounded.reduce((sum, width) => sum + width, 0);
    const narrow = window.matchMedia?.('(max-width: 1023px)').matches ?? false;
    if (!narrow && total < Math.round(target) - 1) table.style.width = `${total}px`;
    else if (table.style.width) table.style.width = '';

    table.dataset.colRoom = String(Math.round(room));
};
