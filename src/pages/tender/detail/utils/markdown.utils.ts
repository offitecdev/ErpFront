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
        const bullet = line.match(/^\s*- (.*)$/);
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
