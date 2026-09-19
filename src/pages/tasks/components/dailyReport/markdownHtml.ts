import { parseMarkdown, type MdSpan } from '../reports/markdownDoc';

/**
 * ── DAS BLATT ALS HTML UND ZURÜCK (16.09.2026) ──────────────────────────────
 *
 * Samet: «ön izleme olmasın, direkt kalın yapsın, italik yapsın, görsel de öyle
 * görünsün — pdf'e verirken url haline getirilsin.» Geschrieben wird also
 * unmittelbar im fertigen Bild (contentEditable), gespeichert bleibt MARKDOWN:
 * der Rapport, das PDF und die alten Rapporte lesen weiter dieselbe Sprache.
 *
 *   markdownToHtml  Markdown → das, was im Editor steht (gelesen wird es mit
 *                   demselben Leser wie im Rapport, markdownDoc.ts)
 *   htmlToMarkdown  was im Editor steht → Markdown (läuft bei jeder Eingabe)
 *
 * Adressen werden geprüft: nur http(s), mailto und eigene Pfade — nie
 * `javascript:`. Text wird maskiert, es entsteht kein fremdes HTML.
 */

const escapeText = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttribute = (value: string): string => escapeText(value).replace(/"/g, '&quot;');

/** Erlaubte Adresse oder leer. */
export const safeUrl = (value: string): string => {
    const url = String(value ?? '').trim();
    return /^(https?:\/\/|mailto:|\/)/i.test(url) ? url : '';
};

const spansToHtml = (spans: MdSpan[]): string => spans.map((span) => {
    if (span.text === '\n') return '<br>';
    let html = escapeText(span.text);
    if (span.code) html = `<code>${html}</code>`;
    if (span.bold) html = `<b>${html}</b>`;
    if (span.italic) html = `<i>${html}</i>`;
    const href = span.href ? safeUrl(span.href) : '';
    if (href) html = `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${html}</a>`;
    return html;
}).join('') || '<br>';

/** Markdown → HTML für den Editor. Überschriften: `#` → h2, `##` → h3, `###` → h4. */
export const markdownToHtml = (markdown: string): string => {
    const blocks = parseMarkdown(markdown);
    if (!blocks.length) return '<p><br></p>';
    return blocks.map((block) => {
        switch (block.kind) {
            case 'heading':
                return `<h${block.level + 1}>${spansToHtml(block.spans)}</h${block.level + 1}>`;
            case 'list': {
                const tag = block.ordered ? 'ol' : 'ul';
                return `<${tag}>${block.items.map((item) => `<li>${spansToHtml(item)}</li>`).join('')}</${tag}>`;
            }
            case 'quote':
                return `<blockquote>${spansToHtml(block.spans)}</blockquote>`;
            case 'rule':
                return '<hr>';
            case 'image': {
                const url = safeUrl(block.url);
                return url
                    ? `<p><img src="${escapeAttribute(url)}" alt="${escapeAttribute(block.alt)}"></p>`
                    : '<p><br></p>';
            }
            default:
                return `<p>${spansToHtml(block.spans)}</p>`;
        }
    }).join('');
};

/* ── Zurück: was im Editor steht, als Markdown ──────────────────────────── */

const TEXT_NODE = 3;

/** Blockelemente, die in einem Absatz nichts zu suchen haben. */
const BLOCK_TAGS = new Set(['UL', 'OL', 'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'HR', 'TABLE', 'SECTION']);

const inlineToMarkdown = (node: Node): string => {
    if (node.nodeType === TEXT_NODE) return (node.textContent ?? '').replace(/\u00a0/g, ' ');
    const element = node as HTMLElement;
    if (!element.tagName) return '';
    if (element.tagName === 'BR') return '\n';
    if (element.tagName === 'IMG') {
        const url = safeUrl(element.getAttribute('src') ?? '');
        return url ? `![${element.getAttribute('alt') ?? ''}](${url})` : '';
    }
    const inner = Array.from(element.childNodes).map(inlineToMarkdown).join('');
    if (!inner.trim()) return inner;
    switch (element.tagName) {
        case 'STRONG':
        case 'B':
            return `**${inner}**`;
        case 'EM':
        case 'I':
            return `*${inner}*`;
        case 'CODE':
            return `\`${inner}\``;
        case 'A': {
            const href = safeUrl(element.getAttribute('href') ?? '');
            // Eine nackte Adresse bleibt nackt — der Leser macht sie ohnehin zum Link.
            if (href && inner.trim() === href) return href;
            return href ? `[${inner}](${href})` : inner;
        }
        default:
            // Der Browser setzt beim Auszeichnen auch <span style="font-weight:bold">.
            if (element.style?.fontWeight && Number(element.style.fontWeight) >= 600) return `**${inner}**`;
            if (element.style?.fontWeight === 'bold') return `**${inner}**`;
            if (element.style?.fontStyle === 'italic') return `*${inner}*`;
            return inner;
    }
};

/** Eine Zeile ohne führende/abschliessende Leerzeichen, ohne Leerzeilen. */
const cleanLines = (text: string): string[] =>
    text.split('\n').map((line) => line.replace(/\s+$/, ''));

export const htmlToMarkdown = (root: HTMLElement): string => {
    const lines: string[] = [];
    const blank = () => { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); };

    const walk = (node: Node) => {
        if (node.nodeType === TEXT_NODE) {
            const text = (node.textContent ?? '').replace(/\u00a0/g, ' ');
            if (text.trim()) { lines.push(text.trim()); blank(); }
            return;
        }
        const element = node as HTMLElement;
        if (!element.tagName) return;
        switch (element.tagName) {
            case 'UL':
            case 'OL': {
                const ordered = element.tagName === 'OL';
                Array.from(element.children).forEach((item, index) => {
                    const text = inlineToMarkdown(item).replace(/\n+/g, ' ').trim();
                    lines.push(`${ordered ? `${index + 1}.` : '-'} ${text}`.trimEnd());
                });
                blank();
                break;
            }
            case 'BLOCKQUOTE':
                cleanLines(inlineToMarkdown(element)).forEach((line) => lines.push(`> ${line}`.trimEnd()));
                blank();
                break;
            case 'HR':
                lines.push('---');
                blank();
                break;
            case 'H1':
            case 'H2':
            case 'H3':
            case 'H4':
            case 'H5':
            case 'H6': {
                const level = Math.min(3, Math.max(1, Number(element.tagName[1]) - 1));
                const text = inlineToMarkdown(element).replace(/\n+/g, ' ').trim();
                if (text) { lines.push(`${'#'.repeat(level)} ${text}`); blank(); }
                break;
            }
            case 'IMG': {
                const url = safeUrl(element.getAttribute('src') ?? '');
                if (url) { lines.push(`![${element.getAttribute('alt') ?? ''}](${url})`); blank(); }
                break;
            }
            case 'TABLE':
            case 'DIV':
            case 'P':
            case 'SECTION': {
                // Steckt ein Block darin (der Browser setzt manchmal <ul> in <p>), zählen die Teile einzeln.
                if (Array.from(element.children).some((child) => BLOCK_TAGS.has(child.tagName))) {
                    let inline: Node[] = [];
                    const flush = () => {
                        const text = inline.map(inlineToMarkdown).join('');
                        cleanLines(text).filter((line) => line.trim()).forEach((line) => lines.push(line));
                        if (text.trim()) blank();
                        inline = [];
                    };
                    Array.from(element.childNodes).forEach((child) => {
                        if (child instanceof HTMLElement && BLOCK_TAGS.has(child.tagName)) {
                            flush();
                            walk(child);
                        } else {
                            inline.push(child);
                        }
                    });
                    flush();
                    break;
                }
                // Ein Absatz: seine Zeilen bleiben Zeilen, ein leerer Absatz trennt.
                const text = inlineToMarkdown(element);
                const rows = cleanLines(text).filter((line, index, all) => line.trim() || index < all.length - 1);
                if (!rows.some((line) => line.trim())) { blank(); break; }
                rows.forEach((line) => lines.push(line));
                blank();
                break;
            }
            default:
                Array.from(element.childNodes).forEach(walk);
                break;
        }
    };

    Array.from(root.childNodes).forEach(walk);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};
