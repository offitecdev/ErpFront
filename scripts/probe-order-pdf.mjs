/**
 * PROBE DES BESTELL-PDF (07.09.2026)
 *
 * Erzeugt ein echtes PDF mit drei eigenen Spalten und prüft, was im Textlayer
 * wirklich steht: stehen die Überschriften NEBEN dem Produktnamen, stehen die
 * Werte in ihren Zeilen, und fällt zurück, was nicht mehr passt?
 *
 * Gebündelt wird mit rolldown; das PDF wird mit `unpdf` (Backend-Abhängigkeit)
 * wieder ausgelesen — dieselbe Bibliothek, die auch den Import liest.
 *
 * Aufruf: node scripts/probe-order-pdf.mjs
 */

import { rolldown } from 'rolldown';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');

/* Vite-eigene Einfuhren (`?url`, `?raw`, Schriften) kennt rolldown nicht — sie
   werden hier durch leere Stummel ersetzt. Geprüft wird der TEXTLAYER, und
   dafür braucht es weder Logo noch Wellenbild. */
const plugin = {
    name: 'stub',
    resolveId(source) {
        if (source === '@/i18n/translate') return '\0i18n';
        if (source.includes('?url') || source.includes('?raw') || /\.(png|jpe?g|svg|woff2?|ttf)$/.test(source)) {
            return `\0asset:${source}`;
        }
        if (source.startsWith('@/')) return `${path.join(src, source.slice(2))}.ts`;
        return null;
    },
    load(id) {
        if (id === '\0i18n') return 'export const t = (key) => key;';
        if (id.startsWith('\0asset:')) {
            /* Die SCHRIFTEN müssen echt sein — jsPDF misst mit ihnen, und ohne
               Mass stimmte keine Spaltenbreite. Sie kommen darum als Dateipfad
               zurück, den `fetch` unten in Bytes auflöst. Logo und Welle sind
               Bilder; für den Textlayer sind sie gleichgültig. */
            const source = id.slice('\0asset:'.length).split('?')[0];
            if (/\.ttf$/i.test(source)) {
                const file = path.resolve(src, 'utils/pdf', source);
                return `export default ${JSON.stringify(pathToFileURL(file).href)};`;
            }
            return 'export default "";';
        }
        return null;
    },
};

const bundle = await rolldown({
    input: path.join(src, 'utils/pdf/orderPdf.ts'),
    plugins: [plugin],
    platform: 'node',
});
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
/* Als DATEI, nicht als data:-URL: das Bündel ruft `createRequire(import.meta.url)`
   auf (jspdf zieht `fflate` über CommonJS herein), und das braucht einen echten
   Pfad. */
const tmpFile = path.join(here, '.probe-orderpdf.mjs');
fs.writeFileSync(tmpFile, output[0].code, 'utf8');
const mod = await import(pathToFileURL(tmpFile).href);
fs.rmSync(tmpFile, { force: true });

const results = [];
let failed = false;
const ok = (label, condition, extra = '') => {
    if (!condition) failed = true;
    results.push(`${condition ? 'OK  ' : 'FEHL'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const extras = (values) => [
    { key: 'x1', name: 'Herstellernr.', value: values[0] },
    { key: 'x2', name: 'Farbe', value: values[1] },
    { key: 'x3', name: 'Gewicht', value: values[2] },
];

const item = (code, name, values) => ({
    itemType: 'PRODUCT',
    articleId: null,
    code,
    serialNumber: null,
    name,
    quantity: 10,
    unit: 'Stk',
    grossPrice: 12.5,
    netPrice: 10,
    discount: 20,
    discount2: 0,
    discount3: 0,
    vatRate: 0,
    lineTotal: 100,
    lineVat: 0,
    calcMode: 'DIRECT',
    extras: extras(values),
});

const order = {
    id: 'p', tenantId: '', referenceNumber: 'BE-2026-00042',
    quoteNumber: null, orderedByName: 'Samet', projectName: 'Probe',
    recipientName: null, coverLetter: null, status: 'DRAFT',
    supplierId: null, supplierName: 'Muster Handels AG', supplierEmail: null,
    supplierAddress: 'Bahnhofstrasse 1\n8000 Zürich',
    items: [
        item('A-100', 'Schraube M6 verzinkt', ['MFR-4711', 'RAL 9010', '0.8 kg']),
        item('A-200', 'Mutter M6', ['MFR-4712', 'RAL 7016', '0.2 kg']),
    ],
    additionalFees: [], itemCount: 2, currency: 'CHF',
    vatMode: 'TOTAL', orderVatRate: 8.1, orderVatCountry: 'Schweiz',
    totalNet: 200, totalGross: 250, totalVat: 16.2, totalFees: 0, revision: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

const settings = {
    companyName: 'Offitec AG', street: 'Musterweg 3', postalCode: '8000', city: 'Zürich',
    country: 'Schweiz', phone: '', email: '', website: '', vatNumber: '', iban: '',
    currency: 'CHF', vatRate: 8.1, logoDataUrl: null,
};

/* `fetch` kennt keine file:-Adressen. Für die Schriften wird es hier auf das
   Dateisystem umgeleitet; alles andere (leere Bildstummel) gibt es leer. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
    const url = String(input ?? '');
    if (url.startsWith('file:')) {
        const buffer = fs.readFileSync(fileURLToPath(url));
        return new Response(buffer);
    }
    if (!url) return new Response(new ArrayBuffer(0));
    return realFetch(input, init);
};

const bytes = await mod.buildOrderPdfBytes(order, settings, 'de');
ok('PDF wurde erzeugt', bytes?.length > 1000, `${Math.round((bytes?.length ?? 0) / 1024)} KB`);

const outFile = path.join(here, '..', '..', '..', 'probe-bestellung.pdf');
fs.writeFileSync(outFile, Buffer.from(bytes));

/* `unpdf` gehört dem Server; von hier wird es über seinen Pfad geholt —
   dieselbe Bibliothek, die auch den Beleg-Import liest. */
const unpdfPath = pathToFileURL(path.join(here, '..', '..', '..', 'Erp_Backend', 'node_modules', 'unpdf', 'dist', 'index.mjs')).href;
const { extractText, getDocumentProxy } = await import(unpdfPath);
const pdf = await getDocumentProxy(new Uint8Array(bytes));
const { text } = await extractText(pdf, { mergePages: true });
const flat = String(text).replace(/\s+/g, ' ');

ok('Überschrift «Herstellernr.» steht im Blatt', flat.includes('Herstellernr'), '');
ok('Überschrift «Farbe» steht im Blatt', flat.includes('Farbe'));
ok('Wert MFR-4711 steht im Blatt', flat.includes('MFR-4711'));
ok('Wert RAL 9010 steht im Blatt', flat.includes('RAL 9010'));
ok('Beide Positionen sind da', flat.includes('Schraube M6') && flat.includes('Mutter M6'));
/* Die dritte Spalte passt neben Menge/Preisen/Rabatt/Betrag meist nicht mehr —
   dann muss sie UNTER dem Namen stehen, mit ihrer Überschrift davor. */
ok('Die dritte Angabe ist nicht verloren', flat.includes('0.8 kg'), '');
ok('Fällt sie zurück, trägt sie ihre Überschrift', !flat.includes('0.8 kg') || flat.includes('Gewicht'));

/* ── WO steht das alles? ───────────────────────────────────────────────────
   «Rechts neben dem Produktnamen» ist eine Aussage über die WAAGRECHTE, und
   die prüft nur, wer die Koordinaten ansieht. pdfjs gibt sie je Textstück in
   der Transformationsmatrix (Index 4 = x, 5 = y) zurück. */
const page = await pdf.getPage(2);
const content = await page.getTextContent();
const pieces = content.items
    .filter((entry) => String(entry.str ?? '').trim())
    .map((entry) => ({ text: String(entry.str).trim(), x: entry.transform[4], y: entry.transform[5] }));

const xOf = (needle) => pieces.find((piece) => piece.text.includes(needle))?.x ?? null;
const nameX = xOf('Schraube M6');
const mfrX = xOf('MFR-4711');
const colorX = xOf('RAL 9010');
const codeX = xOf('A-100');

ok('Der Produktname wurde auf der Seite gefunden', nameX !== null, String(nameX));
ok('Herstellernr. steht RECHTS vom Produktnamen',
    mfrX !== null && nameX !== null && mfrX > nameX, `Name ${nameX?.toFixed(1)} → Wert ${mfrX?.toFixed(1)}`);
ok('Farbe steht rechts von der Herstellernr.',
    colorX !== null && mfrX !== null && colorX > mfrX, `${mfrX?.toFixed(1)} → ${colorX?.toFixed(1)}`);
ok('Die eigenen Spalten stehen LINKS vom Produktcode',
    codeX !== null && colorX !== null && colorX < codeX, `${colorX?.toFixed(1)} → Code ${codeX?.toFixed(1)}`);
const weightX = xOf('0.8 kg');
ok('Auch die dritte Angabe ist eine SPALTE, keine Fussnote',
    weightX !== null && colorX !== null && weightX > colorX,
    weightX === null ? 'nicht gefunden' : `${colorX?.toFixed(1)} → ${weightX.toFixed(1)}`);
ok('Alle vier stehen auf DERSELBEN Zeile',
    [mfrX, colorX, codeX].every((x) => x !== null)
    && Math.abs((pieces.find((p) => p.text.includes('MFR-4711'))?.y ?? 0)
        - (pieces.find((p) => p.text.includes('Schraube M6'))?.y ?? 0)) < 0.5);

console.log(results.join('\n'));
console.log(`\nPDF liegt unter: ${outFile}`);
console.log(failed ? '\n>>> ES GIBT FEHLER' : '\n>>> alles gruen');
process.exit(failed ? 1 : 0);
