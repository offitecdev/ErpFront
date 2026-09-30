/**
 * ── FİYAT TALEBİ (PREISANFRAGE) PDF ŞABLONU ─────────────────────────────────
 * `orderPdf.ts`'in fiyatsız uyarlaması — fiyat talebi aşamasındaki siparişler
 * (TALEP TASLAĞI = DRAFT, gönderilmiş talep = PRICE_REQUEST) için AYRI belge
 * (kullanıcı isteği 2026-08-01). Fiyat sütunu ve toplam bloğu YOKTUR — fiyatlar
 * tedarikçiden İSTENMEKTEDİR.
 *
 * DAS BLATT WIE DIE OFFERTE (29.09.2026 abends — wie die Bestellung, siehe
 * dort): Briefkopf, Belegkarte (Anfrage-Nr. · Projekt-Nr./Kommission · Datum ·
 * Ansprechpartner), Anschrift, Titel mit rotem Strich, Tabelle mit getöntem
 * Kopfband und Zebra — die Spalten der Vorlage, robust für lange Namen und
 * viele Spalten —, darunter die Hinweise als Karte der Offerte. Kein Gruss.
 * Twin von `orderPdf.ts` — Masse und Toene gemeinsam ändern.
 */
import { jsPDF } from 'jspdf';
import { companySenderLine } from './addressBlock';
import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { PurchaseOrderRow } from '../../types/inventory';
import { resolveSupplierPdfColumns, type SupplierPdfColumn } from './supplierPdfColumns';

import {
    OFFER,
    SUPPLIER_FONT,
    drawOfferBand,
    drawOfferFooter,
    drawOfferHeader,
    drawOfferInfoCard,
    drawOfferNoteCard,
    drawOfferRecipient,
    drawOfferTitle,
    fmtDocDate,
    loadOfferLogo,
    loadOfferWave,
    measureOfferNoteCard,
    registerSupplierFonts,
    titleCaption,
} from './supplierPdfKit';
import { localizePurchaseCode } from '@/utils/purchaseCode';
import { localizeProductionCells } from '@/utils/standardOrderColumns';
import { purchaseCommissionOf, purchaseProjectOf } from '@/utils/purchaseProject';

export type PriceRequestPdfLang = 'tr' | 'de' | 'en';

interface PriceRequestPdfStrings {
    docTitle: string;
    /** Beschriftung der Nummer in der Karte — der Name des Dokuments (Referenz). */
    requestNumber: string;
    requestDate: string;
    orderedBy: string;
    project: string;
    /** Die Projektnummer — eine eigene Zeile neben der Kommission (29.09.2026). */
    projectNumber: string;
    supplier: string;
    /** Vor dem Namen des Empfängers in der Anschrift («z. Hd.»). */
    attention: string;
    /** Standard-Anschreiben = `greeting` + ' ' + `intro` — EIN Absatz. */
    greeting: string;
    intro: string;
    /** HINWEISE unter der Tabelle (29.09.2026): `{number}` = Anfragenummer,
        `{commission}` = `notesCommission` oder nichts. */
    notesTitle: string;
    notes: string[];
    notesCommission: string;
    /** Statt der Kommission: die Projektnummer (29.09.2026) — `{p}`. */
    notesProject: string;
    /** Der Gruss am Schluss («Freundliche Grüsse»). */
    regards: string;
    /** Überschrift des Informationsblocks links («Anfrageangaben»). */
    infoCaption: string;
    colPos: string;
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
        requestNumber: 'Talep No',
        requestDate: 'Talep Tarihi',
        orderedBy: 'Talep eden',
        project: 'Komisyon',
        projectNumber: 'Proje No',
        supplier: 'Tedarikçi',
        attention: 'Dikkatine:',
        greeting: 'Sayın Yetkili,',
        intro: 'aşağıda listelenen kalemler için fiyat teklifinizi rica ederiz.',
        notesTitle: 'Bilgilendirme',
        notes: [
            'Lütfen listelenen kalemler için birim ve toplam fiyatları, teslim süresini ve teklifinizin geçerlilik süresini belirtiniz.',
            'Lütfen teklifinizde talep numaramızı ({number}){commission} belirtiniz.',
            'Bu talep bağlayıcı değildir; sipariş ayrıca verilir.',
        ],
        notesCommission: ' ve «{c}» komisyonunu',
        notesProject: ' ve {p} proje numaramızı',
        regards: 'Saygılarımızla',
        infoCaption: 'Talep bilgileri',
        colPos: 'Poz.',
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
        requestNumber: 'Anfrage-Nr.',
        requestDate: 'Anfragedatum',
        orderedBy: 'Ansprechpartner',
        project: 'Kommission',
        projectNumber: 'Projekt-Nr.',
        supplier: 'Lieferant',
        attention: 'z. Hd.',
        greeting: 'Sehr geehrte Damen und Herren,',
        intro: 'wir bitten Sie um ein Angebot für die nachstehenden Positionen.',
        notesTitle: 'Hinweise',
        notes: [
            'Bitte offerieren Sie uns die aufgeführten Positionen mit Einzel- und Gesamtpreisen, Lieferzeit und Gültigkeit Ihrer Offerte.',
            'Bitte vermerken Sie auf Ihrer Offerte unsere Anfragenummer {number}{commission}.',
            'Diese Anfrage ist unverbindlich; eine Bestellung erfolgt separat.',
        ],
        notesCommission: ' sowie die Kommission «{c}»',
        notesProject: ' sowie die Projektnummer {p}',
        regards: 'Freundliche Grüsse',
        infoCaption: 'Anfrageangaben',
        colPos: 'Pos.',
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
        requestNumber: 'Request no.',
        requestDate: 'Request date',
        orderedBy: 'Contact',
        project: 'Commission',
        projectNumber: 'Project no.',
        supplier: 'Supplier',
        attention: 'Attn.',
        greeting: 'Dear Sir or Madam,',
        intro: 'we kindly ask for your quotation for the positions listed below.',
        notesTitle: 'Notes',
        notes: [
            'Please quote the listed positions with unit and total prices, delivery time and the validity of your offer.',
            'Please refer to our request number {number}{commission} in your quotation.',
            'This request is non-binding; any order will be placed separately.',
        ],
        notesCommission: ' and the commission “{c}”',
        notesProject: ' and the project number {p}',
        regards: 'Kind regards',
        infoCaption: 'Request details',
        colPos: 'Pos.',
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
/* Seit dem 29.09.2026 abends das Raster der Offerte (ML 14 · MR 196). */
const ML = OFFER.ML;
const MR = OFFER.MR;
const CONTENT_W = MR - ML;
const PT_MM = 25.4 / 72;

/** Tabellenkopf der Folgeseiten und unterste Zeilenkante — wie die Offerte. */
const CONTENT_TOP_REST = OFFER.CONTENT_TOP_REST;
const CONTENT_BOTTOM = OFFER.CONTENT_BOTTOM;
/** Ön yazı satır sınırı — sipariş şablonuyla aynı (kapak sayfası taşmasın). */
const COVER_LETTER_MAX_LINES = 20;
/** So viel Platz muss unter dem Anschreiben bleiben, damit die Tabelle auf Seite 1 beginnt. */
const TABLE_START_MIN = 70;
/** Von der letzten Zeile des Anschreibens bis zum Tabellenkopf. */
const TABLE_GAP = 7;

/* Die Tabelle wie die Offerte (29.09.2026 abends): kein Rahmen, getöntes
   Kopfband, Zebra, Haarlinien; Pos 1.5 mm vom Rand, die letzte Zahl 1 mm vor
   dem rechten Rand. */
const C_POS_X = ML + 1.5;
const C_DESC = ML + 11;
const C_QTY_R = OFFER.PRICE_R;
/* Der Produktname FETT wie die Positionstitel der Offerte (9.4 pt bei 9 pt Tabelle). */
const NAME_STYLE = 'bold' as const;
const nameSizeOf = (fs: number): number => fs + 0.4;

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
    /** Luft zwischen zwei Spalten und Schrift der Titel — aus der Dichtestufe. */
    gap: number;
    headFs: number;
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
    doc.setFont(FONT, 'bold');
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
    step: TableStep,
    valueStyle: 'normal' | 'bold' = 'normal',
): MeasuredColumn => {
    const { fs, gap } = step;
    // Der Titel darf ein wenig schrumpfen (`headerSizeFor`), bevor er die Spalte breiter macht.
    const headMin = widestCaptionWord(doc, header, step.head * CAPTION_SQUEEZE);
    const headFull = captionWidth(doc, header, step.head);
    const valueMin = Math.max(0, ...values.map((value) => widestWord(doc, value, valueStyle, fs)));
    const valueFull = Math.max(0, ...values.map((value) => fullWidth(doc, value, valueStyle, fs)));
    const valueNeed = align === 'right' ? valueFull : valueMin;
    const min = Math.max(headMin, valueNeed) * 1.03 + gap;
    return {
        kind,
        min,
        full: Math.max(min, Math.max(headFull, valueFull) * 1.03 + gap),
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
    const roomFor = (gap: number): number => C_QTY_R + gap - C_DESC;
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

    const measureAll = (step: TableStep): MeasuredColumn[] =>
        others.map((column, index) => measureColumn(doc, column.key, column.caption, valuesOf(column, aligns[index]), aligns[index], step));
    const descMinFor = (step: TableStep): number => Math.max(
        DESC_MIN_W,
        widestCaptionWord(doc, desc?.caption ?? '', step.head * CAPTION_SQUEEZE) * 1.03 + step.gap,
        ...names.map((name) => widestWord(doc, name, NAME_STYLE, nameSizeOf(step.fs)) * 1.03 + step.gap),
    );
    const minSumOf = (measured: MeasuredColumn[]) => measured.reduce((sum, column) => sum + column.min, 0);

    /* ── Die Dichtestufe: die erste, in der jede Spalte ihr Mindestmass bekommt.
       Sie gilt fuer die GANZE Tabelle — Titel, Namen, Werte, Abstände. ──── */
    let step: TableStep = TABLE_STEPS[TABLE_STEPS.length - 1];
    for (const candidate of TABLE_STEPS) {
        if (minSumOf(measureAll(candidate)) + descMinFor(candidate) <= roomFor(candidate.gap)) { step = candidate; break; }
    }
    const { fs, gap } = step;
    const room = roomFor(gap);
    const measured = measureAll(step);
    const descMin = descMinFor(step);
    const minSum = minSumOf(measured);

    let widths: number[];
    let descW: number;
    if (minSum + descMin > room) {
        descW = Math.max(DESC_HARD_MIN_W, room - minSum);
        const deficit = Math.max(0, minSum + descW - room);
        const textMin = measured.reduce((sum, column) => sum + (column.align === 'left' ? column.min : 0), 0);
        const textScale = textMin > 0 ? Math.max(0.4, (textMin - deficit) / textMin) : 1;
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
        const descFull = Math.max(descMin, ...names.map((name) => fullWidth(doc, name, NAME_STYLE, nameSizeOf(fs)) * 1.03 + gap));
        const floorGrow = Math.min(spare, Math.max(0, Math.min(DESC_FLOOR_W, descFull) - descMin));
        spare -= floorGrow;
        spare = growToward(widths, measured.map((column) => column.full), spare);
        descW = descMin + floorGrow + spare;
    }

    /* ── Von links nach rechts aufstellen — in der Reihenfolge der Vorlage ── */
    const cells: LayoutCell[] = [];
    let x = C_DESC;
    let descX = C_DESC;
    let descEnd = C_DESC + descW - gap;
    let position = 0;
    for (const column of columns) {
        if (column.kind === 'desc') {
            descX = x;
            descEnd = x + descW - gap;
            cells.push({ column, x, width: descW, align: 'left' });
            x += descW;
            continue;
        }
        const width = widths[position];
        cells.push({ column, x, width, align: aligns[position] });
        x += width;
        position += 1;
    }
    return { cells, descX, descEnd, fs, lh: fs * LH_RATIO, gap, headFs: step.head };
};

/* DAS BLATT NACH DER REFERENZ (Vorgabe Samet, 11.09.2026) — dieselben Masse
   und Toene wie im Bestell-PDF; nur Haarlinien, Navy fuer Titel und Nummer.

   DIE ZWEI SCHRIFTEN DER TABELLE (Vorgabe Samet, 11.09.2026, als CSS notiert):
     Spaltentitel    Liberation Sans Regular · 5.6 pt · UPPERCASE · letter-spacing 0.35px · #8E8E92
     Normaler Text   Liberation Sans Regular · 8 pt · ohne Umwandlung · letter-spacing 0 · #1D1D1F
   8 pt ist DIE Groesse; `TABLE_SIZES` geht nur tiefer, wenn eine Tabelle
   (sechs eigene Spalten neben allen Preisen) sonst nicht aufs Blatt passt. */
/* 29.09.2026, zweite Runde (Arial, «yazı tiplerini netleştir») — wie im
   Bestell-PDF: Lesegrösse 9.2 pt, Titel fett in Navy-Versalien. */
/* DIE DICHTESTUFEN (29.09.2026 abends, Samet: «uzun metinlere, fiyatlara ve 8–9
   sütun adına dayanıklı olmalı»): Schrift, Spaltenabstand und Titelschrift gehen
   GEMEINSAM eine Stufe tiefer, bis jede Spalte ihr Mindestmass bekommt — das
   breiteste Wort ihres Werts, bei Zahlen der ganze Betrag. Die erste passende
   Stufe gilt für die GANZE Tabelle. Neun Spalten stehen so ohne ein zerhacktes
   Wort; erst jenseits davon bricht als letzter Ausweg ein Wort. */
const TABLE_STEPS: ReadonlyArray<{ fs: number; gap: number; head: number }> = [
    { fs: 9, gap: 4.2, head: 8.4 },
    { fs: 8.6, gap: 3.8, head: 8.1 },
    { fs: 8.2, gap: 3.4, head: 7.8 },
    { fs: 7.8, gap: 3, head: 7.4 },
    { fs: 7.4, gap: 2.6, head: 7 },
    { fs: 7, gap: 2.2, head: 6.6 },
];
type TableStep = (typeof TABLE_STEPS)[number];
/** Ein Titel darf bis auf diesen Anteil seiner Stufe schrumpfen, bevor er seine Spalte breiter macht. */
const CAPTION_SQUEEZE = 0.88;
/** Das harte Minimum der Beschreibung, wenn selbst die kleinste Stufe nicht reicht —
    der Produktname bleibt lesbar; nachgeben müssen zuerst die eigenen Textspalten. */
const DESC_HARD_MIN_W = 34;
const CAPTION_SPACING = 0;
const CAPTION_LH = 0.43;
/** Fliesstext 9 pt → 4.4 mm wie die Offerte. */
const LH_RATIO = 0.489;
const ROW_PAD = 3;
const ROW_MIN_H = 11;
const ROW_BLOCK_GAP = 1.4;
const MIN_ROW_START = 16;
const HEAD_H = 9.6;
const HEAD_GAP = 2;
const HAIRLINE_W = 0.15;
const nameLhOf = (fs: number): number => nameSizeOf(fs) * 0.5;
const firstBaseOf = (fs: number): number => ROW_PAD + 2.8 * nameSizeOf(fs) / 9.4;

/* Das Anschreiben wie der Einleitungstext der Offerte: 10 pt, Zeilenfaktor 1.35. */
const FS_LETTER = 10;
const LETTER_LHF = 1.35;

/* Die Töne der Offerte (`OFFER.tones`). */
const TONES = OFFER.tones;
const COLOR_TEXT = TONES.TEXT;
const COLOR_CAPTION = TONES.LABEL;
const COLOR_MUTED = TONES.MUTED;
const COLOR_COLUMN_HEAD = TONES.NAVY;
const COLOR_POS = TONES.TEXT;
const COLOR_HAIRLINE = TONES.HAIRLINE;

/* ARIAL — `supplierPdfKit.registerSupplierFonts`. */
const FONT = SUPPLIER_FONT;

// ── Biçimleyiciler ───────────────────────────────────────────────────────────
/* Mengen ohne leere Nachkommastellen — «2», «2,5» (Referenz). */
const fmtQty = (v: number) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v || 0);

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
    sourceOrder: PurchaseOrderRow,
    settings: PdfCompanySettings,
    lang: PriceRequestPdfLang = 'de'
): Promise<Uint8Array> {
    // DER CODE STEHT IN DER SPRACHE DES BELEGS (Vorgabe Samet, 21.09.2026):
    // gespeichert ist die deutsche Schreibweise (`PA-`/`BE-`), gedruckt wird
    // `FT-`/`SP-` (tr) bzw. `PR-`/`PO-` (en). Die Kopie traegt sie durch das
    // ganze Dokument — Fusszeile, Karte, Titel und Dateiname.
    // Die Einheit der Produktion (`stdUnit`) in der Sprache des Belegs — «Adet» wird «Stk» (30.09.2026).
    const order = {
        ...sourceOrder,
        referenceNumber: localizePurchaseCode(sourceOrder.referenceNumber, lang),
        items: localizeProductionCells(sourceOrder.items ?? [], lang),
    };
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    // Der Titel ersetzt in der Vorschau (blob:-URL) die UUID als Dokumentname.
    doc.setProperties({ title: order.referenceNumber || 'Preisanfrage' });
    doc.viewerPreferences({ DisplayDocTitle: true });
    await registerSupplierFonts(doc);
    // Jede Zeile setzt ihre Sperrung selbst (0 Tc) — sonst erbte der Text nach
    // einem gesperrten Spaltentitel dessen Sperrung.
    doc.setCharSpace(0);
    const logo = await loadOfferLogo(doc);
    const wave = await loadOfferWave();
    const L = I18N[lang];
    // Die Tabelle traegt ihre Titel in Grossbuchstaben (Referenz).
    // Heisst noch `upper`, schreibt seit 29.09.2026 spät aber «Produkt - Material».
    const upper = (label: string) => titleCaption(label, captionLocale(label, lang));

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
        lang,
    }).map((column) => ({ ...column, caption: upper(column.caption) }));
    const layout = buildTableLayout(doc, order, columns);
    const posCaption = upper(L.colPos);
    const st: TableState = { y: 0 };
    if (CONTENT_BOTTOM - letterEnd >= TABLE_START_MIN) {
        st.y = drawTableHeader(doc, letterEnd + TABLE_GAP, layout, posCaption);
    } else {
        doc.addPage();
        st.y = drawTableHeader(doc, CONTENT_TOP_REST, layout, posCaption);
    }

    order.items.forEach((item, index) => {
        const h = measureRow(doc, item, L, layout);
        if (st.y + h > CONTENT_BOTTOM || CONTENT_BOTTOM - st.y < MIN_ROW_START) {
            newTablePage(doc, st, layout, posCaption);
        }
        st.y = drawRow(doc, item, index, st.y, Math.min(h, CONTENT_BOTTOM - st.y), L, layout);
    });
    // Toplam bloğu YOKTUR — fiyatlar tedarikçiden istenmektedir. Statt dessen die
    // HINWEISE als Karte der Offerte über die ganze Breite. Kein Gruss danach
    // (29.09.2026: «Freundliche Grüsse … sil»).
    const notes = requestNotes(order, L);
    if (notes.length) {
        let y = st.y + 9;
        if (y + measureOfferNoteCard(doc, notes, CONTENT_W) > CONTENT_BOTTOM) {
            doc.addPage();
            y = CONTENT_TOP_REST + 4;
        }
        drawOfferNoteCard(doc, { x: ML, y, w: CONTENT_W, title: L.notesTitle, notes });
    }

    // ── Antet & alt bilgi dekorasyonu (tüm sayfalar) ─────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawOfferHeader(doc, logo, wave, settings);
        drawOfferFooter(doc, companySenderLine(settings, '  ·  '), `${L.pageWord} ${i} ${L.pageOf} ${pageCount}`);
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
    a.download = `${localizePurchaseCode(order.referenceNumber, lang)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// SAYFA 1 — Karte (links), Absender & Lieferant (rechts), Titel, Anschreiben
// ─────────────────────────────────────────────────────────────────────────────

/* ═══ SEITE 1 WIE DIE OFFERTE (29.09.2026 abends) — wie im Bestell-PDF ═══ */

/** Die Hinweise dieser Anfrage — mit ihrer Nummer und, falls vorhanden, der Kommission. */
/* PROJEKTNUMMER STATT KOMMISSION (29.09.2026, Samet: «siparişlerde komisyon yerine proje
   numarası olması gerekiyor»): auf Lieferschein, Rechnung und Offerte soll der Lieferant
   unsere Projektnummer angeben; ohne Projekt bleibt die Kommission (freier Text). */
function requestNotes(order: PurchaseOrderRow, L: PriceRequestPdfStrings): string[] {
    const project = purchaseProjectOf(order);
    const commission = purchaseCommissionOf(order, project);
    const reference = project?.number
        ? L.notesProject.replace('{p}', project.number)
        : commission ? L.notesCommission.replace('{c}', commission) : '';
    return L.notes.map((note) => note
        .replace('{number}', order.referenceNumber)
        .replace('{commission}', reference));
}

/**
 * Seite 1 bis zum Anschreiben. Gibt die Höhe zurück, unter der (plus
 * `TABLE_GAP`) die Tabelle beginnt: die letzte Zeile des Anschreibens — oder,
 * ohne Anschreiben, gleich unter dem Titel.
 */
function drawCoverPage(doc: jsPDF, order: PurchaseOrderRow, s: PdfCompanySettings, L: PriceRequestPdfStrings): number {
    // Projektnummer statt Kommission, wo es ein Projekt gibt (29.09.2026).
    const project = purchaseProjectOf(order);
    const cardBottom = drawOfferInfoCard(doc, [
        { label: L.requestNumber, value: order.referenceNumber, emphasize: true },
        project?.number
            ? { label: L.projectNumber, value: project.number }
            : { label: L.project, value: purchaseCommissionOf(order, null) },
        { label: L.requestDate, value: fmtDocDate(order.createdAt) },
        { label: L.orderedBy, value: oneLine(order.orderedByName || '') },
    ]);
    const attention = oneLine(order.recipientName || '');
    const addrBottom = drawOfferRecipient(doc, {
        sender: companySenderLine(s, ' · '),
        name: order.supplierName || '',
        attention: attention ? `${L.attention} ${attention}` : '',
        address: order.supplierAddress,
    });
    const titleBase = Math.max(cardBottom, addrBottom) + 16;
    // «Preisanfrage PA-2026-044» — die Nummer steht immer beim Titel.
    drawOfferTitle(doc, titleBase, `${L.docTitle} ${order.referenceNumber}`);

    /* ÖN YAZI: nur, was der Vorgang selbst trägt; leer = keines. */
    const letter = (order.coverLetter || '').trim();
    if (!letter) return titleBase + 10 - TABLE_GAP;
    const y = titleBase + 12;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_LETTER);
    doc.setTextColor(...COLOR_TEXT);
    const lines = letter
        .split('\n')
        .flatMap((line) => (line.trim() ? (doc.splitTextToSize(line, CONTENT_W) as string[]) : ['']))
        .slice(0, COVER_LETTER_MAX_LINES);
    doc.text(lines, ML, y, { lineHeightFactor: LETTER_LHF });
    return y + (lines.length - 1) * FS_LETTER * PT_MM * LETTER_LHF;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABELLE — Kopf, fiyatsız satırlar, Schlusslinie
// ─────────────────────────────────────────────────────────────────────────────

/** Wo die Tabelle steht: die Unterkante der letzten Zeile. */
interface TableState { y: number }

/** Der rohe Wert einer eigenen Spalte ('' = nichts eingetragen). */
function requestExtraRaw(item: OrderItem, key: string): string {
    return String(item.extras?.find((entry) => entry.key === key)?.value ?? '').trim();
}

/** Mit Umbruchpunkten fuer lange Nummern (`breakableCode`); `cellLines` entfernt sie. */
function requestExtraValue(item: OrderItem, key: string): string {
    return breakableCode(requestExtraRaw(item, key));
}

function newTablePage(doc: jsPDF, st: TableState, layout: TableLayout, posCaption: string) {
    doc.addPage();
    st.y = drawTableHeader(doc, CONTENT_TOP_REST, layout, posCaption);
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
    const floor = Math.max(5.4, base - 1.6);
    let size = base;
    while (size > floor && splitCaption(doc, label, width, size).chopped) size -= 0.2;
    return size;
}

function drawTableHeader(doc: jsPDF, y: number, layout: TableLayout, posCaption: string): number {
    /* Der Kopf der Offerte: getöntes Band, Titel fett in Navy; ein langer Titel
       der Vorlage wird zweizeilig und das Band wächst mit (wie im Bestell-PDF). */
    const specs: Array<[string, number, number, 'left' | 'right']> = layout.cells.map((cell) => {
        const width = cell.width - layout.gap;
        return [cell.column.caption, cell.align === 'right' ? cell.x + width : cell.x, width, cell.align];
    });
    const base = layout.headFs;
    const rowSize = Math.min(base, ...specs.map(([label, , maxW]) => headerSizeFor(doc, label, maxW, base)));
    const cells: HeadCell[] = specs.map(([label, x, maxW, align]) =>
        ({ lines: splitCaption(doc, label, Math.max(4, maxW), rowSize).lines, x, align }));
    const lineCount = Math.max(1, ...cells.map((cell) => cell.lines.length));
    const headLh = rowSize * CAPTION_LH;
    const bandH = HEAD_H + (lineCount - 1) * headLh;
    drawOfferBand(doc, y, ML, CONTENT_W, bandH);
    const bottom = y + bandH - (HEAD_H / 2 - 1.3);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(rowSize);
    doc.setTextColor(...COLOR_COLUMN_HEAD);
    doc.text(posCaption, C_POS_X, bottom);
    for (const cell of cells) {
        cell.lines.forEach((line, index) => {
            const ly = bottom - (cell.lines.length - 1 - index) * headLh;
            const lx = cell.align === 'right' ? cell.x - captionWidth(doc, line, rowSize) + CAPTION_SPACING : cell.x;
            doc.text(line, lx, ly);
        });
    }
    return y + bandH + HEAD_GAP;
}

/** Eine Haarlinie über die ganze Breite (zwischen den Zeilen). */
function drawRule(doc: jsPDF, y: number, tone: readonly [number, number, number]) {
    doc.setDrawColor(tone[0], tone[1], tone[2]);
    doc.setLineWidth(HAIRLINE_W);
    doc.line(ML, y, MR, y);
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
    doc.setFontSize(nameSizeOf(layout.fs));
    const title = doc.splitTextToSize((item.name || '').trim(), descW) as string[];
    let meta: string[] = [];
    const serial = (item.serialNumber || '').trim();
    if (serial) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(layout.fs);
        // Bringt die Nummer ihre Beschriftung schon mit, kommt keine zweite davor (wie im Bestell-PDF).
        meta = doc.splitTextToSize(serial.includes(':') ? serial : `${L.serialShort}: ${serial}`, descW) as string[];
    }
    return { title, meta };
}

/** Inhalt der Beschreibung von der Oberkante der ersten Zeile an (Name + Seriennummer) — wie die Offerte. */
function descContentH(title: string[], meta: string[], layout: TableLayout): number {
    return title.length * nameLhOf(layout.fs) + (meta.length ? ROW_BLOCK_GAP + meta.length * layout.lh : 0);
}

/**
 * Die Höhe einer Zeile wie in der Offerte (3 mm Innenabstand, mindestens
 * 11 mm); eine eigene Textspalte bricht in ihrer Spalte um — die höchste
 * Zelle bestimmt die Zeile. Eine Zahl bricht nie um. BİRİM SATIRI YOKTUR
 * (kullanıcı isteği 2026-08-21: «adet vs. yazmasın»).
 */
function measureRow(doc: jsPDF, item: OrderItem, L: PriceRequestPdfStrings, layout: TableLayout): number {
    const { title, meta } = buildRowLines(doc, item, L, layout);
    const cellLineCounts = layout.cells.map((cell) => {
        if (cell.column.kind !== 'extra' || cell.align === 'right') return 1;
        return cellLines(doc, requestExtraValue(item, cell.column.key), cell.width - layout.gap, layout.fs).length;
    });
    const cellsH = (firstBaseOf(layout.fs) - ROW_PAD) + (Math.max(1, ...cellLineCounts) - 1) * layout.lh + 1.4;
    return Math.max(ROW_MIN_H * layout.fs / 9, Math.max(descContentH(title, meta, layout), cellsH) + ROW_PAD * 2);
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
    const baseY = y + firstBaseOf(fs);

    // Zebra wie die Offerte.
    if (index % 2 === 1) {
        doc.setFillColor(...TONES.ZEBRA);
        doc.rect(ML, y, CONTENT_W, rowH, 'F');
    }

    doc.setFont(FONT, 'normal');
    doc.setFontSize(fs * 8.2 / 9);
    doc.setTextColor(...COLOR_POS);
    doc.text(String(index + 1), C_POS_X, baseY);
    doc.setFontSize(fs);

    for (const cell of layout.cells) {
        const width = cell.width - layout.gap;
        switch (cell.column.kind) {
            case 'desc': {
                let cy = baseY;
                doc.setFont(FONT, NAME_STYLE);
                doc.setFontSize(nameSizeOf(fs));
                doc.setTextColor(...COLOR_TEXT);
                for (const line of title) {
                    doc.text(line, cell.x, cy);
                    cy += nameLhOf(fs);
                }
                if (meta.length) {
                    cy += ROW_BLOCK_GAP - nameLhOf(fs) + lh;
                    doc.setFont(FONT, 'normal');
                    doc.setFontSize(fs);
                    doc.setTextColor(...COLOR_CAPTION);
                    for (const line of meta) {
                        doc.text(line, cell.x, cy);
                        cy += lh;
                    }
                }
                doc.setFontSize(fs);
                break;
            }
            case 'extra': {
                const raw = requestExtraRaw(item, cell.column.key);
                doc.setFont(FONT, 'normal');
                if (!raw || isZeroText(raw)) doc.setTextColor(...COLOR_MUTED);
                else doc.setTextColor(...COLOR_TEXT);
                if (cell.align === 'right') {
                    drawFittedRight(doc, raw || '—', cell.x + width, width, baseY, 'normal', fs);
                    break;
                }
                cellLines(doc, requestExtraValue(item, cell.column.key), width, fs)
                    .forEach((line, lineIdx) => doc.text(line, cell.x, baseY + lineIdx * lh));
                break;
            }
            default:
                // Die Menge — fett wie der Betrag der Offerte, ohne Einheit darunter (2026-08-21).
                doc.setTextColor(...COLOR_TEXT);
                drawFittedRight(doc, fmtQty(item.quantity || 0), cell.x + width, width, baseY, 'bold', fs);
                break;
        }
    }
    doc.setFont(FONT, 'normal');

    drawRule(doc, y + rowH, COLOR_HAIRLINE);
    return y + rowH;
}
