import { useCallback, useRef, useState } from 'react';
import { runColumnDrag } from '@/lib/columnResizeDrag';
import {
    applyColumnLayout,
    colsOf,
    getColumnPlan,
    resetColumnBoundary,
    resizeColumnBoundary,
} from '@/lib/columnLayout';

/**
 * React-side defaults and refs for explicitly declared table columns.
 *
 * The app-wide resize layer normally captures these handles. This hook keeps
 * the same boundary behaviour as a safe fallback: the column on the left grows
 * while its immediate neighbour shrinks by the same amount.
 */
export type ColumnWidthOptions<K extends string> = {
    storageKey: string;
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
    // Old entries came from one-sided resizing and may not add up to the card.
    const persistedStorageKey = `${storageKey}:boundary-v2`;
    const keys = Object.keys(defaults) as K[];

    const [widths, setWidths] = useState<Record<K, number>>(() => {
        const stored: Partial<Record<K, number>> = {};
        try {
            const parsed = JSON.parse(localStorage.getItem(persistedStorageKey) || '{}');
            if (parsed && typeof parsed === 'object') {
                for (const key of keys) {
                    const value = Number((parsed as Record<string, unknown>)[key]);
                    if (Number.isFinite(value)) {
                        stored[key] = Math.round(Math.min(maxPx, Math.max(minPx, value)));
                    }
                }
            }
        } catch {
            /* A corrupt entry simply means defaults. */
        }
        return { ...defaults, ...stored };
    });

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
                localStorage.setItem(persistedStorageKey, JSON.stringify(next));
            } catch {
                /* Persistence is best-effort. */
            }
            return next;
        });
    }, [persistedStorageKey]);

    const startResize = useCallback((key: K, event: React.PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget as HTMLElement | null;
        const col = colElsRef.current.get(key);
        const table = handle?.closest('table') ?? null;
        const cols = table ? colsOf(table) : [];
        const index = col ? cols.indexOf(col) : -1;
        const nextCol = index >= 0 ? cols[index + 1] : undefined;
        const startWidth = col?.getBoundingClientRect().width ?? widths[key];
        const nextStartWidth = nextCol?.getBoundingClientRect().width ?? 0;
        const pairTotal = startWidth + nextStartWidth;
        const nextFloor = Math.min(minPx, Math.max(24, nextStartWidth));

        // A terminal handle is inert: the outside edge is not a boundary.
        if (!col || !nextCol || index < 0) return;

        const clamp = (value: number) => Math.round(Math.min(
            Math.min(maxPx, pairTotal - nextFloor),
            Math.max(minPx, value),
        ));
        const applyPair = (leftWidth: number) => {
            if (table && getColumnPlan(table)) {
                resizeColumnBoundary(table, index, leftWidth);
                return;
            }
            col.style.width = `${leftWidth}px`;
            nextCol.style.width = `${pairTotal - leftWidth}px`;
        };

        runColumnDrag({
            table,
            th: handle?.closest('th') ?? null,
            startX: event.clientX,
            startWidth,
            clamp,
            apply: applyPair,
            commit: (leftWidth) => {
                applyPair(leftWidth);
                commitWidth(key, leftWidth);
                const nextEntry = Array.from(colElsRef.current.entries())
                    .find(([, candidate]) => candidate === nextCol);
                if (nextEntry) commitWidth(nextEntry[0] as K, pairTotal - leftWidth);
                if (table) applyColumnLayout(table);
            },
        });
    }, [commitWidth, maxPx, minPx, widths]);

    const resetColumn = useCallback((key: K) => {
        const col = colElsRef.current.get(key);
        if (!col) return;
        const table = col.closest('table');
        const cols = table ? colsOf(table) : [];
        const index = cols.indexOf(col);
        const nextCol = index >= 0 ? cols[index + 1] : undefined;
        if (!table || !nextCol || index < 0) return;

        if (getColumnPlan(table)) {
            resetColumnBoundary(table, index);
            applyColumnLayout(table);
            return;
        }

        const pairTotal = col.getBoundingClientRect().width + nextCol.getBoundingClientRect().width;
        const resetWidth = Math.min(pairTotal - 24, Math.max(minPx, defaults[key]));
        col.style.width = `${resetWidth}px`;
        nextCol.style.width = `${pairTotal - resetWidth}px`;
        commitWidth(key, resetWidth);
    }, [commitWidth, defaults, minPx]);

    const resizeProps = useCallback((key: K) => ({
        onResizeStart: (event: React.PointerEvent) => startResize(key, event),
        onResizeReset: () => resetColumn(key),
    }), [startResize, resetColumn]);

    return { widths, setColRef, startResize, resetColumn, resizeProps };
};

export type ColumnWidthApi<K extends string> = ReturnType<typeof useColumnWidths<K>>;
