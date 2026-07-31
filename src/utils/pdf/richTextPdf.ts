import type jsPDF from 'jspdf';

/**
 * Renders the rich text produced by the offer's editors (bold / italic / colour)
 * into a jsPDF document.
 *
 * The rest of the PDF draws plain strings, which is why the existing helpers
 * flatten HTML with `richHtmlToPlainText`. That is fine for a product
 * description, but the cover letter and closing note are authored text whose
 * emphasis and colour carry meaning — flattening them would silently discard
 * the formatting the user just applied. So the HTML is parsed into styled runs
 * and laid out here instead.
 *
 * Runs the parse through the DOM, which is available because offer PDFs are
 * built in the browser.
 */

export type PdfTextRun = {
    text: string;
    bold: boolean;
    italic: boolean;
    /** RGB 0-255, or null to inherit the caller's current colour. */
    color: [number, number, number] | null;
};

/** One paragraph — a hard line break starts a new one. */
type PdfParagraph = PdfTextRun[];

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'BLOCKQUOTE']);
const BOLD_TAGS = new Set(['B', 'STRONG', 'H1', 'H2', 'H3', 'H4']);
const ITALIC_TAGS = new Set(['I', 'EM']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'HEAD', 'TITLE']);

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** Accepts `#rgb`, `#rrggbb` and `rgb(r, g, b)` — what the editor emits. */
export const parseCssColor = (raw?: string | null): [number, number, number] | null => {
    if (!raw) return null;
    const value = raw.trim().toLowerCase();

    const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
    if (hexMatch) {
        const hex = hexMatch[1];
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
        return [
            parseInt(full.slice(0, 2), 16),
            parseInt(full.slice(2, 4), 16),
            parseInt(full.slice(4, 6), 16),
        ];
    }

    const rgbMatch = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
    if (rgbMatch) {
        return [
            clampChannel(Number(rgbMatch[1])),
            clampChannel(Number(rgbMatch[2])),
            clampChannel(Number(rgbMatch[3])),
        ];
    }
    return null;
};

/** Splits rich HTML into paragraphs of styled runs. */
export const parseRichTextParagraphs = (html: string): PdfParagraph[] => {
    if (!html || !html.trim()) return [];

    const template = document.createElement('template');
    template.innerHTML = html;

    const paragraphs: PdfParagraph[] = [];
    let current: PdfParagraph = [];

    const endParagraph = () => {
        // Collapse runs that carry no visible text, so a stray <div></div> does
        // not print as a blank line.
        if (current.some((run) => run.text.trim())) paragraphs.push(current);
        else if (current.length) paragraphs.push([]);
        current = [];
    };

    const push = (text: string, style: Omit<PdfTextRun, 'text'>) => {
        if (!text) return;
        const previous = current[current.length - 1];
        if (
            previous
            && previous.bold === style.bold
            && previous.italic === style.italic
            && String(previous.color) === String(style.color)
        ) {
            previous.text += text;
            return;
        }
        current.push({ text, ...style });
    };

    const visit = (node: Node, style: Omit<PdfTextRun, 'text'>) => {
        if (node.nodeType === Node.TEXT_NODE) {
            // Collapse HTML whitespace the way a browser would; newlines in the
            // source are not line breaks.
            push((node.textContent ?? '').replace(/\s+/g, ' '), style);
            return;
        }
        if (!(node instanceof Element)) return;
        if (DROP_TAGS.has(node.tagName)) return;

        if (node.tagName === 'BR') {
            endParagraph();
            return;
        }

        const isBlock = BLOCK_TAGS.has(node.tagName);
        if (isBlock && current.length) endParagraph();

        // Only HTMLElement carries `style`; SVG and friends do not.
        const inline = node instanceof HTMLElement ? node.style : null;
        const nextStyle: Omit<PdfTextRun, 'text'> = {
            bold: style.bold
                || BOLD_TAGS.has(node.tagName)
                || inline?.fontWeight === 'bold'
                || Number(inline?.fontWeight) >= 600,
            italic: style.italic || ITALIC_TAGS.has(node.tagName) || inline?.fontStyle === 'italic',
            color: parseCssColor(inline?.color) ?? parseCssColor(node.getAttribute('color')) ?? style.color,
        };

        node.childNodes.forEach((child) => visit(child, nextStyle));

        if (isBlock) endParagraph();
    };

    template.content.childNodes.forEach((child) => visit(child, { bold: false, italic: false, color: null }));
    endParagraph();

    return paragraphs;
};

type DrawRichTextOptions = {
    x: number;
    y: number;
    maxWidth: number;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    /** Colour used by runs that specify none. */
    defaultColor: readonly [number, number, number];
    /** Bottom limit; crossing it calls `onOverflow` for a new page. */
    maxY: number;
    /** Must add a page and return the Y to continue drawing at. */
    onOverflow: () => number;
    /** Extra gap between paragraphs, in mm. */
    paragraphGap?: number;
};

/**
 * Draws parsed rich text with word wrapping, returning the Y after the last
 * line. Measures each run in its own font so a bold word takes the width it
 * will actually occupy — measuring everything in the regular face makes bold
 * text overflow the column.
 */
export const drawRichText = (
    doc: jsPDF,
    paragraphs: PdfParagraph[],
    options: DrawRichTextOptions,
): number => {
    const {
        x, maxWidth, fontFamily, fontSize, lineHeight,
        defaultColor, maxY, onOverflow, paragraphGap = 1.6,
    } = options;
    let y = options.y;

    doc.setFontSize(fontSize);

    const styleOf = (run: PdfTextRun) =>
        (run.bold && run.italic ? 'bolditalic' : run.bold ? 'bold' : run.italic ? 'italic' : 'normal');

    const widthOf = (run: PdfTextRun, text: string) => {
        // jsPDF has no synthesised bold-italic here; bold is the closer match.
        doc.setFont(fontFamily, styleOf(run) === 'bolditalic' ? 'bold' : styleOf(run));
        return doc.getTextWidth(text);
    };

    for (const paragraph of paragraphs) {
        if (paragraph.length === 0) {
            y += lineHeight;
            continue;
        }

        // Wrap into visual lines, carrying each word's style with it.
        let line: Array<{ run: PdfTextRun; text: string }> = [];
        let lineWidth = 0;
        const lines: Array<Array<{ run: PdfTextRun; text: string }>> = [];

        for (const run of paragraph) {
            const words = run.text.split(' ').filter((word, index, all) => word !== '' || index === all.length - 1);
            for (const word of words) {
                if (!word) continue;
                const chunk = line.length === 0 ? word : ` ${word}`;
                const chunkWidth = widthOf(run, chunk);
                if (lineWidth + chunkWidth > maxWidth && line.length > 0) {
                    lines.push(line);
                    line = [{ run, text: word }];
                    lineWidth = widthOf(run, word);
                } else {
                    line.push({ run, text: chunk });
                    lineWidth += chunkWidth;
                }
            }
        }
        if (line.length) lines.push(line);

        for (const visualLine of lines) {
            if (y + lineHeight > maxY) y = onOverflow();
            let cursorX = x;
            for (const { run, text } of visualLine) {
                const style = styleOf(run);
                doc.setFont(fontFamily, style === 'bolditalic' ? 'bold' : style);
                const [r, g, b] = run.color ?? defaultColor;
                doc.setTextColor(r, g, b);
                doc.text(text, cursorX, y);
                cursorX += doc.getTextWidth(text);
            }
            y += lineHeight;
        }
        y += paragraphGap;
    }

    doc.setFont(fontFamily, 'normal');
    const [dr, dg, db] = defaultColor;
    doc.setTextColor(dr, dg, db);
    return y;
};
