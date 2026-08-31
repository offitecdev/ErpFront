import { t } from '@/i18n/translate';
import { runColumnDrag } from './columnResizeDrag';
import {
    applyColumnLayout,
    clearColumnPlan,
    colsOf,
    flexFloorFor,
    getColumnPlan,
    pinColumn,
    probeWeights,
    rememberChrome,
    roomFor,
    setColumnPlan,
} from './columnLayout';

/**
 * App-wide column resizing — every table, no per-table wiring.
 *
 * Each column is grabbed by its OWN RIGHT EDGE and a drag changes that column
 * alone; a wider or narrower card is shared out over the columns that were
 * flexible to begin with. Both rules, and why the shares are measured off the
 * real table, live in `lib/columnLayout` — this file is only the plumbing.
 *
 * How a table is prepared, once, the first time it is seen:
 *   1. the heading row is measured, so nothing on screen moves;
 *   2. the table is stretched for ONE frame (never painted) to read how the
 *      browser itself divides spare width between these columns;
 *   3. every column is frozen at the width it already has — a sized column
 *      keeps exactly what the user (or the page) gave it;
 *   4. each one except the LAST gets a grip on its right edge;
 *   5. widths the user dragged before are read back from localStorage.
 *
 * From then on the table answers to its card: `applyColumnLayout` runs whenever
 * the card resizes, so the table widens on a big screen and goes back to the
 * widths it would have been born with on a small one, instead of keeping the
 * pixel widths of whatever screen it happened to load on.
 *
 * A hand-wired table (`useColumnWidths` + `<ColResizeHandle>`, recognised by its
 * `data-col-resizer="react"` handles) sizes its own columns from React state.
 * There this layer only takes over the column React left WITHOUT a width — the
 * one that used to stretch — so that column becomes draggable too instead of
 * silently swallowing every drag, and it is also the one that absorbs a change
 * of screen width.
 *
 * Opt out of a single table with `data-no-col-resize`, and pin its remembered
 * widths to a stable name with `data-col-key="…"` (otherwise the key is derived
 * from the route and the heading labels).
 */

const TABLE_SELECTOR = [
    'table[data-inv-table]',
    'table[data-montage-table]',
    'table[data-tender-detail-table]',
    'table[data-col-resize]',
].join(', ');

/* `auto3` because what is stored changed shape (2026-08-19): every column's
   pixel width used to be written down, which is precisely what made a table
   keep its big-screen layout on a small screen. Only columns the user actually
   dragged are remembered now, together with the card width they were set at. */
const STORAGE_PREFIX = 'offitec:col-widths:auto3:';
const MIN_PX = 56;
const MAX_PX = 900;

/** Per table: the widths it was born with — what a double-click restores. */
const naturalWidths = new WeakMap<HTMLTableElement, number[]>();

/**
 * A column may never be dragged below `MIN_PX` — unless it was BORN narrower
 * (a checkbox or icon column), in which case its own width is the floor.
 * Clamping those up to 56 px on sight would silently re-lay-out the table.
 */
const dragFloorFor = (naturalPx: number) => Math.min(MIN_PX, Math.round(naturalPx));
/* On a wide screen a column may legitimately be dragged wider than `MAX_PX`;
   the cap only exists to keep a stray drag from producing a 4000 px column. */
const dragCeilingFor = (table: HTMLTableElement) => Math.max(MAX_PX, Math.round(roomFor(table) * 0.8));
const clampPx = (px: number, floor: number, ceiling: number) =>
    Math.round(Math.min(ceiling, Math.max(floor, px)));

/* FNV-1a — only ever used to keep the storage key short. */
const hash = (input: string) => {
    let value = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        value ^= input.charCodeAt(i);
        value = Math.imul(value, 0x01000193);
    }
    return (value >>> 0).toString(36);
};

const storageKeyFor = (table: HTMLTableElement, cells: HTMLTableCellElement[]) => {
    const explicit = table.getAttribute('data-col-key');
    if (explicit) return `${STORAGE_PREFIX}${explicit}`;
    // Record ids differ per row but the table is the same one, so they are
    // folded away; the heading labels separate the tables that share a route.
    const path = window.location.pathname.replace(/\/\d+(?=\/|$)/g, '/:id');
    const labels = cells
        .map((cell) => (cell.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32))
        .join('|');
    return `${STORAGE_PREFIX}${path}:${cells.length}:${hash(labels)}`;
};

type StoredWidths = { widths: Array<number | null>; room: number };

const readStored = (key: string, count: number): StoredWidths | null => {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (!parsed || !Array.isArray(parsed.widths) || parsed.widths.length !== count) return null;
        return {
            // `null` is the normal case — a column the user never dragged. It has
            // to stay null: `Number(null)` is 0, and a zero would come back as a
            // pin and squeeze the column down to its floor.
            widths: parsed.widths.map((entry: unknown) =>
                (entry == null || !Number.isFinite(Number(entry)) ? null : Number(entry))),
            room: Number.isFinite(Number(parsed.room)) ? Number(parsed.room) : 0,
        };
    } catch {
        return null; /* a corrupt entry just means "use the table's own layout" */
    }
};

/** Only the columns the user dragged are remembered; the rest follow the card. */
const persist = (table: HTMLTableElement) => {
    const key = table.dataset.colStorageKey;
    const plan = getColumnPlan(table);
    if (!key || !plan) return;
    try {
        localStorage.setItem(key, JSON.stringify({ widths: plan.pinned, room: Math.round(roomFor(table)) }));
    } catch {
        /* persistence is best-effort */
    }
};

/**
 * A width the user dragged on ANOTHER screen size. Kept as it is when there is
 * at least as much room as back then; scaled down with the card when there is
 * less, so a 600 px column set on a 2400 px screen does not swallow a laptop.
 * A column the user made NARROW is never scaled below what they chose — only
 * the room they added above the floor is given back.
 */
const replayPinned = (stored: number, storedRoom: number, room: number, floor: number, ceiling: number) => {
    if (!storedRoom || room >= storedRoom) return clampPx(stored, floor, ceiling);
    const scaled = Math.round(stored * (room / storedRoom));
    return clampPx(Math.max(scaled, Math.min(stored, floor)), floor, ceiling);
};

/**
 * The `<colgroup>` the widths are written to. Tables that ship one are used as
 * they are; the rest get an empty one, which changes nothing on screen because
 * a `<col>` without a width behaves exactly like no `<col>` at all.
 * Returns `null` for a colgroup this layer cannot map one-to-one onto columns.
 */
const ensureCols = (table: HTMLTableElement, count: number) => {
    const group = table.querySelector(':scope > colgroup');
    if (group) {
        const cols = Array.from(group.children).filter((el): el is HTMLTableColElement => el.tagName === 'COL');
        if (cols.length !== count || cols.some((col) => (col.span || 1) > 1)) return null;
        return { cols, created: false };
    }
    const created = document.createElement('colgroup');
    created.dataset.colAuto = 'created'; // so `reset` knows it may throw it away
    for (let i = 0; i < count; i += 1) created.appendChild(document.createElement('col'));
    table.insertBefore(created, table.firstChild);
    return { cols: Array.from(created.children) as HTMLTableColElement[], created: true };
};

const makeGrip = (index: number) => {
    const grip = document.createElement('span');
    grip.className = 'ofi-col-grip ofi-col-grip--right';
    grip.dataset.colResizer = 'auto';
    grip.dataset.colIndex = String(index);
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.title = t('tenders.column_resize');
    return grip;
};

/** `off` = decided against for good; only structural reasons ever land here. */
const decline = (table: HTMLTableElement) => table.setAttribute('data-col-auto', 'off');

/**
 * Undo everything `enable` did, so the table can be prepared again. Needed when
 * a table gains or loses a column after it was prepared (a toggled column, a
 * view switch that reuses the same `<table>`): the grips carry column INDEXES,
 * and stale indexes would drag the wrong column.
 */
const reset = (table: HTMLTableElement) => {
    table.querySelectorAll('[data-col-resizer="auto"]').forEach((grip) => grip.remove());
    const plan = getColumnPlan(table);
    colsOf(table).forEach((col, index) => {
        // React-sized columns keep their width — it is not this layer's to clear,
        // and React only rewrites a style it sees change.
        if (!plan?.own[index]) return;
        col.style.width = '';
    });
    clearColumnPlan(table);
    // A colgroup this layer made itself has the OLD column count; drop it so the
    // next pass builds one that matches.
    table.querySelector(':scope > colgroup[data-col-auto="created"]')?.remove();
    delete table.dataset.colStorageKey;
    delete table.dataset.colCount;
    delete table.dataset.colChrome;
    delete table.dataset.colRoom;
    table.removeAttribute('data-col-fill');
    table.removeAttribute('data-col-auto');
};

const enable = (table: HTMLTableElement) => {
    const state = table.getAttribute('data-col-auto');
    if (state === 'off') return;
    if (table.hasAttribute('data-no-col-resize')) return decline(table);

    const row = table.tHead?.rows[0];
    // No heading row (yet) — a table that fills in later gets another chance.
    if (!row) return;
    const cells = Array.from(row.cells);
    if (state === 'on') {
        if (cells.length === Number(table.dataset.colCount)) return;
        reset(table); // the column set changed underneath us
    }
    if (cells.length < 2) return;
    // Grouped headings have no one-to-one column mapping to drag.
    if (cells.some((cell) => cell.colSpan > 1)) return;

    // Still off screen (a closed popup, a tab that was never opened): measuring
    // now would freeze every column at zero. Leave it unmarked and try again.
    if (table.getClientRects().length === 0) return;
    const measured = cells.map((cell) => cell.getBoundingClientRect().width);
    if (measured.some((width) => width <= 0)) return;

    // Read the browser's own division of spare width BEFORE a single column is
    // frozen — after that the table would answer with the frozen layout.
    const weight = probeWeights(table, cells);

    const group = ensureCols(table, cells.length);
    // A colgroup that does not map one-to-one onto the columns (spans, a
    // different count) is a table this layer cannot reason about.
    if (!group) return decline(table);
    const { cols } = group;

    // A hand-wired table has already sized its own columns from React state;
    // the only one to take over is the one it left stretching.
    const handWired = !!table.querySelector('[data-col-resizer="react"]');
    const own = cols.map((col) => !handWired || !col.style.width);

    // Measured BEFORE any stored width lands, i.e. while the table still has the
    // layout it was born with — that is the gap the layout reproduces.
    rememberChrome(table, measured.reduce((total, width) => total + width, 0));

    const key = storageKeyFor(table, cells);
    const stored = readStored(key, cells.length);
    const room = roomFor(table);
    const ceiling = dragCeilingFor(table);
    const pinned = cols.map((_, index) => {
        const remembered = own[index] ? stored?.widths[index] : null;
        if (remembered == null) return null;
        return replayPinned(remembered, stored?.room || 0, room, dragFloorFor(measured[index]), ceiling);
    });

    setColumnPlan(table, {
        natural: measured.map((width) => Math.round(width)),
        weight,
        floor: measured.map((width) => flexFloorFor(width)),
        own,
        pinned,
        room: Math.round(room),
    });
    naturalWidths.set(table, measured.map((width) => Math.round(width)));
    table.dataset.colStorageKey = key;

    cells.forEach((cell, index) => {
        // The last column carries no grip: its right edge IS the table's edge,
        // so there is no line between two cells for the user to grab there.
        if (index === cells.length - 1 || !own[index]) return;
        if (cell.querySelector('[data-col-resizer]')) return; // React put one there
        // The grip is absolutely positioned inside the heading. Set this here
        // rather than in a stylesheet: an unlayered `position: relative` rule
        // would beat a Tailwind `sticky`/`absolute` utility on the same cell.
        if (window.getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
        cell.appendChild(makeGrip(index));
    });

    table.dataset.colCount = String(cells.length);
    table.setAttribute('data-col-fill', ''); // index.css lets its card scroll sideways
    table.setAttribute('data-col-auto', 'on');
    observeRoom(table);
    applyColumnLayout(table);
};

const gripFrom = (target: EventTarget | null) => {
    const element = target as Element | null;
    if (!element?.closest) return null;
    return element.closest<HTMLElement>('[data-col-resizer="auto"]');
};

const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const grip = gripFrom(event.target);
    if (!grip) return;
    const table = grip.closest('table');
    const th = grip.closest('th');
    const row = table?.tHead?.rows[0];
    if (!table || !th || !row) return;

    // Capture phase, before React: a heading that also sorts must not sort now.
    event.preventDefault();
    event.stopPropagation();

    const index = Number(grip.dataset.colIndex);
    const cols = colsOf(table);
    const cells = Array.from(row.cells);
    if (!cols[index] || !cells[index]) return;

    // The heading cell, not the <col>: only the cell reports a usable box in
    // every browser.
    const startWidth = cells[index].getBoundingClientRect().width;
    const minPx = dragFloorFor(naturalWidths.get(table)?.[index] ?? MIN_PX);
    const maxPx = dragCeilingFor(table);
    const col = cols[index];

    runColumnDrag({
        table,
        th,
        startX: event.clientX,
        startWidth,
        clamp: (px) => Math.round(Math.min(maxPx, Math.max(minPx, px))),
        apply: (px) => {
            // Dragging PINS the column: it keeps this width from now on, and a
            // later change of screen width is shared out over the others. Only
            // the columns to its RIGHT may take room it frees, so the edge under
            // the cursor is the edge that moves.
            pinColumn(table, index, px);
            col.style.width = `${px}px`;
            applyColumnLayout(table, { growOnly: true, after: index });
        },
        commit: (px) => {
            pinColumn(table, index, px);
            col.style.width = `${px}px`;
            applyColumnLayout(table, { growOnly: true, after: index });
            persist(table);
        },
    });
};

/**
 * `preventDefault` on pointerdown does not stop the click that follows, and a
 * sortable heading would happily re-sort the list the moment a drag ends.
 */
const onClick = (event: MouseEvent) => {
    if (!gripFrom(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
};

const onDoubleClick = (event: MouseEvent) => {
    const grip = gripFrom(event.target);
    if (!grip) return;
    const table = grip.closest('table');
    if (!table) return;
    const index = Number(grip.dataset.colIndex);
    if (!getColumnPlan(table)) return;
    event.preventDefault();
    event.stopPropagation();
    // Releasing the pin puts the column back into the flexible set, so it lands
    // on the width this card would have given it all along.
    pinColumn(table, index, null);
    applyColumnLayout(table);
    persist(table);
};

/**
 * A card that changes width — a window resize, the split view's divider, a
 * collapsing panel, a popup being dragged wider — is what rule 2 answers to.
 * One observer watches every prepared table's card; `applyColumnLayout` itself
 * is cheap and only writes what really changed.
 */
let roomObserver: ResizeObserver | null = null;
const observedHosts = new WeakSet<Element>();
/** Last width seen per card — a card that only got TALLER changes nothing. */
const hostWidths = new WeakMap<Element, number>();
let layoutQueued = false;

const relayoutAll = () => {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
        layoutQueued = false;
        document
            .querySelectorAll<HTMLTableElement>('table[data-col-fill]')
            .forEach((table) => applyColumnLayout(table));
    });
};

const observeRoom = (table: HTMLTableElement) => {
    const host = table.parentElement;
    if (!host || !roomObserver || observedHosts.has(host)) return;
    observedHosts.add(host);
    roomObserver.observe(host);
};

/** Widths written by an older layout rule, kept nowhere but in the way. */
const dropStaleStorage = () => {
    try {
        Object.keys(localStorage)
            .filter((key) => key.startsWith('offitec:col-widths:auto2:'))
            .forEach((key) => localStorage.removeItem(key));
    } catch {
        /* a locked-down storage just keeps them */
    }
};

let installed = false;

/** Called once at boot (main.tsx). Safe to call again — it only ever runs once. */
export const installAutoColumnResize = () => {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    dropStaleStorage();

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDoubleClick, true);

    if (typeof ResizeObserver !== 'undefined') {
        // Rows coming and going resize the card VERTICALLY all the time; only a
        // change of width can change a column. The work is batched into the next
        // frame and the layout only writes widths that really change, so this
        // cannot chase its own tail.
        roomObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = Math.round(entry.contentRect.width);
                if (hostWidths.get(entry.target) === width) continue;
                hostWidths.set(entry.target, width);
                relayoutAll();
                return;
            }
        });
    }

    let queued = false;
    const scan = () => {
        queued = false;
        document.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach(enable);
    };
    const schedule = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(scan);
    };

    // Tables have to be prepared BEFORE the user reaches for them, or remembered
    // widths would snap into place under the cursor. One rAF-debounced sweep per
    // batch of DOM changes is enough — `enable` marks what it has decided, so a
    // sweep over an unchanged page does nothing but a querySelectorAll. Text-only
    // updates (a re-rendered label, a ticking counter) are skipped outright:
    // those are the mutations a busy React page fires by the hundred.
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    schedule();
                    return;
                }
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    schedule();

    // A card that got wider or narrower is shared out over the flexible columns;
    // page-sized and pinned columns keep what they have.
    window.addEventListener('resize', relayoutAll);

    // Safety net for a table that becomes visible without the DOM changing (a
    // tab panel that was only hidden): pointing at it is a prerequisite for
    // dragging it anyway.
    document.addEventListener(
        'pointerover',
        (event) => {
            const table = (event.target as Element | null)?.closest?.(TABLE_SELECTOR) as HTMLTableElement | null;
            if (table) enable(table);
        },
        true,
    );
};
