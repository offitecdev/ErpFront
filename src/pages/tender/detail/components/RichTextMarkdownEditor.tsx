import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Ban,
    Bold as BoldIcon,
    CaseUpper,
    Italic as ItalicIcon,
    List as ListIcon,
    Strikethrough as StrikethroughIcon,
    Underline as UnderlineIcon,
} from 'lucide-react';

import { t } from '@/i18n/translate';

import { richTextToHtml } from '../utils/markdown.utils';

export const INLINE_INPUT_FONT_FAMILY = "'Google Sans', 'Product Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

// WYSIWYG rich-text editor (contentEditable). Stores HTML; legacy markdown-ish
// values are converted on load via richTextToHtml. Formatting is available in
// the boxed editor and in a floating toolbar for selected text.

const DEFAULT_TEXT_COLOR = '#202124';
const HIGHLIGHT_COLORS = ['#fff3c4', '#ffe0d2', '#d9f3df', '#d9f1f6', '#e7eafd', '#ffe4cf'];
const TEXT_COLORS = [
    '#424242', '#707070', '#9b9b9b', '#c5c5c5', '#a158eb', '#ff6680', '#f5222d',
    '#ff6b00', '#f2aa00', '#00a86b', '#008b8b', '#4d7cff', '#294ed8', '#ffffff',
];

type HeadingLevel = 'p' | 'h1' | 'h2' | 'h3' | 'h4';

type ExecCommand =
    | { cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertUnorderedList' }
    | { cmd: 'formatBlock'; value: HeadingLevel }
    | { cmd: 'foreColor' | 'hiliteColor'; value: string };

type ActiveState = {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    list: boolean;
    heading: HeadingLevel;
    textColor: string;
    highlightColor: string;
};

const EMPTY_ACTIVE: ActiveState = {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    list: false,
    heading: 'p',
    textColor: DEFAULT_TEXT_COLOR,
    highlightColor: 'transparent',
};

const colorKey = (color: string) => {
    const value = color.toLowerCase().replace(/\s+/g, '');
    if (value === 'transparent' || value === 'rgba(0,0,0,0)') return 'transparent';
    if (!value.startsWith('#')) return value;
    const hex = value.slice(1);
    if (hex.length !== 3 && hex.length !== 6) return value;
    const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgb(${red},${green},${blue})`;
};

const sameColor = (left: string, right: string) => colorKey(left) === colorKey(right);

type ToolbarProps = {
    exec: (command: ExecCommand) => void;
    active: ActiveState;
    compact?: boolean;
};

// This deliberately contains only the controls requested for the selection
// toolbar. Comment and overflow controls are not rendered.
const FormatToolbar: React.FC<ToolbarProps> = ({ exec, active, compact = false }) => {
    const [menu, setMenu] = useState<'color' | 'heading' | null>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const baseBtn = 'flex h-7 min-w-7 items-center justify-center rounded-[3px] px-0.5 antialiased transition-colors hover:bg-[#f1f1f1] dark:hover:bg-white/10';
    const stateBtn = (on: boolean) => `${baseBtn} ${on ? '!bg-transparent !text-[#4d64ff] hover:!bg-transparent dark:!text-[#e5b63f] dark:hover:!bg-transparent' : '!text-black dark:!text-white'}`;
    const menuPosition = compact ? 'bottom-[calc(100%+10px)]' : 'top-[calc(100%+10px)]';

    useEffect(() => {
        if (!menu) return;
        const close = (event: MouseEvent) => {
            if (!toolbarRef.current?.contains(event.target as Node)) setMenu(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menu]);

    const run = (command: ExecCommand) => {
        setMenu(null);
        exec(command);
    };

    return (
        <div
            ref={toolbarRef}
            className="notranslate relative flex items-center gap-0.5 whitespace-nowrap px-1 py-0.5"
            translate="no"
            data-google-translate="false"
            data-notranslate="true"
            style={{ fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif" }}
            onMouseDown={(event) => event.preventDefault()}
        >
            <button type="button" aria-pressed={active.bold} title={t('tenders.rt_bold')} className={stateBtn(active.bold)} onPointerDown={(event) => { event.preventDefault(); run({ cmd: 'bold' }); }}><BoldIcon size={17} strokeWidth={1.75} /></button>
            <button type="button" aria-pressed={active.italic} title={t('tenders.rt_italic')} className={stateBtn(active.italic)} onPointerDown={(event) => { event.preventDefault(); run({ cmd: 'italic' }); }}><ItalicIcon size={17} strokeWidth={1.75} /></button>
            <button type="button" aria-pressed={active.underline} title={t('tenders.rt_underline')} className={stateBtn(active.underline)} onPointerDown={(event) => { event.preventDefault(); run({ cmd: 'underline' }); }}><UnderlineIcon size={17} strokeWidth={1.75} /></button>
            <button type="button" aria-pressed={active.strike} title="Üstü çizili" className={stateBtn(active.strike)} onPointerDown={(event) => { event.preventDefault(); run({ cmd: 'strikeThrough' }); }}><StrikethroughIcon size={17} strokeWidth={1.75} /></button>

            <div className="relative">
                <button
                    type="button"
                    title="Vurgu ve yazı rengi"
                    aria-haspopup="menu"
                    aria-expanded={menu === 'color'}
                    className={stateBtn(menu === 'color')}
                    onClick={() => setMenu((current) => current === 'color' ? null : 'color')}
                >
                    <span
                        className="flex h-[22px] w-[22px] items-center justify-center rounded-full p-[2.5px]"
                        style={{ background: 'conic-gradient(#f5222d, #f2aa00, #21b36b, #21a6dd, #5c63ef, #bd45d4, #f5222d)' }}
                    >
                        <span className="h-full w-full rounded-full border-2 border-white" style={{ backgroundColor: active.textColor || '#fff' }} />
                    </span>
                </button>

                {menu === 'color' && (
                    <div role="menu" className={`absolute left-0 z-50 w-[340px] rounded-lg border border-[#dedede] bg-white p-3.5 text-[#3d3d3d] shadow-[0_8px_28px_rgba(0,0,0,0.16)] dark:border-[#454545] dark:bg-[#1b1b1b] dark:text-white ${menuPosition}`}>
                        <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[#65564f]">HIGHLIGHT</div>
                        <div className="mb-4 flex items-center gap-3">
                            <button type="button" aria-label="Vurguyu kaldır" className={`flex h-8 w-8 items-center justify-center rounded-full ${colorKey(active.highlightColor) === 'transparent' ? 'ring-4 ring-[#e5b63f]' : ''}`} onClick={() => run({ cmd: 'hiliteColor', value: 'transparent' })}>
                                <Ban size={19} strokeWidth={1.6} />
                            </button>
                            {HIGHLIGHT_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    aria-label={`Vurgu ${color}`}
                                    className={`h-7 w-7 rounded-full border border-black/10 ${sameColor(active.highlightColor, color) ? 'ring-4 ring-[#e5b63f]' : ''}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => run({ cmd: 'hiliteColor', value: color })}
                                />
                            ))}
                        </div>

                        <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[#65564f]">TEXT COLOR</div>
                        <button type="button" className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#d7d7d7] text-[15px] shadow-sm hover:bg-[#f6f6f6] dark:border-[#4b4b4b] dark:hover:bg-white/10" onClick={() => run({ cmd: 'foreColor', value: DEFAULT_TEXT_COLOR })}>
                            <span className="h-4 w-4 rounded-full border border-[#c8c8c8]" style={{ background: 'linear-gradient(135deg, #fff 0 49%, #202124 50% 100%)' }} />
                            Auto
                        </button>
                        <div className="grid grid-cols-7 gap-x-1 gap-y-1">
                            {TEXT_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    aria-label={`Yazı rengi ${color}`}
                                    className={`flex h-10 items-center justify-center rounded-md text-[20px] hover:bg-[#f2f2f2] dark:hover:bg-white/10 ${sameColor(active.textColor, color) ? 'bg-[#e5b63f] ring-1 ring-[#d9aa34]' : ''}`}
                                    style={{ color: sameColor(active.textColor, color) ? '#111111' : color, textShadow: color === '#ffffff' && !sameColor(active.textColor, color) ? '0 0 1px #555' : undefined }}
                                    onClick={() => run({ cmd: 'foreColor', value: color })}
                                >
                                    Aa
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <span className="mx-0.5 h-4 w-px bg-[#dedede]" />

            <div className="relative">
                <button
                    type="button"
                    title="Başlık stili"
                    aria-haspopup="menu"
                    aria-expanded={menu === 'heading'}
                    className={stateBtn(menu === 'heading')}
                    onClick={() => setMenu((current) => current === 'heading' ? null : 'heading')}
                >
                    <CaseUpper size={18} strokeWidth={1.7} />
                </button>
                {menu === 'heading' && (
                    <div
                        role="menu"
                        className={`absolute left-1/2 z-50 flex w-[218px] -translate-x-1/2 flex-col items-stretch gap-0.5 rounded-[6px] border border-[#dedede] bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:border-[#454545] dark:bg-[#1b1b1b] ${menuPosition}`}
                    >
                        {([
                            ['h1', 'H₁', 'Large heading'],
                            ['h2', 'H₂', 'Medium heading'],
                            ['h3', 'H₃', 'Small heading'],
                            ['h4', 'H₄', 'Extra small heading'],
                            ['p', 'Aa', 'Normal text'],
                        ] as const).map(([value, mark, label]) => (
                            <button
                                key={value}
                                type="button"
                                className={`flex h-9 w-full shrink-0 items-center gap-2 rounded-[4px] px-2.5 text-left text-[14px] font-medium leading-none hover:bg-[#f0f0f0] dark:hover:bg-white/10 ${active.heading === value ? 'bg-[#eeeeee] text-[#5b61ff] dark:bg-white/10 dark:text-[#e5b63f]' : 'text-[#272727] dark:text-white'}`}
                                onClick={() => run({ cmd: 'formatBlock', value })}
                            >
                                <span className="w-6 shrink-0 text-[16px] font-normal leading-none">{mark}</span>
                                <span className="truncate">{label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <button type="button" aria-pressed={active.list} title={t('tenders.rt_bullet_list')} className={stateBtn(active.list)} onPointerDown={(event) => { event.preventDefault(); run({ cmd: 'insertUnorderedList' }); }}><ListIcon size={18} strokeWidth={1.8} /></button>
        </div>
    );
};

// Treat markup with no visible content ('<br>', empty divs) as an empty value.
const normalizeEmptyHtml = (html: string): string => {
    const probe = document.createElement('template');
    probe.innerHTML = html;
    const hasText = (probe.content.textContent || '').trim().length > 0;
    const hasStructure = probe.content.querySelector('li') !== null;
    return hasText || hasStructure ? html : '';
};

const selectionElement = (selection: Selection | null): Element | null => {
    const node = selection?.anchorNode;
    if (!node) return null;
    return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
};

export const RichTextMarkdownEditor: React.FC<{
    value: string;
    onChange: (value: string) => void;
    minHeight?: number;
    className?: string;
    placeholder?: string;
    variant?: 'boxed' | 'inline';
    commitOnBlur?: boolean;
}> = ({ value, onChange, minHeight = 92, className = '', placeholder = t('tenders.description_yazin'), variant = 'boxed', commitOnBlur = false }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<HTMLDivElement>(null);
    const focusedRef = useRef(false);
    const savedRangeRef = useRef<Range | null>(null);
    const commandMutationRef = useRef(false);
    const pendingEmitRef = useRef<number | null>(null);
    // Last value we emitted: matching parent updates must not reset the DOM and
    // drop the caret.
    const lastEmitted = useRef<string | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState<ActiveState>(EMPTY_ACTIVE);
    const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
    const isInline = variant === 'inline';

    const syncEmpty = useCallback(() => {
        const el = editorRef.current;
        setIsEmpty(!el || normalizeEmptyHtml(el.innerHTML) === '');
    }, []);

    const rememberSelection = useCallback(() => {
        const editor = editorRef.current;
        const selection = window.getSelection();
        if (!editor || !selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) return false;
        savedRangeRef.current = selection.getRangeAt(0).cloneRange();
        return true;
    }, []);

    const restoreSelection = useCallback(() => {
        const editor = editorRef.current;
        const range = savedRangeRef.current;
        if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return false;
        editor.focus({ preventScroll: true });
        const selection = window.getSelection();
        if (!selection) return false;
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    }, []);

    // Adopt external values only while not focused, so parent re-renders never
    // clobber in-progress edits.
    useEffect(() => {
        if (focusedRef.current) return;
        if (lastEmitted.current === value) return;
        const el = editorRef.current;
        if (!el) return;
        el.innerHTML = richTextToHtml(value || '');
        lastEmitted.current = value;
        savedRangeRef.current = null;
        syncEmpty();
    }, [value, syncEmpty]);

    const emit = useCallback((always = false) => {
        const el = editorRef.current;
        if (!el) return;
        const html = normalizeEmptyHtml(el.innerHTML);
        syncEmpty();
        if (!always && commitOnBlur) return;
        if (html === value && lastEmitted.current === html) return;
        lastEmitted.current = html;
        if (html !== value) onChange(html);
    }, [commitOnBlur, onChange, syncEmpty, value]);

    // Keep typing and keyboard shortcuts independent from potentially heavy
    // parent form renders. The editable DOM updates immediately; state follows
    // after the user pauses very briefly, and blur always flushes it.
    const scheduleEmit = useCallback(() => {
        syncEmpty();
        if (commitOnBlur) return;
        if (pendingEmitRef.current !== null) window.clearTimeout(pendingEmitRef.current);
        pendingEmitRef.current = window.setTimeout(() => {
            pendingEmitRef.current = null;
            emit();
        }, 90);
    }, [commitOnBlur, emit, syncEmpty]);

    const flushEmit = useCallback(() => {
        if (pendingEmitRef.current !== null) {
            window.clearTimeout(pendingEmitRef.current);
            pendingEmitRef.current = null;
        }
        emit(true);
    }, [emit]);

    useEffect(() => () => {
        if (pendingEmitRef.current !== null) window.clearTimeout(pendingEmitRef.current);
    }, []);

    const refreshActiveStates = useCallback(() => {
        const editor = editorRef.current;
        const selection = window.getSelection();
        const element = selectionElement(selection);
        if (!editor || !element || !editor.contains(element)) {
            setActive(EMPTY_ACTIVE);
            return;
        }
        const heading = element.closest('h1, h2, h3, h4')?.tagName.toLowerCase() as HeadingLevel | undefined;
        let highlightColor = 'transparent';
        let cursor: Element | null = element;
        while (cursor && cursor !== editor) {
            const background = window.getComputedStyle(cursor).backgroundColor;
            if (colorKey(background) !== 'transparent') {
                highlightColor = background;
                break;
            }
            cursor = cursor.parentElement;
        }
        try {
            setActive({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                underline: document.queryCommandState('underline'),
                strike: document.queryCommandState('strikeThrough'),
                list: document.queryCommandState('insertUnorderedList'),
                heading: heading || 'p',
                textColor: window.getComputedStyle(element).color || DEFAULT_TEXT_COLOR,
                highlightColor,
            });
        } catch {
            setActive(EMPTY_ACTIVE);
        }
    }, []);

    // Track both collapsed and expanded selections. Toolbar interaction restores
    // this exact range before executing a command, so the caret never jumps to
    // the beginning of the editor.
    useEffect(() => {
        const handleSelectionChange = () => {
            const editor = editorRef.current;
            const container = containerRef.current;
            if (!editor || !container || !focusedRef.current) return;
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
                setBubble(null);
                return;
            }
            rememberSelection();
            refreshActiveStates();
            if (selection.isCollapsed) {
                setBubble(null);
                return;
            }
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            if (!rect.width && !rect.height) {
                setBubble(null);
                return;
            }
            const toolbarWidth = 220;
            const left = Math.max(0, Math.min(rect.left - containerRect.left, container.clientWidth - toolbarWidth));
            setBubble({ top: rect.bottom - containerRect.top + 7, left });
        };
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [refreshActiveStates, rememberSelection]);

    const exec = useCallback((command: ExecCommand) => {
        const editor = editorRef.current;
        if (!editor) return;
        restoreSelection();
        commandMutationRef.current = true;
        try {
            const styledCommand = command.cmd === 'foreColor' || command.cmd === 'hiliteColor';
            document.execCommand('styleWithCSS', false, styledCommand ? 'true' : 'false');
            if (command.cmd === 'formatBlock') {
                // Normal text uses the editor's native DIV block. This replaces
                // the active H1-H4 element and restores the regular body size.
                const block = command.value === 'p' ? 'DIV' : command.value.toUpperCase();
                document.execCommand('formatBlock', false, block);
            } else if (command.cmd === 'hiliteColor') {
                const applied = document.execCommand('hiliteColor', false, command.value);
                if (!applied) document.execCommand('backColor', false, command.value);
            } else {
                document.execCommand(command.cmd, false, 'value' in command ? command.value : undefined);
            }
        } catch {
            /* execCommand unsupported: leave the text as typed. */
        } finally {
            commandMutationRef.current = false;
        }
        rememberSelection();
        refreshActiveStates();
        scheduleEmit();
    }, [refreshActiveStates, rememberSelection, restoreSelection, scheduleEmit]);

    // Paste as plain text so foreign markup never enters the stored HTML.
    const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
        rememberSelection();
        scheduleEmit();
    }, [rememberSelection, scheduleEmit]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const editor = editorRef.current;
        const selection = window.getSelection();
        if (!editor || !selection || selection.rangeCount === 0 || !selection.isCollapsed || !editor.contains(selection.anchorNode)) return;

        // At the beginning of a list item, Backspace removes only that bullet.
        // The item becomes a normal line and the caret stays on that same line.
        if (event.key === 'Backspace') {
            const element = selectionElement(selection);
            const listItem = element?.closest('li');
            if (!listItem) return;
            const beforeCaret = document.createRange();
            beforeCaret.selectNodeContents(listItem);
            beforeCaret.setEnd(selection.anchorNode!, selection.anchorOffset);
            if (beforeCaret.toString().length !== 0) return;
            event.preventDefault();
            rememberSelection();
            exec({ cmd: 'insertUnorderedList' });
            return;
        }

        // "- " or "* " at the start of the current line becomes the same
        // semantic list produced by the toolbar. Native Enter then creates the
        // next item, while Backspace can leave the list on the current line.
        if (event.key !== ' ') return;
        const node = selection.anchorNode;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        const text = node.textContent || '';
        const offset = selection.anchorOffset;
        if (offset < 1 || !/(?:^|\n)[-*]$/.test(text.slice(0, offset))) return;
        if (node.parentElement?.closest('li')) return;
        event.preventDefault();
        commandMutationRef.current = true;
        // Keep this exact line non-empty while Chromium performs the list
        // command. Without the temporary anchor an emptied text node can be
        // resolved as the end of the previous paragraph/list item.
        const temporaryAnchor = '\u200B';
        const anchoredText = `${text.slice(0, offset - 1)}${temporaryAnchor}${text.slice(offset)}`;
        node.textContent = anchoredText;
        const marker = document.createRange();
        marker.setStart(node, offset);
        marker.collapse(true);
        selection.removeAllRanges();
        selection.addRange(marker);
        savedRangeRef.current = marker.cloneRange();

        try {
            // Always establish the current visual line as its own block before
            // applying the same command used by the toolbar list button.
            document.execCommand('formatBlock', false, 'DIV');
            document.execCommand('insertUnorderedList', false);
            // A fresh list must start in normal weight unless B was explicitly
            // selected afterwards; browsers can otherwise carry stale state.
            if (document.queryCommandState('bold')) document.execCommand('bold', false);
        } catch {
            /* Keep the emptied marker line editable if list commands fail. */
        }

        // Remove the temporary anchor and leave the caret exactly where the
        // marker was, inside the newly-created current list item.
        const listItem = selectionElement(selection)?.closest('li');
        const cleanupRoot: Node = listItem || editor;
        const walker = document.createTreeWalker(cleanupRoot, NodeFilter.SHOW_TEXT);
        let anchoredNode: Text | null = null;
        while (walker.nextNode()) {
            const candidate = walker.currentNode as Text;
            if (candidate.data.includes(temporaryAnchor)) {
                anchoredNode = candidate;
                break;
            }
        }
        if (anchoredNode) {
            const anchorOffset = anchoredNode.data.indexOf(temporaryAnchor);
            anchoredNode.data = anchoredNode.data.replace(temporaryAnchor, '');
            const finalCaret = document.createRange();
            finalCaret.setStart(anchoredNode, Math.max(0, anchorOffset));
            finalCaret.collapse(true);
            selection.removeAllRanges();
            selection.addRange(finalCaret);
            savedRangeRef.current = finalCaret.cloneRange();
        }
        commandMutationRef.current = false;
        rememberSelection();
        refreshActiveStates();
        // The list is already visible in the DOM; saving it must not hold up
        // the keyboard event or its first paint.
        scheduleEmit();
    }, [exec, refreshActiveStates, rememberSelection, scheduleEmit]);

    // Inline TenderDetail fields and the boxed mail editor intentionally share
    // one surface treatment. Only their internal padding differs.
    const sharedFrameClass = 'rounded-[4px] border border-slate-300 bg-white shadow-xs transition-colors hover:border-slate-400 focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-200 dark:border-[#444] dark:bg-[#171717] dark:hover:border-[#666] dark:focus-within:border-[#e5b63f] dark:focus-within:ring-[#e5b63f]/20';
    const frameClass = `${sharedFrameClass} ${isInline ? 'px-2 py-1' : ''} ${className}`;

    const editorClass = `block w-full cursor-text select-text resize-none border-0 bg-transparent text-[13px] leading-6 text-black caret-black outline-none [user-select:text] whitespace-pre-wrap break-words dark:text-white dark:caret-white [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5 [&_h1]:my-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:leading-7 [&_h2]:my-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-7 [&_h3]:my-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-6 [&_h4]:my-1 [&_h4]:text-[14px] [&_h4]:font-semibold [&_h4]:leading-6 ${isInline ? 'px-0 py-0.5' : 'px-3 py-2'}`;

    return (
        <div
            ref={containerRef}
            className="notranslate relative"
            translate="no"
            data-google-translate="false"
            data-notranslate="true"
        >
            {!isInline && (
                <div className="mb-1.5 ml-1 w-fit rounded-[4px] border border-[#dedede] bg-white shadow-[0_1px_5px_rgba(0,0,0,0.08)] dark:border-[#454545] dark:bg-[#171717]">
                    <FormatToolbar exec={exec} active={active} />
                </div>
            )}
            {bubble && (
                <div
                    className="absolute z-40 rounded-[4px] border border-[#dedede] bg-white shadow-[0_6px_18px_rgba(0,0,0,0.14)] dark:border-[#454545] dark:bg-[#171717]"
                    style={{ top: bubble.top, left: bubble.left }}
                    onMouseDown={(event) => event.preventDefault()}
                >
                    <FormatToolbar exec={exec} active={active} compact />
                </div>
            )}
            <div className={`${frameClass} relative`}>
                {isEmpty && !focused && (
                    <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute text-[13px] leading-6 text-slate-400 dark:text-[#a3a3a3] ${isInline ? 'left-2 top-1.5' : 'left-3 top-2'}`}
                    >
                        {placeholder}
                    </div>
                )}
                <div
                    ref={editorRef}
                    contentEditable
                    tabIndex={0}
                    translate="no"
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    className={`notranslate ${editorClass}`}
                    data-google-translate="false"
                    data-notranslate="true"
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                    style={{ minHeight, fontFamily: INLINE_INPUT_FONT_FAMILY }}
                    onInput={() => {
                        // execCommand dispatches synchronous input events for
                        // every internal step. The command itself emits once.
                        if (commandMutationRef.current) return;
                        rememberSelection();
                        scheduleEmit();
                    }}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onFocus={() => {
                        focusedRef.current = true;
                        setFocused(true);
                        rememberSelection();
                        // A blank editor must always start in normal text mode;
                        // execCommand state can otherwise leak between editors.
                        if (normalizeEmptyHtml(editorRef.current?.innerHTML || '') === '') {
                            if (document.queryCommandState('bold')) document.execCommand('bold', false);
                            if (document.queryCommandState('italic')) document.execCommand('italic', false);
                        }
                        rememberSelection();
                        refreshActiveStates();
                    }}
                    onBlur={() => {
                        focusedRef.current = false;
                        setFocused(false);
                        setBubble(null);
                        flushEmit();
                    }}
                />
            </div>
        </div>
    );
};
