import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '@/i18n/translate';

export const INLINE_INPUT_FONT_FAMILY = "'Google Sans', 'Product Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

export const RichTextMarkdownEditor: React.FC<{
    value: string;
    onChange: (value: string) => void;
    minHeight?: number;
    className?: string;
    placeholder?: string;
    variant?: 'boxed' | 'inline';
    commitOnBlur?: boolean;
}> = ({ value, onChange, minHeight = 92, className = '', placeholder = t('tenders.description_yazin'), variant = 'boxed', commitOnBlur = false }) => {
    // A plain <textarea> editing the markdown source directly. Enter is the
    // browser's native newline (always reliable) and "- " bullets are literal
    // markdown that view mode renders via markdownToHtml — no contentEditable /
    // execCommand fragility. Bullet lists auto-continue / exit on Enter below.
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const focusedRef = useRef(false);
    // Caret to restore after a programmatic value change (bullet continue/exit).
    // Ordinary typing keeps its caret via React's controlled-input handling.
    const pendingCaret = useRef<number | null>(null);
    const [draft, setDraft] = useState(value);
    const isInline = variant === 'inline';

    // Adopt external updates only while the field isn't focused, so a parent
    // re-render (e.g. another cell committing) never clobbers in-progress text.
    useEffect(() => {
        if (!focusedRef.current) setDraft(value);
    }, [value]);

    useLayoutEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        if (pendingCaret.current != null) {
            const pos = pendingCaret.current;
            pendingCaret.current = null;
            el.selectionStart = el.selectionEnd = pos;
        }
    }, [draft]);

    const emit = (next: string) => {
        if (next !== value) onChange(next);
    };

    const applyChange = (next: string, caret?: number) => {
        if (caret != null) pendingCaret.current = caret;
        setDraft(next);
        if (!commitOnBlur) emit(next);
    };

    // Enter continues a "- " bullet, exits the list on an empty bullet, and
    // otherwise falls through to the textarea's native newline.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        const el = event.currentTarget;
        if (el.selectionStart !== el.selectionEnd) return;

        const caret = el.selectionStart;
        const text = el.value;
        const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
        const bullet = text.slice(lineStart, caret).match(/^(\s*)-\s(.*)$/);
        if (!bullet) return;

        event.preventDefault();
        const indent = bullet[1] ?? '';
        if ((bullet[2] ?? '').trim() === '') {
            // Empty bullet: strip the marker and drop back to a plain line.
            applyChange(text.slice(0, lineStart) + text.slice(caret), lineStart);
            return;
        }
        const insert = `\n${indent}- `;
        applyChange(text.slice(0, caret) + insert + text.slice(caret), caret + insert.length);
    };

    const frameClass = isInline
        ? `rounded-md border border-slate-200 bg-white px-2 py-1 transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200 ${className}`
        : `rounded-md border border-slate-300 bg-white shadow-xs transition-colors hover:border-slate-400 focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200 ${className}`;
    const textareaClass = `block w-full resize-none border-0 bg-transparent text-[13px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 ${isInline ? 'px-0 py-0.5' : 'px-3 py-2'}`;

    return (
        <div className={`${frameClass} grid`}>
            <textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                placeholder={placeholder}
                onChange={(event) => applyChange(event.target.value)}
                onFocus={() => { focusedRef.current = true; }}
                onBlur={() => { focusedRef.current = false; emit(draft); }}
                onKeyDown={handleKeyDown}
                className={`${textareaClass} col-start-1 col-end-2 row-start-1 row-end-2 overflow-hidden`}
                style={{ minHeight, fontFamily: INLINE_INPUT_FONT_FAMILY }}
            />
            <div
                aria-hidden="true"
                className={`${textareaClass} col-start-1 col-end-2 row-start-1 row-end-2 invisible pointer-events-none whitespace-pre-wrap break-words`}
                style={{ minHeight, fontFamily: INLINE_INPUT_FONT_FAMILY }}
            >
                {draft + ' '}
            </div>
        </div>
    );
};
