/**
 * DOM-Hilfen des Editors: Schreibmarke setzen, Block an der Schreibmarke
 * teilen, Auswahl merken. Alles, was mit `window.getSelection()` arbeitet,
 * steht hier — die Bausteine bleiben frei davon.
 */

const escapeId = (id: string): string => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"'));

export const findTextElement = (host: HTMLElement | null, blockId: string): HTMLElement | null =>
    host?.querySelector<HTMLElement>(`[data-editor-text="${escapeId(blockId)}"]`) ?? null;

export const findBlockMenuButton = (host: HTMLElement | null, blockId: string): HTMLElement | null =>
    host?.querySelector<HTMLElement>(`[data-block-menu="${escapeId(blockId)}"]`) ?? null;

export const placeCaret = (element: HTMLElement, at: 'start' | 'end'): void => {
    element.focus({ preventScroll: false });
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(at === 'start');
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
};

const rangeInside = (element: HTMLElement): Range | null => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return element.contains(range.startContainer) ? range : null;
};

/** Steht die Schreibmarke ganz am Anfang des Blocks? */
export const caretAtStart = (element: HTMLElement): boolean => {
    const range = rangeInside(element);
    if (!range || !range.collapsed) return false;
    const before = document.createRange();
    before.selectNodeContents(element);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length === 0 && !before.cloneContents().querySelector?.('br');
};

/** Steht die Schreibmarke ganz am Ende des Blocks? */
export const caretAtEnd = (element: HTMLElement): boolean => {
    const range = rangeInside(element);
    if (!range || !range.collapsed) return false;
    const after = document.createRange();
    after.selectNodeContents(element);
    after.setStart(range.endContainer, range.endOffset);
    return after.toString().length === 0;
};

/**
 * Teilt den Block an der Schreibmarke (Enter): was hinter der Marke steht,
 * wird aus dem Element GELÖST und als HTML zurückgegeben — das Element behält
 * den vorderen Teil. Eine markierte Stelle wird vorher gelöscht.
 */
export const splitAtCaret = (element: HTMLElement): { head: string; tail: string } => {
    const range = rangeInside(element);
    if (!range) return { head: element.innerHTML, tail: '' };
    if (!range.collapsed) range.deleteContents();
    const tailRange = document.createRange();
    tailRange.setStart(range.startContainer, range.startOffset);
    tailRange.setEnd(element, element.childNodes.length);
    const fragment = tailRange.extractContents();
    const box = document.createElement('div');
    box.appendChild(fragment);
    return { head: element.innerHTML, tail: box.innerHTML };
};

/** Textblock, in dem die aktuelle Auswahl liegt (innerhalb von `host`). */
export const selectionTextElement = (host: HTMLElement | null): HTMLElement | null => {
    if (!host) return null;
    const selection = window.getSelection();
    const node = selection?.anchorNode ?? null;
    if (!node) return null;
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const text = element?.closest<HTMLElement>('[data-editor-text]') ?? null;
    return text && host.contains(text) ? text : null;
};

/** Markierung für später (Link-Fenster nimmt den Fokus). */
export const saveSelection = (element: HTMLElement): Range | null => {
    const range = rangeInside(element);
    return range && !range.collapsed ? range.cloneRange() : null;
};

export const restoreSelection = (element: HTMLElement, range: Range): void => {
    element.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
};

/** Klartext an der Schreibmarke einfügen (Einfügen aus der Zwischenablage). */
export const insertPlainText = (text: string): void => {
    document.execCommand('insertText', false, text);
};
