/**
 * The one drag loop behind every resizable table column.
 *
 * Two callers share it: `useColumnWidths` (tables whose columns are declared in
 * React, with their own defaults and storage key) and `autoColumnResize` (the
 * app-wide layer that gives every other table the same handles without any
 * per-table wiring). Keeping the loop in one place is what makes the two look
 * and feel identical — most of all the DRAG FOCUS: while a column is being
 * dragged the table fades to light grey and only the dragged column's NAME
 * keeps its colour, so the user sees exactly which column is moving.
 *
 * The greying itself lives in CSS (`index.css`, "SPALTENBREITE ZIEHEN"); this
 * only flips the two attributes it keys off:
 *   • `data-col-resizing` on the `<table>`   — fade everything
 *   • `data-resize-active` on the `<th>`     — except this column's heading
 */

export type ColumnDragSpec = {
    /** Faded while dragging. */
    table: HTMLTableElement | null;
    /** The dragged column's heading — the one thing that stays coloured. */
    th: HTMLElement | null;
    /** Pointer x where the drag started. */
    startX: number;
    /** The column's width at that moment, in px. */
    startWidth: number;
    clamp: (px: number) => number;
    /** Every pointermove: write the width straight to the DOM (no React render). */
    apply: (px: number) => void;
    /** Once, on pointerup: persist the final width. */
    commit: (px: number) => void;
};

export const runColumnDrag = ({
    table,
    th,
    startX,
    startWidth,
    clamp,
    apply,
    commit,
}: ColumnDragSpec) => {
    let width = clamp(startWidth);

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    table?.setAttribute('data-col-resizing', '');
    th?.setAttribute('data-resize-active', '');

    // The handle always sits on the column's RIGHT edge: the cursor pulls that
    // edge, so moving right widens the column and moving left narrows it.
    const onMove = (moveEvent: PointerEvent) => {
        width = clamp(startWidth + (moveEvent.clientX - startX));
        apply(width);
    };
    const finish = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        table?.removeAttribute('data-col-resizing');
        th?.removeAttribute('data-resize-active');
        commit(width);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
};
