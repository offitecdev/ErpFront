
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronUp,
    File05 as FileText,
    Package,
    Tag01,
    Trash01,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { AutoFitAmount } from '../common/AutoFitAmount';
import { PlainCheckbox as Checkbox } from '../common/PlainUi';

import { richTextToHtml } from '../../utils/markdown.utils';
import { useMoneyFormat } from '../../utils/useMoneyFormat';
import {
    RESIZABLE_LINE_COLUMNS,
    useTenderLineColumnWidths,
    type ResizableLineColumn,
} from '../../hooks/useTenderLineColumnWidths';
import type {
    ManualProductForm,
    NumberField,
    ProductSource,
    SimpleTenderLine,
    TenderLineProfit,
    TextField,
} from '../../types/tenderDetail.types';
import {
    INLINE_NAME_INPUT_CLASS,
    INLINE_TITLE_INPUT_CLASS,
    TENDER_LINE_TABLE_MIN_WIDTH,
} from '../../utils/tenderDetail.constants';
import { cleanImportedProductDescription } from '../../utils/tenderLine.utils';
import { BufferedTextInput } from '../TenderLineInputs';
import { TenderLineHeaderCell } from './TenderLineTableHeader';
import { TenderLinePriceInput } from './TenderLinePriceInput';

const LazyInlineDescriptionEditor = lazy(() =>
    import('../InlineDescriptionEditor').then((mod) => ({ default: mod.InlineDescriptionEditor })),
);

// Each editable line contains several inputs, buttons and SVGs. Mounting all
// lines before first paint made an ordinary quote create roughly 2,000 nodes.
// Totals and save logic still use every row; only off-screen row DOM is staged.
// First commit stays lean — every extra initial row is table DOM rendered
// inside the boot's biggest main-thread task. The IntersectionObserver batch
// reveal below fills the window long before the user reaches row 10.
const INITIAL_RENDERED_ROWS = 10;
const RENDER_ROW_BATCH = 16;
const COLLAPSED_ROW_HEIGHT_PX = 37;

// Small square pop-up behind the profit/loss icon: sales, cost, result and the
// margin ratio for one line. Portal + fixed position so it overlays the rows
// below instead of being clipped by the table's scroll container.
const TenderLineProfitPopover = ({
    anchorEl,
    profit,
    fmtMoney,
    onClose,
}: {
    anchorEl: HTMLElement;
    profit: TenderLineProfit;
    fmtMoney: (value: number) => string;
    onClose: () => void;
}) => {
    const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
    const [style] = useState<React.CSSProperties>(() => {
        const width = 340;
        // Defensive: a null/detached anchor must never crash the page render.
        if (!anchorEl?.isConnected) return { position: 'fixed', top: -9999, left: -9999, width };
        const rect = anchorEl.getBoundingClientRect();
        const left = Math.min(Math.max(8, rect.right - width), Math.max(8, window.innerWidth - width - 8));
        const openUp = window.innerHeight - rect.bottom < 300 && rect.top > 320;
        return openUp
            ? { position: 'fixed', bottom: window.innerHeight - rect.top + 6, left, width }
            : { position: 'fixed', top: rect.bottom + 6, left, width };
    });

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (panelEl?.contains(target) || anchorEl?.contains(target)) return;
            onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        // Close on scroll instead of tracking the anchor — the pop-up is a quick
        // glance, not a persistent panel.
        const onScroll = () => onClose();
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [anchorEl, panelEl, onClose]);

    const isProfit = profit.result >= 0;

    return createPortal(
        <div
            ref={setPanelEl}
            style={style}
            className="z-[999] overflow-hidden rounded-[2px] border border-slate-300 bg-white shadow-[0_10px_32px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
        >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2">
                <span className="text-[11.5px] font-semibold text-slate-600">{t('tenders.profit_loss')}</span>
                <span className={`inline-flex items-center gap-1 text-[12px] font-bold tabular-nums ${isProfit ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {isProfit ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                    {profit.resultRate.toFixed(1)}%
                </span>
            </div>
            {/* The headline figure first, then the numbers it is derived from. */}
            <div className="px-3.5 py-3">
                <div className={`text-[22px] font-bold leading-none tabular-nums ${isProfit ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {fmtMoney(profit.result)}
                </div>
                <dl className="mt-3 space-y-1.5 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-500">{t('tenders.sales')}</dt>
                        <dd className="font-medium tabular-nums text-slate-900">{fmtMoney(profit.revenue)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-slate-500">{t('tenders.cost')}</dt>
                        <dd className="font-medium tabular-nums text-slate-900">{fmtMoney(profit.cost)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-1.5">
                        <dt className="text-slate-500">{t('tenders.unit_cost')}</dt>
                        <dd className="tabular-nums text-slate-700">{fmtMoney(profit.unitCost)}</dd>
                    </div>
                </dl>
                <p className="mt-3 border-t border-slate-200 pt-2 text-[10.5px] leading-4 text-slate-400">{profit.costSource}</p>
            </div>
        </div>,
        document.body,
    );
};

type TenderLineTableProps = {
    rows: SimpleTenderLine[];
    isEmpty: boolean;
    isDraft: boolean;
    canManage: boolean;
    fallbackTaxRate: number;
    selectedId: string | null;
    selectedRowIds: Record<string, boolean>;
    allRowsSelected: boolean;
    someRowsSelected: boolean;
    stableRowKeys: Map<string, string>;
    lastRowId?: string;
    onSelectRow: (rowId: string) => void;
    onToggleAllRows: (checked: boolean) => void;
    onToggleRow: (rowId: string, checked: boolean) => void;
    commitTextField: (positionId: string, field: TextField, value: string) => void;
    commitNumberField: (positionId: string, field: NumberField, value: number) => void;
    commitLongDescription: (positionId: string, value: string) => void;
    registerCell: (key: string, handle: { focus: () => void } | null) => void;
    onArrowNav: (col: string, rowIndex: number, dir: 1 | -1) => boolean;
    onAddRow: (rowType: 'TITLE' | 'DESCRIPTION' | 'PRODUCT', article?: ProductSource, options?: Partial<ManualProductForm>, afterRowId?: string) => void;
    onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
    /** Trash button next to the position number — removes just that line. */
    onDeleteRow: (rowId: string) => void;
    /**
     * "Add product" — appends a BLANK product row and focuses its name cell,
     * where the article search happens inline. No pop-up is opened.
     */
    onAddProductRow: (afterRowId?: string) => void;
    /** Row whose name cell should take focus and open its article combobox. */
    autoFocusRowId?: string | null;
    /**
     * Live text of the product-name cell, with the input it came from. Drives
     * the article suggestions, which appear only while there is text to match.
     */
    onProductComboInput: (rowId: string, text: string, anchorEl: HTMLInputElement) => void;
    /** Per-row profit/loss figures for the icon next to the row total. */
    profitByRowId: Map<string, TenderLineProfit>;
};

// Every column EXCEPT the description is fixed-width, so the figures can never
// be squeezed out of view; the description column carries no width and absorbs
// whatever space is left. Below the table's minimum the wrapper's
// overflow-x-auto provides left/right scrolling.
//
// Labels are read through functions so they re-resolve on a language change.
// Profit/loss carries no caption: the column is one icon wide, and any wording
// for it was longer than the column itself. The paired up/down arrows say what
// it is; the words live in the header's tooltip (COLUMN_TITLES).
const COLUMN_LABELS: Record<ResizableLineColumn, () => ReactNode> = {
    quantity: () => t('common.quantity'),
    unit: () => t('tenders.unit'),
    unitPrice: () => t('tenders.unit_price'),
    discount: () => `${t('common.discount')} %`,
    taxRate: () => `${t('tenders.kdv')} %`,
    total: () => t('common.amount'),
    // Plain up + down arrows, not trend-chart zigzags: the column is about a
    // figure going one way or the other, and two straight arrows say that at
    // 13px where a jagged line just reads as noise.
    profit: () => (
        <span className="flex items-center justify-end text-slate-500">
            <ArrowUp size={12} />
            <ArrowDown size={12} className="-ml-0.5" />
        </span>
    ),
};

// Tooltip / accessible name per column — the only place the profit column's
// wording still appears.
const COLUMN_TITLES: Partial<Record<ResizableLineColumn, () => string>> = {
    profit: () => t('tenders.profit_loss'),
};

export const TenderLineTable = ({
    rows,
    isEmpty,
    isDraft,
    canManage,
    fallbackTaxRate,
    selectedId,
    selectedRowIds,
    allRowsSelected,
    someRowsSelected,
    stableRowKeys,
    lastRowId,
    onSelectRow,
    onToggleAllRows,
    onToggleRow,
    commitTextField,
    commitNumberField,
    commitLongDescription,
    registerCell,
    onArrowNav,
    onAddRow,
    onMoveRow,
    onDeleteRow,
    onAddProductRow,
    autoFocusRowId,
    onProductComboInput,
    profitByRowId,
}: TenderLineTableProps) => {
    // Row totals follow the offer's selected currency (symbol-only display).
    const fmtMoney = useMoneyFormat();
    // Drag-resizable numeric columns, remembered per browser.
    const { widths, setColRef, startResize, resetColumn } = useTenderLineColumnWidths();
    // At most ONE row shows its full description at a time; it expands downwards
    // inside the cell and collapses again on any click outside that cell.
    const [expandedId, setExpandedId] = useState<string | null>(null);
    // Profit/loss pop-up opened from the icon next to a row total.
    const [profitPopover, setProfitPopover] = useState<{ rowId: string; anchorEl: HTMLElement } | null>(null);
    const [renderedRowCount, setRenderedRowCount] = useState(() => Math.min(INITIAL_RENDERED_ROWS, rows.length));
    const moreRowsRef = useRef<HTMLTableRowElement | null>(null);
    const pendingKeyboardNavRef = useRef<{ col: string; rowIndex: number; dir: 1 | -1 } | null>(null);
    const autoFocusIndex = autoFocusRowId
        ? rows.findIndex((row) => row.id === autoFocusRowId)
        : -1;
    // Derived rather than synchronized through an effect: deletions clamp the
    // window with no cascading render, and a requested focus is present in the
    // same render that receives its row id.
    const effectiveRenderedRowCount = Math.min(
        rows.length,
        Math.max(renderedRowCount, autoFocusIndex + 1),
    );

    // Reveal another batch shortly before the virtual spacer reaches view.
    // Its fixed estimated height keeps the totals below the table stable and
    // avoids a layout jump while real rows replace the placeholder space.
    useEffect(() => {
        const marker = moreRowsRef.current;
        if (!marker || effectiveRenderedRowCount >= rows.length) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setRenderedRowCount((current) => Math.min(rows.length, current + RENDER_ROW_BATCH));
            }
        }, { rootMargin: '0px 0px 160px 0px' });
        observer.observe(marker);
        return () => observer.disconnect();
    }, [effectiveRenderedRowCount, rows.length]);

    // Arrow navigation remains seamless at a batch boundary: render the next
    // batch, then focus the requested cell after React commits it.
    useEffect(() => {
        const pending = pendingKeyboardNavRef.current;
        if (!pending) return;
        pendingKeyboardNavRef.current = null;
        const frame = window.requestAnimationFrame(() =>
            onArrowNav(pending.col, pending.rowIndex, pending.dir),
        );
        return () => window.cancelAnimationFrame(frame);
    }, [renderedRowCount, onArrowNav]);

    const handleArrowNav = useCallback((col: string, rowIndex: number, dir: 1 | -1) => {
        const nextIndex = rowIndex + dir;
        if (dir === 1 && nextIndex >= effectiveRenderedRowCount && nextIndex < rows.length) {
            pendingKeyboardNavRef.current = { col, rowIndex, dir };
            setRenderedRowCount((current) =>
                Math.min(rows.length, Math.max(current + RENDER_ROW_BATCH, nextIndex + 1)),
            );
            return true;
        }
        return onArrowNav(col, rowIndex, dir);
    }, [effectiveRenderedRowCount, onArrowNav, rows.length]);

    useEffect(() => {
        if (!expandedId) return;
        // `click` (not mousedown) so the editor's on-blur commit runs BEFORE the
        // collapse unmounts it; capture phase so rows that stopPropagation on
        // their own clicks still close the open description.
        const onDocClick = (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (!target?.closest?.(`[data-desc-cell="${expandedId}"]`)) setExpandedId(null);
        };
        document.addEventListener('click', onDocClick, true);
        return () => document.removeEventListener('click', onDocClick, true);
    }, [expandedId]);

    const canReorder = isDraft && canManage;
    const popoverProfit = profitPopover ? profitByRowId.get(profitPopover.rowId) : undefined;

    return (
        <>
        <table
            data-tender-detail-table
            // Opts out of the app-wide table chrome (72px rows, 14px text,
            // 32px-square cell buttons) — this table styles itself in index.css.
            data-unstyled-table
            style={{ minWidth: TENDER_LINE_TABLE_MIN_WIDTH }}
            className="w-full"
        >
            <colgroup>
                <col ref={setColRef('pos')} style={{ width: widths.pos }} />
                {/* No width: the description absorbs the leftover space, so
                    widening a numeric column narrows this one instead of
                    leaving a gap. */}
                <col ref={setColRef('description')} />
                {RESIZABLE_LINE_COLUMNS.map((key) => (
                    <col key={key} ref={setColRef(key)} style={{ width: widths[key] }} />
                ))}
            </colgroup>
            <thead>
                <tr className="group/head">
                    {/* Mirrors the rows: "Pos." at rest, select-all on hover or
                        once a selection exists. */}
                    <th className="border-l-0 text-left font-semibold">
                        <span className="relative flex h-4 w-full items-center">
                            <span
                                aria-hidden
                                className={`transition-opacity ${someRowsSelected ? 'opacity-0' : 'opacity-100 group-hover/head:opacity-0'}`}
                            >
                                {t('tenders.pos')}
                            </span>
                            <Checkbox
                                aria-label={t('tenders.all_satirlari_select')}
                                size="sm"
                                isSelected={allRowsSelected}
                                isIndeterminate={someRowsSelected && !allRowsSelected}
                                onChange={onToggleAllRows}
                                onClick={(event) => event.stopPropagation()}
                                className={`absolute left-0 transition-opacity ${
                                    someRowsSelected ? 'opacity-100' : 'opacity-0 group-hover/head:opacity-100'
                                }`}
                            />
                        </span>
                    </th>
                    <TenderLineHeaderCell label={t('tenders.description')} align="left" />
                    {/* Each numeric column can be dragged wider from its left
                        border, and double-clicking that handle restores it. */}
                    {RESIZABLE_LINE_COLUMNS.map((key) => (
                        <TenderLineHeaderCell
                            key={key}
                            label={COLUMN_LABELS[key]()}
                            title={COLUMN_TITLES[key]?.()}
                            noTruncate={key === 'quantity'}
                            onResizeStart={(event) => startResize(key, event)}
                            onResizeReset={() => resetColumn(key)}
                        />
                    ))}
                </tr>
            </thead>
            <tbody>
                {isEmpty && (
                    <tr>
                        <td colSpan={9} className="px-3 py-10 text-center text-[12px] text-slate-400">{t('tenders.tender_line_not_found')}</td>
                    </tr>
                )}
                {rows.slice(0, effectiveRenderedRowCount).map((row, rowIndex) => {
                    const position = row.position;
                    const isSelected = selectedId === row.id;
                    // Once anything is ticked the checkboxes stay visible, so the
                    // selection can be extended without hunting for them.
                    const showSelection = someRowsSelected;
                    const isProduct = row.kind === 'PRODUCT';
                    const isDescription = row.kind === 'DESCRIPTION';
                    const taxRate = Number(position.taxRate || fallbackTaxRate);
                    const visibleLongDescription = isProduct
                        ? cleanImportedProductDescription(position.longDescription)
                        : position.longDescription || '';
                    const profit = isProduct ? profitByRowId.get(row.id) : undefined;
                    const canExpand = (isProduct || isDescription) && (Boolean(visibleLongDescription) || isDraft);
                    // An empty DESCRIPTION row in draft is always open — there is
                    // nothing to preview and the user needs the editor to type into.
                    const isExpanded = expandedId === row.id || (isDescription && isDraft && !visibleLongDescription);

                    // Collapsed state shows NO description text — just one large
                    // arrow. The row stays exactly one line tall whatever the
                    // description holds, and the arrow is solid when there is
                    // something to read, faint when the row is still empty.
                    const expandToggle = canExpand ? (
                        <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-label={t('tenders.description')}
                            title={t('tenders.description')}
                            onClick={(event) => {
                                event.stopPropagation();
                                onSelectRow(row.id);
                                setExpandedId(isExpanded ? null : row.id);
                            }}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] transition-colors ${
                                visibleLongDescription
                                    ? 'text-[#1f2654] hover:bg-[#1f2654]/10'
                                    : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'
                            }`}
                        >
                            <ChevronDown
                                size={18}
                                className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            />
                        </button>
                    ) : null;

                    const expandedDescription = canExpand && isExpanded ? (
                        <div className="mt-1 min-w-0">
                            {isDraft ? (
                                <Suspense fallback={<div className="min-h-[60px] rounded bg-slate-50" />}>
                                    <LazyInlineDescriptionEditor
                                        positionId={row.id}
                                        value={visibleLongDescription}
                                        minHeight={60}
                                        commit={commitLongDescription}
                                    />
                                </Suspense>
                            ) : visibleLongDescription ? (
                                <div
                                    className="rich-text-preview text-[12px] leading-5 text-slate-700 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_li]:pl-0.5"
                                    dangerouslySetInnerHTML={{ __html: richTextToHtml(visibleLongDescription) }}
                                />
                            ) : null}
                        </div>
                    ) : null;

                    return (
                        <tr
                            key={stableRowKeys.get(row.id) ?? row.id}
                            onClick={() => onSelectRow(row.id)}
                            // Every row is white — a title line is told apart by its
                            // type, not by a background of its own. Selection is an
                            // accent bar on the leading edge (index.css), so the row
                            // colour never changes underneath the figures.
                            data-row-selected={isSelected ? 'true' : undefined}
                            className="group"
                        >
                            {/* Position column: the row number is the resting state;
                                the checkbox takes its place on hover (and stays put
                                once anything is selected), with the reorder arrows
                                tucked to its left. Keeps the column quiet without
                                giving up bulk selection or ordering. */}
                            <td className="align-top">
                                <div className="flex items-center gap-1">
                                    {canReorder && (
                                        <div className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                            <button
                                                type="button"
                                                aria-label={t('tenders.move_up')}
                                                title={t('tenders.move_up')}
                                                disabled={rowIndex === 0}
                                                onClick={(event) => { event.stopPropagation(); onMoveRow(row.id, 'up'); }}
                                                className="flex h-3 w-4 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                            >
                                                <ChevronUp size={11} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={t('tenders.move_down')}
                                                title={t('tenders.move_down')}
                                                disabled={rowIndex === rows.length - 1}
                                                onClick={(event) => { event.stopPropagation(); onMoveRow(row.id, 'down'); }}
                                                className="flex h-3 w-4 items-center justify-center rounded-sm text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                            >
                                                <ChevronDown size={11} />
                                            </button>
                                        </div>
                                    )}
                                    <span className="relative flex h-5 w-6 shrink-0 items-center justify-start">
                                        <span
                                            aria-hidden
                                            className={`text-[12.5px] font-semibold tabular-nums transition-opacity ${
                                                row.kind === 'TITLE' ? 'text-[#1f2654]' : 'text-slate-500'
                                            } ${showSelection ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'}`}
                                        >
                                            {row.label}
                                        </span>
                                        <Checkbox
                                            aria-label={t('tenders.line_select')}
                                            size="sm"
                                            isSelected={!!selectedRowIds[row.id]}
                                            onChange={(checked) => onToggleRow(row.id, checked)}
                                            onClick={(event) => event.stopPropagation()}
                                            className={`absolute left-0 transition-opacity ${
                                                showSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                            }`}
                                        />
                                    </span>
                                </div>
                            </td>
                            <td
                                data-desc-cell={row.id}
                                onClick={() => { if (canExpand && expandedId !== row.id) setExpandedId(row.id); }}
                                className="align-top"
                            >
                                {/* No position number here — it lives in the Pos.
                                    column, to the side of the row. */}
                                <div className="flex min-w-0 items-center gap-1.5">
                                    {isProduct && position.sourceArticleId && (
                                        <button
                                            type="button"
                                            aria-label={t('tenders.product_detayina_git')}
                                            title={t('tenders.product_detayina_git')}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                window.open(`/inventory/articles/${position.sourceArticleId}`, '_blank', 'noopener');
                                            }}
                                            className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                            <Tag01 size={13} />
                                        </button>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        {!isDescription && (
                                            isDraft ? (
                                                <BufferedTextInput
                                                    ariaLabel={row.kind === 'TITLE' ?t('tenders.baslik') :t('tenders.product_adi')}
                                                    value={position.shortDescription || ''}
                                                    field="shortDescription"
                                                    commit={commitTextField}
                                                    positionId={row.id}
                                                    rowIndex={rowIndex}
                                                    navCol="shortDescription"
                                                    registerCell={registerCell}
                                                    onArrowNav={handleArrowNav}
                                                    className={row.kind === 'TITLE' ? INLINE_TITLE_INPUT_CLASS : INLINE_NAME_INPUT_CLASS}
                                                    onDraftChange={isProduct ? (text, anchor) => onProductComboInput(row.id, text, anchor) : undefined}
                                                    autoFocus={autoFocusRowId === row.id}
                                                />
                                            ) : (
                                                <div className={`whitespace-normal break-words ${row.kind === 'TITLE' ?"text-[14px] font-semibold text-[#1f2654]" :"text-[13px] font-medium text-slate-900"}`}>
                                                    {position.shortDescription}
                                                </div>
                                            )
                                        )}
                                    </div>
                                    {expandToggle}
                                </div>
                                {expandedDescription}
                            </td>
                            <td className="text-right align-top">
                                <TenderLinePriceInput row={row} field="quantity" value={position.quantity} rowIndex={rowIndex} isDraft={isDraft} commit={commitNumberField} registerCell={registerCell} onArrowNav={handleArrowNav} />
                            </td>
                            <td className="text-right align-top">
                                {isProduct && isDraft ? (
                                    <BufferedTextInput
                                        ariaLabel={t('tenders.unit')}
                                        value={position.unit || ''}
                                        field="unit"
                                        commit={commitTextField}
                                        positionId={row.id}
                                        rowIndex={rowIndex}
                                        navCol="unit"
                                        registerCell={registerCell}
                                        onArrowNav={handleArrowNav}
                                        className="h-7 w-full min-w-0 rounded-[3px] border border-solid border-transparent bg-transparent px-2 text-right text-[12.5px] text-slate-700 outline-none transition-[border-color,background-color,box-shadow] duration-150 hover:border-slate-200 hover:bg-white focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10"
                                    />
                                ) : (
                                    <span className="block truncate py-1 text-right text-[12.5px] text-slate-500">{isProduct ? position.unit : ''}</span>
                                )}
                            </td>
                            <td className="text-right align-top">
                                <TenderLinePriceInput row={row} field="unitPrice" value={position.unitPrice} rowIndex={rowIndex} isDraft={isDraft} commit={commitNumberField} registerCell={registerCell} onArrowNav={handleArrowNav} />
                            </td>
                            {/* Discount: ONE editable percentage, nothing else. The
                                per-line stack of named discounts (and the little
                                "+" square that opened its editor) is gone — a
                                product line carries a single rate, and what the
                                cell shows is what the line applies. */}
                            <td className="text-right align-top">
                                {isProduct ? (
                                    <TenderLinePriceInput row={row} field="discount" value={position.discount} rowIndex={rowIndex} isDraft={isDraft} commit={commitNumberField} registerCell={registerCell} onArrowNav={handleArrowNav} max={100} />
                                ) : null}
                            </td>
                            <td className="text-right align-top">
                                <TenderLinePriceInput row={row} field="taxRate" value={taxRate} rowIndex={rowIndex} isDraft={isDraft} commit={commitNumberField} registerCell={registerCell} onArrowNav={handleArrowNav} max={100} />
                            </td>
                            <td className="text-right align-top">
                                {isProduct && row.total > 0 ? (
                                    // `shrink={false}`: the amount keeps its full size
                                    // however long it gets. A figure that outgrows the
                                    // column scrolls inside its cell — and the column
                                    // itself can be dragged wider — instead of the
                                    // digits getting smaller and harder to read.
                                    <AutoFitAmount
                                        value={fmtMoney(row.total)}
                                        basePx={13}
                                        shrink={false}
                                        scrollbar="thin"
                                        className="py-0.5 text-right font-bold tabular-nums text-[#1f2654]"
                                    />
                                ) : null}
                            </td>
                            {/* Profit / loss is a bare trend icon — the figures live in
                                the pop-up it opens, so the column stays narrow and the
                                prices to its left keep the attention. The delete button
                                shares the cell and only appears on the clicked row. */}
                            <td className="align-top">
                                <div className="flex items-center justify-end gap-0.5">
                                    {isProduct && profit && (
                                        <button
                                            type="button"
                                            aria-label={t('tenders.profit_loss')}
                                            title={t('tenders.profit_loss')}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                // Capture BEFORE the updater runs: React nulls
                                                // event.currentTarget after dispatch, so reading
                                                // it inside the updater intermittently stored
                                                // null and crashed the popover on gBCR.
                                                const anchor = event.currentTarget;
                                                setProfitPopover((current) =>
                                                    current?.rowId === row.id ? null : { rowId: row.id, anchorEl: anchor },
                                                );
                                            }}
                                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] transition-colors ${
                                                profit.result >= 0
                                                    ? 'text-emerald-600 hover:bg-emerald-50'
                                                    : 'text-rose-600 hover:bg-rose-50'
                                            }`}
                                        >
                                            {/* Same arrows as the column header — one
                                                direction each, so the cell and its
                                                heading speak the same language. */}
                                            {profit.result >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                        </button>
                                    )}
                                    {canReorder && isSelected && (
                                        <button
                                            type="button"
                                            aria-label={t('common.delete')}
                                            title={t('common.delete')}
                                            onClick={(event) => { event.stopPropagation(); onDeleteRow(row.id); }}
                                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                        >
                                            <Trash01 size={13} />
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    );
                })}
                {effectiveRenderedRowCount < rows.length && (
                    <tr
                        ref={moreRowsRef}
                        aria-hidden
                        data-tender-lines-virtual-spacer
                        style={{ height: (rows.length - effectiveRenderedRowCount) * COLLAPSED_ROW_HEIGHT_PX }}
                    >
                        <td colSpan={9} className="!p-0" />
                    </tr>
                )}
                {/* Permanent blank line: the next product / title / description
                    lands HERE — selecting in the dropdown or the large pop-up
                    fills this slot and a fresh blank line appears below it. */}
                {isDraft && canManage && (
                    <tr data-tender-line-placeholder>
                        <td />
                        <td colSpan={8}>
                            <button
                                type="button"
                                onClick={() => {
                                    setRenderedRowCount(rows.length + 1);
                                    onAddProductRow(lastRowId);
                                }}
                                className="block w-full max-w-[380px] rounded-[2px] border border-dashed border-slate-300 px-2.5 py-1.5 text-left text-[12px] text-slate-400 transition-colors hover:border-[#1f2654] hover:bg-slate-50 hover:text-slate-600"
                            >
                                {t('tenders.search_product')}
                            </button>
                        </td>
                    </tr>
                )}
                {isDraft && canManage && (
                    <tr data-tender-line-actions>
                        <td colSpan={9} className="!border-b-0">
                            {/* One row of add-actions: the product button leads, with
                                the title / description pair grouped beside it. */}
                            <div className="flex flex-wrap items-center gap-2 py-0.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRenderedRowCount(rows.length + 1);
                                        onAddProductRow(lastRowId);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-[2px] bg-emerald-600 px-2.5 py-1 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                                >
                                    <Package size={13} />
                                    {t('tenders.product_add')}
                                </button>
                                <span className="h-4 w-px bg-slate-200" aria-hidden />
                                <div className="inline-flex items-center overflow-hidden rounded-[2px] border border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRenderedRowCount(rows.length + 1);
                                            onAddRow('TITLE', undefined, undefined, lastRowId);
                                        }}
                                        className="px-2.5 py-1 text-[11.5px] font-medium text-slate-700 transition-colors hover:bg-[#1f2654] hover:text-white"
                                    >
                                        {t('tenders.baslik')}
                                    </button>
                                    <span className="h-5 w-px bg-slate-200" aria-hidden />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRenderedRowCount(rows.length + 1);
                                            onAddRow('DESCRIPTION', undefined, undefined, lastRowId);
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11.5px] font-medium text-slate-700 transition-colors hover:bg-[#1f2654] hover:text-white"
                                    >
                                        <FileText size={11} />
                                        {t('tenders.description_add')}
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
        {profitPopover && popoverProfit && (
            <TenderLineProfitPopover
                anchorEl={profitPopover.anchorEl}
                profit={popoverProfit}
                fmtMoney={fmtMoney}
                onClose={() => setProfitPopover(null)}
            />
        )}
        </>
    );
};
