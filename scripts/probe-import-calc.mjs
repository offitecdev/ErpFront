/**
 * PROBE DER VORLAGE UND DER MENGENSTAFFEL (07.09.2026)
 *
 * Geprüft wird `pages/inventory/import/importTemplate.ts`:
 *   · welche Spaltenüberschriften an das Modell gehen (feste + eigene),
 *   · dass der Import NUR zuordnet und nichts vorrechnet,
 *   · dass die eigenen Angaben als eine Zeile unter dem Produktnamen landen,
 *   · dass die Mengenstaffel zur gewählten Menge den richtigen Preis findet.
 *
 * Gebündelt wird mit rolldown (liegt als Abhängigkeit von Vite bereits da);
 * `@/i18n/translate` wird durch einen Stummel ersetzt, der den Schlüssel
 * zurückgibt — die Probe prüft Verhalten, nicht Wortlaut.
 *
 * Aufruf: node scripts/probe-import-calc.mjs
 */

import { rolldown } from 'rolldown';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');

const stubPlugin = {
    name: 'stub',
    resolveId(source) {
        if (source === '@/i18n/translate') return '\0i18n-stub';
        // Der Alias trägt keine Endung — rolldown findet die Datei sonst nicht.
        if (source.startsWith('@/')) return `${path.join(src, source.slice(2))}.ts`;
        return null;
    },
    load(id) {
        if (id === '\0i18n-stub') return 'export const t = (key) => key;';
        return null;
    },
};

const bundle = await rolldown({
    input: path.join(src, 'pages/inventory/import/importTemplate.ts'),
    external: ['xlsx'],
    plugins: [stubPlugin],
});
const { output } = await bundle.generate({ format: 'esm' });
const module = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

const {
    templateColumns, extractedToDraftRow, repriceRow, previewTotals,
    resolveLinePrice, matchDocumentTier, rowPriceTiers, defaultCalcConfig, nextExtraKey,
    draftExtras, extrasFromItems,
} = module;

const results = [];
let failed = false;
const ok = (label, condition, extra = '') => {
    if (!condition) failed = true;
    results.push(`${condition ? 'OK  ' : 'FEHL'} ${label}${extra ? ` — ${extra}` : ''}`);
};
const near = (a, b, epsilon = 1e-6) => Math.abs(a - b) < epsilon;
const config = (patch = {}) => ({ ...defaultCalcConfig(8.1, 'Schweiz', 'CHF'), ...patch });

/* ═══ 1) WAS AN DAS MODELL GEHT ═══════════════════════════════════════════ */
let cols = templateColumns(config());
ok('Vorgabe: sieben feste Spalten', cols.length === 7, cols.map((c) => c.key).join(','));
ok('Vorgabe: Code, Bezeichnung, Menge, BEIDE Preise, Rabatt, Rabatt 2',
    cols.map((c) => c.key).join(',') === 'code,name,quantity,priceGross,priceNet,discount,discount2');
ok('Einzelpreis und Nettopreis stehen NEBENEINANDER',
    cols.findIndex((c) => c.key === 'priceNet') === cols.findIndex((c) => c.key === 'priceGross') + 1);
ok('Vorgabe: Menge und beide Preise sind Zahlen',
    ['quantity', 'priceGross', 'priceNet'].every((key) => cols.find((c) => c.key === key)?.type === 'number'));

cols = templateColumns(config({ discount2Enabled: false }));
ok('Rabatt 2 aus → er geht gar nicht erst mit', !cols.some((c) => c.key === 'discount2'), String(cols.length));

cols = templateColumns(config({
    extraColumns: [
        { key: 'x1', name: 'Herstellernummer', type: 'text' },
        { key: 'x2', name: '   ', type: 'text' },
        { key: 'x3', name: 'Gewicht', type: 'number' },
    ],
}));
ok('Eigene Angaben kommen dazu', cols.length === 9, cols.map((c) => c.key).join(','));
ok('Eine NAMENLOSE Angabe reist nicht mit', !cols.some((c) => c.key === 'x2'));
ok('Nie mehr als zehn Spalten', cols.length <= 10);
ok('Freier Schlüssel wird gefunden', nextExtraKey([{ key: 'x1' }, { key: 'x3' }]) === 'x2');
ok('Voll ist voll', nextExtraKey([{ key: 'x1' }, { key: 'x2' }, { key: 'x3' }]) === null);

/* ═══ 2) DER IMPORT ORDNET NUR ZU ═════════════════════════════════════════ */
const doc = {
    code: 'A-100',
    name: 'Schraube M6',
    quantity: 100,
    priceNet: 0.72,
    discount: 20,
    discount2: 5,
    x1: '4711',
    x3: '0.8',
};

let row = extractedToDraftRow(doc, config());
ok('Zuordnung: Code, Name, Menge', row.code === 'A-100' && row.name === 'Schraube M6' && row.quantity === '100');
ok('Nur der Nettopreis auf dem Beleg → nur die NETTOspalte',
    row.netPrice === '0.72' && row.grossPrice === '', `${row.grossPrice || '—'} / ${row.netPrice}`);
ok('Beide Rabatte kommen mit', row.discount === '20' && row.discount2 === '5');
ok('Der Betrag wird NIE übernommen — die Tabelle leitet ihn ab', row.lineTotal === '');
ok('Ohne Rechenmodus ist die Zeile eine manuelle Eingabe', row.calcMode === 'DIRECT');

row = extractedToDraftRow({ ...doc, priceGross: 0.9 }, config());
ok('Beide Preise auf dem Beleg → beide Spalten',
    row.grossPrice === '0.9' && row.netPrice === '0.72', `${row.grossPrice} / ${row.netPrice}`);

row = extractedToDraftRow(doc, config({ discount2Enabled: false }));
ok('Rabatt 2 aus → die Zelle bleibt leer', row.discount2 === '');

/* Der Rabatt der Vorlage ist eine EINSTELLUNG, keine Rechnung. */
row = extractedToDraftRow({ code: 'B-1', name: 'Ohne Rabatt', quantity: 4, priceNet: 100 },
    config({ discounts: [15, 5] }));
ok('Vorlagenrabatt füllt die leere Rabattzelle', row.discount === '15' && row.discount2 === '5');
ok('Vorlagenrabatt wird NICHT in den Preis gerechnet', row.netPrice === '100');

/* Ein fehlender Code bleibt leer — der Server vergibt ihn beim Speichern. */
row = extractedToDraftRow({ name: 'Ohne Nummer', quantity: 1, priceNet: 5 }, config());
ok('Fehlender Produktcode bleibt leer (der Server vergibt ihn)', row.code === '');

/* Die Rechenart der Seite reist mit. */
ok('Läuft der Rechenmodus, kommt die Zeile in derselben Art herein',
    extractedToDraftRow(doc, config(), 'SUPPLIER').calcMode === 'SUPPLIER');

/* ═══ 3) DIE EIGENEN ANGABEN → EIGENE SPALTEN ════════════════════════════ */
const withExtras = config({
    extraColumns: [
        { key: 'x1', name: 'Herstellernummer', type: 'text' },
        { key: 'x3', name: 'Gewicht', type: 'number' },
    ],
});
row = extractedToDraftRow(doc, withExtras);
ok('Eigene Angaben landen in ihren ZELLEN, nicht unter dem Namen',
    row.extras?.x1 === '4711' && row.extras?.x3 === '0.8' && row.serialNumber === '',
    JSON.stringify(row.extras));

const saved = draftExtras(row, withExtras.extraColumns);
ok('Beim Speichern reisen Überschrift UND Reihenfolge mit',
    saved.map((entry) => entry.name).join(',') === 'Herstellernummer,Gewicht'
    && saved[0].value === '4711',
    saved.map((entry) => entry.name + '=' + entry.value).join(' · '));

/* Die Reihenfolge der Vorlage IST die Reihenfolge der Spalten. */
const swapped = config({ extraColumns: [...withExtras.extraColumns].reverse() });
ok('Umgestellte Vorlage → umgestellte Spalten',
    draftExtras(extractedToDraftRow(doc, swapped), swapped.extraColumns)
        .map((entry) => entry.name).join(',') === 'Gewicht,Herstellernummer');

ok('Eine leere Angabe erzeugt keine leere Spalte',
    draftExtras(extractedToDraftRow({ code: 'C', name: 'Leer', quantity: 1, priceNet: 1 }, withExtras), withExtras.extraColumns).length === 0);

/* Eine geladene Bestellung bringt ihre EIGENEN Überschriften mit. */
ok('Geladene Bestellung behält ihre Spaltennamen',
    extrasFromItems([{ extras: [{ key: 'x1', name: 'Alte Bezeichnung', value: 'a' }] }])
        .map((column) => column.name).join(',') === 'Alte Bezeichnung');

/* ═══ 4) DIE MENGENSTAFFEL ════════════════════════════════════════════════ */
const docTiers = [
    { minQuantity: 1, unitPrice: 10 },
    { minQuantity: 10, unitPrice: 9 },
    { minQuantity: 100, unitPrice: 7.5 },
];
ok('Staffel: 7 Stück → die Stufe ab 1', matchDocumentTier(docTiers, 7)?.unitPrice === 10);
ok('Staffel: 10 Stück → die Stufe ab 10 (Grenze zählt)', matchDocumentTier(docTiers, 10)?.unitPrice === 9);
ok('Staffel: 99 Stück → immer noch ab 10', matchDocumentTier(docTiers, 99)?.unitPrice === 9);
ok('Staffel: 500 Stück → die höchste erreichte', matchDocumentTier(docTiers, 500)?.unitPrice === 7.5);
ok('Staffel: 0 Stück → keine', matchDocumentTier(docTiers, 0) === null);
ok('Staffel: unsortiert liefert dasselbe', matchDocumentTier([...docTiers].reverse(), 50)?.unitPrice === 9);
ok('Staffel aus der Antwort gelesen', rowPriceTiers({ priceTiers: docTiers }).length === 3);
ok('Unsinn in der Staffel fliegt raus',
    rowPriceTiers({ priceTiers: [{ minQuantity: 0, unitPrice: 5 }, { minQuantity: 5, unitPrice: 0 }, { minQuantity: 5, unitPrice: 2 }] }).length === 1);

const line = { netPrice: 80, discount: 12, discount2: 3, priceTiers: [] };
let priced = resolveLinePrice(line, 5, config());
ok('Keine Stufe erreicht → die Zeile bleibt, wie sie ist',
    priced.netPrice === 80 && priced.discount === 12 && priced.rule === 'base');

priced = resolveLinePrice({ ...line, priceTiers: docTiers }, 100, config());
ok('Belegstaffel setzt den Preis und löscht die Rabatte',
    priced.netPrice === 7.5 && priced.discount === 0 && priced.rule === 'documentTier');

priced = resolveLinePrice({ ...line, priceTiers: docTiers }, 100,
    config({ qtyTiers: [{ minQuantity: 50, discount: 0, unitPrice: 6 }] }));
ok('Lieferantenpreis schlägt die Belegstaffel', priced.netPrice === 6 && priced.rule === 'supplierTierPrice');

priced = resolveLinePrice(line, 100, config({ qtyTiers: [{ minQuantity: 50, discount: 30, unitPrice: 0 }] }));
ok('Staffelrabatt ersetzt Rabatt 1, Rabatt 2 bleibt',
    priced.discount === 30 && priced.discount2 === 3 && priced.rule === 'supplierTierDiscount');

/* ═══ 5) MENGE GEÄNDERT → PREIS NEU NACHGESCHLAGEN ════════════════════════ */
const tiered = { code: 'A-100', name: 'Schraube', quantity: 100, priceNet: 0.72, priceTiers: docTiers };
const base = extractedToDraftRow(tiered, config());
ok('Import lässt die Staffel an der Zeile mitreisen', base.priceTiers?.length === 3);

let repriced = repriceRow({ ...base, quantity: '500' }, config());
ok('Menge 500 → der Preis fällt auf 7.5', repriced.netPrice === '7.5' && repriced.priceTierFrom === 100);

repriced = repriceRow({ ...base, quantity: '10' }, config());
ok('Menge 10 → zurück auf 9', repriced.netPrice === '9' && repriced.priceTierFrom === 10);

const plain = extractedToDraftRow({ code: 'B-1', name: 'Ohne Staffel', quantity: 3, priceNet: 5 }, config());
const untouched = repriceRow({ ...plain, quantity: '900' }, config());
ok('Zeile ohne Staffel bleibt unangetastet',
    untouched.netPrice === plain.netPrice && untouched.discount === plain.discount && untouched.quantity === '900');

const supplierOnly = config({ qtyTiers: [{ minQuantity: 20, discount: 25, unitPrice: 0 }] });
const withSupplierTier = repriceRow(
    { ...extractedToDraftRow({ code: 'C-1', name: 'Nur Lieferantenstaffel', quantity: 1, priceNet: 200 }, supplierOnly), quantity: '20' },
    supplierOnly,
);
ok('Lieferantenstaffel greift auch ohne Belegstaffel', withSupplierTier.discount === '25', withSupplierTier.discount);

/* ═══ 6) SUMMEN DER VORSCHAU ══════════════════════════════════════════════ */
const rows = [
    extractedToDraftRow({ code: 'A', name: 'A', quantity: 10, priceNet: 8 }, config()),
    extractedToDraftRow({ code: 'B', name: 'B', quantity: 5, priceNet: 20 }, config()),
];
const totals = previewTotals(rows, 8.1);
ok('Summe: netto 10×8 + 5×20 = 180', near(totals.net, 180), String(totals.net));
ok('Summe: MwSt 8.1% auf 180', near(totals.vat, 14.58), String(totals.vat));
ok('Summe: Gesamt 194.58', near(totals.grand, 194.58), String(totals.grand));
ok('Summe: leere Liste ergibt 0', previewTotals([], 8.1).grand === 0);

console.log(results.join('\n'));
console.log(failed ? '\n>>> ES GIBT FEHLER' : '\n>>> alles gruen');
process.exit(failed ? 1 : 0);
