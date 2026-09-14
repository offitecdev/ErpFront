import { useCallback, useEffect, useState, type RefObject } from 'react';

import { selectionTextElement } from './editorDom';

export interface FormatState {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    /** Textblock, in dem die Auswahl gerade steht. */
    blockId: string | null;
}

const EMPTY: FormatState = { bold: false, italic: false, underline: false, blockId: null };

const queryState = (command: string): boolean => {
    try {
        return document.queryCommandState(command);
    } catch {
        return false;
    }
};

/**
 * Zustand der Knöpfe Fett/Kursiv/Unterstrichen — Vorgabe Samet: der Knopf
 * zeigt, ob die Schreibmarke gerade in fettem Text steht. Nachgeführt bei
 * jeder Auswahländerung, beim Loslassen von Taste und Maus und nach jeder
 * Eingabe (Strg+B ändert die Auswahl nicht, nur den Zustand).
 */
export const useFormatState = (hostRef: RefObject<HTMLElement | null>, enabled: boolean) => {
    const [state, setState] = useState<FormatState>(EMPTY);

    const refresh = useCallback(() => {
        const element = selectionTextElement(hostRef.current);
        const next: FormatState = element
            ? {
                bold: queryState('bold'),
                italic: queryState('italic'),
                underline: queryState('underline'),
                blockId: element.dataset.editorText ?? null,
            }
            : EMPTY;
        setState((previous) => (
            previous.bold === next.bold
            && previous.italic === next.italic
            && previous.underline === next.underline
            && previous.blockId === next.blockId
                ? previous
                : next
        ));
    }, [hostRef]);

    useEffect(() => {
        const host = hostRef.current;
        if (!enabled || !host) return undefined;
        document.addEventListener('selectionchange', refresh);
        host.addEventListener('keyup', refresh);
        host.addEventListener('mouseup', refresh);
        host.addEventListener('input', refresh);
        return () => {
            document.removeEventListener('selectionchange', refresh);
            host.removeEventListener('keyup', refresh);
            host.removeEventListener('mouseup', refresh);
            host.removeEventListener('input', refresh);
        };
    }, [enabled, hostRef, refresh]);

    return { format: state, refreshFormat: refresh };
};
