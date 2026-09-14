/**
 * ── FİYAT TALEBİ (PREISANFRAGE) PDF ŞABLONU ─────────────────────────────────
 * `orderPdf.ts`'in fiyatsız uyarlaması — fiyat talebi aşamasındaki siparişler
 * (TALEP TASLAĞI = DRAFT, gönderilmiş talep = PRICE_REQUEST) için AYRI belge
 * (kullanıcı isteği 2026-08-01). Fiyat sütunu ve toplam bloğu YOKTUR — fiyatlar
 * tedarikçiden İSTENMEKTEDİR.
 *
 * DAS BLATT NACH DER REFERENZ (Vorgabe Samet, 11.09.2026: «bunun aynısı —
 * sadece pdf'i daha temiz yapmak; tenant adresleri yine doğru gelmeli»):
 *  - Briefkopf: Logo, Welle, Kontaktzeile in feinem Grau.
 *  - Links die Angaben in einer hellgrauen, abgerundeten KARTE (Nummer fett in
 *    Navy, Besteller, Datum, Projekt, Empfänger, Lieferant — kein Status);
 *    rechts der Absender DES MANDANTEN klein und grau (`companySenderLine`:
 *    `usePdfSettings()` legt Name und eigene Adresse des aktiven Mandanten
 *    über die Firmendaten), darunter der Lieferant mit seiner Adresse.
 *  - Titel «Preisanfrage PR-2026-005», ein kurzes Anschreiben — und die Tabelle
 *    beginnt GLEICH DARUNTER auf Seite 1 (kein eigenes Deckblatt mehr).
 *  - Tabelle offen: Titel in kleinen grauen Grossbuchstaben, Zeilen nur durch
 *    Haarlinien getrennt, kein Rahmen, keine senkrechten Linien.
 *  - Unter der Tabelle die Schlusszeile (Bitte um Preise · Gruss), im Fuss der
 *    Absender und «Preisanfrage PR-… · Seite n von m».
 * Twin von `orderPdf.ts` — Masse und Toene gemeinsam ändern.
 */
import { jsPDF } from 'jspdf';
import { companySenderLine, drawAddressBlockLines, drawFittedSingleLine } from './addressBlock';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { PurchaseOrderRow } from '../../types/inventory';
import { resolveSupplierPdfColumns, type SupplierPdfColumn } from './supplierPdfColumns';

import liberationBoldUrl from '../../assets/fonts/LiberationSans-Bold.ttf?url';
import liberationRegularUrl from '../../assets/fonts/LiberationSans-Regular.ttf?url';
import offitecLogoUrl from '../../assets/images/offitec.png?url';
import headerWaveUrl from '../../assets/images/header-wave.svg?url';

export type PriceRequestPdfLang = 'tr' | 'de' | 'en';

interface PriceRequestPdfStrings {
    docTitle: string;
    /** Beschriftung der Nummer in der Karte — der Name des Dokuments (Referenz). */
    requestNumber: string;
    requestDate: string;
    orderedBy: string;
    project: string;
    supplier: string;
    /** Standard-Anschreiben = `greeting` + ' ' + `intro` — EIN Absatz. */
    greeting: string;
    intro: string;
    /** Schlusszeile unter der Tabelle: links die Bitte, rechts der Gruss. */
    closing: string;
    regards: string;
    colDesc: string;
    colCode: string;
    colQty: string;
    pageWord: string;
    pageOf: string;
    serialShort: string;
    /** Kapak kartındaki ALICI ADI satırının etiketi (Empfänger). */
    recipient: string;
}

const I18N: Record<PriceRequestPdfLang, PriceRequestPdfStrings> = {
    tr: {
        docTitle: 'Fiyat Teklifi Talebi',
        // Kartın ilk satırı belgenin adını taşır (referans PDF, 11.09.2026) —
        // numara kaydın kendi kodudur (BE-{yıl}-{sıra} ya da elle girilen).
        requestNumber: 'Fiyat Teklifi Talebi',
        requestDate: 'Talep Tarihi',
        orderedBy: 'Talep eden',
        project: 'Proje',
        supplier: 'Tedarikçi',
        greeting: 'Sayın Yetkili,',
        intro: 'aşağıda listelenen kalemler için fiyat teklifinizi rica ederiz.',
        closing: 'Lütfen birim ve toplam fiyatları, teslim süresini ve teklifin geçerlilik süresini belirtiniz.',
        regards: 'Saygılarımızla',
        colDesc: 'Ürün / Malzeme',
        colCode: 'Seri Kod',
        colQty: 'Miktar',
        pageWord: 'Sayfa',
        pageOf: '/',
        serialShort: 'Seri No',
        recipient: 'Alıcı',
    },
    de: {
        docTitle: 'Preisanfrage',
        requestNumber: 'Preisanfrage',
        requestDate: 'Anfragedatum',
        orderedBy: 'Besteller',
        project: 'Projekt',
        supplier: 'Lieferant',
        greeting: 'Sehr geehrte Damen und Herren,',
        intro: 'wir bitten Sie um ein Angebot für die nachstehenden Positionen.',
        closing: 'Bitte geben Sie Einzel- und Gesamtpreise, Lieferzeit sowie die Gültigkeit Ihres Angebots an.',
        regards: 'Freundliche Grüsse',
        colDesc: 'Produkt / Material',
        colCode: 'Seriencode',
        colQty: 'Menge',
        pageWord: 'Seite',
        pageOf: 'von',
        serialShort: 'Serien-Nr.',
        recipient: 'Empfänger',
    },
    en: {
        docTitle: 'Price Request',
        requestNumber: 'Price Request',
        requestDate: 'Request Date',
        orderedBy: 'Requested by',
        project: 'Project',
        supplier: 'Supplier',
        greeting: 'Dear Sir or Madam,',
        intro: 'we kindly ask for your quotation for the positions listed below.',
        closing: 'Please state unit and total prices, delivery time and the validity of your quotation.',
        regards: 'Kind regards',
        colDesc: 'Product / Material',
        colCode: 'Serial Code',
        colQty: 'Quantity',
        pageWord: 'Page',
        pageOf: 'of',
        serialShort: 'Serial No.',
        recipient: 'Recipient',
    },
};

// ── Sayfa geometrisi (A4, mm) — sipariş şablonuyla birebir ──────────────────
/* Zwei Millimeter schmalere Raender seit dem 09.09.2026 — dieselbe Vorgabe
   wie beim Bestell-PDF (orderPdf.ts). */
const ML = 12;
const MR = 198;
const CONTENT_W = MR - ML;
const PT_MM = 25.4 / 72;

/* Briefkopf nach der Referenz (11.09.2026): Logo und Welle etwas kleiner, die
   Kontaktzeile hoeher — die Karte beginnt gleich darunter. */
const LOGO_X = ML;
const LOGO_Y = 8.2;
const LOGO_H = 11.6;
const LOGO_MAX_W = 50;

/** Oberkante der Karte (Seite 1) und des Tabellenkopfs (Folgeseiten). */
const CONTENT_TOP_FIRST = 31.4;
const CONTENT_TOP_REST = 36;
/** Unterste Zeilenkante — der Fuss liegt tiefer (Linie bei 288 mm). */
const CONTENT_BOTTOM = 278;
/** Tiefste Grundlinie der Schlusszeile unter der Tabelle. */
const CLOSING_BOTTOM = 283;
/** Ön yazı satır sınırı — sipariş şablonuyla aynı (kapak sayfası taşmasın). */
const COVER_LETTER_MAX_LINES = 20;
/** So viel Platz muss unter dem Anschreiben bleiben, damit die Tabelle auf Seite 1 beginnt. */
const TABLE_START_MIN = 70;
/** Von der letzten Zeile des Anschreibens bis zum Tabellenkopf. */
const TABLE_GAP = 7;

/* Die Tabelle nach der Referenz: OFFEN — kein Rahmen, kein getoenter Kopf,
   keine senkrechten Linien. Pos ohne Titel 1.9 mm vom Rand, 4.2 mm Luft
   zwischen zwei Spalten, die letzte Zahl 1.9 mm vor dem rechten Rand. */
const C_POS_X = ML + 1.9;
const C_DESC = ML + 7.9;
const C_QTY_R = MR - 1.9;
const GAP = 4.2;
/* Produktname in NORMALER Schrift (Vorgabe Samet, 11.09.2026) — dunkler Ton
   statt Fett, wie im Bestell-PDF. */
const NAME_STYLE = 'normal' as const;

/** Eine gezeichnete Spalte: ihre Rolle, ihre linke Kante, ihr Mass. */
interface LayoutCell {
    column: SupplierPdfColumn;
    /** Linke Kante (mm). */
    x: number;
    /** Breite SAMT dem Abstand `GAP` zur naechsten Spalte. */
    width: number;
    /** Zahlen (Menge, eine rein numerische eigene Spalte) stehen rechtsbuendig. */
    align: 'left' | 'right';
}

interface TableLayout {
    /** Alle Spalten von links nach rechts — in der Reihenfolge der Vorlage. */
    cells: LayoutCell[];
    /** Linke Kante und rechtes Ende der Beschreibung (Produktname). */
    descX: number;
    descEnd: number;
    /** Die EINE Schrift der Tabelle (pt) und ihr Zeilenabstand (mm). */
    fs: number;
    lh: number;
}

/** Freie Spalten auf dem Blatt: sechs sind das Ende der Lesbarkeit auf A4 hochkant. */
const PDF_MAX_EXTRA_COLUMNS = 6;

/* ═══════════════════════════════════════════════════════════════════════════
   DIE SPALTEN RICHTEN SICH NACH IHREM INHALT — dieselbe Regel wie im
   Bestell-PDF (siehe den langen Kommentar in orderPdf.ts, Vorgabe Samet
   09.09.2026): kein Titel schrumpft, kein Wort bricht in der Mitte, nichts
   wandert unter den Produktnamen. Jede Spalte bekommt mindestens ihr laengstes
   Wort, der Rest wird nach Bedarf verteilt, die Beschreibung nimmt, was
   uebrig bleibt. Ein Code ohne Leerzeichen darf an seinen Trennzeichen
   brechen.
   ═════════════════════════════════════════════════════════════════════════ */
const DESC_MIN_W = 28;
/** Bis hierhin waechst die Beschreibung, BEVOR die Titel in eine Zeile kommen (Referenz: 60 mm). */
const DESC_FLOOR_W = 60;

const widestWord = (doc: jsPDF, text: string, style: 'normal' | 'bold', size: number): number => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    return Math.max(0, ...text.split(/[\s\u200b]+/).filter(Boolean).map((word) => doc.getTextWidth(word)));
};

const fullWidth = (doc: jsPDF, text: string, style: 'normal' | 'bold', size: number): number => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    // Der Nullbreiten-Trenner aus `breakableCode` ist im Druck unsichtbar —
    // gemessen als Glyphe waere er eine ganze Breite (die Spalte wuchs dadurch
    // auf 40 mm statt 26).
    return doc.getTextWidth(text.replace(/\u200b/g, ''));
};

/* Spaltentitel stehen in GROSSBUCHSTABEN, leicht gesperrt (Referenz): ihre
   Breite ist die der Glyphen plus `CAPTION_SPACING` je Zeichen. */
const captionWidth = (doc: jsPDF, text: string, size: number): number => {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(size);
    return doc.getTextWidth(text) + CAPTION_SPACING * text.length;
};

/* ── EIN TITEL BRICHT AN SEINER FUGE, MIT TRENNSTRICH (Referenz-PDF) ────────
   «PRODUKTTYP-» / «NUMMER», «GESAMT-» / «MENGE»: so schmal wie ihre Werte
   duerfen die Spalten werden — der Titel folgt. Die Fuge findet sich an
   einem weichen Trennzeichen, einem Bindestrich oder vor einem bekannten
   Grundwort (`CAPTION_TAILS`); ein Wort ohne Fuge bleibt ganz. */
const CAPTION_TAILS = [
    'BESCHREIBUNG', 'BEZEICHNUNG', 'NUMMER', 'MENGE', 'LÄNGE', 'BREITE', 'HÖHE', 'TIEFE',
    'GEWICHT', 'ANZAHL', 'EINHEIT', 'BETRAG', 'RABATT', 'GRÖSSE', 'KLASSE', 'GRUPPE',
    'TERMIN', 'STÜCK', 'PREIS', 'DATUM', 'FARBE', 'SUMME', 'NAME', 'TEXT', 'WERT', 'ZEIT',
    'CODE', 'TYP', 'ART', 'NR',
];
const captionPieces = (word: string): string[] => {
    const explicit = word.split(/[\u00ad-]+/).filter(Boolean);
    if (explicit.length > 1) return explicit;
    const upper = word.toUpperCase();
    if (upper.length < 9) return [word];
    for (const tail of CAPTION_TAILS) {
        if (upper.endsWith(tail) && upper.length - tail.length >= 4) {
            const head = word.slice(0, word.length - tail.length);
            return [...captionPieces(head), word.slice(word.length - tail.length)];
        }
    }
    return [word];
};

/** Das schmalste Mass eines Titels: sein breitestes Wort — oder, bei einem
    zusammengesetzten Wort, sein breitestes Glied samt Trennstrich. */
const widestCaptionWord = (doc: jsPDF, text: string, size: number): number =>
    Math.max(0, ...text.split(/\s+/).filter(Boolean).map((word) => {
        const pieces = captionPieces(word);
        if (pieces.length === 1) return captionWidth(doc, word, size);
        return Math.max(...pieces.map((piece, index) => captionWidth(doc, piece + (index < pieces.length - 1 ? '-' : ''), size)));
    }));

/* Trennzeichen sind Umbruchpunkte; eine lange Kette ohne Trennzeichen mit
   Ziffern darin («HMIP6DDB0NA0WNAN00») bekommt alle sechs Zeichen einen —
   dieselbe Regel wie im Bestell-PDF. */
const breakableCode = (code: string): string => code
    .replace(/([-_/.])/g, '$1\u200b')
    .replace(/(?=[A-Za-z0-9]{12,})(?=[A-Za-z]*\d)[A-Za-z0-9]{12,}/g, (run) => run.replace(/(.{6})(?=.)/g, '$1\u200b'));

interface MeasuredColumn {
    kind: 'code' | 'qty' | string;
    /** Ohne dieses Mass bricht ein Wort in der Mitte. */
    min: number;
    /** Mit diesem Mass steht alles in einer Zeile (Titel und laengster Wert). */
    full: number;
    align: 'left' | 'right';
}

const measureColumn = (
    doc: jsPDF,
    kind: MeasuredColumn['kind'],
    header: string,
    values: string[],
    align: 'left' | 'right',
    fs: number,
    valueStyle: 'normal' | 'bold' = 'normal',
): MeasuredColumn => {
    const headSize = HEAD_FS;
    const headMin = widestCaptionWord(doc, header, headSize);
    const headFull = captionWidth(doc, header, headSize);
    const valueMin = Math.max(0, ...values.map((value) => widestWord(doc, value, valueStyle, fs)));
    const valueFull = Math.max(0, ...values.map((value) => fullWidth(doc, value, valueStyle, fs)));
    const valueNeed = align === 'right' ? valueFull : valueMin;
    const min = Math.max(headMin, valueNeed) * 1.03 + GAP;
    return {
        kind,
        min,
        full: Math.max(min, Math.max(headFull, valueFull) * 1.03 + GAP),
        align,
    };
};

/** Hebt jede Spalte anteilig Richtung `caps[i]`, soweit `spare` reicht; gibt den Rest zurueck. */
const growToward = (widths: number[], caps: number[], spare: number): number => {
    const needs = widths.map((width, index) => Math.max(0, caps[index] - width));
    const needSum = needs.reduce((sum, need) => sum + need, 0);
    if (needSum <= 0 || spare <= 0) return Math.max(0, spare);
    const share = Math.min(1, spare / needSum);
    needs.forEach((need, index) => { widths[index] += need * share; });
    return spare - needSum * share;
};

/* Dieselbe Verteilung wie im Bestell-PDF (siehe `buildTableLayout` dort):
   EINE Schrift fuer die ganze Tabelle, Stufe nach `TABLE_SIZES`; der Rest
   geht erst bis `DESC_FLOOR_W` an die Beschreibung, dann an einzeilige
   Titel, dann an einzeilige Werte, zuletzt wieder an die Beschreibung.

   DIE SPALTEN KOMMEN AUS DER VORLAGE (`resolveSupplierPdfColumns`, Vorgabe
   Samet 11.09.2026): ihre Reihenfolge ist die der Liste, ihre Titel die
   Namen der Vorlage. Die Beschreibung nimmt, was uebrig bleibt — wo immer
   die Vorlage sie hingestellt hat. */
const buildTableLayout = (
    doc: jsPDF,
    order: PurchaseOrderRow,
    columns: SupplierPdfColumn[],
): TableLayout => {
    const items = order.items ?? [];
    const names = items.map((item) => (item.name || '').trim());
    const desc = columns.find((column) => column.kind === 'desc');
    const others = columns.filter((column) => column.kind !== 'desc');
    // Die letzte Spalte endet an `C_QTY_R` — ihr eigener Abstand faellt dort weg.
    const room = C_QTY_R + GAP - C_DESC;
    const aligns = others.map((column): 'left' | 'right' => (
        column.kind === 'extra'
            ? (columnIsNumeric(items.map((item) => requestExtraRaw(item, column.key))) ? 'right' : 'left')
            : 'right'
    ));
    // Genau die Texte, die `drawRow` druckt.
    const valuesOf = (column: SupplierPdfColumn, align: 'left' | 'right'): string[] => {
        if (column.kind === 'extra') {
            return align === 'right'
                ? items.map((item) => requestExtraRaw(item, column.key) || '—')
                : items.map((item) => requestExtraValue(item, column.key) || '—');
        }
        return items.map((item) => fmtQty(item.quantity || 0));
    };

    const measureAll = (fs: number): MeasuredColumn[] =>
        others.map((column, index) => measureColumn(doc, column.key, column.caption, valuesOf(column, aligns[index]), aligns[index], fs));
    const descMinFor = (fs: number): number => Math.max(
        DESC_MIN_W,
        widestCaptionWord(doc, desc?.caption ?? '', HEAD_FS) * 1.03 + GAP,
        ...names.map((name) => widestWord(doc, name, NAME_STYLE, fs) * 1.03 + GAP),
    );
    const minSumOf = (measured: MeasuredColumn[]) => measured.reduce((sum, column) => sum + column.min, 0);

    let fs = TABLE_SIZES[TABLE_SIZES.length - 1];
    for (const size of TABLE_SIZES) {
        if (minSumOf(measureAll(size)) + descMinFor(size) <= room) { fs = size; break; }
    }
    const measured = measureAll(fs);
    const descMin = descMinFor(fs);
    const minSum = minSumOf(measured);

    let widths: number[];
    let descW: number;
    if (minSum + descMin > room) {
        descW = Math.max(DESC_MIN_W, room - minSum);
        const deficit = Math.max(0, minSum + descW - room);
        const textMin = measured.reduce((sum, column) => sum + (column.align === 'left' ? column.min : 0), 0);
        const textScale = textMin > 0 ? Math.max(0.5, (textMin - deficit) / textMin) : 1;
        widths = measured.map((column) => (column.align === 'left' ? column.min * textScale : column.min));
    } else {
        /* Reihenfolge nach der Referenz (Vorgabe Samet, 11.09.2026, dritte
           Runde: «die Spalten muessen sich so teilen wie dort» — nachgemessen:
           Beschreibung 60 mm, Produkttypnummer 26 mm bei 34 mm langen Codes):
             1. jede Spalte ihr Mindestmass (breitestes Wort bzw. Titel-Glied);
             2. die Beschreibung bis `DESC_FLOOR_W` (60 mm wie im Referenzblatt);
             3. der Rest an die Spalten, IM VERHAELTNIS dessen, was ihnen bis
                zur einen Zeile fehlt (Titel + laengster Wert) — ein langer
                Code bricht dann in seiner Spalte um, ein Titel an seiner Fuge
                («PRODUKTTYP-» / «NUMMER», siehe `splitCaption`);
             4. was danach noch bleibt, bekommt die Beschreibung. */
        widths = measured.map((column) => column.min);
        let spare = room - minSum - descMin;
        const descFull = Math.max(descMin, ...names.map((name) => fullWidth(doc, name, NAME_STYLE, fs) * 1.03 + GAP));
        const floorGrow = Math.min(spare, Math.max(0, Math.min(DESC_FLOOR_W, descFull) - descMin));
        spare -= floorGrow;
        spare = growToward(widths, measured.map((column) => column.full), spare);
        descW = descMin + floorGrow + spare;
    }

    /* ── Von links nach rechts aufstellen — in der Reihenfolge der Vorlage ── */
    const cells: LayoutCell[] = [];
    let x = C_DESC;
    let descX = C_DESC;
    let descEnd = C_DESC + descW - GAP;
    let position = 0;
    for (const column of columns) {
        if (column.kind === 'desc') {
            descX = x;
            descEnd = x + descW - GAP;
            cells.push({ column, x, width: descW, align: 'left' });
            x += descW;
            continue;
        }
        const width = widths[position];
        cells.push({ column, x, width, align: aligns[position] });
        x += width;
        position += 1;
    }
    return { cells, descX, descEnd, fs, lh: fs * LH_RATIO };
};

/* DAS BLATT NACH DER REFERENZ (Vorgabe Samet, 11.09.2026) — dieselben Masse
   und Toene wie im Bestell-PDF; nur Haarlinien, Navy fuer Titel und Nummer.

   DIE ZWEI SCHRIFTEN DER TABELLE (Vorgabe Samet, 11.09.2026, als CSS notiert):
     Spaltentitel    Liberation Sans Regular · 5.6 pt · UPPERCASE · letter-spacing 0.35px · #8E8E92
     Normaler Text   Liberation Sans Regular · 8 pt · ohne Umwandlung · letter-spacing 0 · #1D1D1F
   8 pt ist DIE Groesse; `TABLE_SIZES` geht nur tiefer, wenn eine Tabelle
   (sechs eigene Spalten neben allen Preisen) sonst nicht aufs Blatt passt. */
const TABLE_SIZES = [8, 7.4, 6.8];
/** Spaltentitel: immer 5.6 pt. */
const HEAD_FS = 5.6;
const PX_MM = 25.4 / 96;
/** Sperrung der Spaltentitel je Zeichen: 0.35 px. */
const CAPTION_SPACING = 0.35 * PX_MM;
/** Zeilenabstand zweizeiliger Titel in mm je pt (5.6 pt → 2.4 mm). */
const CAPTION_LH = 0.425;
/** Zeilenabstand in mm je pt Schrift (8 pt → 4.1 mm, Faktor 1.45). */
const LH_RATIO = 0.51;
/** Ober- und Unterlaenge in mm je pt — setzen erste Grundlinie und Zeilenhoehe. */
const CAP_RATIO = 0.254;
const DESCENT_RATIO = 0.078;
const ROW_PAD_T = 3.9;
const ROW_PAD_B = 3.75;
const MIN_ROW_START = 14;
/** Tabellenkopf: vom oberen Rand bis zur Oberlaenge, von der letzten Titelzeile bis zur Linie. */
const HEAD_PAD_T = 1.6;
const HEAD_PAD_B = 3;
/** Luecke zwischen Produktname und Seriennummer darunter. */
const META_GAP = 0.8;
/** Die Pos-Nummer steht eine Spur kleiner als die Tabelle. */
const POS_RATIO = 0.925;
const HAIRLINE_W = 0.26;

const FS_LETTER = 8.4;
const LETTER_LHF = 1.45;
const FS_CLOSING = 7.4;
const CLOSING_GAP = 7.3;
const FS_FOOTER = 5.25;
/** Die Marke hinter dem Namen des Bestellers in der Grusszeile. */
const BRAND_NAME = 'OffiTec';

/* Die Karte oben links (Referenz): hellgrau, abgerundet, 83.6 mm breit. */
const CARD_W = 83.6;
const CARD_RADIUS = 3;
const CARD_PAD = 2.4;
const CARD_ROW_H = 7.4;
const CARD_BASELINE = 4.37;
const CARD_INSET = 4.1;
const CARD_LABEL_FS = 7.6;
const CARD_VALUE_FS = 8.2;
const CARD_VALUE_LH = 3.6;
/** Linke Kante des Absender- und Lieferantenblocks rechts. */
const ADDR_X = ML + 94;

const COLOR_NAVY = [22, 32, 92] as const;
const COLOR_TEXT = [29, 29, 31] as const;
const COLOR_TEXT_2 = [72, 72, 74] as const;
const COLOR_CAPTION = [110, 110, 115] as const;
const COLOR_MUTED = [142, 142, 147] as const;
/** Spaltentitel: #8E8E92. */
const COLOR_COLUMN_HEAD = [142, 142, 146] as const;
const COLOR_POS = [161, 161, 166] as const;
const COLOR_SENDER = [154, 154, 160] as const;
const COLOR_HAIRLINE = [239, 239, 242] as const;
const COLOR_RULE = [210, 210, 215] as const;
const COLOR_DIVIDER = [229, 229, 234] as const;
const COLOR_CARD_FILL = [245, 245, 247] as const;
const COLOR_CARD_EDGE = [235, 235, 239] as const;
const COLOR_CARD_LINE = [231, 231, 236] as const;

const CONTACT_PHONE = '+41 56 556 24 68';
const CONTACT_EMAIL = 'info@offitec.ch';
const CONTACT_WEB = 'www.offitec.ch';

// ── Fontlar / logo / dalga (sipariş şablonundaki yükleyicilerle aynı) ────────
/* Liberation Sans (SIL OFL, die Lizenz liegt neben den Dateien) — Vorgabe
   Samet, 11.09.2026. Dieselben Laufweiten wie Arial: keine Spalte verschiebt sich. */
const FONT = 'LiberationSans';
let fontFiles: { regular: string; bold: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
};

async function registerFonts(doc: jsPDF) {
    if (!fontFiles) {
        const [regular, bold] = await Promise.all([
            fetch(liberationRegularUrl).then((r) => r.arrayBuffer()),
            fetch(liberationBoldUrl).then((r) => r.arrayBuffer()),
        ]);
        fontFiles = { regular: bufferToBase64(regular), bold: bufferToBase64(bold) };
    }
    doc.addFileToVFS('LiberationSans-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('LiberationSans-Bold.ttf', fontFiles.bold);
    doc.addFont('LiberationSans-Regular.ttf', FONT, 'normal');
    doc.addFont('LiberationSans-Bold.ttf', FONT, 'bold');
    doc.setFont(FONT, 'normal');
}

let logoDataUrl: string | null = null;

async function loadLogo(doc: jsPDF): Promise<{ dataUrl: string; w: number; h: number } | null> {
    try {
        if (!logoDataUrl) {
            const buf = await fetch(offitecLogoUrl).then((r) => r.arrayBuffer());
            logoDataUrl = `data:image/png;base64,${bufferToBase64(buf)}`;
        }
        const props = doc.getImageProperties(logoDataUrl);
        const h = LOGO_H;
        const w = Math.min(LOGO_MAX_W, h * (props.width / props.height));
        return { dataUrl: logoDataUrl, w, h };
    } catch (e) {
        console.warn('Offitec logo could not be loaded for the PDF header:', e);
        return null;
    }
}

/* Die Welle der Referenz: dasselbe Bild auf 0.875 verkleinert, am rechten Rand. */
const WAVE_W = 127.8;
const WAVE_H = 24.6;
const WAVE_TOP = 3.2;
const WAVE_RASTER_DPI = 400;
const WAVE_VIEW = '0 0 1460 280';

let wavePngCache: { key: string; dataUrl: string } | null = null;

async function loadHeaderWave(wMm: number, hMm: number): Promise<string | null> {
    const key = `${wMm.toFixed(2)}x${hMm.toFixed(2)}`;
    if (wavePngCache?.key === key) return wavePngCache.dataUrl;
    try {
        const pxW = Math.round((wMm / 25.4) * WAVE_RASTER_DPI);
        const pxH = Math.round((hMm / 25.4) * WAVE_RASTER_DPI);
        const svgText = await fetch(headerWaveUrl).then((r) => r.text());
        const sized = svgText.replace(/<svg\b[^>]*>/, (tag) =>
            tag
                .replace(/\swidth="[^"]*"/, ` width="${pxW}"`)
                .replace(/\sheight="[^"]*"/, ` height="${pxH}"`)
                .replace(/\sviewBox="[^"]*"/, ` viewBox="${WAVE_VIEW}"`)
                .replace(/\s*>$/, ' preserveAspectRatio="none">')
        );
        const img = new Image();
        img.decoding = 'sync';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('wave svg decode failed'));
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
        });
        const canvas = document.createElement('canvas');
        canvas.width = pxW;
        canvas.height = pxH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, pxW, pxH);
        const dataUrl = canvas.toDataURL('image/png');
        wavePngCache = { key, dataUrl };
        return dataUrl;
    } catch (e) {
        console.warn('Header wave could not be rendered for the PDF header:', e);
        return null;
    }
}

// ── Biçimleyiciler ───────────────────────────────────────────────────────────
/* Mengen ohne leere Nachkommastellen — «2», «2,5» (Referenz). */
const fmtQty = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v || 0);

const fmtDateShort = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    // GG.AA.YY — "21.08.26" (kullanıcı isteği 2026-08-21: yy-mm-dd sıralaması
    // karşı tarafça anlaşılmıyordu; müşteri teklif PDF'i de GG.AA.YYYY kullanır).
    return `${dd}.${mm}.${yy}`;
};

const oneLine = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

/* Grossbuchstaben nach der Sprache des WORTES, nicht nur des Dokuments: ein
   tuerkisches i wird İ («BİRİM»), ein deutsches bleibt I («EINHEIT»). Die
   Spaltennamen tippt der Benutzer in der Vorlage — sie verraten ihre Sprache
   an ı/ğ/ş bzw. ä/ß/ei/ch/ck; sonst gilt die Sprache des Dokuments. */
const captionLocale = (label: string, lang: PriceRequestPdfLang): string => {
    if (/[ıİğĞşŞ]/.test(label)) return 'tr-TR';
    if (/ß|ä|ei|ie|eu|ch|ck|tz/i.test(label)) return 'de-CH';
    return lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-CH' : 'en-GB';
};

/* Eine eigene Spalte, in der NUR Zahlen stehen («0,00», «1'250», «12.5»),
   steht rechtsbuendig; eine Null ist so blass wie ein fehlender Wert. */
const NUMBER_RE = /^[-+]?(?:\d{1,3}(?:[.'\u2019 ]\d{3})+|\d+)(?:[.,]\d+)?$/;
const isNumberText = (value: string) => NUMBER_RE.test(value.trim());
const isZeroText = (value: string) => isNumberText(value) && !/[1-9]/.test(value);
const columnIsNumeric = (values: string[]) => {
    const filled = values.map((value) => value.trim()).filter(Boolean);
    return filled.length > 0 && filled.every(isNumberText);
};

// ─────────────────────────────────────────────────────────────────────────────
// ANA GİRİŞ NOKTALARI
// ─────────────────────────────────────────────────────────────────────────────

export async function buildPriceRequestPdfBytes(
    order: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: PriceRequestPdfLang = 'de'
): Promise<Uint8Array> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    // Jede Zeile setzt ihre Sperrung selbst (0 Tc) — sonst erbte der Text nach
    // einem gesperrten Spaltentitel dessen Sperrung.
    doc.setCharSpace(0);
    const logo = await loadLogo(doc);
    const wave = await loadHeaderWave(WAVE_W, WAVE_H);
    const L = I18N[lang];
    // Die Tabelle traegt ihre Titel in Grossbuchstaben (Referenz).
    const upper = (label: string) => label.toLocaleUpperCase(captionLocale(label, lang));

    // ── Seite 1: Karte, Adressen, Titel, Anschreiben ─────────────────────────
    const letterEnd = drawCoverPage(doc, order, settings, L);

    // ── Die Positionen (fiyatsız) — gleich unter dem Anschreiben ─────────────
    /* DIE SPALTEN DER VORLAGE (Vorgabe Samet, 11.09.2026): Titel = die Namen
       der Vorlage («GESAMTMENGE», nicht «Menge»), Reihenfolge = die der
       Vorlage. Der ERP-Code steht nie im PDF; Ausgeblendetes bleibt weg. Kopf,
       Masse und Zeilen lesen DIESELBE Liste. */
    const columns = resolveSupplierPdfColumns(order, {
        captions: { desc: L.colDesc, qty: L.colQty },
        fixed: ['qty'],
        hidden: new Set([...(order.hiddenColumnKeys ?? []), 'code']),
        maxExtras: PDF_MAX_EXTRA_COLUMNS,
    }).map((column) => ({ ...column, caption: upper(column.caption) }));
    const layout = buildTableLayout(doc, order, columns);
    const st: TableState = { y: 0 };
    if (CONTENT_BOTTOM - letterEnd >= TABLE_START_MIN) {
        st.y = drawTableHeader(doc, letterEnd + TABLE_GAP, layout);
    } else {
        doc.addPage();
        st.y = drawTableHeader(doc, CONTENT_TOP_REST, layout);
    }

    order.items.forEach((item, index) => {
        const h = measureRow(doc, item, L, layout);
        if (st.y + h > CONTENT_BOTTOM || CONTENT_BOTTOM - st.y < MIN_ROW_START) {
            newTablePage(doc, st, layout);
        }
        st.y = drawRow(doc, item, index, st.y, Math.min(h, CONTENT_BOTTOM - st.y), L, layout);
    });
    closeTable(doc, st.y);

    // Toplam bloğu YOKTUR — fiyatlar tedarikçiden istenmektedir; statt dessen
    // die Schlusszeile mit der Bitte und dem Gruss.
    drawClosing(doc, st.y, order, L);

    // ── Antet & alt bilgi dekorasyonu (tüm sayfalar) ─────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawPageHeader(doc, logo, wave, settings);
        drawPageFooter(doc, i, pageCount, L, order, settings);
    }

    return new Uint8Array(doc.output('arraybuffer'));
}

export async function exportPriceRequestPdf(
    order: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: PriceRequestPdfLang = 'de'
): Promise<void> {
    const bytes = await buildPriceRequestPdfBytes(order, settings, lang);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Preisanfrage-${order.referenceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTET & ALT BİLGİ — sipariş şablonuyla birebir
// ─────────────────────────────────────────────────────────────────────────────

type ContactIcon = 'phone' | 'mail' | 'web';

/** Breite der Kontaktsymbole (mm) — feine graue Umrisse wie in der Referenz. */
const CONTACT_ICON_W: Record<ContactIcon, number> = { phone: 1.25, mail: 2.4, web: 2.3 };

function drawContactIcon(doc: jsPDF, kind: ContactIcon, x: number, midY: number) {
    doc.setDrawColor(...COLOR_MUTED);
    doc.setLineWidth(0.2);
    if (kind === 'phone') {
        const w = CONTACT_ICON_W.phone;
        const h = 2.5;
        const top = midY - h / 2;
        doc.roundedRect(x, top, w, h, 0.3, 0.3, 'S');
        doc.line(x + w / 2 - 0.15, top + h - 0.45, x + w / 2 + 0.15, top + h - 0.45);
    } else if (kind === 'mail') {
        const w = CONTACT_ICON_W.mail;
        const h = 1.75;
        const top = midY - h / 2;
        doc.roundedRect(x, top, w, h, 0.25, 0.25, 'S');
        doc.line(x + 0.15, top + 0.25, x + w / 2, top + h * 0.57);
        doc.line(x + w - 0.15, top + 0.25, x + w / 2, top + h * 0.57);
    } else {
        const r = CONTACT_ICON_W.web / 2;
        doc.circle(x + r, midY, r, 'S');
        doc.ellipse(x + r, midY, r * 0.44, r, 'S');
        doc.line(x, midY, x + 2 * r, midY);
    }
}

function drawHeaderWave(doc: jsPDF, wave: string | null) {
    if (!wave) return;
    try {
        doc.addImage(wave, 'PNG', MR - WAVE_W, WAVE_TOP, WAVE_W, WAVE_H, 'offitec-header-wave', 'FAST');
    } catch { /* şerit çizilemezse antet logo + iletişim satırı olarak kalır */ }
}

function drawPageHeader(
    doc: jsPDF,
    logo: { dataUrl: string; w: number; h: number } | null,
    wave: string | null,
    s: PdfCompanySettings
) {
    if (logo) {
        try {
            doc.addImage(logo.dataUrl, 'PNG', LOGO_X, LOGO_Y, logo.w, logo.h, 'offitec-logo', 'FAST');
        } catch { /* logo yüklenemezse antet metin-only kalır */ }
    } else {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...COLOR_NAVY);
        doc.text(s.companyName, ML, 16.5);
    }

    drawHeaderWave(doc, wave);

    // Kontaktzeile: 7 pt grau, rechtsbuendig; die Symbole mittig auf der Zeile.
    const baseline = 26.5;
    const midY = 25.85;
    const ICON_GAP = 2;
    const ITEM_GAP = 7.3;
    const items: Array<{ icon: ContactIcon; text: string }> = [
        { icon: 'phone', text: CONTACT_PHONE },
        { icon: 'mail', text: CONTACT_EMAIL },
        { icon: 'web', text: CONTACT_WEB },
    ];

    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    const widths = items.map((it) => CONTACT_ICON_W[it.icon] + ICON_GAP + doc.getTextWidth(it.text));
    const totalW = widths.reduce((a, b) => a + b, 0) + ITEM_GAP * (items.length - 1);

    let x = MR - totalW;
    items.forEach((it, i) => {
        drawContactIcon(doc, it.icon, x, midY);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR_CAPTION);
        doc.text(it.text, x + CONTACT_ICON_W[it.icon] + ICON_GAP, baseline);
        x += (widths[i] ?? 0) + ITEM_GAP;
    });
}

/**
 * Der Fuss nach der Referenz: eine Haarlinie, links der Absender DES MANDANTEN
 * (Name · Adresse — die fest eingetragene Schweizer Bankverbindung ist weg,
 * sie stimmte fuer den tuerkischen Mandanten nie), rechts Dokument und Seite.
 */
function drawPageFooter(
    doc: jsPDF,
    page: number,
    total: number,
    L: PriceRequestPdfStrings,
    order: PurchaseOrderRow,
    s: PdfCompanySettings,
) {
    doc.setFillColor(...COLOR_DIVIDER);
    doc.rect(ML, 288.13, CONTENT_W, 0.27, 'F');
    const textY = 291.85;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_FOOTER);
    doc.setTextColor(...COLOR_MUTED);
    const right = `${L.docTitle} ${order.referenceNumber}  ·  ${L.pageWord} ${page} ${L.pageOf} ${total}`;
    doc.text(right, MR, textY, { align: 'right' });
    const rightW = doc.getTextWidth(right);
    drawFittedSingleLine(doc, companySenderLine(s, '  ·  '), ML, textY, CONTENT_W - rightW - 8, FS_FOOTER, 4.4);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 1 — Karte (links), Absender & Lieferant (rechts), Titel, Anschreiben
// ─────────────────────────────────────────────────────────────────────────────

type CardRow = [label: string, value: string, emphasize: boolean];

/**
 * Die Angabenkarte (Referenz): hellgrau, abgerundet; Beschriftung grau links,
 * Wert rechts, alle Werte in EINER Groesse — ein zu langer Wert bricht um,
 * statt kleiner zu werden. Gibt die Unterkante zurueck.
 */
function drawInfoCard(doc: jsPDF, x: number, top: number, rows: CardRow[]): number {
    const measured = rows.map(([label, value, emphasize]) => {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(CARD_LABEL_FS);
        const labelW = doc.getTextWidth(label);
        doc.setFont(FONT, emphasize ? 'bold' : 'normal');
        doc.setFontSize(CARD_VALUE_FS);
        const lines = doc.splitTextToSize(value, CARD_W - CARD_INSET * 2 - labelW - 4) as string[];
        return { label, lines, emphasize, h: CARD_ROW_H + (lines.length - 1) * CARD_VALUE_LH };
    });
    const height = CARD_PAD * 2 + measured.reduce((sum, row) => sum + row.h, 0);
    doc.setFillColor(...COLOR_CARD_FILL);
    doc.setDrawColor(...COLOR_CARD_EDGE);
    doc.setLineWidth(HAIRLINE_W);
    doc.roundedRect(x, top, CARD_W, height, CARD_RADIUS, CARD_RADIUS, 'FD');

    let y = top + CARD_PAD;
    measured.forEach((row, index) => {
        const base = y + CARD_BASELINE;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(CARD_LABEL_FS);
        doc.setTextColor(...COLOR_CAPTION);
        doc.text(row.label, x + CARD_INSET, base);
        doc.setFont(FONT, row.emphasize ? 'bold' : 'normal');
        doc.setFontSize(CARD_VALUE_FS);
        if (row.emphasize) doc.setTextColor(...COLOR_NAVY);
        else doc.setTextColor(...COLOR_TEXT);
        row.lines.forEach((line, lineIdx) => doc.text(line, x + CARD_W - CARD_INSET, base + lineIdx * CARD_VALUE_LH, { align: 'right' }));
        y += row.h;
        if (index < measured.length - 1) {
            doc.setFillColor(...COLOR_CARD_LINE);
            doc.rect(x + CARD_INSET, y - HAIRLINE_W / 2, CARD_W - CARD_INSET * 2, HAIRLINE_W, 'F');
        }
    });
    return top + height;
}

/**
 * Rechts oben: der Absender — der AKTIVE MANDANT mit Name und Adresse (hat er
 * eine eigene, legt `usePdfSettings()` sie ueber die Firmendaten) — klein und
 * grau; er darf in eine zweite Zeile umbrechen, erst eine dritte macht ihn
 * kleiner. Darunter eine Haarlinie und der Lieferant mit seiner Adresse
 * (Strasse / PLZ Ort, jede Zeile fuer sich). Gibt die Unterkante zurueck.
 */
function drawSenderAndSupplier(doc: jsPDF, order: PurchaseOrderRow, s: PdfCompanySettings): number {
    const top = CONTENT_TOP_FIRST;
    const addrW = MR - ADDR_X;
    const sender = companySenderLine(s, ' · ');
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLOR_SENDER);
    let size = 6.3;
    let senderLines: string[];
    do {
        doc.setFontSize(size);
        senderLines = doc.splitTextToSize(sender, addrW) as string[];
        size = Math.round((size - 0.2) * 10) / 10;
    } while (senderLines.length > 2 && size >= 5.2);
    senderLines.slice(0, 2).forEach((line, index) => doc.text(line, ADDR_X, top + 2.5 + index * 2.9));
    doc.setFillColor(...COLOR_DIVIDER);
    doc.rect(ADDR_X, top + 8.07, addrW, 0.27, 'F');

    let y = top + 15.45;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXT);
    const nameLines = doc.splitTextToSize(order.supplierName || '', addrW) as string[];
    nameLines.forEach((line, index) => doc.text(line, ADDR_X, y + index * 4.4));
    y += (Math.max(1, nameLines.length) - 1) * 4.4;
    // Alıcı adı kartta; sağ blokta e-posta yok (2026-08-02 kararları geçerli).
    if (order.supplierAddress) {
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...COLOR_TEXT_2);
        y = drawAddressBlockLines(doc, order.supplierAddress, ADDR_X, y + 5.3, addrW, 8.4, 4.24) - 4.24;
    }
    return y + 1.5;
}

/** Der Titel: Dokument fett in Navy, die Nummer normal daneben. */
function drawDocTitle(doc: jsPDF, title: string, number: string, y: number) {
    doc.setFont(FONT, 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(title, ML, y);
    const numberX = ML + doc.getTextWidth(`${title} `);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...COLOR_TEXT);
    doc.text(number, numberX, y);
}

/** Seite 1 bis zum Anschreiben; gibt die Grundlinie seiner letzten Zeile zurueck. */
function drawCoverPage(doc: jsPDF, order: PurchaseOrderRow, s: PdfCompanySettings, L: PriceRequestPdfStrings): number {
    const rows = ([
        [L.requestNumber, order.referenceNumber, true],
        [L.orderedBy, oneLine(order.orderedByName || ''), false],
        [L.requestDate, fmtDateShort(order.createdAt), false],
        [L.project, oneLine(order.projectName || ''), false],
        [L.recipient, oneLine(order.recipientName || ''), false],
        [L.supplier, oneLine(order.supplierName), false],
    ] as CardRow[]).filter(([, value]) => value.trim().length > 0);
    const cardBottom = drawInfoCard(doc, ML, CONTENT_TOP_FIRST, rows);
    const addrBottom = drawSenderAndSupplier(doc, order, s);

    const titleY = Math.max(cardBottom, addrBottom) + 12;
    drawDocTitle(doc, L.docTitle, order.referenceNumber, titleY);

    // ÖN YAZI: siparişe yazılmış metin varsa o, yoksa standart metin — ikisi
    // de AYNI yoldan basılır (sipariş şablonuyla aynı kural). Der Standard ist
    // seit der Referenz EIN Satz: «Sehr geehrte …, wir bitten Sie um ein Angebot …».
    const y = titleY + 7.9;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_LETTER);
    doc.setTextColor(...COLOR_TEXT_2);
    const coverLetter = (order.coverLetter || '').trim() || `${L.greeting} ${L.intro}`;
    const coverLines = coverLetter
        .split('\n')
        .flatMap((line) => (line.trim() ? (doc.splitTextToSize(line, CONTENT_W) as string[]) : ['']))
        .slice(0, COVER_LETTER_MAX_LINES);
    doc.text(coverLines, ML, y, { lineHeightFactor: LETTER_LHF });
    return y + (coverLines.length - 1) * FS_LETTER * PT_MM * LETTER_LHF;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABELLE — Kopf, fiyatsız satırlar, Schlusslinie
// ─────────────────────────────────────────────────────────────────────────────

interface TableState { y: number }

/** Der rohe Wert einer eigenen Spalte ('' = nichts eingetragen). */
function requestExtraRaw(item: OrderItem, key: string): string {
    return String(item.extras?.find((entry) => entry.key === key)?.value ?? '').trim();
}

/** Mit Umbruchpunkten fuer lange Nummern (`breakableCode`); `cellLines` entfernt sie. */
function requestExtraValue(item: OrderItem, key: string): string {
    return breakableCode(requestExtraRaw(item, key));
}

function newTablePage(doc: jsPDF, st: TableState, layout: TableLayout) {
    doc.addPage();
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, layout);
}

/**
 * ── DIE KOPFZEILE BRICHT UM, STATT ZU SCHRUMPFEN ─────────────────────────────
 * Dieselbe Regel wie im Bestell-PDF: alle Titel in EINER Schrift (`HEAD_FS`,
 * 5.6 pt); wer nicht in seine Spalte passt, bekommt eine zweite
 * Zeile, alle haengen an der UNTERKANTE. Verkleinert wird nur im Notfall —
 * hoechstens um 1 pt und fuer alle gleich. Die Zeilen packt `splitCaption`
 * selbst, weil die Sperrung mitgemessen werden muss.
 */
type HeadCell = { lines: string[]; x: number; align: 'left' | 'right' };

function splitCaption(doc: jsPDF, label: string, width: number, size: number): { lines: string[]; chopped: boolean } {
    const lines: string[] = [];
    let line = '';
    let chopped = false;
    const fits = (text: string) => captionWidth(doc, text, size) <= width;
    for (const word of label.split(/\s+/).filter(Boolean)) {
        const joined = line ? `${line} ${word}` : word;
        if (fits(joined)) { line = joined; continue; }
        const pieces = captionPieces(word);
        if (pieces.length === 1) {
            if (!fits(word)) chopped = true;
            if (line) lines.push(line);
            line = word;
            continue;
        }
        /* Ein zusammengesetztes Wort bricht an seiner Fuge («PRODUKTTYP-» /
           «NUMMER»); was in eine Zeile passt, bleibt ohne Trennstrich zusammen. */
        if (line) lines.push(line);
        let run = '';
        pieces.forEach((piece, index) => {
            const last = index === pieces.length - 1;
            const trial = run + piece;
            if (fits(trial + (last ? '' : '-'))) { run = trial; return; }
            if (run) lines.push(`${run}-`);
            if (!fits(piece + (last ? '' : '-'))) chopped = true;
            run = piece;
        });
        line = run;
    }
    if (line) lines.push(line);
    return { lines, chopped };
}

function headerSizeFor(doc: jsPDF, label: string, maxW: number, base: number): number {
    const width = Math.max(4, maxW);
    const floor = Math.max(4.6, base - 1);
    let size = base;
    while (size > floor && splitCaption(doc, label, width, size).chopped) size -= 0.2;
    return size;
}

function drawTableHeader(doc: jsPDF, y: number, layout: TableLayout): number {
    // Die Pos-Spalte hat keinen Titel (Referenz). Rechtsbuendige Titel stehen
    // mit ihrer RECHTEN Kante auf der Kante ihrer Zahlen. Die Titel sind die
    // Namen der Vorlage, in ihrer Reihenfolge.
    const specs: Array<[string, number, number, 'left' | 'right']> = layout.cells.map((cell) => {
        const width = cell.width - GAP;
        return [cell.column.caption, cell.align === 'right' ? cell.x + width : cell.x, width, cell.align];
    });
    const base = HEAD_FS;
    const rowSize = Math.min(base, ...specs.map(([label, , maxW]) => headerSizeFor(doc, label, maxW, base)));
    const cells: HeadCell[] = specs.map(([label, x, maxW, align]) =>
        ({ lines: splitCaption(doc, label, Math.max(4, maxW), rowSize).lines, x, align }));
    const lineCount = Math.max(1, ...cells.map((cell) => cell.lines.length));
    const headLh = rowSize * CAPTION_LH;
    const bottom = y + HEAD_PAD_T + rowSize * CAP_RATIO + (lineCount - 1) * headLh;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(rowSize);
    doc.setTextColor(...COLOR_COLUMN_HEAD);
    for (const cell of cells) {
        cell.lines.forEach((line, index) => {
            const ly = bottom - (cell.lines.length - 1 - index) * headLh;
            const lx = cell.align === 'right' ? cell.x - captionWidth(doc, line, rowSize) + CAPTION_SPACING : cell.x;
            doc.text(line, lx, ly, { charSpace: CAPTION_SPACING });
        });
    }
    const ruleY = bottom + HEAD_PAD_B;
    drawRule(doc, ruleY, COLOR_RULE);
    return ruleY;
}

/** Eine Linie ueber die ganze Breite: Haarlinie zwischen Zeilen, Linie unter Kopf und Tabelle. */
function drawRule(doc: jsPDF, y: number, tone: readonly [number, number, number]) {
    doc.setFillColor(tone[0], tone[1], tone[2]);
    doc.rect(ML, y - HAIRLINE_W / 2, CONTENT_W, HAIRLINE_W, 'F');
}

/** Das Ende der Tabelle: die letzte Haarlinie wird zur dunkleren Schlusslinie (Referenz). */
function closeTable(doc: jsPDF, bottom: number) {
    drawRule(doc, bottom, COLOR_RULE);
}

function fitFontSize(doc: jsPDF, text: string, maxW: number, base: number, min = 6.4): number {
    let size = base;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxW) {
        size -= 0.2;
        doc.setFontSize(size);
    }
    return size;
}

function drawFittedRight(
    doc: jsPDF,
    text: string,
    rightX: number,
    maxW: number,
    baseY: number,
    style: 'normal' | 'bold',
    base: number
) {
    doc.setFont(FONT, style);
    fitFontSize(doc, text, maxW, base);
    doc.text(text, rightX, baseY, { align: 'right' });
    doc.setFontSize(base);
}

type OrderItem = PurchaseOrderRow['items'][number];

/** Die Zeilen einer Zelle: der Text bricht in seiner Spalte um. */
function cellLines(doc: jsPDF, text: string, maxW: number, size: number): string[] {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(size);
    const width = Math.max(4, maxW);
    /* Selbst gepackt (siehe orderPdf.ts): `splitTextToSize` kennt nur das
       Leerzeichen als Umbruch; Glieder einer Nummer trennt der Nullbreiten-
       Trenner, der im Druck verschwindet. */
    const lines: string[] = [];
    let line = '';
    for (const word of (text || '—').split(/\s+/).filter(Boolean)) {
        word.split('\u200b').filter(Boolean).forEach((part, index) => {
            const candidate = line + (index === 0 && line ? ' ' : '') + part;
            if (!line || doc.getTextWidth(candidate) <= width) { line = candidate; return; }
            lines.push(line);
            line = part;
        });
    }
    if (line) lines.push(line);
    // Ein Glied, das allein nicht passt, wird als letzter Ausweg zerteilt.
    return lines.flatMap((entry) => (doc.getTextWidth(entry) <= width ? [entry] : (doc.splitTextToSize(entry, width) as string[])));
}

/** Açıklama hücresi: ürün adı (tablonun TEK puntosunda) + seri no ikinci
    satırda (soluk). Der Code steht NICHT hier — er hat seine eigene Spalte. */
function buildRowLines(doc: jsPDF, item: OrderItem, L: PriceRequestPdfStrings, layout: TableLayout): { title: string[]; meta: string[] } {
    const descW = layout.descEnd - layout.descX;
    doc.setFont(FONT, NAME_STYLE);
    doc.setFontSize(layout.fs);
    const title = doc.splitTextToSize((item.name || '').trim(), descW) as string[];
    let meta: string[] = [];
    if (item.serialNumber) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(layout.fs * 0.92);
        meta = doc.splitTextToSize(`${L.serialShort}: ${item.serialNumber}`, descW) as string[];
    }
    return { title, meta };
}

/** Hoehe der Beschreibungszelle ab der ersten Grundlinie (Name + Seriennummer). */
function descBlockH(title: string[], meta: string[], layout: TableLayout): number {
    return (title.length - 1) * layout.lh + (meta.length ? META_GAP + meta.length * layout.lh * 0.92 : 0);
}

function measureRow(doc: jsPDF, item: OrderItem, L: PriceRequestPdfStrings, layout: TableLayout): number {
    const { title, meta } = buildRowLines(doc, item, L, layout);
    // Eine eigene Textspalte bricht in ihrer Spalte um — die hoechste Zelle
    // bestimmt die Zeile. Eine Zahl bricht nicht um.
    const cellLineCounts = layout.cells.map((cell) => {
        if (cell.column.kind !== 'extra' || cell.align === 'right') return 1;
        return cellLines(doc, requestExtraValue(item, cell.column.key), cell.width - GAP, layout.fs).length;
    });
    // BİRİM SATIRI YOKTUR (kullanıcı isteği 2026-08-21: "adet vs. yazmasın").
    const belowFirst = Math.max(descBlockH(title, meta, layout), (Math.max(1, ...cellLineCounts) - 1) * layout.lh);
    return ROW_PAD_T + ROW_PAD_B + layout.fs * (CAP_RATIO + DESCENT_RATIO) + belowFirst;
}

function drawRow(
    doc: jsPDF,
    item: OrderItem,
    index: number,
    y: number,
    rowH: number,
    L: PriceRequestPdfStrings,
    layout: TableLayout,
): number {
    const { fs, lh } = layout;
    const { title, meta } = buildRowLines(doc, item, L, layout);
    const baseY = y + ROW_PAD_T + fs * CAP_RATIO;

    // Pos: schlichte Nummer, blass, eine Spur kleiner.
    doc.setFont(FONT, 'normal');
    doc.setFontSize(fs * POS_RATIO);
    doc.setTextColor(...COLOR_POS);
    doc.text(String(index + 1), C_POS_X, baseY);
    doc.setFontSize(fs);

    for (const cell of layout.cells) {
        const width = cell.width - GAP;
        switch (cell.column.kind) {
            case 'desc': {
                let cy = baseY;
                doc.setFont(FONT, NAME_STYLE);
                doc.setTextColor(...COLOR_TEXT);
                for (const line of title) {
                    doc.text(line, cell.x, cy);
                    cy += lh;
                }
                if (meta.length) {
                    cy += META_GAP - lh + lh * 0.92;
                    doc.setFont(FONT, 'normal');
                    doc.setFontSize(fs * 0.92);
                    doc.setTextColor(...COLOR_CAPTION);
                    for (const line of meta) {
                        doc.text(line, cell.x, cy);
                        cy += lh * 0.92;
                    }
                    doc.setFontSize(fs);
                }
                break;
            }
            case 'extra': {
                // Eigene Spalten: eine Stufe weicher im Ton; eine leere Zelle oder
                // eine Null steht blass. Zahlen stehen rechtsbuendig und brechen nicht um.
                const raw = requestExtraRaw(item, cell.column.key);
                if (!raw || isZeroText(raw)) doc.setTextColor(...COLOR_MUTED);
                else doc.setTextColor(...COLOR_TEXT_2);
                if (cell.align === 'right') {
                    drawFittedRight(doc, raw || '—', cell.x + width, width, baseY, 'normal', fs);
                    break;
                }
                cellLines(doc, requestExtraValue(item, cell.column.key), width, fs)
                    .forEach((line, lineIdx) => doc.text(line, cell.x, baseY + lineIdx * lh));
                break;
            }
            default:
                // Die Menge — ohne Einheit darunter (kullanıcı isteği 2026-08-21).
                doc.setTextColor(...COLOR_TEXT);
                drawFittedRight(doc, fmtQty(item.quantity || 0), cell.x + width, width, baseY, 'normal', fs);
                break;
        }
    }
    doc.setFont(FONT, 'normal');

    drawRule(doc, y + rowH, COLOR_HAIRLINE);
    return y + rowH;
}

/**
 * Die Schlusszeile unter der Tabelle (Referenz): links die Bitte um Einzel-
 * und Gesamtpreise, Lieferzeit und Gueltigkeit, rechts «Freundliche Grüsse ·
 * Halil Tam, OffiTec» — der Name ist der Besteller der Anfrage. Passt beides
 * nicht nebeneinander, steht der Gruss unter der Bitte.
 */
function drawClosing(doc: jsPDF, tableEnd: number, order: PurchaseOrderRow, L: PriceRequestPdfStrings) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_CLOSING);
    const lead = `${L.regards} · `;
    const signer = [oneLine(order.orderedByName || ''), BRAND_NAME].filter(Boolean).join(', ');
    const leadW = doc.getTextWidth(lead);
    const signerW = doc.getTextWidth(signer);
    const beside = CONTENT_W - leadW - signerW - 8;
    const oneRow = doc.getTextWidth(L.closing) <= beside;
    const closingLines = doc.splitTextToSize(L.closing, oneRow ? beside : CONTENT_W) as string[];
    const lineH = FS_CLOSING * PT_MM * 1.45;
    const signOffset = oneRow ? 0 : closingLines.length * lineH + 1;

    let y = tableEnd + CLOSING_GAP;
    if (y + signOffset > CLOSING_BOTTOM) {
        doc.addPage();
        y = CONTENT_TOP_REST + 3;
    }
    doc.setTextColor(...COLOR_CAPTION);
    closingLines.forEach((line, index) => doc.text(line, ML, y + index * lineH));
    const signY = y + signOffset;
    doc.text(lead, MR - signerW - leadW, signY);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(signer, MR - signerW, signY);
}
