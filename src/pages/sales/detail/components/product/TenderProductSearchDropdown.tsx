import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Check,
    Package,
    Tag01 as Tag,
} from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleQuickPick } from '@/types/inventory';

// Odoo-style combobox list: short, fast, "view all" for the rest.
const DROPDOWN_PAGE_SIZE = 10;

type TenderProductSearchDropdownProps = {
    /** Element the dropdown attaches to (button or the row's product input). */
    anchorEl: HTMLElement;
    /**
     * The row cell's live text. The list has no search box of its own — the
     * quote line IS the input, and this mirrors what is being typed into it.
     */
    search: string;
    onClose: () => void;
    onSelectArticle: (article: ArticleQuickPick) => void;
    /** "All products" — opens the full product picker pop-up carrying the search text over. */
    onOpenAllProducts: (search: string) => void;
};

// Fixed-position overlay so the list pops OVER the rows below the anchor (like
// an Odoo product combobox) instead of pushing content down — and is never
// clipped by the table's scroll container or the card.
const computeStyle = (anchorEl: HTMLElement): React.CSSProperties => {
    // Defensive: a null/detached anchor must never crash the page render.
    if (!anchorEl?.isConnected) return { position: 'fixed', top: -9999, left: -9999, width: 320 };
    const rect = anchorEl.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 300), 440);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    // The panel opens ABOVE the anchor by default: the blank product row sits
    // at the bottom of the table, so an upward list never covers the rows being
    // entered below it. It only drops downward when the anchor is so close to
    // the top of the viewport that the panel (~430px at full height) would be
    // clipped there AND there is more room below.
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceAbove >= 430 || spaceAbove >= spaceBelow;
    return openUp
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 2, left, width }
        : { position: 'fixed', top: rect.bottom + 2, left, width };
};

// Result list for the article search that happens INSIDE a quote line. It has
// no search box and never takes focus: the row's own name cell is the input,
// this only reads back what matches. Arrow keys move the highlight, Enter picks,
// Escape closes and keeps whatever was typed — all handled on the anchor input
// (see the keyboard effect below). When nothing matches, the create-actions
// appear in place of the list.
export const TenderProductSearchDropdown = ({
    anchorEl,
    search,
    onClose,
    onSelectArticle,
    onOpenAllProducts,
}: TenderProductSearchDropdownProps) => {
    const [items, setItems] = useState<ArticleQuickPick[]>([]);
    const [loading, setLoading] = useState(false);
    const [style, setStyle] = useState<React.CSSProperties>(() => computeStyle(anchorEl));
    const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
    // Gold "picked" row: moved with the arrow keys, confirmed with Enter (or the
    // OK button).
    const [activeIndex, setActiveIndex] = useState(-1);
    const listRef = useRef<HTMLDivElement>(null);

    const activeIdx = activeIndex >= 0 && activeIndex < items.length ? activeIndex : -1;
    const moveActive = (dir: 1 | -1) => {
        if (items.length === 0) return;
        const next = Math.min(items.length - 1, Math.max(0, (activeIdx < 0 ? -1 : activeIdx) + dir));
        setActiveIndex(next);
        listRef.current
            ?.querySelector(`[data-item-index="${next}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    };
    const confirmActive = () => {
        if (activeIdx >= 0) onSelectArticle(items[activeIdx]);
    };

    // Follow the anchor while the page scrolls or resizes (capture catches the
    // inner scroll containers too).
    //
    // Measuring is throttled to one animation frame. Reading the anchor's
    // getBoundingClientRect() straight out of a scroll handler forces the
    // browser to flush layout on every single event — a forced reflow — and each
    // one also queued a setState, so a short scroll produced dozens of
    // measure/render pairs. One measurement per frame is all a repaint can use.
    useEffect(() => {
        let frame = 0;
        const measure = () => {
            frame = 0;
            setStyle(computeStyle(anchorEl));
        };
        const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(measure);
        };
        measure();
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
    }, [anchorEl]);

    // Debounced fetch: first page loads immediately on open, then every
    // keystroke re-queries the server 300ms after typing stops.
    useEffect(() => {
        const normalizedSearch = search.trim();
        let cancelled = false;
        const id = setTimeout(() => {
            setLoading(true);
            inventoryApi
                // Lean feed: only the fields that end up on the quote line, so
                // selecting still needs no second request but the response no
                // longer carries stock levels, barcodes or category.
                .articlesQuickPick({
                    page: 1,
                    pageSize: DROPDOWN_PAGE_SIZE,
                    search: normalizedSearch || undefined,
                })
                .then((res) => {
                    if (cancelled) return;
                    setItems(res.items);
                    // New result set — the gold selection must not silently point
                    // at a different article.
                    setActiveIndex(-1);
                })
                .catch(() => { if (!cancelled) setItems([]); })
                .finally(() => { if (!cancelled) setLoading(false); });
        }, normalizedSearch ? 300 : 0);
        return () => { cancelled = true; clearTimeout(id); };
    }, [search]);

    // Click outside (panel AND anchor) closes the dropdown.
    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (panelEl?.contains(target) || anchorEl?.contains(target)) return;
            onClose();
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [anchorEl, panelEl, onClose]);

    // Keyboard control, driven from the ROW INPUT rather than from the panel.
    //
    // Focus never leaves the cell the user is typing in — the list is only a
    // readout — so the arrow keys have to be intercepted on the anchor itself.
    // The listener is registered on the anchor in the CAPTURE phase, which puts
    // it ahead of React's own handler (React listens on the root container, in
    // the bubble phase). That ordering matters: without it, the cell's ArrowUp /
    // ArrowDown would jump to the previous/next table row instead of moving
    // through the results. `stopPropagation` is what keeps that from happening.
    useEffect(() => {
        const anchor = anchorEl;
        if (!anchor) return;

        const onKeyDown = (event: KeyboardEvent) => {
            // Nothing to steer: leave every key to the cell itself, so ArrowUp /
            // ArrowDown still move between rows when the search found nothing.
            if (items.length === 0) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                moveActive(event.key === 'ArrowDown' ? 1 : -1);
                return;
            }
            if (event.key === 'Enter') {
                if (activeIdx < 0) return;
                event.preventDefault();
                event.stopPropagation();
                onSelectArticle(items[activeIdx]);
                return;
            }
            if (event.key === 'Escape') {
                // Close the list, but let the cell keep what was typed — the
                // input's own Escape would otherwise revert the draft.
                event.preventDefault();
                event.stopPropagation();
                onClose();
            }
        };

        anchor.addEventListener('keydown', onKeyDown, true);
        return () => anchor.removeEventListener('keydown', onKeyDown, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorEl, items, activeIdx, onClose]);

    // A search that matches nothing renders NOTHING. There is no "not found"
    // panel to read or dismiss: an article that does not exist is just a name
    // the user keeps typing, and the row is already the field they are typing
    // into. The fetch effects above keep running, so the list reappears the
    // moment the text matches something again.
    if (!loading && items.length === 0) return null;

    return createPortal(
        <div
            ref={setPanelEl}
            style={style}
            className="ofi-tp-menu relative z-[999] overflow-hidden"
        >
            {/* The spinner only replaces the list on the FIRST load. A refresh
                keeps the current items on screen and clickable — blanking or
                disabling them mid-query is what made a click go nowhere. */}
            {/* Tall enough for the full first page (10 rows) without scrolling. */}
            <div ref={listRef} aria-busy={loading} className="relative max-h-[320px] overflow-y-auto">
                {loading && items.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-6 text-[12px] text-slate-500">
                        <span
                            aria-hidden
                            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654]"
                        />
                        {t('tenders.productler_loading')}
                    </div>
                ) : (
                    <ul role="listbox">
                        {items.map((article, index) => (
                            // The WHOLE row is the hit target — its padding and the gap
                            // beside the name used to be dead zones, so a click that
                            // visibly highlighted the row selected nothing and the user
                            // had to click again. `pointerdown` also fires before the
                            // anchor input's blur/commit re-renders this list, which a
                            // `click` would then never survive.
                            <li
                                key={article.id}
                                data-item-index={index}
                                role="option"
                                aria-selected={index === activeIdx}
                                title={article.name}
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.preventDefault();
                                    onSelectArticle(article);
                                }}
                                className={`ofi-option-row group flex cursor-pointer items-center gap-1.5 px-2 py-1.5 transition-colors ${
                                    index === activeIdx ? 'is-active' : ''
                                }`}
                            >
                                <span className="min-w-0 flex-1 truncate text-left text-[13px] text-slate-900 transition-colors group-hover:!text-white">
                                    {article.name}
                                </span>
                                {/* Tag icon opens the product's detail page in a new window;
                                    it must not also select the row. */}
                                <button
                                    type="button"
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                    }}
                                    onClick={() => window.open(`/inventory/articles/${article.id}`, '_blank', 'noopener')}
                                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:bg-white/10 group-hover:text-white/70 group-hover:hover:text-white"
                                    title={t('common.detail')}
                                    aria-label={t('common.detail')}
                                >
                                    <Tag size={12} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {/* Control strip: OK confirms the highlighted row (same as Enter).
                The ▼ button and the trash button are gone — the arrow keys move
                the highlight and the row's own text is the search, so a button
                to scroll the list and a button to erase what was just typed only
                crowded the panel. */}
            <div className="flex items-center justify-end gap-1 border-t border-slate-200 bg-slate-50 px-2 py-1">
                {/* Refresh indicator for a query running behind a list that is
                    still on screen and still clickable. */}
                {loading && items.length > 0 && (
                    <span
                        role="status"
                        aria-label={t('tenders.productler_loading')}
                        className="mr-auto h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654]"
                    />
                )}
                <button
                    type="button"
                    aria-label="OK"
                    title="OK (Enter)"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={confirmActive}
                    disabled={loading || activeIdx < 0}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-emerald-200 bg-white text-emerald-600 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-emerald-200 disabled:hover:bg-white disabled:hover:text-emerald-600"
                >
                    <Check size={13} />
                </button>
            </div>
            <div className="border-t border-slate-100 px-2 py-1">
                <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onOpenAllProducts(search.trim())}
                    className="ofi-option-action flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[12px] font-medium text-[#1f2654] transition-colors"
                >
                    <Package size={12} />
                    {t('tenders.all_products')} …
                </button>
            </div>
        </div>,
        document.body,
    );
};
