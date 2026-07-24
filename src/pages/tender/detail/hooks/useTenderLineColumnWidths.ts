import { useCallback, useRef, useState } from 'react';

import type { TenderLineColumnKey } from '../types/tenderDetail.types';
import { DEFAULT_TENDER_LINE_COLUMN_WIDTHS } from '../utils/tenderDetail.constants';

const STORAGE_KEY = 'offitec:tender-detail:line-col-widths:v1';

export const RESIZABLE_LINE_COLUMNS = ['quantity', 'unit', 'unitPrice', 'discount', 'taxRate', 'total'] as const;
export type ResizableLineColumn = (typeof RESIZABLE_LINE_COLUMNS)[number];

const MIN_COL_PX = 56;
const MAX_COL_PX = 320;

const clampWidth = (value: number) => Math.round(Math.min(MAX_COL_PX, Math.max(MIN_COL_PX, value)));

const readStoredWidths = (): Partial<Record<ResizableLineColumn, number>> => {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object') return {};
        const out: Partial<Record<ResizableLineColumn, number>> = {};
        for (const key of RESIZABLE_LINE_COLUMNS) {
            const value = Number((parsed as Record<string, unknown>)[key]);
            if (Number.isFinite(value)) out[key] = clampWidth(value);
        }
        return out;
    } catch {
        return {};
    }
};

const persistWidths = (widths: Record<TenderLineColumnKey, number>) => {
    try {
        const out: Partial<Record<ResizableLineColumn, number>> = {};
        for (const key of RESIZABLE_LINE_COLUMNS) out[key] = widths[key];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch {
        /* persistence is best-effort */
    }
};

/**
 * User-resizable widths for the offer-line table's fixed (numeric) columns.
 *
 * The description column has no <col> width, so with `table-fixed` it always
 * absorbs whatever the fixed columns give up — resizing never leaves dead
 * space. All resizable columns sit to the RIGHT of the flexible one, so each
 * drag handle lives on a column's LEFT border: that border is the edge that
 * actually moves, which keeps it glued to the cursor during the drag.
 *
 * While dragging we write the <col> width directly (one style write per
 * pointermove, zero React renders); the final width is committed to state +
 * localStorage on pointerup.
 */
export const useTenderLineColumnWidths = () => {
    const [widths, setWidths] = useState<Record<TenderLineColumnKey, number>>(() => ({
        ...DEFAULT_TENDER_LINE_COLUMN_WIDTHS,
        ...readStoredWidths(),
    }));
    const colElsRef = useRef(new Map<TenderLineColumnKey, HTMLTableColElement>());

    const setColRef = useCallback((key: TenderLineColumnKey) => (el: HTMLTableColElement | null) => {
        if (el) colElsRef.current.set(key, el);
        else colElsRef.current.delete(key);
    }, []);

    const commitWidth = useCallback((key: ResizableLineColumn, width: number) => {
        setWidths((current) => {
            if (current[key] === width) return current;
            const next = { ...current, [key]: width };
            persistWidths(next);
            return next;
        });
    }, []);

    const startResize = useCallback((key: ResizableLineColumn, event: React.PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = colElsRef.current.get(key)?.getBoundingClientRect().width ?? widths[key];
        let nextWidth = clampWidth(startWidth);

        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (moveEvent: PointerEvent) => {
            // Left-border handle: dragging left grows the column, right shrinks it.
            nextWidth = clampWidth(startWidth - (moveEvent.clientX - startX));
            const col = colElsRef.current.get(key);
            if (col) col.style.width = `${nextWidth}px`;
        };
        const finish = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            commitWidth(key, nextWidth);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
    }, [commitWidth, widths]);

    const resetColumn = useCallback((key: ResizableLineColumn) => {
        commitWidth(key, DEFAULT_TENDER_LINE_COLUMN_WIDTHS[key]);
    }, [commitWidth]);

    return { widths, setColRef, startResize, resetColumn };
};
