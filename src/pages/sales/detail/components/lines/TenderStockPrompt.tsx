import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { CircleXFill } from '@/components/icons/CircleXFill';
import { t } from '@/i18n/translate';
import '@/styles/tenderStockPrompt.css';

/** Distance from the end of the typed name to the arrow tip. */
const GAP = 12;
const EDGE = 8;
/** How long a missing row is taken for a render in flight, not a deleted row. */
const VOID_GRACE_MS = 400;

type Placement = { left: number; top: number; side: 'right' | 'left'; hidden: boolean };

let measureContext: CanvasRenderingContext2D | null = null;
const measureCache = { value: '', font: '', width: 0 };

/** Rendered width of the cell's text — the bubble sits right behind it. */
const textWidth = (input: HTMLInputElement, font: string): number => {
    if (measureCache.value === input.value && measureCache.font === font) return measureCache.width;
    measureContext ??= document.createElement('canvas').getContext('2d');
    if (!measureContext) return 0;
    measureContext.font = font;
    const width = measureContext.measureText(input.value).width;
    Object.assign(measureCache, { value: input.value, font, width });
    return width;
};

const findNameInput = (rowId: string): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>(`tr[data-row-id="${CSS.escape(rowId)}"] [data-line-name] input`);

const computePlacement = (rowId: string, bubble: HTMLDivElement | null): Placement | null => {
    const input = findNameInput(rowId);
    if (!input || !bubble) return null;
    const rect = input.getBoundingClientRect();
    if (!rect.width) return null;
    const style = getComputedStyle(input);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const textEnd = Math.min(rect.right, rect.left + padLeft + textWidth(input, style.font) - input.scrollLeft);
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    // To the right of the name; only when that runs off screen, left of the cell.
    let side: Placement['side'] = 'right';
    let left = textEnd + GAP;
    if (left + width > window.innerWidth - EDGE) {
        side = 'left';
        left = Math.max(EDGE, rect.left - GAP - width);
    }
    // Scrolled out of the page's scroll port: keep the bubble, just hide it.
    const port = input.closest('[data-page-scrollport]')?.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const hidden = centerY < Math.max(0, port?.top ?? 0) || centerY > Math.min(window.innerHeight, port?.bottom ?? window.innerHeight);
    return { left, top: centerY - height / 2, side, hidden };
};

/**
 * "Add to stock?" — the narrow macOS popover beside a quote line whose product
 * name matched nothing in the catalogue. "Add" opens the product form in a new
 * tab; the circled X keeps the line as a free line.
 *
 * It is pinned to the ROW, not to an element: saving the quote swaps the row's
 * temp id for the server id, so the row is resolved and its name cell looked up
 * afresh on every measure. Scroll and resize move it at once; a slow tick
 * catches layout shifts without a scroll (rows added above, a description
 * expanding) — and notices when the question no longer stands.
 */
export const TenderStockPrompt = ({ rowKey, resolveRowId, onAdd, onDismiss }: {
    /** The asked row's stable key. */
    rowKey: string;
    /** The row's current id; null once the question is void (row deleted,
        emptied or given an article another way). */
    resolveRowId: (rowKey: string) => string | null;
    onAdd: () => void;
    onDismiss: () => void;
}) => {
    const bubbleRef = useRef<HTMLDivElement | null>(null);
    const [placement, setPlacement] = useState<Placement | null>(null);

    useLayoutEffect(() => {
        let frame = 0;
        let last = '';
        const shownAt = performance.now();
        const measure = () => {
            frame = 0;
            const rowId = resolveRowId(rowKey);
            // The page publishes its newest rows to a ref in a passive effect, so
            // the first passes may still see the row as it was before the name
            // landed. Only a void that outlasts that grace calls the question off.
            if (!rowId && performance.now() - shownAt > VOID_GRACE_MS) {
                onDismiss();
                return;
            }
            const next = rowId ? computePlacement(rowId, bubbleRef.current) : null;
            const key = next ? `${Math.round(next.left)}|${Math.round(next.top)}|${next.side}|${next.hidden}` : 'none';
            if (key === last) return;
            last = key;
            setPlacement(next);
        };
        const schedule = () => {
            if (!frame) frame = window.requestAnimationFrame(measure);
        };
        measure();
        schedule();
        const timer = window.setInterval(schedule, 250);
        window.addEventListener('scroll', schedule, { capture: true, passive: true });
        window.addEventListener('resize', schedule);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.clearInterval(timer);
            window.removeEventListener('scroll', schedule, { capture: true });
            window.removeEventListener('resize', schedule);
        };
    }, [rowKey, resolveRowId, onDismiss]);

    // Escape acts as the X — unless a field has focus: Escape in a cell belongs
    // to that cell (it reverts the draft).
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            const active = document.activeElement;
            if (active && active !== document.body && !bubbleRef.current?.contains(active)) return;
            onDismiss();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onDismiss]);

    const question = t('tenders.stockPrompt.question');
    const dismissLabel = t('tenders.stockPrompt.dismiss');

    return createPortal(
        <div
            ref={bubbleRef}
            role="dialog"
            aria-label={question}
            data-side={placement?.side ?? 'right'}
            className="ofi-stock-ask"
            style={{
                left: placement?.left ?? -9999,
                top: placement?.top ?? -9999,
                visibility: placement && !placement.hidden ? 'visible' : 'hidden',
            }}
        >
            <span className="ofi-stock-ask__text">{question}</span>
            <button type="button" className="ofi-stock-ask__add" onClick={onAdd}>
                {t('common.add')}
            </button>
            <button
                type="button"
                className="ofi-stock-ask__close"
                aria-label={dismissLabel}
                title={dismissLabel}
                onClick={onDismiss}
            >
                <CircleXFill />
            </button>
        </div>,
        document.body,
    );
};
