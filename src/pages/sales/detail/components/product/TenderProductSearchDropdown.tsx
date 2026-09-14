import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, Plus } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleQuickPick } from '@/types/inventory';

import { resolveTypedArticleIndex } from '../../utils/tenderProduct.utils';

// Odoo-style combobox list: short and fast, "Alle Produkte" for the rest.
const DROPDOWN_PAGE_SIZE = 10;
// A full first page plus the two action rows, without scrolling.
const PANEL_HEIGHT_ESTIMATE = 430;
// Pause after the last keystroke before the catalogue is asked. Was 300 ms;
// with 150–200 ms network on top, the list trailed the typing by half a
// second on production (measured 14.09.2026). Rows for the new text are shown
// provisionally at once (see provisionalItems), so the wait only decides how
// often the server is asked.
const SEARCH_DEBOUNCE_MS = 120;

const foldText = (value: string) => value.toLocaleLowerCase('tr').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/**
 * Rows to show for `search` BEFORE the catalogue has answered: the answer for
 * the longest already-answered start of the text, narrowed here. Only a
 * readout — the list does not count as answered (Enter still waits), since the
 * server also matches fields this filter does not see.
 */
const provisionalItems = (search: string): ArticleQuickPick[] | null => {
    const folded = foldText(search);
    for (let length = search.length - 1; length >= 1; length -= 1) {
        const prefix = search.slice(0, length).trim();
        if (!prefix) break;
        const cached = inventoryApi.peekArticlesQuickPick({ page: 1, pageSize: DROPDOWN_PAGE_SIZE, search: prefix });
        if (!cached) continue;
        return cached.value.items.filter((article) =>
            foldText(article.name ?? '').includes(folded)
            || foldText(article.articleCode ?? '').includes(folded));
    }
    return null;
};

/**
 * One row of the list. The two action rows are ordinary options: the arrow
 * keys reach them and Enter takes them, exactly like a product row.
 */
type ComboOption =
    | { kind: 'article'; article: ArticleQuickPick }
    | { kind: 'add'; name: string }
    | { kind: 'more' };

type TenderProductSearchDropdownProps = {
    /** The row's product-name input the list attaches to. */
    anchorEl: HTMLElement;
    /**
     * The row cell's live text. The list has no search box of its own — the
     * quote line IS the input, and this mirrors what is being typed into it.
     */
    search: string;
    /**
     * What the row held before the user started typing. Empty means a NEW line
     * being filled — Enter then takes the first hit, like Odoo's product field.
     * A filled line being edited keeps its typed text on Enter instead; a
     * product is picked there with the arrow keys or the mouse.
     */
    currentName: string;
    onClose: () => void;
    onSelectArticle: (article: ArticleQuickPick) => void;
    /**
     * The typed name, confirmed as a line of its own. Nothing the catalogue does
     * not know is ever written to a line without going through here — the
     * "Hinzufügen" row below is the only way in (Enter on it, or a click).
     */
    onCreateFreeLine: (name: string) => void;
    /** "Alle Produkte" — opens the full product picker pop-up carrying the search text over. */
    onOpenAllProducts: (search: string) => void;
    /**
     * Leave out the "Alle Produkte" row. The sales-document surface (direct
     * invoice, addon order) has no big product picker behind it, and a row that
     * leads nowhere is worse than no row.
     */
    hideAllProducts?: boolean;
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
    // Under the field, the way Odoo's list hangs off its product field. It only
    // opens upward when it would be clipped below AND there is more room above.
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < PANEL_HEIGHT_ESTIMATE && spaceAbove > spaceBelow;
    return openUp
        ? { position: 'fixed', bottom: window.innerHeight - rect.top + 2, left, width }
        : { position: 'fixed', top: rect.bottom + 2, left, width };
};

/**
 * The rows for a result set. `listedFor` is the text the catalogue answered
 * for; only when it equals the typed text does the answer say anything about
 * it — and only then does the "Hinzufügen" row appear, because until then the
 * typed name may still turn out to be a listed product.
 */
const buildOptions = (
    items: ArticleQuickPick[],
    typedName: string,
    listedFor: string | null,
    hideAllProducts = false,
) => {
    const answered = listedFor === typedName;
    const typedIdx = answered ? resolveTypedArticleIndex(items, typedName, listedFor) : -1;
    const canAddTyped = answered && typedName.length > 0 && typedIdx < 0;
    const options: ComboOption[] = items.map((article) => ({ kind: 'article', article }));
    if (canAddTyped) options.push({ kind: 'add', name: typedName });
    if (!hideAllProducts) options.push({ kind: 'more' });
    return { options, typedIdx, canAddTyped, answered };
};

/**
 * The row Enter takes while the arrow keys have not moved the highlight.
 *
 *  - a product named exactly (name or article number) is that product;
 *  - an empty cell, or a NEW line: the first hit — one keystroke less than
 *    reaching for the mouse, as in Odoo;
 *  - an existing line whose text was changed: the "Hinzufügen" row, i.e. the
 *    typed text stays the line's text. Changing the product of a filled line
 *    is done on purpose — ArrowDown or a click — never by Enter alone, or a
 *    free line renamed to "Montage vor Ort" would silently turn into the first
 *    catalogue article that happens to start with "Montage".
 */
const defaultOptionIndex = (
    built: ReturnType<typeof buildOptions>,
    itemCount: number,
    typedName: string,
    currentName: string,
): number => {
    const addIndex = built.canAddTyped ? itemCount : -1;
    if (built.typedIdx >= 0) return built.typedIdx;
    if (!typedName) return itemCount > 0 ? 0 : -1;
    if (!currentName.trim()) return itemCount > 0 ? 0 : addIndex;
    return addIndex;
};

// Result list for the article search that happens INSIDE a quote line. It has
// no search box and never takes focus: the row's own name cell is the input,
// this only reads back what matches. One row is highlighted; the arrow keys
// move it, Enter takes it, a click takes a row directly. Nothing else selects:
// clicking away, Tab or Escape leave the row as it was — the page refuses the
// bare text — so a product only ever lands on a line by a deliberate choice.
export const TenderProductSearchDropdown = ({
    anchorEl,
    search,
    currentName,
    onClose,
    onSelectArticle,
    onCreateFreeLine,
    onOpenAllProducts,
    hideAllProducts = false,
}: TenderProductSearchDropdownProps) => {
    const [items, setItems] = useState<ArticleQuickPick[]>([]);
    // The search text `items` were fetched for; null until the catalogue has
    // answered once. While it lags behind the cell, the list is stale.
    const [listedFor, setListedFor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [style, setStyle] = useState<React.CSSProperties>(() => computeStyle(anchorEl));
    const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
    // Highlight moved with the arrow keys. Only an ARROW move is stored — the
    // highlight otherwise follows the typed text (see defaultOptionIndex), so
    // it can never survive into a result set it no longer belongs to.
    const [arrowIndex, setArrowIndex] = useState(-1);
    const listRef = useRef<HTMLUListElement>(null);

    const typedName = search.trim();
    const built = useMemo(
        () => buildOptions(items, typedName, listedFor, hideAllProducts),
        [items, typedName, listedFor, hideAllProducts],
    );
    const { options, answered } = built;
    const restIndex = defaultOptionIndex(built, items.length, typedName, currentName);
    const activeIdx = arrowIndex >= 0 && arrowIndex < options.length ? arrowIndex : restIndex;

    // The panel stays mounted while the user moves from one row to the next,
    // and a deferred Enter (below) fires out of a fetch callback — both must
    // reach the CURRENT callbacks, never the ones captured when set up.
    const latestRef = useRef({ currentName, onSelectArticle, onCreateFreeLine, onOpenAllProducts });
    useEffect(() => {
        latestRef.current = { currentName, onSelectArticle, onCreateFreeLine, onOpenAllProducts };
    });

    const act = (option: ComboOption, typed: string) => {
        const latest = latestRef.current;
        if (option.kind === 'article') latest.onSelectArticle(option.article);
        else if (option.kind === 'add') latest.onCreateFreeLine(option.name);
        else latest.onOpenAllProducts(typed);
    };

    const moveActive = (dir: 1 | -1) => {
        if (options.length === 0) return;
        const next = activeIdx < 0
            ? (dir === 1 ? 0 : options.length - 1)
            : (activeIdx + dir + options.length) % options.length;
        setArrowIndex(next);
        listRef.current
            ?.querySelector(`[data-item-index="${next}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    };

    // Enter pressed while the list still belongs to an OLDER text (typing is
    // debounced): the answer is awaited and then acted on, so a name typed or
    // pasted quickly and confirmed at once is not lost. Cleared as soon as the
    // text changes again.
    const pendingConfirmRef = useRef<string | null>(null);
    // One per mounted panel: see the fetch effect below.
    const firstFetchRef = useRef(true);

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
    // keystroke re-queries the server SEARCH_DEBOUNCE_MS after typing stops.
    // A text answered within the last minute is served from the client cache
    // without asking; an older answer (or a narrowed shorter one) is shown at
    // once and replaced by the fresh one.
    //
    // The very first query of a cell skips the debounce even when it already
    // carries text — there is no earlier keystroke to wait for, and a name that
    // was PASTED in would otherwise still be unresolved after the debounce, i.e.
    // exactly when Enter arrives.
    useEffect(() => {
        const normalizedSearch = search.trim();
        if (pendingConfirmRef.current !== null && pendingConfirmRef.current !== normalizedSearch) {
            pendingConfirmRef.current = null;
        }
        let cancelled = false;
        // The answer is in: show it, and carry out an Enter that was waiting
        // for exactly this text.
        const settle = (nextItems: ArticleQuickPick[]) => {
            setItems(nextItems);
            setListedFor(normalizedSearch);
            // New result set — an arrow selection must not silently point at a
            // different article. The typed-text highlight is derived and
            // re-resolves itself against the new list.
            setArrowIndex(-1);
            if (pendingConfirmRef.current !== normalizedSearch) return;
            pendingConfirmRef.current = null;
            const fresh = buildOptions(nextItems, normalizedSearch, normalizedSearch, hideAllProducts);
            const index = defaultOptionIndex(fresh, nextItems.length, normalizedSearch, latestRef.current.currentName);
            if (index >= 0) act(fresh.options[index], normalizedSearch);
        };
        const params = { page: 1, pageSize: DROPDOWN_PAGE_SIZE, search: normalizedSearch || undefined };
        const cached = inventoryApi.peekArticlesQuickPick(params);
        if (cached?.fresh) {
            firstFetchRef.current = false;
            setLoading(false);
            settle(cached.value.items);
            return undefined;
        }
        const provisional = cached?.value.items ?? (normalizedSearch ? provisionalItems(normalizedSearch) : null);
        if (provisional) {
            setItems(provisional);
            setArrowIndex(-1);
        }
        const debounce = firstFetchRef.current || cached ? 0 : (normalizedSearch ? SEARCH_DEBOUNCE_MS : 0);
        const id = setTimeout(() => {
            firstFetchRef.current = false;
            setLoading(true);
            inventoryApi
                // Lean feed: only the fields that end up on the quote line, so
                // selecting still needs no second request but the response no
                // longer carries stock levels, barcodes or category.
                .articlesQuickPick(params, { mustBeFresh: true })
                .then((res) => { if (!cancelled) settle(res.items); })
                .catch(() => { if (!cancelled) settle([]); })
                .finally(() => { if (!cancelled) setLoading(false); });
        }, debounce);
        return () => { cancelled = true; clearTimeout(id); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, hideAllProducts]);

    // Click outside (panel AND anchor) closes the dropdown, and so does the
    // cell losing focus in any other way (Tab, a click into another cell). The
    // page then puts the cell back the way it was — leaving never chooses
    // anything. A press on a row of the list keeps the focus in the cell (its
    // pointerdown is prevented), so the list is never closed under a click.
    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (panelEl?.contains(target) || anchorEl?.contains(target)) return;
            onClose();
        };
        const onBlur = () => onClose();
        document.addEventListener('mousedown', onPointerDown);
        anchorEl.addEventListener('blur', onBlur);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            anchorEl.removeEventListener('blur', onBlur);
        };
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
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (options.length === 0) return;
                event.preventDefault();
                event.stopPropagation();
                moveActive(event.key === 'ArrowDown' ? 1 : -1);
                return;
            }
            if (event.key === 'Enter') {
                // The list does not belong to this text yet: hold the Enter
                // until the catalogue has answered, then take the row it lands
                // on. Acting on the stale list would pick the wrong product.
                if (!answered) {
                    event.preventDefault();
                    event.stopPropagation();
                    pendingConfirmRef.current = typedName;
                    return;
                }
                // Nothing highlighted (an emptied cell over an empty catalogue):
                // leave Enter to the cell — committing the empty text is how the
                // product is taken off the row.
                if (activeIdx < 0) return;
                event.preventDefault();
                event.stopPropagation();
                act(options[activeIdx], typedName);
                return;
            }
            if (event.key === 'Escape') {
                // Close the list and let the cell's own Escape run too: it drops
                // the typed text and leaves the row as it was.
                onClose();
            }
        };

        anchor.addEventListener('keydown', onKeyDown, true);
        return () => anchor.removeEventListener('keydown', onKeyDown, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorEl, options, activeIdx, answered, typedName, onClose]);

    const optionLabel = (option: ComboOption) => {
        if (option.kind === 'add') {
            return currentName.trim()
                ? t('tenders.combo_use_typed_name', { name: option.name })
                : t('tenders.combo_add_free_line', { name: option.name });
        }
        return `${t('tenders.all_products')} …`;
    };

    // Rows are taken on `pointerdown`, not `click`: it fires before the anchor
    // input's blur re-renders (and with a click, unmounts) this list, and the
    // default is prevented so the cell keeps its focus. The WHOLE row is the
    // hit target.
    const rowProps = (index: number, option: ComboOption) => ({
        'data-item-index': index,
        role: 'option' as const,
        'aria-selected': index === activeIdx,
        onPointerDown: (event: React.PointerEvent) => {
            if (event.button !== 0) return;
            event.preventDefault();
            act(option, typedName);
        },
        onPointerMove: () => {
            if (arrowIndex !== index) setArrowIndex(index);
        },
    });

    const articleOptions = options.filter((option) => option.kind === 'article');
    const actionOptions = options
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => option.kind !== 'article');

    return createPortal(
        <div
            ref={setPanelEl}
            style={style}
            className="ofi-tp-menu ofi-tp-combo relative z-[999]"
        >
            <ul ref={listRef} role="listbox" aria-busy={loading} className="ofi-tp-combo__list">
                {/* The spinner only replaces the list on the FIRST load. A refresh
                    keeps the current rows on screen and clickable — blanking or
                    disabling them mid-query is what made a click go nowhere. */}
                {loading && articleOptions.length === 0 && (
                    <li className="ofi-tp-combo__state" role="presentation">
                        <span aria-hidden className="ofi-tp-combo__spinner" />
                        {t('tenders.productler_loading')}
                    </li>
                )}
                {articleOptions.map((option, index) => option.kind === 'article' && (
                    <li
                        key={option.article.id}
                        title={option.article.name}
                        className={`ofi-option-row ofi-tp-combo__row ${index === activeIdx ? 'is-active' : ''}`}
                        {...rowProps(index, option)}
                    >
                        <span className="ofi-tp-combo__name">{option.article.name}</span>
                        {option.article.articleCode && (
                            <span className="ofi-tp-combo__code">{option.article.articleCode}</span>
                        )}
                    </li>
                ))}
                {articleOptions.length > 0 && <li role="separator" className="ofi-tp-combo__sep" />}
                {actionOptions.map(({ option, index }) => (
                    <li
                        key={option.kind}
                        className={`ofi-option-row ofi-tp-combo__row is-action ${index === activeIdx ? 'is-active' : ''}`}
                        {...rowProps(index, option)}
                    >
                        {option.kind === 'add' ? <Plus size={13} className="shrink-0" /> : <Package size={13} className="shrink-0" />}
                        <span className="ofi-tp-combo__name">{optionLabel(option)}</span>
                    </li>
                ))}
            </ul>
        </div>,
        document.body,
    );
};
