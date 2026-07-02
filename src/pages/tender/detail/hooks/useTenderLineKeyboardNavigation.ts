import { useCallback, useEffect, useRef } from 'react';

type CellHandle = { focus: () => void };

// Owns the inline line-item cells' keyboard-navigation wiring: a registry of
// focusable cell handles keyed by `${column}:${rowIndexOnPage}`, and the ↑/↓
// mover that shifts focus between the same column of adjacent rows. The paged
// row count is mirrored into a ref so the mover can bound its scan without
// re-creating the callback on every page change.
export const useTenderLineKeyboardNavigation = (pagedRows: readonly unknown[]) => {
    const cellHandleRefs = useRef(new Map<string, CellHandle>());
    const pagedRowCountRef = useRef(0);

    const registerCellHandle = useCallback((key: string, handle: CellHandle | null) => {
        if (handle) cellHandleRefs.current.set(key, handle);
        else cellHandleRefs.current.delete(key);
    }, []);

    const navigateCell = useCallback((col: string, rowIndex: number, dir: 1 | -1) => {
        const count = pagedRowCountRef.current;
        for (let r = rowIndex + dir; r >= 0 && r < count; r += dir) {
            const handle = cellHandleRefs.current.get(`${col}:${r}`);
            if (handle) {
                handle.focus();
                return true;
            }
        }
        return false;
    }, []);

    useEffect(() => {
        pagedRowCountRef.current = pagedRows.length;
    }, [pagedRows]);

    return {
        registerCellHandle,
        navigateCell,
    };
};
