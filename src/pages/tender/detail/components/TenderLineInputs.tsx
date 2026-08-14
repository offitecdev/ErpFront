import { memo, useEffect, useRef, useState } from 'react';

import type { NumberField, TextField } from '../types/tenderDetail.types';

// Keep in step with --font-body (theme.css); 'sans-serif' alone put the quote
// line inputs (Einheit, description …) in Arial while the page is Open Sans.
const INLINE_INPUT_FONT_FAMILY = '"Open Sans", Arial, sans-serif';

/**
 * Tells a cell input to discard its in-progress text and blur WITHOUT
 * committing. Dispatch it on the input element itself:
 *   input.dispatchEvent(new CustomEvent(RESET_DRAFT_EVENT))
 */
export const RESET_DRAFT_EVENT = 'ofi:reset-draft';

type InlineCellNavProps = {
    positionId: string;
    rowIndex: number;
    navCol: string;
    registerCell: (key: string, handle: { focus: () => void } | null) => void;
    onArrowNav: (col: string, rowIndex: number, dir: 1 | -1) => boolean;
};

// Plain native <input> (no Ant Design): the value is buffered locally while the
// cell is focused and committed on blur/Enter. Font size is STATIC — the text
// never rescales with content length; overflow relies on native input scroll.
export const BufferedTextInput = memo(({
    ariaLabel,
    value,
    className,
    field,
    commit,
    positionId,
    rowIndex,
    navCol,
    registerCell,
    onArrowNav,
    onDraftChange,
    autoFocus,
}: {
    ariaLabel: string;
    value: string;
    className: string;
    field: TextField;
    commit: (positionId: string, field: TextField, value: string) => void;
    /**
     * Live draft text plus the input it came from. The article suggestions are
     * driven from here — while typing, and also on focusing an EMPTY cell, so a
     * blank row offers the first products straight away. A filled cell stays a
     * plain text field until the user actually edits it.
     */
    onDraftChange?: (value: string, anchor: HTMLInputElement) => void;
    /** Set on a freshly added row: take focus so the user can type immediately. */
    autoFocus?: boolean;
} & InlineCellNavProps) => {
    const [draft, setDraft] = useState(value);
    const focusedRef = useRef(false);
    const wasFocusedOnPointerDownRef = useRef(false);
    const skipCommitRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!focusedRef.current) setDraft(value);
    }, [value]);

    useEffect(() => {
        const key = `${navCol}:${rowIndex}`;
        registerCell(key, {
            focus: () => {
                // preventScroll: arrow-key navigation between cells must move the
                // caret without the browser scrolling the row into view — that
                // was what nudged the page up/down on every keystroke.
                inputRef.current?.focus({ preventScroll: true });
                inputRef.current?.select();
            },
        });
        return () => registerCell(key, null);
    }, [navCol, rowIndex, registerCell]);

    // Runs once per newly added blank row: put the caret in the cell. The
    // focus handler below then opens the article list — the cell is empty, so
    // the first products appear without a single keystroke.
    useEffect(() => {
        if (!autoFocus) return;
        inputRef.current?.focus({ preventScroll: true });
    }, [autoFocus]);

    // Explicit "abandon what was typed" channel for the article combobox.
    //
    // When an article is picked, the search text sitting in this cell must be
    // dropped — the article's own name replaces it. That used to be done by
    // dispatching a synthetic Escape at the input and relying on the keydown
    // handler below; a listener added elsewhere on the same element later
    // stopped Escape from propagating, so the reset silently stopped happening
    // and the stale search text was committed over the article name on blur.
    // A dedicated event cannot be intercepted by keyboard handling.
    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        const onResetDraft = () => {
            skipCommitRef.current = true;
            setDraft(value);
            input.blur();
        };
        input.addEventListener(RESET_DRAFT_EVENT, onResetDraft);
        return () => input.removeEventListener(RESET_DRAFT_EVENT, onResetDraft);
    }, [value]);

    const commitDraft = () => {
        focusedRef.current = false;
        if (skipCommitRef.current) {
            skipCommitRef.current = false;
            setDraft(value);
            return;
        }
        if (draft !== value) commit(positionId, field, draft);
    };

    return (
        <input
            ref={inputRef}
            type="text"
            aria-label={ariaLabel}
            value={draft}
            onFocus={() => {
                focusedRef.current = true;
            }}
            onChange={(event) => {
                setDraft(event.target.value);
                onDraftChange?.(event.target.value, event.currentTarget);
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    skipCommitRef.current = true;
                    setDraft(value);
                    event.currentTarget.blur();
                } else if (event.key === 'ArrowUp') {
                    if (onArrowNav(navCol, rowIndex, -1)) event.preventDefault();
                } else if (event.key === 'ArrowDown') {
                    if (onArrowNav(navCol, rowIndex, 1)) event.preventDefault();
                }
            }}
            onPointerDown={() => {
                // First click selects/focuses the cell. Only a second click on
                // the already focused product name opens its suggestions.
                wasFocusedOnPointerDownRef.current = focusedRef.current;
            }}
            onClick={(event) => {
                event.stopPropagation();
                if (wasFocusedOnPointerDownRef.current) {
                    onDraftChange?.(draft, event.currentTarget);
                }
            }}
            className={className}
            style={{ fontFamily: INLINE_INPUT_FONT_FAMILY }}
        />
    );
});
BufferedTextInput.displayName = 'BufferedTextInput';

const toNumberDraft = (value: number | null | undefined) =>
    value != null && Number(value) > 0 ? String(value) : '';

// Accept both "1'234,5" and "1234.5" style entries.
const parseNumberDraft = (raw: string): number => {
    const normalized = raw.replace(/'/g, '').replace(',', '.').trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

// Native numeric cell input (no Ant Design InputNumber). The draft is kept as
// the raw typed string while focused and parsed/clamped on commit. Static font
// size by design — long figures scroll inside the input instead of shrinking.
export const BufferedNumberInput = memo(({
    ariaLabel,
    value,
    max,
    className,
    field,
    commit,
    positionId,
    rowIndex,
    navCol,
    registerCell,
    onArrowNav,
}: {
    ariaLabel: string;
    value: number | null | undefined;
    max?: number;
    className: string;
    field: NumberField;
    commit: (positionId: string, field: NumberField, value: number) => void;
} & InlineCellNavProps) => {
    const [draft, setDraft] = useState<string>(() => toNumberDraft(value));
    const focusedRef = useRef(false);
    const skipCommitRef = useRef(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!focusedRef.current) setDraft(toNumberDraft(value));
    }, [value]);

    useEffect(() => {
        const key = `${navCol}:${rowIndex}`;
        registerCell(key, {
            focus: () => {
                // preventScroll: arrow-key navigation between cells must move the
                // caret without the browser scrolling the row into view — that
                // was what nudged the page up/down on every keystroke.
                inputRef.current?.focus({ preventScroll: true });
                inputRef.current?.select();
            },
        });
        return () => registerCell(key, null);
    }, [navCol, rowIndex, registerCell]);

    const commitDraft = () => {
        focusedRef.current = false;
        if (skipCommitRef.current) {
            skipCommitRef.current = false;
            setDraft(toNumberDraft(value));
            return;
        }
        const raw = parseNumberDraft(draft);
        const next = max == null ? raw : Math.min(raw, max);
        const current = value != null && Number(value) > 0 ? Number(value) : 0;
        setDraft(next > 0 ? String(next) : '');
        if (next !== current) commit(positionId, field, next);
    };

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            aria-label={ariaLabel}
            value={draft}
            onFocus={() => { focusedRef.current = true; }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    skipCommitRef.current = true;
                    setDraft(toNumberDraft(value));
                    event.currentTarget.blur();
                } else if (event.key === 'ArrowUp') {
                    if (onArrowNav(navCol, rowIndex, -1)) event.preventDefault();
                } else if (event.key === 'ArrowDown') {
                    if (onArrowNav(navCol, rowIndex, 1)) event.preventDefault();
                }
            }}
            onClick={(event) => event.stopPropagation()}
            className={className}
            style={{ fontFamily: INLINE_INPUT_FONT_FAMILY }}
        />
    );
});
BufferedNumberInput.displayName = 'BufferedNumberInput';
