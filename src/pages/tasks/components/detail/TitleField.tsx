import { useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import { t } from '@/i18n/translate';

/**
 * Der Titel als Überschrift, die man direkt überschreibt (Görevly `dt-title`
 * contenteditable). Klartext: Einfügen nimmt nur Text, Enter speichert, Esc
 * verwirft. Der Text wird NUR dann von aussen gesetzt, wenn das Feld nicht
 * gerade bearbeitet wird — ein Nachladen zerschiesst also keine Eingabe.
 */
export const TitleField = ({
    value,
    editable,
    onSave,
}: {
    value: string;
    editable: boolean;
    onSave: (next: string) => void;
}) => {
    const ref = useRef<HTMLHeadingElement | null>(null);

    useLayoutEffect(() => {
        const element = ref.current;
        if (element && document.activeElement !== element) element.textContent = value;
    }, [value, editable]);

    if (!editable) return <h2 className="ofi-gv-detail-title">{value}</h2>;

    const commit = () => {
        const element = ref.current;
        if (!element) return;
        const next = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!next) {
            element.textContent = value;
            return;
        }
        if (next !== value) onSave(next.slice(0, 200));
    };

    const onKeyDown = (event: KeyboardEvent<HTMLHeadingElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.textContent = value;
            event.currentTarget.blur();
        }
    };

    const onPaste = (event: ClipboardEvent<HTMLHeadingElement>) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain').replace(/\s+/g, ' ');
        document.execCommand('insertText', false, text);
    };

    return (
        <h2
            ref={ref}
            className="ofi-gv-detail-title is-editable"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label={t('tasksModule.detail.titleLabel')}
            spellCheck
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={commit}
        />
    );
};
