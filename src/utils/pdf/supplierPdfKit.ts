/**
 * ── LIEFERANTEN-BELEGE: DER GEMEINSAME BAUKASTEN ────────────────────────────
 *
 * Bestellung (`orderPdf.ts`) und Preisanfrage (`priceRequestPdf.ts`) sehen
 * seit dem 29.09.2026 abends aus wie die Offerte (Samet: «direkt teklifteki
 * gibi yap — satırları, kartları, her şeyi», und: «sadece tasarımsal olarak
 * benzer olacak ama uzun metinlere, fiyatlara ve 8–9 sütun adına dayanıklı
 * olmalı»). Hier liegt, was beide Belege gleich zeichnen: Schrift (Arial),
 * Briefkopf, Belegkarte, Anschrift, Titel, Kopfband, Hinweiskarte, Summen und
 * Fuss — alles in den Massen und Tönen von `tenderPdfModern`. Die Tabelle
 * selbst (Spalten der Vorlage, messendes Layout) bleibt in den beiden Dateien.
 *
 * Frühere Runden desselben Tages (Informationsblock nach DIN 5008, weisse
 * Karte, Gruss am Schluss) sind damit ersetzt; der Gruss ist weg («Freundliche
 * Grüsse … sil»).
 */
import { jsPDF } from 'jspdf';

import arialBoldUrl from '../../assets/fonts/ARIALBD.TTF?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.TTF?url';
import { drawAddressBlockLines, drawFittedSingleLine } from './addressBlock';
import { brandKit } from './tenderPdfModern';

/** Die Schrift beider Lieferanten-Belege. */
export const SUPPLIER_FONT = 'Arial';

/**
 * DIE TITEL IN GROSS-/KLEINSCHREIBUNG (29.09.2026 spät, Samet: «başlık harfleri Büyük
 * ile başlayıp küçük ile devam etsin»): «Produkt - Material», «Hinweise» statt
 * «PRODUKT - MATERIAL». Ein Titel, den jemand GANZ in Versalien getippt hat
 * («MALZEME NO»), wird Wort für Wort gross angefangen und klein fortgesetzt;
 * sonst bleibt er, wie die Vorlage ihn schreibt — nur der erste Buchstabe gross.
 */
export const titleCaption = (label: string, locale: string): string => {
    const text = label.replace(/\s+/g, ' ').trim();
    const letters = text.replace(/[^\p{L}]/gu, '');
    const shouting = letters.length >= 4 && letters === letters.toLocaleUpperCase(locale);
    const cased = shouting
        ? text.toLocaleLowerCase(locale).replace(/(^|[\s\-/(])(\p{L})/gu, (_match, lead: string, char: string) => lead + char.toLocaleUpperCase(locale))
        : text;
    return cased.charAt(0).toLocaleUpperCase(locale) + cased.slice(1);
};

let fontFiles: { regular: string; bold: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
};

/** Arial (normal + fett) in das Dokument laden; jsPDF bettet nur die benutzten Glyphen ein. */
export async function registerSupplierFonts(doc: jsPDF) {
    if (!fontFiles) {
        const [regular, bold] = await Promise.all([
            fetch(arialRegularUrl).then((r) => r.arrayBuffer()),
            fetch(arialBoldUrl).then((r) => r.arrayBuffer()),
        ]);
        fontFiles = { regular: bufferToBase64(regular), bold: bufferToBase64(bold) };
    }
    doc.addFileToVFS('Arial-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('Arial-Bold.ttf', fontFiles.bold);
    doc.addFont('Arial-Regular.ttf', SUPPLIER_FONT, 'normal');
    doc.addFont('Arial-Bold.ttf', SUPPLIER_FONT, 'bold');
    doc.setFont(SUPPLIER_FONT, 'normal');
}

/** «29.09.2026» — mit vierstelligem Jahr, wie im Lieferschein. */
export const fmtDocDate = (iso?: string | null): string => {
    if (!iso) return '';
    const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return day ? `${day[3]}.${day[2]}.${day[1]}` : '';
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
};

/* ═══════════════════════════════════════════════════════════════════════════
   WIE DIE OFFERTE (29.09.2026 abends, Vorgabe Samet: «direkt teklifteki gibi
   yap — satırları, kartları, her şeyi — sipariş formunda da»)

   Bestellung und Preisanfrage stehen seither auf dem Raster und in der Sprache
   der Offerte (`tenderPdfModern`): derselbe Briefkopf (die Offerte zeichnet ihn
   selbst, `brandKit.drawPageHeader`), links die Belegkarte mit dem getönten
   Kopfband für die Nummer und dem durchgehenden Navy-Streifen, rechts
   Absenderzeile und Anschrift, der Titel mit dem kurzen roten Strich, die
   Tabelle mit getöntem Kopfband, Zebra-Zeilen und fetten Namen, die Summen mit
   dem GESAMT-Band — und die Hinweise als Karte neben den Summen, dort, wo die
   Rechnung ihre Zahlungsbedingungen trägt. Masse und Töne sind die der
   Offerte; ändert sich dort etwas, gehört es hier nachgezogen.
   ═════════════════════════════════════════════════════════════════════════ */

const O = brandKit.C;

/** Das Raster der Offerte (tenderPdfModern: ML 14 · MR 196 · Inhalt 44/38 → 266). */
export const OFFER = {
    ML: brandKit.ML,
    MR: brandKit.MR,
    CONTENT_W: brandKit.CONTENT_W,
    CONTENT_TOP_FIRST: 44,
    CONTENT_TOP_REST: 38,
    CONTENT_BOTTOM: brandKit.CONTENT_BOTTOM,
    /** Linke Kante der Anschrift rechts. */
    ADDR_X: 112,
    /** Die Belegkarte links. */
    CARD_W: 82,
    /** Linke Kante des Summenblocks (rechts davon die Summen, links die Hinweiskarte). */
    TOTALS_X: 116,
    /** Der Betrag endet 1 mm vor dem rechten Rand. */
    PRICE_R: brandKit.MR - 1,
    tones: O,
};

const fitSize = (doc: jsPDF, text: string, maxW: number, base: number, min: number): number => {
    let size = base;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > maxW) {
        size -= 0.2;
        doc.setFontSize(size);
    }
    return size;
};

/** Logo, Welle und Kontaktzeile — genau die der Offerte. */
export const loadOfferLogo = (doc: jsPDF) => brandKit.loadLogo(doc);
export const loadOfferWave = () => brandKit.loadHeaderWave(brandKit.WAVE_W, brandKit.WAVE_H);
export const drawOfferHeader = brandKit.drawPageHeader;

/** Das getönte Kopfband mit der weichen Navy-Kante — Tabellenkopf und Kopf der Belegkarte. */
export function drawOfferBand(doc: jsPDF, y: number, x: number, w: number, h: number) {
    doc.setFillColor(...O.HEAD_BG);
    doc.rect(x, y, w, h, 'F');
    doc.setFillColor(...O.NAVY_SOFT);
    doc.rect(x, y + h - 0.35, w, 0.35, 'F');
}

/** Eine Zeile der Belegkarte; `emphasize` = die Nummer im getönten Kopfband. */
export interface OfferCardRow { label: string; value: string; emphasize?: boolean }

/**
 * Die Belegkarte der Offerte, links oben: weisser Grund, oben das getönte
 * Kopfband mit der Belegnummer, darunter Beschriftung links / Wert fett
 * rechts, eingerückte Haarlinien, EIN Navy-Streifen an der linken Kante,
 * feiner Rahmen. Leere Werte fallen weg.
 *
 * Robust für lange Werte (29.09.2026, Samet: «uzun metinlere dayanıklı
 * olmalı»): die Offerte verkleinert einen zu langen Wert bis 5.8 pt — hier
 * schrumpft er höchstens bis 7.4 pt und bricht dann in bis zu drei Zeilen um;
 * die Zeile wird so hoch wie ihr Wert. Gibt die Unterkante zurück.
 */
export function drawOfferInfoCard(doc: jsPDF, rows: OfferCardRow[]): number {
    const cardX = OFFER.ML;
    const cardW = OFFER.CARD_W;
    const ACCENT_W = 1.2;
    const PAD_X = 4.4;
    const HEAD_H = 9.6;
    const ROW_H = 6.4;
    const VALUE_LH = 3.6;
    const MAX_LINES = 3;
    const cardY = OFFER.CONTENT_TOP_FIRST - 4;
    const textLeft = cardX + ACCENT_W + PAD_X;
    const textRight = cardX + cardW - PAD_X;
    const inner = textRight - textLeft;

    // 1) Messen: Beschriftung, Schriftgrösse und Zeilen jedes Werts.
    const measured = rows
        .filter((row) => row.value.trim().length > 0)
        .map((row) => {
            const value = row.value.trim();
            doc.setFont(SUPPLIER_FONT, 'normal');
            const labelSize = fitSize(doc, row.label, inner * 0.56, 7.4, 5.6);
            const labelW = doc.getTextWidth(row.label);
            const valueW = Math.max(16, inner - labelW - 3);
            doc.setFont(SUPPLIER_FONT, 'bold');
            const base = row.emphasize ? 10 : 8.2;
            const size = fitSize(doc, value, valueW, base, 7.4);
            let lines = [value];
            if (doc.getTextWidth(value) > valueW) {
                const all = doc.splitTextToSize(value, valueW) as string[];
                lines = all.slice(0, MAX_LINES);
                if (all.length > MAX_LINES) {
                    let last = `${lines[MAX_LINES - 1]}…`;
                    while (last.length > 1 && doc.getTextWidth(last) > valueW) last = `${last.slice(0, -2)}…`;
                    lines[MAX_LINES - 1] = last;
                }
            }
            const h = (row.emphasize ? HEAD_H : ROW_H) + (lines.length - 1) * VALUE_LH;
            return { row, labelSize, size, lines, h };
        });
    const cardH = measured.reduce((sum, entry) => sum + entry.h, 0);

    doc.setFillColor(255, 255, 255);
    doc.rect(cardX, cardY, cardW, cardH, 'F');
    let ry = cardY;
    measured.forEach(({ row, labelSize, size, lines, h }, index) => {
        if (row.emphasize) drawOfferBand(doc, ry, cardX, cardW, h);
        const firstH = row.emphasize ? HEAD_H : ROW_H;
        const base = ry + firstH / 2 + (row.emphasize ? 1.4 : 1.2);
        doc.setFont(SUPPLIER_FONT, 'normal');
        doc.setFontSize(labelSize);
        doc.setTextColor(...O.LABEL);
        doc.text(row.label, textLeft, base);
        doc.setFont(SUPPLIER_FONT, 'bold');
        doc.setFontSize(size);
        doc.setTextColor(...(row.emphasize ? O.NAVY : O.TEXT));
        lines.forEach((line, lineIdx) => doc.text(line, textRight, base + lineIdx * VALUE_LH, { align: 'right' }));
        ry += h;
        if (index < measured.length - 1 && !row.emphasize) {
            doc.setDrawColor(...O.HAIRLINE);
            doc.setLineWidth(0.12);
            doc.line(textLeft, ry, textRight, ry);
        }
    });
    doc.setFillColor(...O.NAVY);
    doc.rect(cardX, cardY, ACCENT_W, cardH, 'F');
    doc.setDrawColor(...O.CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(cardX, cardY, cardW, cardH, 'S');
    return cardY + cardH;
}

/**
 * Rechts oben wie in der Offerte: die Absenderzeile klein über einer
 * Haarlinie, darunter der Lieferant fett, die Person («z. Hd. …») und die
 * Adresse — jede Zeile bleibt ganz. Gibt die Höhe unter der letzten Zeile zurück.
 */
export function drawOfferRecipient(
    doc: jsPDF,
    opts: { sender: string; name: string; attention?: string; address?: string | null },
): number {
    const x = OFFER.ADDR_X;
    const w = OFFER.MR - x;
    const y0 = OFFER.CONTENT_TOP_FIRST;
    doc.setFont(SUPPLIER_FONT, 'normal');
    doc.setTextColor(...O.MUTED);
    drawFittedSingleLine(doc, opts.sender, x, y0, w, 7.5, 5.8);
    doc.setDrawColor(...O.HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(x, y0 + 1.6, OFFER.MR, y0 + 1.6);

    let y = y0 + 8;
    doc.setTextColor(...O.TEXT);
    if (opts.name.trim()) {
        doc.setFont(SUPPLIER_FONT, 'bold');
        doc.setFontSize(10.5);
        const nameLines = (doc.splitTextToSize(opts.name.trim(), w) as string[]).slice(0, 2);
        doc.text(nameLines, x, y);
        y += nameLines.length * 5;
    }
    doc.setFont(SUPPLIER_FONT, 'normal');
    doc.setFontSize(10);
    const attention = (opts.attention ?? '').trim();
    if (attention) {
        drawFittedSingleLine(doc, attention, x, y, w, 10, 7.5);
        y += 4.9;
    }
    if (opts.address && opts.address.trim()) {
        y = drawAddressBlockLines(doc, opts.address, x, y, w, 10, 4.9);
    }
    return y;
}

/** Der Titel der Offerte: fett in Navy, «(Rev. n)» leiser daneben, darunter der kurze rote Strich. */
export function drawOfferTitle(doc: jsPDF, baseline: number, title: string, suffix?: string | null) {
    doc.setFont(SUPPLIER_FONT, 'bold');
    doc.setFontSize(16.5);
    doc.setTextColor(...O.NAVY);
    doc.text(title, OFFER.ML, baseline);
    if (suffix?.trim()) {
        const x = OFFER.ML + doc.getTextWidth(`${title} `);
        doc.setFont(SUPPLIER_FONT, 'normal');
        doc.setTextColor(...O.NAVY_SOFT);
        doc.text(suffix.trim(), x, baseline);
    }
    doc.setDrawColor(...O.RED);
    doc.setLineWidth(0.8);
    doc.line(OFFER.ML, baseline + 2.6, OFFER.ML + 14, baseline + 2.6);
}

/**
 * Der Fuss der Offerte: links in Navy die Zeile des Mandanten (die Offerte
 * druckt dort BIC/MWST/IBAN der Group AG — auf einem Beleg an den Lieferanten
 * stimmt das nicht für jeden Mandanten, darum steht hier sein Absender), rechts
 * «Seite n von m», darunter die Navy-Linie.
 */
export function drawOfferFooter(doc: jsPDF, left: string, pageText: string) {
    const textY = 274.5;
    doc.setFont(SUPPLIER_FONT, 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...O.NAVY_SOFT);
    doc.text(pageText, OFFER.MR, textY, { align: 'right' });
    const pageW = doc.getTextWidth(pageText);
    doc.setTextColor(...O.NAVY);
    drawFittedSingleLine(doc, left, OFFER.ML, textY, OFFER.CONTENT_W - pageW - 8, 7.8, 5.6);
    doc.setFillColor(...O.NAVY);
    doc.rect(OFFER.ML, 278.5 - 0.2, OFFER.CONTENT_W, 0.4, 'F');
}

// ── Die Hinweiskarte — die Karte der Zahlungsbedingungen der Rechnung ─────────

const NOTE_CARD_PAD = 3.2;
const NOTE_CARD_LH = 4.4;
const NOTE_CARD_FS = 9;
const NOTE_BULLET_INDENT = 3.2;
const NOTE_BULLET_GAP = 0.8;

const noteCardLines = (doc: jsPDF, notes: string[], w: number, bullets: boolean): string[][] => {
    doc.setFont(SUPPLIER_FONT, 'normal');
    doc.setFontSize(NOTE_CARD_FS);
    const textW = w - 1.2 - NOTE_CARD_PAD * 2 - (bullets ? NOTE_BULLET_INDENT : 0) - 1;
    return notes.map((note) => doc.splitTextToSize(note, textW) as string[]);
};

/** Höhe der Hinweiskarte (mm) — für den Seitenumbruch davor. */
export function measureOfferNoteCard(doc: jsPDF, notes: string[], w: number, bullets = true): number {
    if (!notes.length) return 0;
    const blocks = noteCardLines(doc, notes, w, bullets);
    const lines = blocks.reduce((sum, block) => sum + block.length, 0);
    return NOTE_CARD_PAD * 2 + 4.6 + lines * NOTE_CARD_LH + (blocks.length - 1) * NOTE_BULLET_GAP;
}

/**
 * Eine Karte wie die «Zahlungsbedingungen» der Rechnung: heller Grund, feiner
 * Rahmen, Navy-Streifen links, die Überschrift fett in Navy, darunter die
 * Punkte (•) — ohne `bullets` ein Absatz je Eintrag. Gibt die Unterkante zurück.
 */
export function drawOfferNoteCard(
    doc: jsPDF,
    opts: { x: number; y: number; w: number; title: string; notes: string[]; bullets?: boolean },
): number {
    if (!opts.notes.length) return opts.y;
    const bullets = opts.bullets !== false;
    const blocks = noteCardLines(doc, opts.notes, opts.w, bullets);
    const h = measureOfferNoteCard(doc, opts.notes, opts.w, bullets);
    doc.setFillColor(...O.CARD_BG);
    doc.setDrawColor(...O.CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(opts.x, opts.y, opts.w, h, 'FD');
    doc.setFillColor(...O.NAVY);
    doc.rect(opts.x, opts.y, 1.2, h, 'F');

    const textX = opts.x + 1.2 + NOTE_CARD_PAD;
    doc.setFont(SUPPLIER_FONT, 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(...O.NAVY);
    doc.text(opts.title, textX, opts.y + NOTE_CARD_PAD + 2.6);

    doc.setFont(SUPPLIER_FONT, 'normal');
    doc.setFontSize(NOTE_CARD_FS);
    doc.setTextColor(...O.TEXT);
    let ty = opts.y + NOTE_CARD_PAD + 4.6 + 2.6;
    blocks.forEach((lines) => {
        if (bullets) doc.text('•', textX, ty);
        lines.forEach((line, index) => doc.text(line, textX + (bullets ? NOTE_BULLET_INDENT : 0), ty + index * NOTE_CARD_LH));
        ty += lines.length * NOTE_CARD_LH + NOTE_BULLET_GAP;
    });
    return opts.y + h;
}

// ── Die Summen der Offerte ───────────────────────────────────────────────────

/** Vorschub einer Summenzeile und Höhe des GESAMT-Bands (tenderPdfModern). */
const OFFER_TOTAL_ROW_H = 5.4 + 2.8;
const OFFER_TOTAL_BAND_H = 12;

/** Höhe des Summenblocks bei `rowCount` Zeilen über dem GESAMT-Band. */
export const offerTotalsHeight = (rowCount: number): number => rowCount * OFFER_TOTAL_ROW_H + 1 + OFFER_TOTAL_BAND_H;

/**
 * Die Summen wie in der Offerte: jede Zeile unter einer Haarlinie, Beschriftung
 * grau, Betrag fett rechts; darunter das GESAMT-Band — getönter Grund,
 * Navy-Streifen links, gross und fett in Navy. Gibt die Unterkante zurück.
 */
export function drawOfferTotals(doc: jsPDF, top: number, rows: Array<[string, string]>, grand: [string, string]): number {
    const blockX = OFFER.TOTALS_X;
    const labelX = blockX + 4;
    const valueX = OFFER.PRICE_R;
    let y = top;
    rows.forEach(([label, value]) => {
        doc.setDrawColor(...O.HAIRLINE);
        doc.setLineWidth(0.15);
        doc.line(blockX, y, OFFER.MR, y);
        y += 5.4;
        doc.setFont(SUPPLIER_FONT, 'bold');
        doc.setFontSize(9);
        const labelMaxW = Math.max(14, valueX - doc.getTextWidth(value) - labelX - 3);
        doc.setFont(SUPPLIER_FONT, 'normal');
        fitSize(doc, label, labelMaxW, 9, 6.4);
        let text = label;
        if (doc.getTextWidth(text) > labelMaxW) {
            const lines = doc.splitTextToSize(text, labelMaxW) as string[];
            text = `${(lines[0] ?? text).trim()}…`;
        }
        doc.setTextColor(...O.LABEL);
        doc.text(text, labelX, y);
        doc.setFontSize(9);
        doc.setFont(SUPPLIER_FONT, 'bold');
        doc.setTextColor(...O.TEXT);
        doc.text(value, valueX, y, { align: 'right' });
        y += 2.8;
    });
    y += 1;
    doc.setFillColor(...O.HEAD_BG);
    doc.rect(blockX, y, OFFER.MR - blockX, OFFER_TOTAL_BAND_H, 'F');
    doc.setFillColor(...O.NAVY);
    doc.rect(blockX, y, 1.2, OFFER_TOTAL_BAND_H, 'F');
    doc.setFont(SUPPLIER_FONT, 'bold');
    doc.setTextColor(...O.NAVY);
    const base = y + OFFER_TOTAL_BAND_H / 2 + 1.8;
    doc.setFontSize(12.5);
    doc.text(grand[0], labelX, base);
    const labelW = doc.getTextWidth(grand[0]);
    fitSize(doc, grand[1], valueX - labelX - labelW - 6, 12.5, 8);
    doc.text(grand[1], valueX, base, { align: 'right' });
    doc.setFont(SUPPLIER_FONT, 'normal');
    doc.setTextColor(...O.TEXT);
    return y + OFFER_TOTAL_BAND_H;
}
