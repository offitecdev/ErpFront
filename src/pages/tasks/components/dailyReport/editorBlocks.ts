/**
 * ── ABSÄTZE UND LISTEN IM BLATT, VON HAND GEBAUT (16.09.2026) ──────────────
 *
 * Samet: «madde işareti yapamıyorum; silince madde işareti satır başına gelmeli,
 * bir satır öncesine gitmemeli.» Der eingebaute Befehl des Browsers
 * (`insertUnorderedList`) setzte in Chrome die Liste IN den Absatz (<p><ul>)
 * und hinterliess beim Zurücknehmen <span style="font-family…">-Reste. Darum
 * baut diese Datei die Blöcke selbst um — immer gleich, ohne Überraschungen:
 *
 *   blockToListItem      Absatz/Überschrift/Zitat → Listenpunkt (hängt sich an
 *                        eine direkt davor stehende Liste derselben Art)
 *   listItemToParagraph  Listenpunkt → Absatz AN DERSELBEN STELLE; die Liste
 *                        wird dort geteilt, nichts rutscht eine Zeile hoch
 *   retag                Absatz ↔ Überschrift ↔ Zitat
 *
 * Nur DOM, kein React: die Fläche gehört dem Browser (siehe DailyReportEditor).
 */

const BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE)$/;
const LIST = /^(UL|OL)$/;

/** Der Block der Schreibmarke: ein Listenpunkt oder ein direktes Kind der Fläche. */
export const blockOf = (host: HTMLElement, node: Node | null): HTMLElement | null => {
    let current: Node | null = node;
    let found: HTMLElement | null = null;
    while (current && current !== host) {
        if (current instanceof HTMLElement) {
            if (current.tagName === 'LI') return current;
            if (BLOCK.test(current.tagName) && current.parentNode === host) found = current;
        }
        current = current.parentNode;
    }
    return found;
};

/** Lose Zeichen direkt in der Fläche kommen in einen Absatz (das leere Blatt beginnt so). */
export const ensureBlocks = (host: HTMLElement): void => {
    let run: Node[] = [];
    const wrap = () => {
        if (!run.length) return;
        if (run.every((node) => node.nodeType === Node.TEXT_NODE && !(node.textContent ?? '').trim())) {
            run.forEach((node) => node.parentNode?.removeChild(node));
            run = [];
            return;
        }
        const paragraph = document.createElement('p');
        host.insertBefore(paragraph, run[0]);
        run.forEach((node) => paragraph.appendChild(node));
        run = [];
    };
    Array.from(host.childNodes).forEach((node) => {
        const isBlock = node instanceof HTMLElement && (BLOCK.test(node.tagName) || LIST.test(node.tagName) || node.tagName === 'HR');
        if (isBlock) wrap();
        else run.push(node);
    });
    wrap();
    if (!host.firstChild) host.innerHTML = '<p><br></p>';
};

/** Schreibmarke an eine Stelle setzen. */
export const placeCaret = (node: Node, offset = 0): void => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.setStart(node, Math.min(offset, node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '').length : node.childNodes.length));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
};

/** Den Anfang eines Blocks als Schreibmarke — im ersten Textstück, sonst im Block. */
export const caretToStart = (block: HTMLElement): void => {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode();
    if (first) placeCaret(first, 0);
    else placeCaret(block, 0);
};

/** Die ersten `count` Zeichen eines Blocks entfernen (die getippten «- »-Zeichen). */
export const dropLeadingChars = (block: HTMLElement, count: number): void => {
    let rest = count;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node && rest > 0) {
        const text = node.data;
        const take = Math.min(rest, text.length);
        node.data = text.slice(take);
        rest -= take;
        node = walker.nextNode() as Text | null;
    }
};

/** Leerer Block bekommt ein <br>, sonst kann man nicht hineinklicken. */
const keepOpen = (element: HTMLElement): void => {
    if (!(element.textContent ?? '').length && !element.querySelector('img, br')) element.appendChild(document.createElement('br'));
};

/** Kinder von `from` nach `to` umziehen. */
const moveChildren = (from: HTMLElement, to: HTMLElement): void => {
    while (from.firstChild) to.appendChild(from.firstChild);
    keepOpen(to);
};

/** Einen Block durch denselben Inhalt mit anderem Tag ersetzen. */
export const retag = (element: HTMLElement, tag: string): HTMLElement => {
    const next = document.createElement(tag);
    moveChildren(element, next);
    element.replaceWith(next);
    return next;
};

/** Absatz (oder Überschrift/Zitat) → Listenpunkt. */
export const blockToListItem = (block: HTMLElement, ordered: boolean): HTMLLIElement => {
    const tag = ordered ? 'OL' : 'UL';
    const item = document.createElement('li');
    moveChildren(block, item);
    const previous = block.previousElementSibling;
    const next = block.nextElementSibling;
    if (previous?.tagName === tag) {
        previous.appendChild(item);
        block.remove();
        // Steht dahinter gleich noch eine Liste derselben Art, werden beide eins.
        if (next?.tagName === tag) {
            while (next.firstChild) previous.appendChild(next.firstChild);
            next.remove();
        }
    } else if (next?.tagName === tag) {
        next.insertBefore(item, next.firstChild);
        block.remove();
    } else {
        const list = document.createElement(tag.toLowerCase());
        list.appendChild(item);
        block.replaceWith(list);
    }
    return item;
};

/**
 * Listenpunkt → Absatz an derselben Stelle. Punkte davor bleiben oben in der
 * Liste, Punkte danach bilden unter dem Absatz eine neue Liste derselben Art.
 */
export const listItemToParagraph = (item: HTMLElement): HTMLElement => {
    const list = item.parentElement as HTMLElement;
    const paragraph = document.createElement('p');
    moveChildren(item, paragraph);
    const after: Element[] = [];
    for (let next = item.nextElementSibling; next; next = next.nextElementSibling) after.push(next);
    const hasBefore = Boolean(item.previousElementSibling);
    item.remove();

    if (!hasBefore) {
        list.parentNode?.insertBefore(paragraph, list);
        if (!list.children.length) list.remove();
        return paragraph;
    }
    list.parentNode?.insertBefore(paragraph, list.nextSibling);
    if (after.length) {
        const rest = document.createElement(list.tagName.toLowerCase());
        after.forEach((element) => rest.appendChild(element));
        paragraph.parentNode?.insertBefore(rest, paragraph.nextSibling);
    }
    return paragraph;
};

/** Steht der Block leer da (nur <br> oder nichts)? */
export const isEmptyBlock = (block: HTMLElement): boolean =>
    !(block.textContent ?? '').replace(/\u200b/g, '').length && !block.querySelector('img');
