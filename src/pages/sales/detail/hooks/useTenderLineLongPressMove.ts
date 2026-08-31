import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

// Long-press reordering for the quote lines table. Holding the pointer still on
// a row for LONG_PRESS_MS "picks the row up": every other line greys out, the
// picked one is highlighted, and a drop line follows the pointer between the
// rows. Two ways to put it down —
//   • keep holding and drag: the row lands where the line is when the pointer
//     is released;
//   • release without moving: the row stays picked ("armed") and the next click
//     anywhere in the table places it at the line under the pointer.
// Escape, a click on the picked row itself or the hint's cancel button drop it
// back where it was. Everything runs on window/document listeners so the drag
// keeps working when the pointer leaves the table (and the rows are made
// pointer-transparent for the duration — see index.css).
//
// Pressing on a spot that is NOT an input/button (the Pos. number, a static
// amount, cell padding) and pulling straight away picks the row up too, with
// no wait — the hold is only needed where an immediate drag would otherwise
// mean "select this text".
const LONG_PRESS_MS = 350;
// A press that wanders further than this before the timer fires is either an
// immediate drag (non-interactive spot → pick up now) or a text selection /
// scroll (interactive spot → not a long-press).
const LONG_PRESS_TOLERANCE_PX = 6;
// Elements whose own press gesture (caret, text selection, toggle) must win
// over an immediate drag; the row still lifts after a hold.
const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a, label, [contenteditable=""], [contenteditable="true"], [role="button"], [role="checkbox"]';
// A drag that let go on a no-op slot after travelling this far was "put back",
// not "released in place" — so it does NOT stay armed.
const DROP_TRAVEL_TOLERANCE_PX = 8;
const AUTO_SCROLL_EDGE_PX = 56;
const AUTO_SCROLL_MAX_STEP_PX = 16;

export type TenderLineMoveState = {
    /** The row that was picked up. */
    rowId: string;
    /** Insert-before slot 0..rowIds.length; null until the pointer has said. */
    slot: number | null;
    /** True while the long-press pointer is still held (drop on release). */
    dragging: boolean;
};

type Options = {
    enabled: boolean;
    /** Row ids in display order — the same order as the `tr[data-row-id]` DOM. */
    rowIds: string[];
    tableRef: RefObject<HTMLTableElement | null>;
    /** `slot` is an insert-before index over the CURRENT order (0..rowIds.length). */
    onMoveRowTo: (rowId: string, slot: number) => void;
    /** Fired once when a row is picked up (select it, reveal every row, …). */
    onPickUp?: (rowId: string) => void;
};

/** A slot that would leave the row where it already is is not a drop target. */
export const isRealDropSlot = (rowIds: string[], rowId: string, slot: number | null): slot is number => {
    if (slot == null) return false;
    const from = rowIds.indexOf(rowId);
    return from >= 0 && slot !== from && slot !== from + 1;
};

const slotFromPointer = (table: HTMLTableElement, clientY: number) => {
    const rowEls = table.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row-id]');
    let slot = 0;
    for (const rowEl of rowEls) {
        const rect = rowEl.getBoundingClientRect();
        if (clientY > rect.top + rect.height / 2) slot += 1;
        else break;
    }
    return slot;
};

// The element that scrolls the page content — the app shell scrolls a main
// pane rather than the window, so walk up to the first overflowing ancestor.
const findScrollParent = (el: HTMLElement | null): HTMLElement | null => {
    let node = el?.parentElement ?? null;
    while (node) {
        const { overflowY } = window.getComputedStyle(node);
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
        node = node.parentElement;
    }
    return null;
};

export const useTenderLineLongPressMove = ({ enabled, rowIds, tableRef, onMoveRowTo, onPickUp }: Options) => {
    const [moveState, setMoveStateRaw] = useState<TenderLineMoveState | null>(null);
    // Mirrors of props/state for the window listeners, which live longer than
    // one render.
    const stateRef = useRef<TenderLineMoveState | null>(null);
    const rowIdsRef = useRef(rowIds);
    const enabledRef = useRef(enabled);
    const onMoveRowToRef = useRef(onMoveRowTo);
    const onPickUpRef = useRef(onPickUp);
    useLayoutEffect(() => {
        rowIdsRef.current = rowIds;
        enabledRef.current = enabled;
        onMoveRowToRef.current = onMoveRowTo;
        onPickUpRef.current = onPickUp;
    });

    const setMoveState = useCallback((next: TenderLineMoveState | null) => {
        stateRef.current = next;
        setMoveStateRaw(next);
    }, []);

    // The pending press: pointer is down, timer running, nothing picked up yet.
    const pressRef = useRef<{ timer: number; teardown: () => void } | null>(null);
    // Where the pointer was when the row was picked up / last seen.
    const originRef = useRef({ x: 0, y: 0 });
    const lastPointerRef = useRef({ x: 0, y: 0 });
    // The click the browser fires when the long-press pointer is released must
    // reach nobody: not the session's own click handler (it would read it as a
    // placement), and not the row underneath once the session has ended (it
    // would select a row / open a description). Armed for a moment on
    // pointer-up; the click follows in the same input task.
    const suppressClickRef = useRef(false);
    const swallowNextClick = useCallback(() => {
        suppressClickRef.current = true;
        const cleanup = () => {
            suppressClickRef.current = false;
            document.removeEventListener('click', handler, true);
            window.clearTimeout(timer);
        };
        const handler = (event: MouseEvent) => {
            event.stopPropagation();
            event.preventDefault();
            cleanup();
        };
        const timer = window.setTimeout(cleanup, 150);
        document.addEventListener('click', handler, true);
    }, []);
    const sessionTeardownRef = useRef<(() => void) | null>(null);

    const cancelPress = useCallback(() => {
        const press = pressRef.current;
        if (!press) return;
        window.clearTimeout(press.timer);
        press.teardown();
        pressRef.current = null;
    }, []);

    const endSession = useCallback(() => {
        sessionTeardownRef.current?.();
        sessionTeardownRef.current = null;
        setMoveState(null);
    }, [setMoveState]);

    const commitDrop = useCallback((slot: number) => {
        const current = stateRef.current;
        if (!current) return;
        const real = isRealDropSlot(rowIdsRef.current, current.rowId, slot);
        endSession();
        if (real) onMoveRowToRef.current(current.rowId, slot);
    }, [endSession]);

    const activate = useCallback((rowId: string, x: number, y: number) => {
        // Any input the press landed in lets go of focus + selection so the
        // drag does not turn into a text selection.
        const active = document.activeElement as HTMLElement | null;
        active?.blur?.();
        window.getSelection?.()?.removeAllRanges();
        originRef.current = { x, y };
        lastPointerRef.current = { x, y };
        onPickUpRef.current?.(rowId);
        setMoveState({ rowId, slot: null, dragging: true });
    }, [setMoveState]);

    const onRowPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, rowId: string) => {
        if (!enabledRef.current || stateRef.current) return;
        if (event.button !== 0 || !event.isPrimary) return;
        cancelPress();
        const start = { x: event.clientX, y: event.clientY };
        const target = event.target as Element | null;
        const immediateDrag = !(target?.closest?.(INTERACTIVE_SELECTOR));
        const onMove = (moveEvent: PointerEvent) => {
            if (moveEvent.pointerId !== event.pointerId) return;
            if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) <= LONG_PRESS_TOLERANCE_PX) return;
            cancelPress();
            if (immediateDrag) activate(rowId, moveEvent.clientX, moveEvent.clientY);
        };
        const onEnd = (endEvent: PointerEvent) => {
            if (endEvent.pointerId === event.pointerId) cancelPress();
        };
        // A long touch pops the platform context menu on some devices; the row
        // is being picked up instead.
        const onContextMenu = (menuEvent: Event) => menuEvent.preventDefault();
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
        document.addEventListener('contextmenu', onContextMenu, true);
        const teardown = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);
            document.removeEventListener('contextmenu', onContextMenu, true);
        };
        const timer = window.setTimeout(() => {
            teardown();
            pressRef.current = null;
            activate(rowId, start.x, start.y);
        }, LONG_PRESS_MS);
        pressRef.current = { timer, teardown };
    }, [activate, cancelPress]);

    // One session = one picked-up row. Subscribed per pick-up, not per slot
    // change; the handlers read live state through the refs.
    const activeRowId = moveState?.rowId ?? null;
    useEffect(() => {
        if (!activeRowId) return;
        const table = tableRef.current;
        if (!table) { endSession(); return; }
        const scrollParent = findScrollParent(table);
        let autoScrollFrame = 0;
        let autoScrollStep = 0;

        const updateSlot = (clientY: number) => {
            const slot = slotFromPointer(table, clientY);
            const current = stateRef.current;
            if (current && current.slot !== slot) setMoveState({ ...current, slot });
        };

        const stopAutoScroll = () => {
            if (autoScrollFrame) window.cancelAnimationFrame(autoScrollFrame);
            autoScrollFrame = 0;
            autoScrollStep = 0;
        };
        const autoScrollTick = () => {
            autoScrollFrame = 0;
            if (!autoScrollStep) return;
            if (scrollParent) scrollParent.scrollTop += autoScrollStep;
            else window.scrollBy(0, autoScrollStep);
            // The rows moved under a stationary pointer: re-aim the drop line.
            updateSlot(lastPointerRef.current.y);
            autoScrollFrame = window.requestAnimationFrame(autoScrollTick);
        };
        // Near the top/bottom edge of the scrolling area the list creeps in that
        // direction, faster the closer to the edge — long quotes stay reachable.
        const updateAutoScroll = (clientY: number) => {
            const bounds = scrollParent ? scrollParent.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
            const top = Math.max(bounds.top, 0);
            const bottom = Math.min(bounds.bottom, window.innerHeight);
            let step = 0;
            if (clientY < top + AUTO_SCROLL_EDGE_PX) {
                step = -Math.ceil(((top + AUTO_SCROLL_EDGE_PX - clientY) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_STEP_PX);
            } else if (clientY > bottom - AUTO_SCROLL_EDGE_PX) {
                step = Math.ceil(((clientY - (bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX) * AUTO_SCROLL_MAX_STEP_PX);
            }
            autoScrollStep = Math.max(-AUTO_SCROLL_MAX_STEP_PX, Math.min(AUTO_SCROLL_MAX_STEP_PX, step));
            if (autoScrollStep && !autoScrollFrame) autoScrollFrame = window.requestAnimationFrame(autoScrollTick);
            if (!autoScrollStep) stopAutoScroll();
        };

        const onPointerMove = (event: PointerEvent) => {
            lastPointerRef.current = { x: event.clientX, y: event.clientY };
            updateSlot(event.clientY);
            // Edge auto-scroll only while the pointer is held; once armed the
            // wheel scrolls as usual (and the hint's cancel button sits in the
            // bottom edge zone).
            if (stateRef.current?.dragging) updateAutoScroll(event.clientY);
        };
        // Wheel / keyboard scrolling under a stationary pointer: re-aim.
        const onScroll = () => updateSlot(lastPointerRef.current.y);
        const onPointerUp = (event: PointerEvent) => {
            const current = stateRef.current;
            if (!current?.dragging) return;
            stopAutoScroll();
            swallowNextClick();
            const slot = slotFromPointer(table, event.clientY);
            const travelled = Math.hypot(event.clientX - originRef.current.x, event.clientY - originRef.current.y);
            if (isRealDropSlot(rowIdsRef.current, current.rowId, slot)) {
                commitDrop(slot);
            } else if (travelled > DROP_TRAVEL_TOLERANCE_PX) {
                // Dragged around and put back — done.
                endSession();
            } else {
                // Released in place: stay picked up, the next click places it.
                setMoveState({ ...current, dragging: false });
            }
        };
        // Touch scrolling (or the OS) took the pointer away mid-drag: keep the
        // row picked up so a tap can still place it.
        const onPointerCancel = () => {
            const current = stateRef.current;
            stopAutoScroll();
            if (current?.dragging) setMoveState({ ...current, dragging: false });
        };
        const onClick = (event: MouseEvent) => {
            const target = event.target as Element | null;
            // The floating hint (cancel button) is the one thing that keeps its
            // own click while a row is picked up.
            if (target?.closest?.('[data-line-move-hint]')) return;
            // Nothing else underneath may react to a click during a move — not
            // the row select, not the description toggle, not the add buttons.
            event.stopPropagation();
            event.preventDefault();
            // The release click of the long-press itself (see swallowNextClick).
            if (suppressClickRef.current) return;
            const current = stateRef.current;
            if (!current || current.dragging) return;
            const insideTable = Boolean(target && table.contains(target));
            const slot = insideTable ? slotFromPointer(table, event.clientY) : null;
            if (isRealDropSlot(rowIdsRef.current, current.rowId, slot)) commitDrop(slot);
            else endSession();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            endSession();
        };
        const swallow = (event: Event) => event.preventDefault();
        const onWindowBlur = () => endSession();

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);
        window.addEventListener('blur', onWindowBlur);
        window.addEventListener('scroll', onScroll, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('dragstart', swallow, true);
        document.addEventListener('contextmenu', swallow, true);
        document.body.classList.add('ofi-line-move-active');

        // The pointer has not moved yet: aim the drop line at where it is.
        updateSlot(lastPointerRef.current.y);

        const teardown = () => {
            stopAutoScroll();
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
            window.removeEventListener('blur', onWindowBlur);
            window.removeEventListener('scroll', onScroll, true);
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('dragstart', swallow, true);
            document.removeEventListener('contextmenu', swallow, true);
            document.body.classList.remove('ofi-line-move-active');
        };
        sessionTeardownRef.current = teardown;
        return () => {
            teardown();
            if (sessionTeardownRef.current === teardown) sessionTeardownRef.current = null;
        };
    }, [activeRowId, commitDrop, endSession, setMoveState, swallowNextClick, tableRef]);

    // The table can lose the right to reorder mid-session (status change, the
    // row got deleted) — drop the row back rather than leaving a ghost pick-up.
    useEffect(() => {
        const current = stateRef.current;
        if (!current) return;
        if (!enabled || !rowIds.includes(current.rowId)) endSession();
    }, [enabled, rowIds, endSession]);

    useEffect(() => () => {
        cancelPress();
        sessionTeardownRef.current?.();
        sessionTeardownRef.current = null;
    }, [cancelPress]);

    return {
        moveState,
        onRowPointerDown,
        cancelMove: endSession,
    };
};
