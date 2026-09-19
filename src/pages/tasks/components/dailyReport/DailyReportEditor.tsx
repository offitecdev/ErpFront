import {
    forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
    type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode,
} from 'react';
import {
    LuBold, LuCheck, LuHeading2, LuImagePlus, LuItalic, LuLink, LuList, LuListOrdered, LuQuote, LuX,
} from 'react-icons/lu';

import { t } from '@/i18n/translate';
import {
    blockOf, blockToListItem, caretToStart, dropLeadingChars, ensureBlocks, isEmptyBlock,
    listItemToParagraph, placeCaret, retag,
} from './editorBlocks';
import { htmlToMarkdown, markdownToHtml, safeUrl } from './markdownHtml';

/**
 * ── DAS BLATT, WIE ES SPÄTER AUSSIEHT (16.09.2026) ──────────────────────────
 *
 * Samet: «ön izleme olmasın — direkt kalın yapsın, italik yapsın, görsel de
 * öyle görünsün.» Geschrieben wird darum IM Bild: eine beschreibbare Fläche
 * (contentEditable), die Knöpfe zeichnen sofort aus, Bilder stehen als Bild
 * mitten im Text. Gespeichert wird weiterhin Markdown (markdownHtml.ts) —
 * das PDF macht daraus wieder anklickbare Adressen.
 *
 * Tippen wie in einem Textprogramm (Samet: «madde işareti yapamıyorum; silince
 * madde işareti satır başına gelmeli, bir satır öncesine gitmemeli»):
 *   «- » / «* »   am Zeilenanfang → Aufzählung, «1. » → Nummernliste,
 *                 «# » → Überschrift, «> » → Zitat
 *   Eingabetaste  in einer Liste der nächste Punkt; auf einem LEEREN Punkt
 *                 endet die Liste (der Punkt wird zum Absatz)
 *   Rücktaste     ganz vorne in einem Punkt: nur das Zeichen verschwindet, die
 *                 Zeile bleibt stehen (die Liste wird dort geteilt)
 * Listen, Überschriften und Zitate baut editorBlocks.ts selbst um — Chromes
 * eigener Listenbefehl setzte die Liste in den Absatz und hinterliess Stilreste.
 *
 * Wichtig (React 19): die Fläche gehört dem Browser, nicht React. Ihr Inhalt
 * wird EINMAL je Rapport gesetzt (Effekt unten); React zeichnet sie nie neu —
 * sonst verliert man beim Tippen Text und Schreibmarke
 * (siehe RichTextMarkdownEditor der Angebotszeilen).
 */

const K = 'tasksModule.dailyReport';

export interface DailyEditorHandle {
    /** Ein Bild oder einen Verweis an der Schreibmarke einsetzen. */
    insertHtml: (html: string) => void;
}

interface Props {
    /** Markdown des Tages; wird bei einem Wechsel von `docKey` neu gesetzt. */
    markdown: string;
    docKey: string;
    disabled: boolean;
    placeholder: string;
    onChange: (markdown: string) => void;
    onFiles: (files: File[]) => void;
    /** Bild/Datei anhängen (Knopf in der Leiste). */
    onPickFiles: () => void;
    busy?: boolean;
}

const ToolButton = ({ label, disabled, onClick, children }: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
}) => (
    <button
        type="button"
        className="ofi-dr__tool ofi-btn-plain ofi-nosize"
        title={label}
        aria-label={label}
        disabled={disabled}
        // Der Knopf darf der Fläche die Auswahl nicht wegnehmen.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
    >
        {children}
    </button>
);

/** Die aktuelle Auswahl als festgehaltene Punkte (die Textknoten überleben das Umbauen). */
const saveSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return { startNode: range.startContainer, startOffset: range.startOffset, endNode: range.endContainer, endOffset: range.endOffset };
};

const restoreSelection = (host: HTMLElement, saved: ReturnType<typeof saveSelection>) => {
    if (!saved || !host.contains(saved.startNode) || !host.contains(saved.endNode)) return;
    const range = document.createRange();
    try {
        range.setStart(saved.startNode, saved.startOffset);
        range.setEnd(saved.endNode, saved.endOffset);
    } catch {
        return;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
};

/** Die Blöcke, die die Auswahl berührt: Absätze, Überschriften, Zitate und Listenpunkte. */
const selectedBlocks = (host: HTMLElement): HTMLElement[] => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return [];
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
        const block = blockOf(host, range.startContainer);
        return block ? [block] : [];
    }
    const blocks: HTMLElement[] = [];
    Array.from(host.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || !range.intersectsNode(child)) return;
        if (child.tagName === 'UL' || child.tagName === 'OL') {
            Array.from(child.children).forEach((item) => {
                if (item instanceof HTMLElement && range.intersectsNode(item)) blocks.push(item);
            });
        } else if (child.tagName !== 'HR') {
            blocks.push(child);
        }
    });
    return blocks;
};

export const DailyReportEditor = forwardRef<DailyEditorHandle, Props>(({
    markdown, docKey, disabled, placeholder, onChange, onFiles, onPickFiles, busy,
}, ref) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linkValue, setLinkValue] = useState('https://');
    const savedRange = useRef<Range | null>(null);

    /** Was in der Fläche steht, als Markdown melden. */
    const report = useCallback(() => {
        const host = hostRef.current;
        if (!host) return;
        const text = htmlToMarkdown(host);
        host.dataset.empty = text.trim() ? 'false' : 'true';
        onChange(text);
    }, [onChange]);

    // Einmal je Rapport: der Browser bekommt das Blatt, danach gehört es ihm.
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = markdownToHtml(markdown);
        ensureBlocks(host);
        host.dataset.empty = markdown.trim() ? 'false' : 'true';
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nur beim Wechsel des Tages, nicht bei jedem Tastendruck
    }, [docKey]);

    /** Auszeichnen im Text (fett, kursiv, Link) — der Browser macht es im Bild sichtbar. */
    const exec = (command: string, value?: string) => {
        const host = hostRef.current;
        if (!host || disabled) return;
        host.focus();
        // Ohne das schreibt Chrome <span style="font-weight:bold"> statt <b>.
        document.execCommand('styleWithCSS', false, 'false');
        document.execCommand('defaultParagraphSeparator', false, 'p');
        document.execCommand(command, false, value);
        report();
    };

    /** Blöcke umbauen und die Auswahl dabei festhalten. */
    const reshape = (change: (host: HTMLElement, blocks: HTMLElement[]) => void) => {
        const host = hostRef.current;
        if (!host || disabled) return;
        host.focus();
        const saved = saveSelection();
        ensureBlocks(host);
        restoreSelection(host, saved);
        const blocks = selectedBlocks(host);
        if (!blocks.length) return;
        change(host, blocks);
        restoreSelection(host, saved);
        report();
    };

    /** Knopf «Liste»: Absätze werden Punkte — sind schon alle Punkte dieser Liste, werden sie wieder Absätze. */
    const toggleList = (ordered: boolean) => reshape((_host, blocks) => {
        const tag = ordered ? 'OL' : 'UL';
        const already = blocks.every((block) => block.tagName === 'LI' && block.parentElement?.tagName === tag);
        if (already) {
            [...blocks].reverse().forEach((item) => listItemToParagraph(item));
            return;
        }
        blocks.forEach((block) => {
            if (block.tagName !== 'LI') {
                blockToListItem(block, ordered);
                return;
            }
            const list = block.parentElement;
            if (list && list.tagName !== tag && list.isConnected) retag(list, tag.toLowerCase());
        });
    });

    /** Knopf «Überschrift»/«Zitat»: Absatz ↔ diese Form. */
    const toggleBlock = (tag: 'h3' | 'blockquote') => reshape((_host, blocks) => {
        const already = blocks.every((block) => block.tagName === tag.toUpperCase());
        blocks.forEach((block) => {
            const target = block.tagName === 'LI' ? listItemToParagraph(block) : block;
            retag(target, already ? 'p' : tag);
        });
    });

    /** Der Block der Schreibmarke und der Text davor (nur bei einer Schreibmarke ohne Auswahl). */
    const caretBlock = (): { block: HTMLElement; before: string } | null => {
        const host = hostRef.current;
        const selection = window.getSelection();
        if (!host || !selection?.rangeCount || !selection.isCollapsed) return null;
        const node = selection.anchorNode;
        const offset = selection.anchorOffset;
        if (!node || !host.contains(node)) return null;
        let block = blockOf(host, node);
        if (!block) {
            // Getippt direkt in die leere Fläche: erst einen Absatz daraus machen.
            ensureBlocks(host);
            placeCaret(node, offset);
            block = blockOf(host, node);
            if (!block) return null;
        }
        const range = document.createRange();
        range.selectNodeContents(block);
        range.setEnd(node, offset);
        return { block, before: range.toString() };
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled || event.nativeEvent.isComposing) return;
        const shortcut = event.ctrlKey || event.metaKey;
        if (shortcut && !event.altKey && (event.key === 'b' || event.key === 'B')) {
            event.preventDefault();
            exec('bold');
            return;
        }
        if (shortcut && !event.altKey && (event.key === 'i' || event.key === 'I')) {
            event.preventDefault();
            exec('italic');
            return;
        }
        if (shortcut || event.altKey) return;
        if (event.key !== ' ' && event.key !== 'Backspace' && event.key !== 'Enter') return;
        if (event.key === 'Enter' && event.shiftKey) return;

        const here = caretBlock();
        if (!here) return;
        const { block, before } = here;
        const isItem = block.tagName === 'LI';

        // «- » am Zeilenanfang → Aufzählung (auch «1. », «# », «> »).
        if (event.key === ' ' && !isItem) {
            const typed = before.replace(/\u00a0/g, ' ');
            const bullet = /^[-*•]$/.test(typed);
            const numbered = /^\d{1,3}[.)]$/.test(typed);
            const heading = /^#{1,3}$/.test(typed);
            const quote = typed === '>';
            if (!bullet && !numbered && !heading && !quote) return;
            event.preventDefault();
            dropLeadingChars(block, typed.length);
            const next = bullet || numbered
                ? blockToListItem(block, numbered)
                : retag(block, heading ? `h${typed.length + 1}` : 'blockquote');
            caretToStart(next);
            report();
            return;
        }

        // Rücktaste ganz vorne: nur das Zeichen weg — die Zeile bleibt, wo sie ist.
        if (event.key === 'Backspace' && !before.length) {
            if (isItem) {
                event.preventDefault();
                caretToStart(listItemToParagraph(block));
                report();
            } else if (/^(H[1-6]|BLOCKQUOTE)$/.test(block.tagName)) {
                event.preventDefault();
                caretToStart(retag(block, 'p'));
                report();
            }
            return;
        }

        // Eingabetaste auf einem leeren Punkt: die Liste endet hier.
        if (event.key === 'Enter' && isItem && isEmptyBlock(block)) {
            event.preventDefault();
            caretToStart(listItemToParagraph(block));
            report();
        }
    };

    useImperativeHandle(ref, () => ({
        insertHtml: (html: string) => {
            const host = hostRef.current;
            if (!host) return;
            host.focus();
            const selection = window.getSelection();
            // Ohne Schreibmarke (nach einem Klick auf den Knopf) ans Ende setzen.
            if (!selection?.rangeCount || !host.contains(selection.anchorNode)) {
                const range = document.createRange();
                range.selectNodeContents(host);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
            }
            document.execCommand('insertHTML', false, html);
            report();
        },
    }), [report]);

    const openLink = () => {
        const selection = window.getSelection();
        savedRange.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
        const selected = selection?.toString().trim() ?? '';
        setLinkValue(/^(https?:\/\/|mailto:)/i.test(selected) ? selected : 'https://');
        setLinkOpen(true);
    };

    const applyLink = () => {
        const url = safeUrl(linkValue);
        setLinkOpen(false);
        if (!url) return;
        const host = hostRef.current;
        if (!host) return;
        host.focus();
        const selection = window.getSelection();
        if (savedRange.current) {
            selection?.removeAllRanges();
            selection?.addRange(savedRange.current);
        }
        if (selection && selection.toString().trim()) exec('createLink', url);
        else {
            document.execCommand('insertHTML', false,
                `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noreferrer">${url.replace(/</g, '&lt;')}</a>&nbsp;`);
            report();
        }
    };

    /* Einfügen: Dateien wandern in den Upload, Text kommt OHNE fremdes HTML herein. */
    const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (files.length && !text.trim()) {
            event.preventDefault();
            onFiles(files);
            return;
        }
        if (!text) return;
        event.preventDefault();
        document.execCommand('insertText', false, text);
        report();
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (!files.length) return;
        event.preventDefault();
        onFiles(files);
    };

    return (
        <div className={`ofi-dr__editor${disabled ? ' is-locked' : ''}`}>
            <div className="ofi-dr__toolbar" role="toolbar" aria-label={t(`${K}.tool.bar`)}>
                <ToolButton label={t(`${K}.tool.heading`)} disabled={disabled} onClick={() => toggleBlock('h3')}><LuHeading2 size={15} /></ToolButton>
                <ToolButton label={t(`${K}.tool.bold`)} disabled={disabled} onClick={() => exec('bold')}><LuBold size={15} /></ToolButton>
                <ToolButton label={t(`${K}.tool.italic`)} disabled={disabled} onClick={() => exec('italic')}><LuItalic size={15} /></ToolButton>
                <i className="ofi-dr__toolbar-gap" aria-hidden />
                <ToolButton label={t(`${K}.tool.bullet`)} disabled={disabled} onClick={() => toggleList(false)}><LuList size={15} /></ToolButton>
                <ToolButton label={t(`${K}.tool.numbered`)} disabled={disabled} onClick={() => toggleList(true)}><LuListOrdered size={15} /></ToolButton>
                <ToolButton label={t(`${K}.tool.quote`)} disabled={disabled} onClick={() => toggleBlock('blockquote')}><LuQuote size={15} /></ToolButton>
                <i className="ofi-dr__toolbar-gap" aria-hidden />
                <ToolButton label={t(`${K}.tool.link`)} disabled={disabled} onClick={openLink}><LuLink size={15} /></ToolButton>
                <ToolButton label={busy ? t(`${K}.uploading`) : t(`${K}.tool.image`)} disabled={disabled || busy} onClick={onPickFiles}><LuImagePlus size={15} /></ToolButton>
                {busy && <span className="ofi-dr__toolbar-note">{t(`${K}.uploading`)}</span>}

                {linkOpen && (
                    <div className="ofi-dr__linkbox" role="dialog" aria-label={t(`${K}.tool.link`)}>
                        <input
                            autoFocus
                            value={linkValue}
                            spellCheck={false}
                            onChange={(event) => setLinkValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') { event.preventDefault(); applyLink(); }
                                if (event.key === 'Escape') { event.preventDefault(); setLinkOpen(false); }
                            }}
                        />
                        <button type="button" className="ofi-dr__linkbox-ok ofi-btn-plain ofi-nosize" aria-label={t('common.save')} onMouseDown={(event) => event.preventDefault()} onClick={applyLink}>
                            <LuCheck size={14} strokeWidth={2.5} />
                        </button>
                        <button type="button" className="ofi-dr__linkbox-cancel ofi-btn-plain ofi-nosize" aria-label={t('common.close')} onMouseDown={(event) => event.preventDefault()} onClick={() => setLinkOpen(false)}>
                            <LuX size={14} strokeWidth={2.5} />
                        </button>
                    </div>
                )}
            </div>

            <div
                ref={hostRef}
                className="ofi-dr__sheet ofi-md"
                contentEditable={!disabled}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label={placeholder}
                data-placeholder={placeholder}
                data-empty="true"
                spellCheck
                onInput={report}
                onBlur={report}
                onKeyDown={onKeyDown}
                onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
                onPaste={onPaste}
                onDrop={onDrop}
                onDragOver={(event) => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); }}
            />
        </div>
    );
});

DailyReportEditor.displayName = 'DailyReportEditor';
