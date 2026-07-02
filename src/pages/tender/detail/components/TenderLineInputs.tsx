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
    const [draft, setDraft] = useState<number | null>(() => toNumberDraft(value));
    const focusedRef = useRef(false);
    const skipCommitRef = useRef(false);
    // antd's InputNumber ref exposes { focus, blur, nativeElement }; typed loosely
    // so we can reach the underlying <input> for select-all on keyboard navigation.
    const inputRef = useRef<any>(null);

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
            className={className}
            style={{ width: '100%', fontFamily: INLINE_INPUT_FONT_FAMILY }}
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
        className="w-full rounded-lg border-slate-200 bg-white px-2 py-1 focus-within:border-[#1f2654] focus-within:ring-2 focus-within:ring-[#1f2654]/10"
    />
));
InlineDescriptionEditor.displayName = 'InlineDescriptionEditor';
