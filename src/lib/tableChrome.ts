/**
 * Table-chrome tagging — replaces the stylesheet's expensive `:has()` lookups.
 *
 * index.css used to find "the element directly around a table", "the Card
 * that hosts a table" and friends with `:has()`. Those selectors made EVERY
 * div (and, under 1024px, every element) a potential subject: each full style
 * recalc walked the whole document re-running child scans, which showed up as
 * 700–1000 ms `UpdateLayoutTree` tasks on a mobile-throttled boot (the
 * Lighthouse "Total Blocking Time" bulk). The conditions themselves are
 * cheap to compute in JS, so this module computes them once per DOM change
 * and writes them onto the elements as data attributes; index.css matches
 * the attributes instead.
 *
 * Attribute → the `:has()` it replaces:
 *   data-ofi-anyhost     host of `> table:not([role="grid"])`         (mobile scrollport)
 *   data-ofi-tablehost   host of `> table:not([role="grid"]):not([data-unstyled-table])`
 *   data-ofi-scrollhost  `[data-table-scroll]` host of a grid-lines/col-fill table,
 *                        or any host of such a table that is ALSO unstyled
 *   data-ofi-tablecard   `[data-ui-card]` with a styled table anywhere inside
 *   data-ofi-cardtable   `[data-ui-card]` with a styled table inside its `[data-ui-card-body]`
 *   data-ofi-filtertable styled table containing `tr[data-filter-row]`
 *   data-ofi-thbtn       list-table heading cell with a direct `<button>` child
 *   html.ofi-has-viewport-sheet   a `.ofi-viewport-sheet` is mounted
 *
 * Row-selection (`tr:has(input:checked)`) and the calendar draft chip keep
 * their `:has()`: their subjects are narrow (rows of one table, one calendar
 * class) and their state does not always reach the DOM as an attribute.
 *
 * Timing: the MutationObserver delivers in a microtask right after the DOM
 * change and the sweep runs in the next animation frame — BEFORE that
 * frame's paint — so freshly mounted tables are never painted untagged
 * (no flash of missing chrome, no layout shift).
 */

const ANY = 'table:not([role="grid"])';

/** Set/remove `attr` so that exactly `keep` carries it. Writes only deltas. */
const reconcile = (attr: string, keep: Set<Element>) => {
    document.querySelectorAll(`[${attr}]`).forEach((el) => {
        if (!keep.has(el)) el.removeAttribute(attr);
    });
    keep.forEach((el) => {
        if (!el.hasAttribute(attr)) el.setAttribute(attr, '');
    });
};

const sweep = () => {
    const anyHosts = new Set<Element>();
    const tableHosts = new Set<Element>();
    const scrollHosts = new Set<Element>();
    const tableCards = new Set<Element>();
    const cardTables = new Set<Element>();
    const filterTables = new Set<Element>();

    document.querySelectorAll<HTMLTableElement>(ANY).forEach((table) => {
        const host = table.parentElement;
        if (host) anyHosts.add(host);

        const unstyled = table.hasAttribute('data-unstyled-table');
        const gridLike = table.hasAttribute('data-grid-lines') || table.hasAttribute('data-col-fill');
        if (host && gridLike && (unstyled || host.hasAttribute('data-table-scroll'))) {
            scrollHosts.add(host);
        }
        if (unstyled) return;

        if (host) tableHosts.add(host);
        const card = table.closest('[data-ui-card]');
        if (card) {
            tableCards.add(card);
            const body = table.closest('[data-ui-card-body]');
            if (body && card.contains(body)) cardTables.add(card);
        }
        if (table.querySelector('tr[data-filter-row]')) filterTables.add(table);
    });

    const thButtons = new Set<Element>();
    document
        .querySelectorAll('table[data-list-table] > thead > tr:first-child > th')
        .forEach((th) => {
            if (th.querySelector(':scope > button')) thButtons.add(th);
        });

    reconcile('data-ofi-anyhost', anyHosts);
    reconcile('data-ofi-tablehost', tableHosts);
    reconcile('data-ofi-scrollhost', scrollHosts);
    reconcile('data-ofi-tablecard', tableCards);
    reconcile('data-ofi-cardtable', cardTables);
    reconcile('data-ofi-filtertable', filterTables);
    reconcile('data-ofi-thbtn', thButtons);

    document.documentElement.classList.toggle(
        'ofi-has-viewport-sheet',
        !!document.querySelector('.ofi-viewport-sheet'),
    );
};

let installed = false;

/** Called once at boot (main.tsx). Safe to call again — it only ever runs once. */
export const installTableChrome = () => {
    if (installed || typeof document === 'undefined') return;
    installed = true;

    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            sweep();
        });
    };

    // Element insertions/removals cover tables and sheets mounting; the
    // attribute list covers the marks that arrive AFTER mount (autoColumnResize
    // sets data-col-fill on tables it prepares). Our own data-ofi-* writes are
    // not in the filter, so the sweep never re-triggers itself.
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type === 'attributes') return schedule();
            for (const node of record.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) return schedule();
            }
            for (const node of record.removedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) return schedule();
            }
        }
    });
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-col-fill', 'data-grid-lines', 'data-unstyled-table', 'role', 'data-list-table'],
    });
    schedule();
};
