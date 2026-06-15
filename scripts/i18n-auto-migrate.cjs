const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(repoRoot, 'src');
const localeDir = path.join(srcRoot, 'i18n', 'locales');
const cachePath = path.join(repoRoot, '.i18n-translate-cache.json');

const targetRoots = [
    path.join(srcRoot, 'pages'),
    path.join(srcRoot, 'components', 'layout'),
    path.join(srcRoot, 'components', 'billing'),
    path.join(srcRoot, 'components', 'ui-shared'),
];

const targetFiles = [
    path.join(srcRoot, 'components', 'QRScanner.tsx'),
];

const jsxAttrNames = new Set([
    'title',
    'description',
    'placeholder',
    'aria-label',
    'label',
    'hint',
    'error',
    'emptyText',
    'subtitle',
]);

const humanPropNames = new Set([
    'title',
    'description',
    'message',
    'label',
    'placeholder',
    'hint',
    'error',
    'emptyText',
    'subject',
    'subtitle',
]);

const technicalPropNames = new Set([
    'id',
    'key',
    'path',
    'permission',
    'feature',
    'className',
    'iconClassName',
    'cardClassName',
    'type',
    'variant',
    'size',
    'color',
    'tone',
    'status',
    'category',
    'method',
    'url',
    'href',
    'to',
    'rel',
    'target',
    'download',
    'fileType',
    'role',
    'mode',
    'currency',
    'locale',
    'format',
    'placement',
    'value',
    'code',
    'accessor',
    'name',
]);

const trSpecial = /[ÇĞİÖŞÜçğıöşü]/;
const letter = /\p{L}/u;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, out);
        else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
    }
    return out;
}

function cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function isAllCapsToken(text) {
    return /^[A-Z0-9_./:-]+$/.test(text) && !/\s/.test(text);
}

function looksHuman(text, context = 'string') {
    const s = cleanText(text);
    if (s.length < 2) return false;
    if (!letter.test(s)) return false;
    if (/^[-_/\\.#:$%0-9{}()[\],]+$/.test(s)) return false;
    if (/^https?:\/\//i.test(s)) return false;
    if (/^\/[a-z0-9/_:-]+$/i.test(s)) return false;
    if (/^[a-z0-9_.:-]+\.[a-z0-9_.:-]+$/i.test(s)) return false;
    if (isAllCapsToken(s) && s.length < 24) return false;
    if (context === 'jsx') return true;
    if (trSpecial.test(s)) return true;
    if (/\s/.test(s)) return true;
    if (/[.!?]/.test(s)) return true;
    return /^[A-Z][\p{L}0-9%/().,-]+$/u.test(s) && s.length > 2;
}

function propName(node) {
    if (!node) return null;
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
    return null;
}

function parentPropName(node) {
    const parent = node.parent;
    if (parent && ts.isPropertyAssignment(parent) && parent.initializer === node) {
        return propName(parent.name);
    }
    return null;
}

function shouldSkipString(node, sourceFile) {
    const parent = node.parent;
    if (!parent) return true;
    if (
        ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        ts.isExternalModuleReference(parent) ||
        ts.isLiteralTypeNode(parent)
    ) return true;
    if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
    if (ts.isElementAccessExpression(parent)) return true;
    if (ts.isJsxAttribute(parent)) return true;
    if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
        const expressionText = parent.expression.getText(sourceFile);
        if (/^(t|i18nT)$/.test(expressionText) || /\.t$/.test(expressionText)) return true;
    }
    const name = parentPropName(node);
    if (name && technicalPropNames.has(name) && !humanPropNames.has(name)) return true;
    return false;
}

function flattenStrings(obj, prefix = '', out = []) {
    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) flattenStrings(value, next, out);
        else if (typeof value === 'string') out.push([next, value]);
    }
    return out;
}

function setPath(obj, dotted, value) {
    const parts = dotted.split('.');
    let current = obj;
    for (const part of parts.slice(0, -1)) {
        if (!current[part] || typeof current[part] !== 'object') current[part] = {};
        current = current[part];
    }
    current[parts[parts.length - 1]] = value;
}

function slugify(text) {
    const normalized = text
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return (normalized || 'text').slice(0, 48);
}

function keyFor(text, reverse, allocated) {
    const existing = reverse.get(text);
    if (existing) return existing;
    const hash = crypto.createHash('sha1').update(text).digest('hex').slice(0, 8);
    const base = `auto.${slugify(text)}_${hash}`;
    let key = base;
    let n = 2;
    while (allocated.has(key)) key = `${base}_${n++}`;
    allocated.add(key);
    return key;
}

function replacementFor(text, context, reverse, allocated, newEntries, callName) {
    const clean = cleanText(text);
    const key = keyFor(clean, reverse, allocated);
    if (!reverse.has(clean)) newEntries.set(key, clean);
    const call = `${callName}('${key}')`;
    return context === 'jsxText' ? `{${call}}` : call;
}

function collectReplacements(file, reverse, allocated, newEntries) {
    const source = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const replacements = [];
    const hasLocalT = /const\s*\{\s*t\b/.test(source) || /function\s+t\s*\(/.test(source);
    const hasHelperImport = source.includes('@/i18n/translate');
    const callName = hasLocalT ? 'i18nT' : 't';

    function add(start, end, text, context) {
        const clean = cleanText(text);
        if (!looksHuman(clean, context === 'jsxText' ? 'jsx' : 'string')) return;
        const replacement = replacementFor(clean, context, reverse, allocated, newEntries, callName);
        replacements.push({ start, end, replacement });
    }

    function visit(node) {
        if (ts.isJsxText(node)) {
            add(node.getFullStart(), node.end, node.getText(sourceFile), 'jsxText');
        }

        if (ts.isJsxAttribute(node) && jsxAttrNames.has(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
            add(node.initializer.getFullStart(), node.initializer.end, node.initializer.text, 'expression');
        }

        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !shouldSkipString(node, sourceFile)) {
            const parent = node.parent;
            const parentName = parentPropName(node);
            const isToastArg = ts.isCallExpression(parent) && /toast\.(error|success|info|warning)|alert|confirm/.test(parent.expression.getText(sourceFile));
            if (isToastArg || (parentName && humanPropNames.has(parentName)) || looksHuman(node.text, 'string')) {
                add(node.getFullStart(), node.end, node.text, 'expression');
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    if (!replacements.length) return false;

    replacements.sort((a, b) => b.start - a.start);
    let next = source;
    for (const r of replacements) {
        next = `${next.slice(0, r.start)}${r.replacement}${next.slice(r.end)}`;
    }

    if (!hasHelperImport) {
        const importLine = hasLocalT
            ? "import { t as i18nT } from '@/i18n/translate';\n"
            : "import { t } from '@/i18n/translate';\n";
        const lastImport = [...next.matchAll(/^import[\s\S]*?;\s*$/gm)].pop();
        if (lastImport) {
            const pos = lastImport.index + lastImport[0].length;
            next = `${next.slice(0, pos)}\n${importLine}${next.slice(pos)}`;
        } else {
            next = `${importLine}${next}`;
        }
    }

    if (next !== source) fs.writeFileSync(file, next, 'utf8');
    return next !== source;
}

async function translate(text, targetLang, cache) {
    const cacheKey = `${targetLang}:${text}`;
    if (cache[cacheKey]) return cache[cacheKey];
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`translate ${targetLang} failed: ${response.status}`);
    const json = await response.json();
    const translated = json[0].map((part) => part[0]).join('');
    cache[cacheKey] = translated;
    return translated;
}

async function main() {
    const tr = readJson(path.join(localeDir, 'tr.json'));
    const en = readJson(path.join(localeDir, 'en.json'));
    const de = readJson(path.join(localeDir, 'de.json'));

    const reverse = new Map();
    for (const [key, value] of flattenStrings(tr)) {
        if (!reverse.has(value)) reverse.set(value, key);
    }

    const allocated = new Set(flattenStrings(tr).map(([key]) => key));
    const newEntries = new Map();
    const files = [...new Set([...targetRoots.flatMap((root) => walk(root)), ...targetFiles].filter((file) => fs.existsSync(file)))];

    let touched = 0;
    for (const file of files) {
        if (collectReplacements(file, reverse, allocated, newEntries)) touched++;
    }

    const cache = fs.existsSync(cachePath) ? readJson(cachePath) : {};
    let translated = 0;
    for (const [key, sourceText] of newEntries) {
        setPath(tr, key, sourceText);
        setPath(en, key, await translate(sourceText, 'en', cache));
        setPath(de, key, await translate(sourceText, 'de', cache));
        translated++;
        if (translated % 50 === 0) {
            writeJson(cachePath, cache);
            console.log(`translated ${translated}/${newEntries.size}`);
        }
    }

    writeJson(path.join(localeDir, 'tr.json'), tr);
    writeJson(path.join(localeDir, 'en.json'), en);
    writeJson(path.join(localeDir, 'de.json'), de);
    writeJson(cachePath, cache);
    console.log(`touched files: ${touched}`);
    console.log(`new keys: ${newEntries.size}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
