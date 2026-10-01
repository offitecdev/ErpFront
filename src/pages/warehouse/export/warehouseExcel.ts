/**
 * ── DEPO: EXCEL (26.09.2026, Vorgabe Samet) ──────────────────────────────────
 *
 * «Satır satır PDF ve Excel indirilebilir olması lazım. Bir de bana Excel
 *  örneği indirme yeri olması lazım — ilk kullanımda elle girme olacak ve
 *  malzeme grubu seçilebilir olması lazım. Bir de biz bunları aktarmamız lazım.»
 *
 *   · Liste als Excel: eine Zeile je Karte, Codes als Text (die führende 0
 *     des GS1-Barcodes bleibt).
 *   · Vorlage: Blatt «Ürünler» mit Kopfzeile, Auswahllisten für Gruppe,
 *     Währung und Seriennummer (Excel-Datenüberprüfung), ein Blatt mit der
 *     Anleitung, die Listen auf einem ausgeblendeten Blatt.
 *   · Einlesen: die Kopfzeile wird in allen drei Sprachen erkannt.
 *
 * SheetJS (Community) schreibt keine Datenüberprüfung — sie wird nach dem
 * Schreiben in das XML des Blatts gesetzt (XLSX.CFB liest und packt die
 * Datei). Diese Datei wird erst beim Klick nachgeladen.
 */
import * as XLSX from 'xlsx';

import type { WarehouseCatalog, WarehouseImportRowInput, WarehouseProduct } from '@/types/warehouse';

import { groupTemplateLabel } from '../warehouseCodes';

export type ImportField =
    | 'group'
    | 'name'
    | 'brand'
    | 'modelNumber'
    | 'unit'
    | 'supplierName'
    | 'supplierEmail'
    | 'supplierArticleNumber'
    | 'supplierOrderNumber'
    | 'manufacturerBarcode'
    | 'description'
    | 'quantity'
    | 'purchasePrice'
    | 'currency'
    | 'serialRequired';

/**
 * Die Spalten der Vorlage, in dieser Reihenfolge. Der Herstellerbarcode steht
 * gleich neben dem Lieferanten: er gehört ihm (vierter Durchgang, «tedarikçiye
 * göre ürün barkodu»); ohne Lieferant gehört er der Karte.
 */
export const TEMPLATE_FIELDS: ImportField[] = [
    'group', 'name', 'brand', 'modelNumber', 'unit', 'supplierName', 'supplierEmail', 'supplierArticleNumber', 'supplierOrderNumber', 'manufacturerBarcode',
    'description', 'quantity', 'purchasePrice', 'currency', 'serialRequired',
];

/** Kopfzeilen in allen Sprachen (für das Einlesen einer beliebigen Vorlage). */
const HEADER_ALIASES: Record<ImportField, string[]> = {
    group: ['malzeme grubu', 'material group', 'materialgruppe', 'grup', 'group', 'gruppe'],
    name: ['ürün adı', 'urun adi', 'product name', 'produktname', 'name', 'ad', 'ürün'],
    brand: ['marka', 'ürün markası', 'brand', 'marke'],
    // «Üretici kodu» = früher «Model numarası» (derselbe Wert).
    modelNumber: ['üretici kodu', 'uretici kodu', 'manufacturer code', 'herstellercode', 'herstellernummer',
        'model numarası', 'model no', 'model', 'model number', 'modellnummer'],
    unit: ['birim', 'birim türü', 'unit', 'einheit'],
    supplierName: ['tedarikçi adı', 'tedarikçi', 'tedarikci', 'supplier name', 'supplier', 'lieferant', 'lieferantenname'],
    supplierEmail: ['tedarikçi e-postası', 'tedarikçi e-posta', 'tedarikçi maili', 'tedarikçi mail', 'e-posta', 'supplier e-mail', 'supplier email',
        'e-mail des lieferanten', 'e-mail', 'email', 'mail'],
    /* Artikel- und Bestellnummer DES Lieferanten der Zeile (01.10.2026). Die
       frühere Karten-Spalte «Ürün kodu» (30.09.) zählt als seine Artikelnummer —
       «ürün kodu da tedarikçiye özel» (Samet). */
    supplierArticleNumber: ['tedarikçi ürün tip no.', 'ürün tip no.', 'ürün tip numarası', 'supplier product type no.', 'product type no.',
        'produkttypnummer des lieferanten', 'produkttypnummer', 'produkttyp-nr.',
        'tedarikçi ürün no.', 'tedarikçi ürün no', 'tedarikçi ürün numarası', 'ürün no.', 'ürün no', 'ürün numarası',
        'supplier item no.', 'supplier item no', 'supplier item number', 'item no.', 'item number',
        'artikel-nr. des lieferanten', 'artikel-nr.', 'artikelnummer', 'article number',
        'ürün kodu', 'urun kodu', 'product code', 'produktcode'],
    supplierOrderNumber: ['tedarikçi ürün sip. no.', 'ürün sip. no.', 'ürün sip. numarası', 'supplier product order no.', 'product order no.',
        'bestellnummer des lieferanten',
        'tedarikçi sipariş no.', 'tedarikçi sipariş no', 'tedarikçi sipariş numarası', 'sipariş no.', 'sipariş no', 'sipariş numarası',
        'supplier order no.', 'supplier order no', 'supplier order number', 'order no.', 'order number',
        'bestell-nr. des lieferanten', 'bestell-nr.', 'bestellnummer'],
    // Die frühere Spalte «Tedarikçi ürün kodu» (Vorlage vor dem vierten Durchgang) war nach
    // Samet schon der Barcode des Lieferanten — sie zählt, wenn die Datei keine Barcodespalte hat.
    manufacturerBarcode: ['üretici barkodu', 'uretici barkodu', 'ürün barkodu', 'urun barkodu', 'tedarikçi barkodu', 'manufacturer barcode',
        'product barcode', 'supplier barcode', 'ean', 'herstellerbarcode', 'hersteller-barcode', 'produkt-barcode', 'barcode des lieferanten',
        'tedarikçi ürün kodu', 'tedarikçi numarası', 'supplier product code', 'artikelnummer des lieferanten'],
    description: ['açıklama', 'ürün açıklaması', 'aciklama', 'description', 'beschreibung'],
    quantity: ['miktar', 'adet', 'quantity', 'qty', 'menge', 'bestand'],
    purchasePrice: ['alış fiyatı', 'alis fiyati', 'fiyat', 'purchase price', 'price', 'einkaufspreis', 'preis'],
    currency: ['para birimi', 'döviz', 'currency', 'währung', 'waehrung'],
    serialRequired: ['seri numarası gerekli', 'seri no gerekli', 'seri numarası', 'serial number required', 'serial required', 'seriennummer nötig', 'seriennummer'],
};

const normalizeHeader = (value: unknown): string =>
    String(value ?? '')
        .replace(/[*:]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('tr-TR');

const today = () => new Date().toISOString().slice(0, 10);

const download = (data: ArrayBuffer | Uint8Array, fileName: string) => {
    // Eine Kopie als eigener ArrayBuffer (Blob nimmt keinen SharedArrayBuffer).
    const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
};

/* ═══════════════════════════════════════════════════════════════════════════
   1) LISTE ALS EXCEL
   ═════════════════════════════════════════════════════════════════════════ */

export interface ListExcelTexts {
    sheet: string;
    headers: {
        erpCode: string; barcode: string; name: string; category: string; group: string; brand: string; modelNumber: string;
        unit: string; supplier: string; supplierArticleNumbers: string; supplierOrderNumbers: string; makerBarcodes: string; description: string; quantity: string; purchasePrice: string; currency: string;
        serialRequired: string;
    };
    /** Die Einheiten in der Sprache der Oberfläche (PCS → «Adet» …). */
    units: Record<string, string>;
    yes: string;
    no: string;
    fileName: string;
}

/**
 * Die Herstellerbarcodes einer Karte in EINER Zelle: der ohne Lieferant
 * zuerst, dann «Lieferant: Barcode» je Lieferant (vierter Durchgang).
 */
const makerBarcodesText = (product: WarehouseProduct): string => [
    product.manufacturerBarcode ?? '',
    ...product.suppliers.map((entry) => (entry.barcode ? `${entry.name}: ${entry.barcode}` : '')),
].filter(Boolean).join('; ');

/** Artikel- bzw. Bestellnummern der Lieferanten in EINER Zelle: «Lieferant: Nummer; …» (01.10.2026). */
const supplierNumbersText = (product: WarehouseProduct, field: 'articleNumber' | 'orderNumber'): string =>
    product.suppliers.map((entry) => (entry[field] ? `${entry.name}: ${entry[field]}` : '')).filter(Boolean).join('; ');

export const downloadListExcel = (products: WarehouseProduct[], texts: ListExcelTexts) => {
    const h = texts.headers;
    const header = [h.erpCode, h.barcode, h.name, h.category, h.group, h.brand, h.modelNumber, h.unit, h.supplier,
        h.supplierArticleNumbers, h.supplierOrderNumbers, h.makerBarcodes,
        h.description, h.quantity, h.purchasePrice, h.currency, h.serialRequired];
    const rows = products.map((product) => [
        product.erpCode ?? '',
        product.barcode ?? '',
        product.name,
        product.materialGroup?.category?.name ?? '',
        product.materialGroup?.name ?? '',
        product.brand ?? '',
        product.modelNumber ?? '',
        product.unit ? texts.units[product.unit] ?? product.unit : '',
        // Mehrere Lieferanten: die Namen mit «; » getrennt, ihre Barcodes daneben.
        product.suppliers.map((entry) => entry.name).join('; '),
        supplierNumbersText(product, 'articleNumber'),
        supplierNumbersText(product, 'orderNumber'),
        makerBarcodesText(product),
        product.description ?? '',
        product.quantity,
        product.purchasePrice ?? '',
        product.purchasePrice !== null ? product.currency ?? '' : '',
        product.serialRequired ? texts.yes : texts.no,
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    // Codes bleiben Text — sonst verliert der Barcode seine führende 0.
    for (let index = 0; index < rows.length; index += 1) {
        for (const col of [0, 1, 9, 10, 11]) {
            const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: col })];
            if (cell) { cell.t = 's'; cell.z = '@'; }
        }
    }
    sheet['!cols'] = [18, 16, 40, 18, 22, 16, 18, 10, 24, 30, 30, 34, 48, 10, 12, 8, 12].map((wch) => ({ wch }));
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: header.length - 1 } }) };
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, texts.sheet.slice(0, 31));
    const out = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    download(freezeHeader(out, [1]), texts.fileName.replace('{date}', today()));
};

/* ═══════════════════════════════════════════════════════════════════════════
   2) DIE VORLAGE MIT AUSWAHLLISTEN
   ═════════════════════════════════════════════════════════════════════════ */

export interface TemplateTexts {
    productsSheet: string;
    helpSheet: string;
    headers: Record<ImportField, string>;
    /** Die Einheiten in der Sprache der Oberfläche — die Auswahl der Spalte «Birim». */
    units: Record<string, string>;
    yes: string;
    no: string;
    /** Die Anleitung, Zeile für Zeile (auf einem eigenen Blatt — ein Beispiel im
        Produktblatt würde beim Aktarım sonst mit übernommen). */
    help: string[];
    fileName: string;
}

const TEMPLATE_ROWS = 2000;
const CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'TRY'];

/** Das Nötigste des ZIP-Pakets (XLSX.CFB ist ungetypt). */
interface CfbContainer {
    FullPaths: string[];
    FileIndex: Array<{ content: unknown }>;
}

const readPackage = (data: Uint8Array): CfbContainer => XLSX.CFB.read(data, { type: 'array' }) as CfbContainer;
const writePackage = (cfb: CfbContainer): Uint8Array => XLSX.CFB.write(cfb, { type: 'array', fileType: 'zip' }) as Uint8Array;

/** Eine Datei im Paket (Pfad wie «xl/worksheets/sheet1.xml»). */
const entryOf = (cfb: CfbContainer, path: string) => {
    const index = cfb.FullPaths.findIndex((full) => full.endsWith(`/${path}`));
    return index >= 0 ? cfb.FileIndex[index] ?? null : null;
};

const readText = (content: unknown): string => new TextDecoder().decode(content as Uint8Array);

/* Die Reihenfolge der Elemente eines Blatts ist im Schema fest: alles, was
   nach der Datenüberprüfung kommen muss. */
const AFTER_VALIDATIONS = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks',
    '<colBreaks', '<customProperties', '<cellWatches', '<ignoredErrors', '<smartTags', '<drawing', '<legacyDrawing',
    '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst'];

const insertBeforeFirst = (xml: string, anchors: string[], snippet: string): string => {
    const positions = anchors.map((anchor) => xml.indexOf(anchor)).filter((position) => position >= 0);
    const at = positions.length ? Math.min(...positions) : xml.lastIndexOf('</worksheet>');
    return `${xml.slice(0, at)}${snippet}${xml.slice(at)}`;
};

/** Kopfzeile(n) fixieren: «sheetView» mit eingefrorenem Bereich (je Blatt 1-basiert). */
const freezeHeader = (data: ArrayBuffer, sheets: number[]): Uint8Array => {
    const cfb = readPackage(new Uint8Array(data));
    for (const number of sheets) {
        const entry = entryOf(cfb, `xl/worksheets/sheet${number}.xml`);
        if (!entry) continue;
        const xml = readText(entry.content).replace(
            /<sheetView ([^>]*?)\/>/,
            '<sheetView $1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>',
        );
        entry.content = new TextEncoder().encode(xml);
    }
    return writePackage(cfb);
};

export const downloadTemplate = (catalog: WarehouseCatalog, texts: TemplateTexts) => {
    const groupLabels = catalog.categories.flatMap((category) =>
        category.groups.filter((group) => group.code).map((group) => groupTemplateLabel(category, group)));

    // Blatt 1: die Produkte — nur die Kopfzeile, ausgefüllt wird von Hand.
    const header = TEMPLATE_FIELDS.map((field) => texts.headers[field]);
    const products = XLSX.utils.aoa_to_sheet([header]);
    products['!cols'] = [34, 34, 16, 18, 12, 24, 28, 20, 20, 18, 40, 10, 12, 12, 16].map((wch) => ({ wch }));

    // Blatt 2: Anleitung.
    const help = XLSX.utils.aoa_to_sheet(texts.help.map((line) => [line]));
    help['!cols'] = [{ wch: 110 }];

    // Blatt 3 (ausgeblendet): die Listen für die Auswahl.
    const unitLabels = Object.values(texts.units);
    const listRows = Math.max(groupLabels.length, CURRENCIES.length, unitLabels.length, 2);
    const lists = XLSX.utils.aoa_to_sheet(Array.from({ length: listRows }, (_, index) => [
        groupLabels[index] ?? null,
        CURRENCIES[index] ?? null,
        index === 0 ? texts.yes : index === 1 ? texts.no : null,
        unitLabels[index] ?? null,
    ]));

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, products, texts.productsSheet.slice(0, 31));
    XLSX.utils.book_append_sheet(book, help, texts.helpSheet.slice(0, 31));
    XLSX.utils.book_append_sheet(book, lists, 'Listeler');
    const names: Array<{ Name: string; Ref: string }> = [
        { Name: 'DepoParaBirimi', Ref: `Listeler!$B$1:$B$${CURRENCIES.length}` },
        { Name: 'DepoEvetHayir', Ref: 'Listeler!$C$1:$C$2' },
        { Name: 'DepoBirimler', Ref: `Listeler!$D$1:$D$${Math.max(1, unitLabels.length)}` },
    ];
    if (groupLabels.length) names.push({ Name: 'DepoMalzemeGruplari', Ref: `Listeler!$A$1:$A$${groupLabels.length}` });
    book.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }], Names: names };

    const written = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const cfb = readPackage(new Uint8Array(written));
    const sheet = entryOf(cfb, 'xl/worksheets/sheet1.xml');
    if (sheet) {
        const col = (field: ImportField) => XLSX.utils.encode_col(TEMPLATE_FIELDS.indexOf(field));
        const range = (field: ImportField) => `${col(field)}2:${col(field)}${TEMPLATE_ROWS + 1}`;
        const list = (field: ImportField, name: string) =>
            `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${range(field)}"><formula1>${name}</formula1></dataValidation>`;
        const rules = [
            ...(groupLabels.length ? [list('group', 'DepoMalzemeGruplari')] : []),
            list('currency', 'DepoParaBirimi'),
            list('serialRequired', 'DepoEvetHayir'),
            list('unit', 'DepoBirimler'),
            `<dataValidation type="decimal" operator="greaterThanOrEqual" allowBlank="1" showErrorMessage="1" sqref="${range('quantity')} ${range('purchasePrice')}"><formula1>0</formula1></dataValidation>`,
        ];
        let xml = readText(sheet.content);
        xml = insertBeforeFirst(xml, AFTER_VALIDATIONS, `<dataValidations count="${rules.length}">${rules.join('')}</dataValidations>`);
        xml = xml.replace(
            /<sheetView ([^>]*?)\/>/,
            '<sheetView $1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>',
        );
        sheet.content = new TextEncoder().encode(xml);
    }
    download(writePackage(cfb), texts.fileName);
};

/* ═══════════════════════════════════════════════════════════════════════════
   3) EINLESEN
   ═════════════════════════════════════════════════════════════════════════ */

export interface ParsedImport {
    rows: WarehouseImportRowInput[];
    /** Erkannte Spalten (für den Hinweis «nicht erkannt»). */
    mapped: ImportField[];
    sheetName: string;
}

const cellText = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    // Ein Barcode als Zahl (bis 21 Stellen ohne Exponent).
    if (typeof value === 'number') return String(value);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value).trim();
    return text || null;
};

/** Die Datei lesen: das erste Blatt, dessen Kopfzeile «Ürün adı» kennt. */
export const parseImportFile = async (file: File): Promise<ParsedImport | null> => {
    const data = await file.arrayBuffer();
    const book = XLSX.read(data, { type: 'array', cellDates: true });
    const hidden = new Set((book.Workbook?.Sheets ?? []).map((sheet, index) => (sheet.Hidden ? index : -1)).filter((index) => index >= 0));
    for (const [index, sheetName] of book.SheetNames.entries()) {
        if (hidden.has(index)) continue;
        const sheet = book.Sheets[sheetName];
        if (!sheet) continue;
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
        // Die Kopfzeile steht in den ersten fünf Zeilen.
        for (let headerRow = 0; headerRow < Math.min(5, matrix.length); headerRow += 1) {
            const cells = (matrix[headerRow] ?? []).map(normalizeHeader);
            const columns = new Map<ImportField, number>();
            (Object.keys(HEADER_ALIASES) as ImportField[]).forEach((field) => {
                // Die Namen in ihrer Reihenfolge: der genaueste zuerst (eine ältere
                // Spalte zählt nur, wenn die neuere fehlt).
                const at = HEADER_ALIASES[field].reduce<number>((found, alias) => (found >= 0 ? found : cells.indexOf(alias)), -1);
                if (at >= 0) columns.set(field, at);
            });
            if (!columns.has('name')) continue;
            const rows: WarehouseImportRowInput[] = [];
            for (let rowIndex = headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
                const line = matrix[rowIndex] ?? [];
                const row: WarehouseImportRowInput = { row: rowIndex + 1 };
                let filled = false;
                for (const [field, col] of columns) {
                    const value = line[col];
                    const text = field === 'quantity' || field === 'purchasePrice'
                        ? (typeof value === 'number' ? value : cellText(value))
                        : cellText(value);
                    if (text !== null && text !== '') filled = true;
                    (row as unknown as Record<string, unknown>)[field] = text;
                }
                if (filled) rows.push(row);
            }
            return { rows, mapped: [...columns.keys()], sheetName };
        }
    }
    return null;
};
