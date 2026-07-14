import { memo, useEffect, useRef, useState } from 'react';
import AntInput, { type InputRef } from 'antd/es/input';
import InputNumber from 'antd/es/input-number';

import { RichTextMarkdownEditor, INLINE_INPUT_FONT_FAMILY } from '../TenderRichText';
import type { NumberField, TextField } from '../types/tenderDetail.types';


type InlineCellNavProps = {
    positionId: string;
    rowIndex: number;
    navCol: string;
    registerCell: (key: string, handle: { focus: () => void } | null) => void;
    onArrowNav: (col: string, rowIndex: number, dir: 1 | -1) => boolean;
};

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
}: {
    ariaLabel: string;
    value: string;
    className: string;
    field: TextField;
    commit: (positionId: string, field: TextField, value: string) => void;
} & InlineCellNavProps) => {
    const [draft, setDraft] = useState(value);
    const focusedRef = useRef(false);
    const skipCommitRef = useRef(false);
    const inputRef = useRef<InputRef>(null);

    useEffect(() => {
        if (!focusedRef.current) setDraft(value);
    }, [value]);

    useEffect(() => {
        const key = `${navCol}:${rowIndex}`;
        registerCell(key, { focus: () => inputRef.current?.focus({ cursor: 'all' }) });
        return () => registerCell(key, null);
    }, [navCol, rowIndex, registerCell]);

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
        <AntInput
            ref={inputRef}
            aria-label={ariaLabel}
            size="small"
            variant="borderless"
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
                    setDraft(value);
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
BufferedTextInput.displayName = 'BufferedTextInput';

const toNumberDraft = (value: number | null | undefined) =>
    value != null && Number(value) > 0 ? Number(value) : null;

// When auto-fit is on, wait this long after the last keystroke before resizing —
// so the font stays put while typing and only settles once the user pauses.
const AUTOFIT_DEBOUNCE_MS = 300;
const AUTOFIT_BASE_PX = 11.5;
const AUTOFIT_MIN_PX = 9;

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
    autoFit = false,
}: {
    ariaLabel: string;
    value: number | null | undefined;
    max?: number;
    className: string;
    field: NumberField;
    commit: (positionId: string, field: NumberField, value: number) => void;
    // Shrink the font a notch (down to AUTOFIT_MIN_PX) so a long figure fits the
    // cell once the user stops typing; native input scroll covers the overflow
    // past the floor. Used for the unit-price field where a wide amount is common.
    autoFit?: boolean;
} & InlineCellNavProps) => {
    const [draft, setDraft] = useState<number | null>(() => toNumberDraft(value));
    const [autoFitPx, setAutoFitPx] = useState<number | null>(null);
    const focusedRef = useRef(false);
    const skipCommitRef = useRef(false);
    // antd's InputNumber ref exposes { focus, blur, nativeElement }; typed loosely
    // so we can reach the underlying <input> for select-all on keyboard navigation.
    const inputRef = useRef<any>(null);

    // After the user pauses, measure the real text overflow and step the font
    // down just enough to fit — the CSS var below then persists the size across
    // antd re-renders.
    useEffect(() => {
        if (!autoFit) return;
        const timer = window.setTimeout(() => {
            const inputEl = inputRef.current?.nativeElement?.querySelector?.('input') as HTMLInputElement | null;
            if (!inputEl) return;
            const restore = inputEl.style.fontSize;
            let px = AUTOFIT_BASE_PX;
            inputEl.style.fontSize = `${px}px`;
            while (px > AUTOFIT_MIN_PX && inputEl.scrollWidth > inputEl.clientWidth + 1) {
                px -= 0.5;
                inputEl.style.fontSize = `${px}px`;
            }
            inputEl.style.fontSize = restore;
            setAutoFitPx(px);
        }, AUTOFIT_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [draft, autoFit]);

    useEffect(() => {
        if (!focusedRef.current) setDraft(toNumberDraft(value));
    }, [value]);

    useEffect(() => {
        const key = `${navCol}:${rowIndex}`;
        registerCell(key, {
            focus: () => {
                const handle = inputRef.current;
                handle?.focus?.();
                handle?.nativeElement?.querySelector?.('input')?.select?.();
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
        const raw = draft == null ? 0 : Math.max(0, draft);
        const next = max == null ? raw : Math.min(raw, max);
        const current = value != null && Number(value) > 0 ? Number(value) : 0;
        setDraft(next > 0 ? next : null);
        if (next !== current) commit(positionId, field, next);
    };

    return (
        <InputNumber
            ref={inputRef}
            aria-label={ariaLabel}
            size="small"
            variant="borderless"
            keyboard={false}
            min={0}
            max={max}
            step={1}
            value={draft}
            onFocus={() => { focusedRef.current = true; }}
            onChange={(next) => setDraft(next == null ? null : Number(next))}
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
            className={autoFit && autoFitPx != null ? `${className} [&_.ant-input-number-input]:!text-[length:var(--fit-fs)]` : className}
            style={{
                width: '100%',
                fontFamily: INLINE_INPUT_FONT_FAMILY,
                ...(autoFit && autoFitPx != null ? { ['--fit-fs' as string]: `${autoFitPx}px` } : {}),
            }}
            parser={(displayValue) => {
                const normalized = String(displayValue ?? '').replace(/'/g, '').replace(',', '.');
                const parsed = Number(normalized);
                return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
            }}
        />
    );
});
BufferedNumberInput.displayName = 'BufferedNumberInput';


export const InlineDescriptionEditor = memo(({
    positionId,
    value,
    minHeight,
    commit,
}: {
    positionId: string;
    value: string;
    minHeight: number;
    commit: (positionId: string, value: string) => void;
}) => (
    <RichTextMarkdownEditor
        value={value}
        onChange={(next) => commit(positionId, next)}
        commitOnBlur
        minHeight={minHeight}
        variant="inline"
        placeholder=""
        className="w-full"
    />
));
InlineDescriptionEditor.displayName = 'InlineDescriptionEditor';
