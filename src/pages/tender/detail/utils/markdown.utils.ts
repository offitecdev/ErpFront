const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const renderInlineMarkdownHtml = (value: string) => {
    return escapeHtml(value)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
        .replace(/(^|[\s>])(?:\*\*|__|_)(?=($|[\s<]))/g, '$1');
};

const computeMarkdownHtml = (value: string) => {
    const lines = value.split('\n');
    let html = '';
    let inList = false;

    lines.forEach((line, index) => {
        const bullet = line.match(/^\s*[-•] (.*)$/);
        if (bullet) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${renderInlineMarkdownHtml(bullet[1]) || '<br>'}</li>`;
            return;
        }

        if (inList) {
            html += '</ul>';
            inList = false;
        }

        const heading = line.match(/^(#{1,2})\s+(.*)$/);
        if (heading) {
            const marker = heading[1] ?? '#';
            const headingText = heading[2] ?? '';
            const tag = marker.length === 1 ? 'h2' : 'h3';
            html += `<${tag}>${renderInlineMarkdownHtml(headingText) || '<br>'}</${tag}>`;
            return;
        }

        html += renderInlineMarkdownHtml(line) || '<br>';
        if (index < lines.length - 1) html += '<br>';
    });

    if (inList) html += '</ul>';
    return html;
};


const MARKDOWN_HTML_CACHE_LIMIT = 500;
const markdownHtmlCache = new Map<string, string>();

export const markdownToHtml = (value: string) => {
    const cached = markdownHtmlCache.get(value);
    if (cached !== undefined) return cached;

    const html = computeMarkdownHtml(value);
    if (markdownHtmlCache.size >= MARKDOWN_HTML_CACHE_LIMIT) {
        const oldestKey = markdownHtmlCache.keys().next().value;
        if (oldestKey !== undefined) markdownHtmlCache.delete(oldestKey);
    }
    markdownHtmlCache.set(value, html);
    return html;
};

// ── Rich text (HTML) support ─────────────────────────────────────────────────
// The WYSIWYG editor stores HTML; legacy values are the markdown-ish dialect
// above. looksLikeRichHtml routes each value to the right renderer.

export const looksLikeRichHtml = (value: string) => /<([a-z][a-z0-9]*)\b[^>]*>/i.test(value);

// Formatting the editor can produce (plus legacy markdownToHtml output).
const ALLOWED_RICH_TAGS = new Set([
    'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
    'UL', 'OL', 'LI', 'BR', 'P', 'DIV', 'SPAN', 'FONT', 'H1', 'H2', 'H3', 'H4',
]);
// Containers whose CONTENT must go too (unwrapping a <script> would leak its
// source as visible text).
const DROP_RICH_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'HEAD']);

// DOM-based allowlist sanitizer for stored/pasted rich HTML: keeps only the
// formatting tags above and the color/size bits of their attributes.
export const sanitizeRichHtml = (html: string): string => {
    const template = document.createElement('template');
    template.innerHTML = html;

    const sanitizeElement = (el: Element) => {
        // Snapshot children first: sanitizing may unwrap/remove nodes.
        [...el.children].forEach(sanitizeElement);

        if (DROP_RICH_TAGS.has(el.tagName)) {
            el.remove();
            return;
        }
        if (!ALLOWED_RICH_TAGS.has(el.tagName)) {
            el.replaceWith(...el.childNodes);
            return;
        }
        [...el.attributes].forEach((attr) => {
            const name = attr.name.toLowerCase();
            const keepAsIs =
                el.tagName === 'FONT' && (
                    (name === 'color' && /^#?[a-z0-9(),.%\s-]+$/i.test(attr.value)) ||
                    (name === 'size' && /^[1-7]$/.test(attr.value))
                );
            if (!keepAsIs && name !== 'style') el.removeAttribute(attr.name);
        });
        const styled = el as HTMLElement;
        if (styled.getAttribute('style')) {
            const color = styled.style.color;
            const fontSize = styled.style.fontSize;
            const backgroundColor = styled.style.backgroundColor;
            styled.removeAttribute('style');
            if (color) styled.style.color = color;
            if (fontSize) styled.style.fontSize = fontSize;
            if (backgroundColor) styled.style.backgroundColor = backgroundColor;
        }
    };

    [...template.content.children].forEach(sanitizeElement);
    return template.innerHTML;
};

// Renderer entry point: stored HTML is sanitized, legacy text goes through the
// markdown pipeline. Use this everywhere a long description / mail message is
// shown as HTML.
export const richTextToHtml = (value: string) =>
    looksLikeRichHtml(value) ? sanitizeRichHtml(value) : markdownToHtml(value);

const RICH_BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4']);

// HTML → the plain markdown-ish dialect ('• ' bullets + newlines). Styling is
// dropped — matching how **bold**/_italic_ were already stripped for the PDF.
export const richHtmlToPlainText = (html: string): string => {
    const template = document.createElement('template');
    template.innerHTML = html;
    let out = '';
    const visit = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            out += node.textContent;
            return;
        }
        if (!(node instanceof Element)) return;
        if (DROP_RICH_TAGS.has(node.tagName)) return;
        if (node.tagName === 'BR') {
            out += '\n';
            return;
        }
        const isBlock = RICH_BLOCK_TAGS.has(node.tagName);
        if (isBlock && out && !out.endsWith('\n')) out += '\n';
        if (node.tagName === 'LI') out += '• ';
        node.childNodes.forEach(visit);
        if (isBlock && out && !out.endsWith('\n')) out += '\n';
    };
    template.content.childNodes.forEach(visit);
    return out.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
};

// Plain-text preview of either storage format (draft cards, tooltips, …).
export const richTextToPlain = (value: string) =>
    looksLikeRichHtml(value) ? richHtmlToPlainText(value) : value;
