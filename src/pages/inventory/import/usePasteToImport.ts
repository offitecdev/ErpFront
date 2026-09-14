import { useEffect, useLayoutEffect, useRef } from 'react';

import { clipboardFromEvent, clipboardToImportFiles } from './importTemplate';

/**
 * ── STRG+V AUF DER BESTELLSEITE (Vorgabe Samet, 11.09.2026) ─────────────────
 * «Fuer Bestellung und Preisanfrage den Beleg einfach einfuegen koennen.»
 * Wer ein Bildschirmfoto oder kopierte Zeilen auf der Seite selbst einfuegt
 * — nicht in ein Feld —, bekommt den Beleg-Import damit geoeffnet.
 *
 * Nie abgefangen wird ein Einfuegen in ein Eingabefeld, einen Textbereich
 * oder einen bearbeitbaren Text (das bleibt ein gewoehnliches Einfuegen),
 * eines, das schon jemand behandelt hat, und jedes, solange ein Fenster
 * offen ist. Ein einzelnes Wort oeffnet nichts (`strict`).
 */
const TYPING_INPUT = /^(text|search|number|email|tel|url|password|date|datetime-local|month|time|week)$/i;

const isTypingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable || target.closest('textarea, select')) return true;
    const input = target.closest('input');
    return Boolean(input && TYPING_INPUT.test(input.type));
};

export const usePasteToImport = (enabled: boolean, onFiles: (files: File[]) => void): void => {
    const latest = useRef(onFiles);
    useLayoutEffect(() => { latest.current = onFiles; });

    useEffect(() => {
        if (!enabled) return undefined;
        const onPaste = (event: ClipboardEvent) => {
            if (event.defaultPrevented || !event.clipboardData) return;
            if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
            if (document.querySelector('[aria-modal="true"]')) return;
            const files = clipboardToImportFiles(clipboardFromEvent(event.clipboardData), { strict: true });
            if (!files.length) return;
            event.preventDefault();
            latest.current(files);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [enabled]);
};
