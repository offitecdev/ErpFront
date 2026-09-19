/**
 * ── DAS BLATT LESEN: MARKDOWN → BLÖCKE ──────────────────────────────────────
 *
 * 16.09.2026 (Samet): «Gün sonu raporu direkt beyaz bir sayfa, markdown olacak,
 * görsel ekleyebilecek.» Vorschau (React) und PDF (jsPDF) zeigen dasselbe
 * Blatt — also liest nur EINE Datei den Text, ohne DOM und ohne Bibliothek.
 *
 * Verstanden wird, was Menschen beim Schreiben von Hand tippen:
 *
 *   # ## ###      Überschriften (tiefer = wie ###)
 *   - * +         Aufzählung · 1. 2. 3.  nummerierte Liste
 *   >             Zitat
 *   ---           Trennlinie
 *   ![alt](url)   Bild in eigener Zeile
 *   **fett**  *kursiv*  _kursiv_  `code`  [Text](url)  nackte http(s)-Adressen
 *
 * Eine Leerzeile trennt Absätze; einzelne Zeilenumbrüche im Absatz bleiben
 * erhalten (wer eine Zeile umbricht, meint das auch so).
 */

export interface MdSpan {
    text: string;
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    /** Gesetzt = anklickbar (Link oder nackte Adresse). */
    href?: string;
}

export type MdBlock =
    | { kind: 'heading'; level: 1 | 2 | 3; spans: MdSpan[] }
    | { kind: 'paragraph'; spans: MdSpan[] }
    | { kind: 'list'; ordered: boolean; items: MdSpan[][] }
    | { kind: 'quote'; spans: MdSpan[] }
    | { kind: 'rule' }
    | { kind: 'image'; url: string; alt: string };

/** Nackte Adresse; `*` und Backtick beenden sie (dahinter beginnt eine Auszeichnung). */
const URL_PATTERN = /https?:\/\/[^\s<>()*`]+[^\s<>().,;:!?"'*`]/gi;

/** Eine Textzeile in Auszeichnungen zerlegen. */
export const parseMarkdownSpans = (line: string): MdSpan[] => {
    const spans: MdSpan[] = [];
    const push = (text: string, style: Omit<MdSpan, 'text'>) => {
        if (!text) return;
        const last = spans[spans.length - 1];
        if (last && last.bold === style.bold && last.italic === style.italic
            && last.code === style.code && last.href === style.href) {
            last.text += text;
            return;
        }
        spans.push({ text, ...style });
    };

    /** Nackte Adressen in einem schon ausgezeichneten Stück zu Links machen. */
    const pushText = (text: string, style: Omit<MdSpan, 'text'>) => {
        if (style.href || style.code) {
            push(text, style);
            return;
        }
        let last = 0;
        URL_PATTERN.lastIndex = 0;
        for (const match of text.matchAll(URL_PATTERN)) {
            const index = match.index ?? 0;
            push(text.slice(last, index), style);
            push(match[0], { ...style, href: match[0] });
            last = index + match[0].length;
        }
        push(text.slice(last), style);
    };

    let rest = line;
    let plain = '';
    const flush = () => {
        pushText(plain, {});
        plain = '';
    };
    while (rest) {
        const link = /^!?\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
        if (link) {
            flush();
            push(link[1] || link[2], { href: link[2] });
            rest = rest.slice(link[0].length);
            continue;
        }
        const code = /^`([^`]+)`/.exec(rest);
        if (code) {
            flush();
            push(code[1], { code: true });
            rest = rest.slice(code[0].length);
            continue;
        }
        const bold = /^\*\*([^*]+)\*\*/.exec(rest) ?? /^__([^_]+)__/.exec(rest);
        if (bold) {
            flush();
            pushText(bold[1], { bold: true });
            rest = rest.slice(bold[0].length);
            continue;
        }
        const italic = /^\*([^*\s][^*]*)\*/.exec(rest) ?? /^_([^_\s][^_]*)_/.exec(rest);
        if (italic) {
            flush();
            pushText(italic[1], { italic: true });
            rest = rest.slice(italic[0].length);
            continue;
        }
        plain += rest[0];
        rest = rest.slice(1);
    }
    flush();
    return spans;
};

export const spansText = (spans: MdSpan[]): string => spans.map((span) => span.text).join('');

const LIST_BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const LIST_NUMBER = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const RULE = /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/;
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

/** Das ganze Blatt in Blöcke. Leerer Text = keine Blöcke. */
export const parseMarkdown = (source: string): MdBlock[] => {
    const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks: MdBlock[] = [];
    let paragraph: string[] = [];

    const closeParagraph = () => {
        if (!paragraph.length) return;
        const spans: MdSpan[] = [];
        paragraph.forEach((line, index) => {
            if (index) spans.push({ text: '\n' });
            spans.push(...parseMarkdownSpans(line));
        });
        blocks.push({ kind: 'paragraph', spans });
        paragraph = [];
    };

    for (const raw of lines) {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) {
            closeParagraph();
            continue;
        }
        const image = IMAGE_LINE.exec(line);
        if (image) {
            closeParagraph();
            blocks.push({ kind: 'image', url: image[2], alt: image[1] });
            continue;
        }
        if (RULE.test(line)) {
            closeParagraph();
            blocks.push({ kind: 'rule' });
            continue;
        }
        const heading = HEADING.exec(line);
        if (heading) {
            closeParagraph();
            const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
            blocks.push({ kind: 'heading', level, spans: parseMarkdownSpans(heading[2]) });
            continue;
        }
        const quote = QUOTE.exec(line);
        if (quote) {
            closeParagraph();
            blocks.push({ kind: 'quote', spans: parseMarkdownSpans(quote[1]) });
            continue;
        }
        const bullet = LIST_BULLET.exec(line);
        const numbered = bullet ? null : LIST_NUMBER.exec(line);
        if (bullet || numbered) {
            closeParagraph();
            const ordered = Boolean(numbered);
            const item = parseMarkdownSpans(bullet ? bullet[1] : (numbered as RegExpExecArray)[2]);
            const last = blocks[blocks.length - 1];
            if (last && last.kind === 'list' && last.ordered === ordered) last.items.push(item);
            else blocks.push({ kind: 'list', ordered, items: [item] });
            continue;
        }
        paragraph.push(line);
    }
    closeParagraph();
    return blocks;
};
