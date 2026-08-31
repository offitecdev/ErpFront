/**
 * Produkt-Upload — Datei lesen, Spalten erkennen, Zeilen aufbereiten.
 *
 * Reine Funktionen ohne React: die Seite zeigt nur an, was hier herauskommt.
 *
 * WARUM EIN EIGENER CSV-LESER statt des vorhandenen `readSpreadsheetFile`?
 * Der Tabellen-Leser lässt `xlsx` die Zelltypen RATEN. Das ist für Zahlenspalten
 * praktisch, für diese Datei aber gefährlich: Artikelnummern wie "4316/2" oder
 * "1/4" liest die Bibliothek als DATUM, und aus einem Namen wird stillschweigend
 * eine Zahl. Eine CSV ist Text — hier wird sie genau so gelesen (RFC 4180), und
 * nur die Preisspalten werden bewusst in Zahlen übersetzt. `.xlsx` gibt es
 * weiterhin über den gemeinsamen Leser, dort führt kein anderer Weg hin.
 */

import type { ParsedSheet } from '@/pages/inventory/types';

/** Zielfelder des Uploads. Bestand ist NICHT dabei — er ist immer 0. */
export type UploadField = 'articleCode' | 'name' | 'salePrice' | 'purchasePrice' | 'unit' | 'image';

export const UPLOAD_FIELDS: UploadField[] = ['articleCode', 'name', 'salePrice', 'purchasePrice', 'unit', 'image'];

/** Ohne diese Spalte ergibt die Datei keinen Produktstamm. */
export const REQUIRED_FIELDS: UploadField[] = ['name'];

/**
 * Erkannte Spaltenüberschriften je Zielfeld, normalisiert verglichen.
 * Die erste Liste ist die des Odoo-Exports ("Produkt (product.template)"), die
 * übrigen fangen die Exporte ab, die dieselbe Datei in einer anderen Sprache
 * oder aus einem anderen System liefert.
 */
const HEADER_ALIASES: Record<UploadField, string[]> = {
    articleCode: [
        'interne referenz', 'internal reference', 'default code', 'referenz',
        'artikelnummer', 'artikelnr', 'produkt id', 'produktnummer',
        'urun kodu', 'stok kodu', 'kod', 'code', 'sku', 'article code',
    ],
    name: [
        'name', 'bezeichnung', 'produkt', 'produktname', 'artikel', 'artikelbezeichnung',
        'product name', 'urun adi', 'ad', 'isim',
    ],
    salePrice: [
        'verkaufspreis', 'vk preis', 'vkpreis', 'listenpreis', 'preis',
        'sale price', 'sales price', 'list price', 'price',
        'satis fiyati', 'fiyat',
    ],
    purchasePrice: [
        'kosten', 'kostenpreis', 'einkaufspreis', 'ek preis', 'ekpreis',
        'durchschnittskosten', 'durchschnittspreis',
        'cost', 'costs', 'unit cost', 'average cost', 'standard price', 'purchase price',
        'maliyet', 'birim maliyet', 'alis fiyati', 'ortalama maliyet',
    ],
    unit: [
        'masseinheit', 'maszeinheit', 'einheit', 'mengeneinheit',
        'unit', 'uom', 'unit of measure', 'birim',
    ],
    image: [
        'bild', 'bilder', 'produktbild', 'image', 'image 1920', 'image 128',
        'photo', 'picture', 'gorsel', 'resim', 'foto',
    ],
};

/** Überschriften vergleichbar machen: Umlaute/Sonderzeichen fallen weg. */
const normalize = (value: string): string =>
    value
        .toLowerCase()
        .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
        .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ş/g, 's')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

/**
 * Spalte je Zielfeld (-1 = nicht gefunden). Eine Überschrift wird nur EINMAL
 * vergeben; genaue Treffer gehen den "beginnt mit"-Treffern vor, damit
 * "Verkaufspreis" nicht an `purchasePrice` fällt, bloss weil dort auch "preis"
 * in der Liste steht.
 */
export type UploadMapping = Record<UploadField, number>;

export const mapColumns = (headers: string[]): UploadMapping => {
    const normalized = headers.map(normalize);
    const mapping = Object.fromEntries(UPLOAD_FIELDS.map((field) => [field, -1])) as UploadMapping;
    const used = new Set<number>();

    const claim = (field: UploadField, matches: (header: string, alias: string) => boolean) => {
        if (mapping[field] !== -1) return;
        for (const alias of HEADER_ALIASES[field]) {
            const index = normalized.findIndex((header, position) =>
                !used.has(position) && header && matches(header, alias));
            if (index !== -1) {
                mapping[field] = index;
                used.add(index);
                return;
            }
        }
    };

    // Erst alle exakten Treffer, dann erst die unscharfen — sonst schnappt sich
    // das zuerst geprüfte Feld eine Spalte, die exakt zu einem späteren passt.
    for (const field of UPLOAD_FIELDS) claim(field, (header, alias) => header === alias);
    for (const field of UPLOAD_FIELDS) claim(field, (header, alias) => header.startsWith(`${alias} `));
    for (const field of UPLOAD_FIELDS) claim(field, (header, alias) => header.includes(alias));

    return mapping;
};

/* ── Bilder ──────────────────────────────────────────────────────────────────
   Der Export liefert das Bild als nacktes Base64 OHNE Kopf ("UklGR..."), der
   Artikelstamm erwartet eine data-URI mit Typ. Der Typ wird an der Signatur
   der Bytes erkannt, nicht geraten — ein falsch deklariertes Bild lehnt der
   Server ab und die Zeile wäre ohne Not verloren. */

/** Grenze des Artikelstamms (shared/articleImage.ts) — hier gespiegelt. */
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const BASE64_PREFIX_TYPES: Array<[string, string]> = [
    ['iVBORw0KGgo', 'image/png'],
    ['/9j/', 'image/jpeg'],
    ['R0lGOD', 'image/gif'],
];

const decodedByteLength = (base64: string): number => {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
};

/** RIFF-Container: erst ab "WEBP" an Byte 8 ist es wirklich ein WebP. */
const isWebp = (base64: string): boolean => {
    try {
        return atob(base64.slice(0, 24)).slice(8, 12) === 'WEBP';
    } catch {
        return false;
    }
};

export type ImageResult =
    | { kind: 'none' }
    | { kind: 'ok'; dataUrl: string }
    /** Die Zelle enthält gar keine Bilddaten, sondern Text. Bei Odoo-Exporten ist
        das der Regelfall für grosse Bilder: die Zelle trägt dann den Hinweis
        "Der Inhalt dieser Zelle ist zu lang für eine XLSX-Datei" — das Bild hat
        die EXPORTIERENDE Seite weggelassen, nicht dieser Upload. */
    | { kind: 'notExported' }
    | { kind: 'unsupported' }
    | { kind: 'tooLarge' };

/** Zellwert → data-URI. Bereits fertige data-URIs kommen unverändert durch. */
export const toImageDataUrl = (cell: string): ImageResult => {
    const value = cell.trim().replace(/\s+/g, '');
    if (!value) return { kind: 'none' };

    if (value.startsWith('data:')) {
        const separator = value.indexOf(',');
        const base64 = separator === -1 ? '' : value.slice(separator + 1);
        if (!/^data:image\/(png|jpeg|gif|webp);base64,/.test(value) || !base64) return { kind: 'unsupported' };
        return decodedByteLength(base64) > IMAGE_MAX_BYTES ? { kind: 'tooLarge' } : { kind: 'ok', dataUrl: value };
    }

    if (!/^[A-Za-z0-9+/]+=*$/.test(value)) return { kind: 'notExported' };

    const prefixType = BASE64_PREFIX_TYPES.find(([prefix]) => value.startsWith(prefix))?.[1]
        ?? (value.startsWith('UklGR') && isWebp(value) ? 'image/webp' : null);
    if (!prefixType) return { kind: 'unsupported' };
    if (decodedByteLength(value) > IMAGE_MAX_BYTES) return { kind: 'tooLarge' };

    return { kind: 'ok', dataUrl: `data:${prefixType};base64,${value}` };
};

/* ── Artikelnummern für Zeilen ohne interne Referenz ──────────────────────────
   Ein Drittel der Beispieldatei trägt keine interne Referenz, der Artikelstamm
   braucht aber je Ware eine eindeutige Nummer. Sie wird aus dem NAMEN abgeleitet
   (FNV-1a, Base36) statt fortlaufend vergeben: dieselbe Datei ergibt damit
   zweimal dieselbe Nummer, ein zweiter Upload legt die Ware also nicht ein
   zweites Mal an, sondern trifft die vorhandene.

   KEIN Vorsatz davor (Vorgabe 17.08.2026): die Nummer soll wie jede andere
   Artikelnummer aussehen, nicht wie ein Vermerk. Welche Zeile ihre Nummer
   abgeleitet bekommen hat, sagt in der Vorschau das Fähnchen NEBEN der Nummer —
   dort steht es, ohne in den Stammdaten zu landen.

   Die 7 Stellen bleiben: der volle 32-Bit-Raum (0000000…1Z141Z3) macht ein
   Zusammentreffen mit einer echten Referenz unwahrscheinlich, und die echten
   Referenzen dieser Datei sind sechsstellige Zahlen — sie liegen also gar nicht
   erst im selben Muster. */

const fnv1a = (value: string): number => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

export const generateArticleCode = (name: string, repeat: number): string => {
    const base = fnv1a(normalize(name)).toString(36).toUpperCase().padStart(7, '0');
    return repeat > 0 ? `${base}-${repeat + 1}` : base;
};

/* ── Spaltenlängen ───────────────────────────────────────────────────────────
   `Article.name`, `.articleCode` und `.unit` sind VARCHAR(191) (Prisma-Vorgabe
   für Text ohne eigene Längenangabe). Längeres lehnt die Datenbank ab — und
   weil ein Paket mit EINER Anweisung geschrieben wird, riss eine einzige zu
   lange Bezeichnung ihre 199 Nachbarn mit (17.08.2026: 4 lange Namen kosteten
   600 Zeilen). Deshalb wird hier gekürzt, BEVOR etwas losgeschickt wird.

   Die Bezeichnung geht dabei nicht verloren: der vollständige Text wandert in
   die BESCHREIBUNG des Produkts (`@db.Text`, ohne Längengrenze). Die vier
   betroffenen Zeilen der Beispieldatei sind ohnehin keine Namen, sondern ganze
   Datenblätter — dort gehören sie hin.

   Gezählt wird in JS-Einheiten, die Datenbank zählt ZEICHEN: ein Zeichen
   ausserhalb der Grundebene wiegt hier 2 und dort 1. Die Schätzung liegt damit
   immer auf der sicheren Seite. */

export const COLUMN_MAX_CHARS = 191;

const fitColumn = (value: string): string => {
    if (value.length <= COLUMN_MAX_CHARS) return value;
    let end = COLUMN_MAX_CHARS;
    // Nicht mitten in einem Ersatzzeichenpaar schneiden — das ergäbe ein
    // halbes Zeichen, das je nach Anzeige als Fragezeichen erscheint.
    const code = value.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    return value.slice(0, end).trimEnd();
};

/* ── Zeilen ─────────────────────────────────────────────────────────────────*/

export interface UploadRow {
    /** Zeilennummer der Datei (Kopfzeile nicht mitgezählt) — für die Fehlerliste. */
    sourceRow: number;
    articleCode: string;
    /** true = aus dem Namen abgeleitet, die Datei trug keine interne Referenz. */
    generatedCode: boolean;
    name: string;
    /** Gesetzt, wenn die Bezeichnung gekürzt wurde: der VOLLE Text. */
    description: string | null;
    /** true = die Bezeichnung passte nicht in die Spalte und wurde gekürzt. */
    nameShortened: boolean;
    salePrice: number;
    purchasePrice: number;
    unit: string | null;
    imageUrl: string | null;
}

export interface UploadPreview {
    fileName: string;
    headers: string[];
    mapping: UploadMapping;
    rows: UploadRow[];
    /** Datenzeilen der Datei (vor allen Abzügen). */
    totalRows: number;
    /** Verworfen, weil ohne Namen — daraus wird kein Produkt. */
    droppedNoName: number;
    /** Verworfen, weil die Artikelnummer weiter oben schon vorkam. */
    droppedDuplicate: number;
    withImage: number;
    /** Bild vorhanden, aber unbrauchbar (Format/Grösse) — Zeile bleibt. */
    imagesSkipped: number;
    /** Bildspalte gefüllt, aber ohne Bilddaten — die Quelle hat es weggelassen. */
    imagesNotExported: number;
    generatedCodes: number;
    /** Bezeichnung war zu lang; voller Text steht in der Beschreibung. */
    namesShortened: number;
}

/** "1'234.50", "1.234,50", "211.60" → Zahl. Unlesbares wird 0. */
export const parsePrice = (value: string): number => {
    const raw = value.trim().replace(/[\s'’]/g, '');
    if (!raw) return 0;
    // Beide Trennzeichen vorhanden: das WEITER RECHTS stehende ist das Komma.
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    let normalized = raw;
    if (lastComma !== -1 && lastDot !== -1) {
        normalized = lastComma > lastDot
            ? raw.replace(/\./g, '').replace(',', '.')
            : raw.replace(/,/g, '');
    } else if (lastComma !== -1) {
        // Nur Kommas: eines ist Dezimaltrenner, mehrere sind Tausendertrenner.
        normalized = raw.split(',').length === 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Kopfzeile + Zeilen → Vorschau. Zeilen ohne Namen und Wiederholungen derselben
 * Artikelnummer fallen heraus (die ERSTE Zeile gewinnt) — beides wird gezählt
 * und angezeigt, damit ein stiller Verlust nicht möglich ist.
 */
export const buildPreview = (fileName: string, headers: string[], rows: string[][]): UploadPreview => {
    const mapping = mapColumns(headers);
    const cell = (row: string[], field: UploadField): string => {
        const index = mapping[field];
        return index === -1 ? '' : (row[index] ?? '');
    };

    const prepared: UploadRow[] = [];
    const seenCodes = new Set<string>();
    const nameRepeats = new Map<string, number>();
    let droppedNoName = 0;
    let droppedDuplicate = 0;
    let withImage = 0;
    let imagesSkipped = 0;
    let imagesNotExported = 0;
    let generatedCodes = 0;
    let namesShortened = 0;

    rows.forEach((row, index) => {
        const fullName = cell(row, 'name').trim();
        if (!fullName) {
            droppedNoName += 1;
            return;
        }
        // Zu lange Bezeichnung: gekürzt in den Namen, VOLLSTÄNDIG in die
        // Beschreibung — sonst wirft die Datenbank das ganze Paket zurück.
        const name = fitColumn(fullName);
        const nameShortened = name !== fullName;
        if (nameShortened) namesShortened += 1;

        // Die Artikelnummer wird aus dem VOLLEN Namen abgeleitet: sonst bekämen
        // zwei Waren, die sich erst nach Zeichen 191 unterscheiden, dieselbe.
        const fileCode = fitColumn(cell(row, 'articleCode').trim());
        let articleCode = fileCode;
        const generated = !fileCode;
        if (generated) {
            const key = normalize(fullName);
            const repeat = nameRepeats.get(key) ?? 0;
            nameRepeats.set(key, repeat + 1);
            articleCode = generateArticleCode(fullName, repeat);
            generatedCodes += 1;
        }

        if (seenCodes.has(articleCode)) {
            droppedDuplicate += 1;
            return;
        }
        seenCodes.add(articleCode);

        const image = toImageDataUrl(cell(row, 'image'));
        if (image.kind === 'ok') withImage += 1;
        else if (image.kind === 'notExported') imagesNotExported += 1;
        else if (image.kind !== 'none') imagesSkipped += 1;

        const unit = fitColumn(cell(row, 'unit').trim());
        prepared.push({
            sourceRow: index + 1,
            articleCode,
            generatedCode: generated,
            name,
            description: nameShortened ? fullName : null,
            nameShortened,
            salePrice: parsePrice(cell(row, 'salePrice')),
            purchasePrice: parsePrice(cell(row, 'purchasePrice')),
            unit: unit || null,
            imageUrl: image.kind === 'ok' ? image.dataUrl : null,
        });
    });

    return {
        fileName,
        headers,
        mapping,
        rows: prepared,
        totalRows: rows.length,
        droppedNoName,
        droppedDuplicate,
        withImage,
        imagesSkipped,
        imagesNotExported,
        generatedCodes,
        namesShortened,
    };
};

/* ── Datei lesen ────────────────────────────────────────────────────────────*/

/** RFC 4180: Anführungszeichen schützen Kommas und Zeilenumbrüche, "" ist ein ".
    Getrennt wird ausschliesslich am Komma — ein anderes Trennzeichen ist vorher
    getauscht worden (`swapDelimiter`). */
export const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) {
            if (char !== '"') { field += char; continue; }
            if (text[index + 1] === '"') { field += '"'; index += 1; continue; }
            quoted = false;
            continue;
        }
        if (char === '"') { quoted = true; continue; }
        if (char === ',') { row.push(field); field = ''; continue; }
        if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
        if (char === '\r') continue;
        field += char;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
};

/** Trennzeichen der Kopfzeile — Odoo liefert Komma, Excel-Exporte Semikolon. */
const detectDelimiter = (firstLine: string): string => {
    const counts = [',', ';', '\t'].map((candidate) => ({
        candidate,
        count: firstLine.split(candidate).length - 1,
    }));
    counts.sort((left, right) => right.count - left.count);
    return counts[0].count > 0 ? counts[0].candidate : ',';
};

export const isUploadFile = (file: File): boolean => /\.(csv|txt|xlsx|xls)$/i.test(file.name);

/**
 * Datei → Vorschau. CSV wird als Text gelesen (siehe Kopf dieser Datei), für
 * `.xlsx` übernimmt der gemeinsame Tabellen-Leser; `xlsx` wird nur dann
 * nachgeladen.
 */
export const readUploadFile = async (file: File): Promise<UploadPreview> => {
    if (/\.(xlsx|xls)$/i.test(file.name)) {
        const { readSpreadsheetFile } = await import('@/pages/inventory/utils/excel');
        const sheet: ParsedSheet = await readSpreadsheetFile(file);
        const rows = sheet.rows.map((row) => row.map((value) => (value === null || value === undefined ? '' : String(value))));
        return buildPreview(file.name, sheet.headers, rows);
    }

    const text = (await file.text()).replace(/^\uFEFF/, '');
    const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
    const delimiter = detectDelimiter(firstLine);
    // Der Leser kennt nur das Komma; ein anderes Trennzeichen wird davor
    // getauscht — aber NUR ausserhalb von Anführungszeichen, sonst zerlegt es
    // Namen wie "Pumpe; gross".
    const prepared = delimiter === ',' ? text : swapDelimiter(text, delimiter);
    const matrix = parseCsv(prepared).filter((row) => row.some((value) => value.trim() !== ''));
    if (!matrix.length) throw new Error('empty');

    const headers = (matrix[0] ?? []).map((value) => value.trim());
    return buildPreview(file.name, headers, matrix.slice(1));
};

/** Trennzeichen → Komma, Anführungszeichen respektiert. */
const swapDelimiter = (text: string, delimiter: string): string => {
    let result = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === '"') quoted = !quoted;
        result += !quoted && char === delimiter ? ',' : char;
    }
    return result;
};
