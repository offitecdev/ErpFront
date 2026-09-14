import { memo, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';

import type { ContentBlock } from '@/types/tasksModule';
import { sanitizeInlineHtml } from './blockModel';
import { insertPlainText } from './editorDom';

export interface TextBlockHandlers {
    onInput: (blockId: string, element: HTMLElement) => void;
    onKeyDown: (blockId: string, event: KeyboardEvent<HTMLElement>) => void;
    onFocus: (blockId: string) => void;
}

/**
 * Ein Textblock (p, h2, h3, Aufzählung, Nummer, Zitat) als contentEditable.
 *
 * DIE REACT-19-FALLE (bezahlt): ein `dangerouslySetInnerHTML={{ __html }}` am
 * bearbeitbaren Element setzt React bei JEDEM Neuzeichnen neu — die
 * Schreibmarke springt an den Anfang, Getipptes verschwindet. Darum hat das
 * Element hier KEINE Kinder aus React: sein innerHTML wird genau dann gesetzt,
 * wenn der Block neu ist oder sein Text von aussen ersetzt wurde (`rev`).
 * Beim Tippen liest der Editor das DOM zurück, nie umgekehrt.
 *
 * Alle Typen teilen dasselbe <div> — ein Wechsel p → h2 tauscht nur die Klasse
 * und hängt das Element nicht neu ein (sonst wäre der Text weg).
 */
export const TextBlock = memo(({
    block,
    number,
    editable,
    rev,
    placeholder,
    showPlaceholder,
    handlers,
}: {
    block: ContentBlock;
    number: number;
    editable: boolean;
    /** Ändert sich, wenn der Text von aussen gesetzt werden muss. */
    rev: string;
    placeholder: string;
    /** Platzhalter auch ohne Fokus (einziger, leerer Block). */
    showPlaceholder: boolean;
    handlers: TextBlockHandlers;
}) => {
    const ref = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const element = ref.current;
        if (element) element.innerHTML = sanitizeInlineHtml(block.text);
        // Bewusst NICHT an block.text gebunden, solange bearbeitet wird (s. oben).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [block.id, rev, editable ? '' : block.text]);

    const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        insertPlainText(event.clipboardData.getData('text/plain'));
    };

    // Strg/⌘-Klick öffnet einen Link auch im Bearbeitungsmodus.
    const onClick = (event: MouseEvent<HTMLDivElement>) => {
        const anchor = (event.target as HTMLElement).closest('a');
        if (!anchor || !editable || !(event.metaKey || event.ctrlKey)) return;
        event.preventDefault();
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
    };

    const empty = !block.text;
    const align = block.meta.align && block.meta.align !== 'left' ? block.meta.align : undefined;

    return (
        <div className={`ofi-gv-editor-text is-${block.type}`}>
            <span className="ofi-gv-editor-text__marker" aria-hidden>
                {block.type === 'number' ? `${number}.` : null}
            </span>
            <div
                ref={ref}
                data-editor-text={block.id}
                data-placeholder={placeholder}
                className={`ofi-gv-editor-text__body ${empty ? 'is-empty' : ''} ${showPlaceholder ? 'is-hinted' : ''}`}
                style={align ? { textAlign: align } : undefined}
                contentEditable={editable ? true : undefined}
                suppressContentEditableWarning
                role={editable ? 'textbox' : undefined}
                aria-multiline={editable ? true : undefined}
                aria-label={editable ? placeholder : undefined}
                spellCheck={editable}
                onInput={editable ? (event) => handlers.onInput(block.id, event.currentTarget) : undefined}
                onKeyDown={editable ? (event) => handlers.onKeyDown(block.id, event) : undefined}
                onFocus={editable ? () => handlers.onFocus(block.id) : undefined}
                onPaste={editable ? onPaste : undefined}
                onClick={onClick}
            />
        </div>
    );
});

TextBlock.displayName = 'TextBlock';
