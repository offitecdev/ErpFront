/**
 * ── LIEFERSCHEIN-PDF (28.09.2026, Vorgabe Samet) ─────────────────────────────
 *
 * Der Beleg, der mit der Ware geht. Gesicht wie die Offerte — Logo, Dalga,
 * Fusszeile, Schrift und Farben kommen aus `tenderPdfModern.brandKit`, damit es
 * EINE Quelle bleibt —, aber schlichter, so wie Samet es abgenommen hat:
 *
 *  • links die Belegkarte (weiss, eine Haarlinie, KEIN Farbstreifen, keine
 *    Tönung), rechts Absenderzeile, Kunde und darunter GENAU EINE
 *    Zusatzanschrift — die auf der Offerte gewählte Projekt- ODER Lieferadresse;
 *  • Titel ohne roten Strich, darunter die Tabelle: Pos · Art.-Nr. ·
 *    Bezeichnung · Bestellt · Geliefert · Offen · Einheit — keine Preise;
 *  • Rot nur dort, wo wirklich noch etwas offen ist;
 *  • keine Unterschriftsfelder, kein Kleingedrucktes — höchstens eine
 *    Bemerkung unter der Tabelle.
 *
 * Die Offertvorlage selbst bleibt unverändert (Vorgabe: «nasılsa öyle,
 * değiştirme»).
 */
import { jsPDF } from 'jspdf';

import type { PdfCompanySettings } from '../../store/pdfSettingsStore';
import { companySenderLine, drawAddressBlockLines, drawFittedSingleLine } from './addressBlock';
import { brandKit, pdfStringsFor, type PdfLang } from './tenderPdfModern';

const {
    FONT, C, ML, MR, CONTENT_W, CONTENT_BOTTOM,
    LOGO_X, LOGO_Y, WAVE_W, WAVE_H, WAVE_CENTER_Y,
    CONTACT_PHONE, CONTACT_EMAIL, CONTACT_WEB,
} = brandKit;

export interface DeliveryNotePdfLine {
    positionNumber?: string | null;
    articleCode?: string | null;
    description: string;
    unit?: string | null;
    /** 0 = von Hand ergänzte Zeile ohne Bestellwert. */
    orderedQty: number;
    deliveredQty: number;
    /** Bestellt minus alles bis und mit diesem Lieferschein; null = keine Angabe. */
    openQty: number | null;
}

export interface DeliveryNotePdfData {
    noteNumber: string;
    /** JJJJ-MM-TT oder ISO */
    deliveryDate: string | null;
    orderNumber?: string | null;
    projectNumber?: string | null;
    customerReference?: string | null;
    customerName?: string | null;
    customerAddress?: string | null;
    siteAddress?: { kind: 'INSTALLATION' | 'DELIVERY'; address: string } | null;
    note?: string | null;
    lines: DeliveryNotePdfLine[];
    lang?: PdfLang;
}

type Strings = {
    title: string;
    number: string;
    date: string;
    order: string;
    project: string;
    reference: string;
    colPos: string;
    colCode: string;
    colDescription: string;
    colOrdered: string;
    colDelivered: string;
    colOpen: string;
    colUnit: string;
};

const STRINGS: Record<PdfLang, Strings> = {
    de: {
        title: 'Lieferschein',
        number: 'Lieferschein-Nr.',
        date: 'Lieferdatum',
        order: 'Auftrag',
        project: 'Projekt',
        reference: 'Ihre Referenz',
        colPos: 'Pos.',
        colCode: 'Art.-Nr.',
        colDescription: 'Bezeichnung',
        colOrdered: 'Bestellt',
        colDelivered: 'Geliefert',
        colOpen: 'Offen',
        colUnit: 'Einh.',
    },
    en: {
        title: 'Delivery Note',
        number: 'Delivery note no.',
        date: 'Delivery date',
        order: 'Order',
        project: 'Project',
        reference: 'Your reference',
        colPos: 'Pos.',
        colCode: 'Item no.',
        colDescription: 'Description',
        colOrdered: 'Ordered',
        colDelivered: 'Delivered',
        colOpen: 'Open',
        colUnit: 'Unit',
    },
    tr: {
        title: 'İrsaliye',
        number: 'İrsaliye no.',
        date: 'Teslim tarihi',
        order: 'Sipariş',
        project: 'Proje',
        reference: 'Referansınız',
        colPos: 'Poz.',
        colCode: 'Ürün no.',
        colDescription: 'Açıklama',
        colOrdered: 'Sipariş',
        colDelivered: 'Teslim',
        colOpen: 'Açık',
        colUnit: 'Birim',
    },
};

// ── Geometrie (mm) — die abgenommene Vorlage v6 ─────────────────────────────
const TOP_FIRST = 41;          // Karte und Absenderzeile beginnen auf gleicher Höhe
const TOP_REST = 38;           // Tabellenkopf auf Folgeseiten
const CARD_W = 82;
const CARD_PAD = 4.4;
const CARD_HEAD_H = 8.4;
const CARD_ROW_H = 6.6;
const ADDR_X = 112;
const ADDR_W = MR - ADDR_X;
const HEAD_H = 8.6;
const CELL_PAD = 2.4;
const ROW_PAD = 2.6;
const LINE_H = 4.2;
const FS_BODY = 9.2;
const FS_HEAD = 7.8;
const FS_LABEL = 7.3;
const LETTER = 0.15;           // Sperrung der Versalien-Beschriftungen

// Spalten von rechts: Einheit 14 · Offen 16 · Geliefert 20 · Bestellt 19
const COL_UNIT_W = 14;
const COL_OPEN_W = 16;
const COL_DELIV_W = 20;
const COL_ORDER_W = 19;
const COL_POS_W = 11;
const COL_CODE_W = 32;
const X_POS = ML + CELL_PAD;
const X_CODE = ML + COL_POS_W + CELL_PAD;
const X_DESC = ML + COL_POS_W + COL_CODE_W + CELL_PAD;
const R_UNIT_CENTER = MR - COL_UNIT_W / 2;
const R_OPEN = MR - COL_UNIT_W - CELL_PAD;
const R_DELIV = MR - COL_UNIT_W - COL_OPEN_W - CELL_PAD;
const R_ORDER = MR - COL_UNIT_W - COL_OPEN_W - COL_DELIV_W - CELL_PAD;
const DESC_W = (MR - COL_UNIT_W - COL_OPEN_W - COL_DELIV_W - COL_ORDER_W) - X_DESC - CELL_PAD;

const fmtQty = (value: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 3 }).format(Number(value) || 0);

const fmtDay = (value?: string | null) => {
    if (!value) return '';
    const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (day) return `${day[3]}.${day[2]}.${day[1]}`;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};

const hairline = (doc: jsPDF, x1: number, y: number, x2: number, width = 0.15) => {
    doc.setDrawColor(...C.HAIRLINE);
    doc.setLineWidth(width);
    doc.line(x1, y, x2, y);
};

// ── Kopf: Logo + Dalga + Kontaktzeile (Punkte statt Symbole, wie v6) ────────
const drawHeader = (
    doc: jsPDF,
    logo: { dataUrl: string; w: number; h: number } | null,
    wave: string | null,
) => {
    if (logo) {
        try {
            doc.addImage(logo.dataUrl, 'PNG', LOGO_X, LOGO_Y, logo.w, logo.h, 'offitec-logo', 'FAST');
        } catch { /* ohne Logo bleibt der Kopf Dalga + Kontakt */ }
    }
    if (wave) {
        try {
            doc.addImage(wave, 'PNG', MR - WAVE_W, WAVE_CENTER_Y - WAVE_H / 2, WAVE_W, WAVE_H, 'offitec-header-wave', 'FAST');
        } catch { /* Dalga optional */ }
    }
    const items = [CONTACT_PHONE, CONTACT_EMAIL, CONTACT_WEB];
    const dot = '·';
    const gap = 2.2;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.8);
    const dotW = doc.getTextWidth(dot);
    const total = items.reduce((sum, item) => sum + doc.getTextWidth(item), 0) + (items.length - 1) * (dotW + gap * 2);
    let x = MR - total;
    const baseline = 32;
    items.forEach((item, index) => {
        doc.setTextColor(...C.LABEL);
        doc.text(item, x, baseline);
        x += doc.getTextWidth(item);
        if (index < items.length - 1) {
            doc.setTextColor(...C.MUTED);
            doc.text(dot, x + gap, baseline);
            x += dotW + gap * 2;
        }
    });
};

// ── Belegkarte links ─────────────────────────────────────────────────────────
const drawCard = (doc: jsPDF, rows: Array<[string, string]>, S: Strings, noteNumber: string): number => {
    const all: Array<[string, string, boolean]> = [
        [S.number, noteNumber, true],
        ...rows.filter(([, value]) => value.trim()).map(([label, value]): [string, string, boolean] => [label, value, false]),
    ];
    const height = all.reduce((sum, [, , head]) => sum + (head ? CARD_HEAD_H : CARD_ROW_H), 0);
    const left = ML + CARD_PAD;
    const right = ML + CARD_W - CARD_PAD;
    let y = TOP_FIRST;
    all.forEach(([label, value, head], index) => {
        const h = head ? CARD_HEAD_H : CARD_ROW_H;
        const base = y + h / 2 + 1.2;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_LABEL);
        doc.setTextColor(...C.LABEL);
        doc.text(label.toUpperCase(), left, base, { charSpace: LETTER });
        doc.setFont(FONT, 'bold');
        doc.setFontSize(head ? 10.5 : 9);
        if (head) doc.setTextColor(...C.NAVY);
        else doc.setTextColor(...C.TEXT);
        doc.text(value, right, base, { align: 'right' });
        y += h;
        if (index < all.length - 1) hairline(doc, left, y, right);
    });
    doc.setDrawColor(...C.HAIRLINE);
    doc.setLineWidth(0.25);
    doc.rect(ML, TOP_FIRST, CARD_W, height, 'S');
    return TOP_FIRST + height;
};

// ── Anschriften rechts ───────────────────────────────────────────────────────
const drawAddresses = (doc: jsPDF, data: DeliveryNotePdfData, settings: PdfCompanySettings, lang: PdfLang): number => {
    const sender = companySenderLine(settings, ' · ');
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...C.MUTED);
    drawFittedSingleLine(doc, sender, ADDR_X, TOP_FIRST + 2.4, ADDR_W, 6.8, 5.6);
    hairline(doc, ADDR_X, TOP_FIRST + 3.6, MR, 0.2);

    let y = TOP_FIRST + 11.4;
    doc.setTextColor(...C.TEXT);
    if (data.customerName) {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(10);
        const nameLines = doc.splitTextToSize(data.customerName, ADDR_W) as string[];
        doc.text(nameLines, ADDR_X, y);
        y += nameLines.length * 4.8;
    }
    if (data.customerAddress) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(10);
        y = drawAddressBlockLines(doc, data.customerAddress, ADDR_X, y, ADDR_W, 10, 4.8);
    }
    // Genau EINE Zusatzanschrift — dieselbe Zeichnung wie auf der Offerte.
    return brandKit.drawSiteAddress(doc, data.siteAddress ?? null, pdfStringsFor(lang), ADDR_X, y, ADDR_W);
};

// ── Tabelle ──────────────────────────────────────────────────────────────────
const drawTableHead = (doc: jsPDF, y: number, S: Strings): number => {
    doc.setFillColor(...C.HEAD_BG);
    doc.rect(ML, y, CONTENT_W, HEAD_H, 'F');
    doc.setFillColor(...C.NAVY_SOFT);
    doc.rect(ML, y + HEAD_H - 0.35, CONTENT_W, 0.35, 'F');
    const base = y + HEAD_H / 2 + 1.1;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_HEAD);
    doc.setTextColor(...C.NAVY);
    const head = (text: string, x: number, align: 'left' | 'right' | 'center' = 'left') =>
        doc.text(text.toUpperCase(), x, base, { align, charSpace: 0.1 });
    head(S.colPos, X_POS);
    head(S.colCode, X_CODE);
    head(S.colDescription, X_DESC);
    head(S.colOrdered, R_ORDER, 'right');
    head(S.colDelivered, R_DELIV, 'right');
    head(S.colOpen, R_OPEN, 'right');
    head(S.colUnit, R_UNIT_CENTER, 'center');
    return y + HEAD_H;
};

const measureLine = (doc: jsPDF, line: DeliveryNotePdfLine) => {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BODY);
    const text = doc.splitTextToSize(line.description || '', DESC_W) as string[];
    return { text, height: ROW_PAD * 2 + Math.max(1, text.length) * LINE_H };
};

const drawLine = (doc: jsPDF, line: DeliveryNotePdfLine, y: number, text: string[], height: number) => {
    const base = y + ROW_PAD + 3.2;
    const dash = '–';
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BODY);
    doc.setTextColor(...C.TEXT);
    if (line.positionNumber) doc.text(line.positionNumber, X_POS, base);
    doc.setTextColor(...C.LABEL);
    if (line.articleCode) drawFittedSingleLine(doc, line.articleCode, X_CODE, base, COL_CODE_W - CELL_PAD * 2, FS_BODY, 6.5);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BODY);
    doc.setTextColor(...C.TEXT);
    doc.text(text, X_DESC, base, { lineHeightFactor: LINE_H / (FS_BODY * 0.3528) });

    const hasOrder = line.orderedQty > 0;
    doc.setTextColor(...(hasOrder ? C.TEXT : C.MUTED));
    doc.text(hasOrder ? fmtQty(line.orderedQty) : dash, R_ORDER, base, { align: 'right' });

    doc.setFont(FONT, 'bold');
    doc.setTextColor(...C.TEXT);
    doc.text(fmtQty(line.deliveredQty), R_DELIV, base, { align: 'right' });

    const open = line.openQty;
    if (open !== null && open > 0) {
        doc.setTextColor(...C.RED);
        doc.text(fmtQty(open), R_OPEN, base, { align: 'right' });
    } else {
        doc.setFont(FONT, 'normal');
        doc.setTextColor(...C.MUTED);
        doc.text(dash, R_OPEN, base, { align: 'right' });
    }

    doc.setFont(FONT, 'normal');
    doc.setTextColor(...C.TEXT);
    if (line.unit) {
        // Einheiten sind kurz (Stk, m, kg); eine lange wird kleiner, nie umbrochen.
        let size = FS_BODY;
        while (size > 6.5 && doc.getTextWidth(line.unit) > COL_UNIT_W - 2) {
            size -= 0.2;
            doc.setFontSize(size);
        }
        doc.text(line.unit, R_UNIT_CENTER, base, { align: 'center' });
        doc.setFontSize(FS_BODY);
    }

    hairline(doc, ML, y + height, MR);
    return y + height;
};

export interface DeliveryNotePdfDocument {
    fileName: string;
    bytes: Uint8Array;
    blob: Blob;
}

export async function buildDeliveryNotePdf(
    data: DeliveryNotePdfData,
    settings: PdfCompanySettings,
): Promise<DeliveryNotePdfDocument> {
    const lang = data.lang ?? 'de';
    const S = STRINGS[lang] ?? STRINGS.de;
    const L = pdfStringsFor(lang);

    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title: data.noteNumber, subject: S.title, creator: 'Offitec' });
    await brandKit.registerFonts(doc);
    const logo = await brandKit.loadLogo(doc);
    const wave = await brandKit.loadHeaderWave(WAVE_W, WAVE_H);

    // ── Seite 1: Karte links, Anschriften rechts, Titel ─────────────────────
    const cardBottom = drawCard(doc, [
        [S.date, fmtDay(data.deliveryDate)],
        [S.order, data.orderNumber || ''],
        [S.project, data.projectNumber || ''],
        [S.reference, data.customerReference || ''],
    ], S, data.noteNumber);
    const addrBottom = drawAddresses(doc, data, settings, lang);

    const titleBase = Math.max(cardBottom, addrBottom) + 17;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...C.NAVY);
    doc.text(S.title, ML, titleBase);

    // ── Positionen ───────────────────────────────────────────────────────────
    let y = drawTableHead(doc, titleBase + 7, S);
    for (const line of data.lines) {
        const { text, height } = measureLine(doc, line);
        if (y + height > CONTENT_BOTTOM) {
            doc.addPage();
            y = drawTableHead(doc, TOP_REST, S);
        }
        y = drawLine(doc, line, y, text, height);
    }

    // ── Bemerkung (optional, eine Zeile Grau) ───────────────────────────────
    const note = String(data.note || '').trim();
    if (note) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8.4);
        doc.setTextColor(...C.LABEL);
        const noteLines = doc.splitTextToSize(note, CONTENT_W) as string[];
        const noteH = noteLines.length * 3.8;
        if (y + 6 + noteH > CONTENT_BOTTOM) {
            doc.addPage();
            y = TOP_REST;
        }
        doc.text(noteLines, ML, y + 6.5);
    }

    // ── Kopf und Fuss auf jeder Seite ────────────────────────────────────────
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        drawHeader(doc, logo, wave);
        brandKit.drawPageFooter(doc, page, pages, L);
    }

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    return {
        fileName: `${data.noteNumber}.pdf`,
        bytes,
        blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    };
}

export function saveDeliveryNotePdf(document_: DeliveryNotePdfDocument): void {
    const url = URL.createObjectURL(document_.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = document_.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
