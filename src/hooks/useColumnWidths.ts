import { useCallback, useRef, useState } from 'react';

/**
 * Drag-resizable column widths for a `table-layout: fixed` table, remembered
 * per browser.
 *
 * The table needs a `<colgroup>`: every resizable column gets a `<col>` with
 * `ref={setColRef(key)}` and `style={{ width: widths[key] }}`, and ONE column is
 * left without a width so it absorbs whatever the others give up — resizing then
 * never leaves dead space at the right edge. Because that flexible column comes
 * FIRST in every table using this, each handle sits on its column's LEFT border:
 * that border is the edge that actually moves, which keeps it under the cursor
 * during the drag (dragging left grows the column, right shrinks it).
 *
 * While dragging, the `<col>` width is written directly — one style write per
 * pointermove, zero React renders; the final width is committed to state +
 * localStorage on pointerup. Double-clicking a handle restores that column's
 * default (see `resetColumn`).
 */
export type ColumnWidthOptions<K extends string> = {
    /** localStorage key. Bump its version suffix when the defaults change, or
        anyone who ever dragged a column keeps the old layout forever. */
    storageKey: string;
    /** Starting width per resizable column, in px. */
    defaults: Record<K, number>;
    minPx?: number;
    maxPx?: number;
};

export const useColumnWidths = <K extends string>({
    storageKey,
    defaults,
    minPx = 60,
    maxPx = 640,
}: ColumnWidthOptions<K>) => {
    const keys = Object.keys(defaults) as K[];
    const clampWidth = useCallback(
        (value: number) => Math.round(Math.min(maxPx, Math.max(minPx, value))),
        [minPx, maxPx],
    );

    const [widths, setWidths] = useState<Record<K, number>>(() => {
        const stored: Partial<Record<K, number>> = {};
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (parsed && typeof parsed === 'object') {
                for (const key of keys) {
                    const value = Number((parsed as Record<string, unknown>)[key]);
                    if (Number.isFinite(value)) {
                        stored[key] = Math.round(Math.min(maxPx, Math.max(minPx, value)));
                    }
                }
            }
        } catch {
            /* a corrupt entry just means "use the defaults" */
        }
        return { ...defaults, ...stored };
    });

    // Keyed by plain string: a table may hand refs for columns it never resizes
    // (they just never get a handle), and those must not have to appear in the
    // width record.
    const colElsRef = useRef(new Map<string, HTMLTableColElement>());

    const setColRef = useCallback((key: string) => (el: HTMLTableColElement | null) => {
        if (el) colElsRef.current.set(key, el);
        else colElsRef.current.delete(key);
    }, []);

    const commitWidth = useCallback((key: K, width: number) => {
        setWidths((current) => {
            if (current[key] === width) return current;
            const next = { ...current, [key]: width };
            try {
                localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
                /* persistence is best-effort */
            }
            return next;
        });
    }, [storageKey]);

    /**
     * @param side Which edge of the column the handle sits on. A column to the
     *   LEFT of the flexible one can only be grabbed by its right edge (that is
     *   the border that moves), so it drags the other way round.
     */
    const startResize = useCallback((key: K, event: React.PointerEvent, side: 'left' | 'right' = 'left') => {
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
            // Left-border handle: dragging left grows the column, right shrinks
            // it. On the right border it is the other way round — either way the
            // border stays under the cursor.
            const delta = moveEvent.clientX - startX;
            nextWidth = clampWidth(side === 'left' ? startWidth - delta : startWidth + delta);
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
    }, [clampWidth, commitWidth, widths]);

    const resetColumn = useCallback((key: K) => {
        commitWidth(key, defaults[key]);
        // The drag writes the <col> width inline; state alone would not undo it.
        const col = colElsRef.current.get(key);
        if (col) col.style.width = `${defaults[key]}px`;
    }, [commitWidth, defaults]);

    /** Everything a `<ColResizeHandle>` in that column's header needs. */
    const resizeProps = useCallback((key: K, side: 'left' | 'right' = 'left') => ({
        side,
        onResizeStart: (event: React.PointerEvent) => startResize(key, event, side),
        onResizeReset: () => resetColumn(key),
    }), [startResize, resetColumn]);

    return { widths, setColRef, startResize, resetColumn, resizeProps };
};

export type ColumnWidthApi<K extends string> = ReturnType<typeof useColumnWidths<K>>;
