import { t } from '@/i18n/translate';
import { runColumnDrag } from './columnResizeDrag';
import {
    applyColumnLayout,
    clearColumnPlan,
    colsOf,
    fitColumnWidths,
    flexFloorFor,
    getColumnPlan,
    probeWeights,
    resetColumnBoundary,
    resizeColumnBoundary,
    roomFor,
    setColumnPlan,
} from './columnLayout';

/**
 * App-wide table column resizing.
 *
 * Every visible HTML data table is prepared automatically. A handle is a
 * boundary between two columns: dragging it grows one column and shrinks the
 * next by exactly the same amount. The total width never changes during a drag,
 * so the table cannot leave blank space in its card.
 *
 * Use `data-no-col-resize` only for a deliberately non-tabular two-column
 * summary. Grouped headings are skipped because one heading does not map to one
 * physical column.
 */
const TABLE_SELECTOR = 'table:not([role="grid"])';
const STORAGE_PREFIX = 'offitec:col-widths:auto4:';

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

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
    const path = window.location.pathname.replace(/\/\d+(?=\/|$)/g, '/:id');
    const labels = cells
        .map((cell) => (cell.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32))
        .join('|');
    return `${STORAGE_PREFIX}${path}:${cells.length}:${hash(labels)}`;
};

type StoredLayout = { widths: number[]; room: number };

const readStored = (key: string, count: number): StoredLayout | null => {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null') as Partial<StoredLayout> | null;
        if (!parsed || !Array.isArray(parsed.widths) || parsed.widths.length !== count) return null;
        const widths = parsed.widths.map(Number);
        if (widths.some((width) => !Number.isFinite(width) || width <= 0)) return null;
        return {
            widths,
            room: Number.isFinite(Number(parsed.room)) ? Number(parsed.room) : 0,
        };
    } catch {
        return null;
    }
};

const persist = (table: HTMLTableElement) => {
    const key = table.dataset.colStorageKey;
    const plan = getColumnPlan(table);
    if (!key || !plan) return;
    try {
        localStorage.setItem(key, JSON.stringify({
            widths: plan.widths,
            room: Math.round(roomFor(table)),
        }));
    } catch {
        /* Persistence is best-effort. */
    }
};

/**
 * Create a one-to-one colgroup when the page did not provide one. Colgroups
 * using spans cannot safely be resized by heading index.
 */
const ensureCols = (table: HTMLTableElement, count: number) => {
    const group = table.querySelector(':scope > colgroup');
    if (group) {
        const cols = Array.from(group.children)
            .filter((el): el is HTMLTableColElement => el.tagName === 'COL');
        if (cols.length !== count || cols.some((col) => (col.span || 1) > 1)) return null;
        return cols;
    }
    const created = document.createElement('colgroup');
    created.dataset.colAuto = 'created';
    for (let index = 0; index < count; index += 1) {
        created.appendChild(document.createElement('col'));
    }
    table.insertBefore(created, table.firstChild);
    return Array.from(created.children) as HTMLTableColElement[];
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

const decline = (table: HTMLTableElement) => table.setAttribute('data-col-auto', 'off');

const originalTableWidth = new WeakMap<HTMLTableElement, string>();
const originalColWidths = new WeakMap<HTMLTableElement, string[]>();

const reset = (table: HTMLTableElement) => {
    table.querySelectorAll('[data-col-resizer="auto"]').forEach((grip) => grip.remove());
    table.querySelectorAll<HTMLElement>('[data-col-resizer="react"]').forEach((grip) => {
        delete grip.dataset.colIndex;
        delete grip.dataset.colTerminal;
    });

    const cols = colsOf(table);
    const originals = originalColWidths.get(table);
    if (originals?.length === cols.length) {
        cols.forEach((col, index) => {
            col.style.width = originals[index] || '';
        });
    }
    const originalWidth = originalTableWidth.get(table);
    if (originalWidth !== undefined) table.style.width = originalWidth;

    clearColumnPlan(table);
    table.querySelector(':scope > colgroup[data-col-auto="created"]')?.remove();
    delete table.dataset.colStorageKey;
    delete table.dataset.colCount;
    delete table.dataset.colRoom;
    table.removeAttribute('data-col-fill');
    table.removeAttribute('data-col-auto');
};

const authoredMinimum = (table: HTMLTableElement) => {
    const value = Number.parseFloat(window.getComputedStyle(table).minWidth || '');
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
};

const enable = (table: HTMLTableElement) => {
    const state = table.getAttribute('data-col-auto');
    if (state === 'off') return;
    if (table.hasAttribute('data-no-col-resize')) return decline(table);

    const row = table.tHead?.rows[0];
    if (!row) return;
    const cells = Array.from(row.cells);
    if (state === 'on') {
        if (cells.length === Number(table.dataset.colCount)) return;
        reset(table);
    }
    if (cells.length < 2 || cells.some((cell) => cell.colSpan > 1)) return decline(table);
    if (table.getClientRects().length === 0) return;

    const measured = cells.map((cell) => cell.getBoundingClientRect().width);
    if (measured.some((width) => width <= 0)) return;

    const existingGroup = table.querySelector(':scope > colgroup');
    const existingCols = existingGroup
        ? Array.from(existingGroup.children)
            .filter((el): el is HTMLTableColElement => el.tagName === 'COL')
        : [];
    const authoredWidths = existingCols.length === cells.length
        ? existingCols.map((col) => col.style.width)
        : null;

    // Reconstruct the table at a normal desktop scale before expanding it to
    // an ultra-wide card. Otherwise a single blank <col> can be measured at
    // 2400px while its four 150–260px siblings stay frozen, which technically
    // fills the card but destroys the table's structure.
    const canonicalRoom = 1440;
    const structuralNatural = authoredWidths
        ? measured.map((width, index) => {
            const authored = authoredWidths[index].trim();
            const numeric = Number.parseFloat(authored);
            if (authored.endsWith('%') && Number.isFinite(numeric)) {
                return Math.round((canonicalRoom * numeric) / 100);
            }
            if (authored && Number.isFinite(numeric)) return Math.round(numeric);
            return Math.min(Math.round(width), 420);
        })
        : measured.map((width) => Math.round(width));

    // Read natural growth before freezing any width. On ultra-wide monitors
    // all real content columns share added room in structural proportion. A
    // narrow terminal action/QR column remains fixed.
    const probedWeight = probeWeights(table, cells);
    const growthBase = structuralNatural.map((width, index) => {
        const terminalUtility = index === measured.length - 1 && width <= 180;
        if (terminalUtility) return 0;
        return probedWeight[index] > 0 || width > 96 ? width : 0;
    });
    const growthTotal = sum(growthBase);
    const weight = growthTotal > 0
        ? growthBase.map((value) => value / growthTotal)
        : structuralNatural.map((width) => width / sum(structuralNatural));
    const minTableWidth = authoredMinimum(table);
    const cols = ensureCols(table, cells.length);
    if (!cols) return decline(table);

    originalTableWidth.set(table, table.style.width);
    originalColWidths.set(table, cols.map((col) => col.style.width));

    const natural = structuralNatural;
    const floor = natural.map(flexFloorFor);
    const room = roomFor(table);
    const target = Math.max(room, minTableWidth, sum(floor));
    const key = storageKeyFor(table, cells);
    const stored = readStored(key, cells.length);
    const source = stored?.widths ?? natural;
    const widths = fitColumnWidths(source, target, floor, weight);

    setColumnPlan(table, {
        natural,
        widths,
        weight,
        floor,
        minTableWidth,
        room,
    });
    table.dataset.colStorageKey = key;

    cells.forEach((cell, index) => {
        const existing = cell.querySelector<HTMLElement>(':scope > [data-col-resizer]');
        if (index === cells.length - 1) {
            // The outside edge is not a column boundary. Existing hand-wired
            // terminal handles stay in the DOM but are inert and hidden.
            if (existing) existing.dataset.colTerminal = '';
            return;
        }

        const grip = existing ?? makeGrip(index);
        grip.dataset.colIndex = String(index);
        delete grip.dataset.colTerminal;
        if (!existing) {
            if (window.getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
            cell.appendChild(grip);
        }
    });

    table.dataset.colCount = String(cells.length);
    table.setAttribute('data-col-fill', '');
    table.setAttribute('data-col-auto', 'on');
    observeRoom(table);
    applyColumnLayout(table);
};

const gripFrom = (target: EventTarget | null) => {
    const element = target as Element | null;
    return element?.closest?.<HTMLElement>('[data-col-resizer]') ?? null;
};

const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const grip = gripFrom(event.target);
    if (!grip) return;
    const table = grip.closest('table');
    const th = grip.closest('th');
    if (!table || !th || table.getAttribute('data-col-auto') !== 'on') return;

    // Capture before React so hand-wired and automatic handles use this one rule.
    event.preventDefault();
    event.stopPropagation();
    if (grip.hasAttribute('data-col-terminal')) return;

    const index = Number(grip.dataset.colIndex);
    const plan = getColumnPlan(table);
    if (!plan || index < 0 || index >= plan.widths.length - 1) return;
    const pairTotal = plan.widths[index] + plan.widths[index + 1];
    const minimum = plan.floor[index];
    const maximum = pairTotal - plan.floor[index + 1];

    runColumnDrag({
        table,
        th,
        startX: event.clientX,
        startWidth: plan.widths[index],
        clamp: (width) => Math.round(Math.min(maximum, Math.max(minimum, width))),
        apply: (width) => {
            resizeColumnBoundary(table, index, width);
        },
        commit: (width) => {
            resizeColumnBoundary(table, index, width);
            persist(table);
        },
    });
};

const onClick = (event: MouseEvent) => {
    const grip = gripFrom(event.target);
    if (!grip || !grip.closest('table[data-col-auto="on"]')) return;
    event.preventDefault();
    event.stopPropagation();
};

const onDoubleClick = (event: MouseEvent) => {
    const grip = gripFrom(event.target);
    const table = grip?.closest('table');
    if (!grip || !table || table.getAttribute('data-col-auto') !== 'on') return;
    event.preventDefault();
    event.stopPropagation();
    if (grip.hasAttribute('data-col-terminal')) return;
    resetColumnBoundary(table, Number(grip.dataset.colIndex));
    persist(table);
};

let roomObserver: ResizeObserver | null = null;
const observedHosts = new WeakSet<Element>();
const hostWidths = new WeakMap<Element, number>();
let layoutQueued = false;

const relayoutAll = () => {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
        layoutQueued = false;
        document
            .querySelectorAll<HTMLTableElement>('table[data-col-auto="on"]')
            .forEach((table) => applyColumnLayout(table));
    });
};

const observeRoom = (table: HTMLTableElement) => {
    const host = table.parentElement;
    if (!host || !roomObserver || observedHosts.has(host)) return;
    observedHosts.add(host);
    roomObserver.observe(host);
};

const dropStaleStorage = () => {
    try {
        Object.keys(localStorage)
            .filter((key) =>
                key.startsWith('offitec:col-widths:auto2:')
                || key.startsWith('offitec:col-widths:auto3:'))
            .forEach((key) => localStorage.removeItem(key));
    } catch {
        /* A locked-down storage simply keeps stale entries. */
    }
};

let installed = false;

/** Called once at boot (main.tsx). */
export const installAutoColumnResize = () => {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    dropStaleStorage();

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDoubleClick, true);

    if (typeof ResizeObserver !== 'undefined') {
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

    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) return schedule();
            }
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    schedule();
    window.addEventListener('resize', relayoutAll);

    document.addEventListener('pointerover', (event) => {
        const table = (event.target as Element | null)?.closest?.(TABLE_SELECTOR) as HTMLTableElement | null;
        if (table) enable(table);
    }, true);
};
