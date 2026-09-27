/**
 * ── DEPO: ETIKETTEN UND LISTE ALS PDF (26.09.2026, Vorgabe Samet) ───────────
 *
 * «Bu ERP kodların hepsinin dikdörtgen etikete basılması gerekiyor, bir de
 *  ERP numarası yazsın altında … malzeme gruplarına göre toplu indirebilelim,
 *  satır satır PDF ve Excel indirilebilir olması lazım.»
 *
 *   · Etiketten: je Karte ein Rechteck — GS1-Barcode (EAN-13) mit Klarschrift,
 *     darunter fett der ERP-Code, darüber (wählbar) der Produktname. Entweder
 *     Etikettendrucker (jede Seite ein Etikett) oder A4-Etikettenbogen.
 *   · Liste: A4 quer, Zeile für Zeile — ERP-Code, Barcode (klein, lesbar),
 *     Name, Gruppe, Marke · Modell, Lieferant, Menge.
 *
 * Alles Vektor (Striche als Rechtecke) — scharf in jedem Drucker. Die Schrift
 * ist Liberation Sans, wie die übrigen PDFs der Anwendung. Diese Datei wird
 * erst beim Drucken nachgeladen (jsPDF ist gross).
 */
import { jsPDF } from 'jspdf';

import liberationBoldUrl from '@/assets/fonts/LiberationSans-Bold.ttf?url';
import liberationRegularUrl from '@/assets/fonts/LiberationSans-Regular.ttf?url';
import type { WarehouseLabelSettings, WarehouseProduct } from '@/types/warehouse';

import { a4Grid, ean13Bars, ean13Pattern, labelLayout, PT_MM } from '../warehouseCodes';

const FONT = 'LiberationSans';
const INK: [number, number, number] = [29, 29, 31];
const MUTED: [number, number, number] = [110, 110, 115];
const HAIRLINE: [number, number, number] = [214, 214, 219];
const ZEBRA: [number, number, number] = [244, 245, 247];
const PT = PT_MM;

let fontFiles: { regular: string; bold: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
};

const registerFonts = async (doc: jsPDF) => {
    if (!fontFiles) {
        const [regular, bold] = await Promise.all([
            fetch(liberationRegularUrl).then((response) => response.arrayBuffer()),
            fetch(liberationBoldUrl).then((response) => response.arrayBuffer()),
        ]);
        fontFiles = { regular: bufferToBase64(regular), bold: bufferToBase64(bold) };
    }
    doc.addFileToVFS('LiberationSans-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('LiberationSans-Bold.ttf', fontFiles.bold);
    doc.addFont('LiberationSans-Regular.ttf', FONT, 'normal');
    doc.addFont('LiberationSans-Bold.ttf', FONT, 'bold');
    doc.setFont(FONT, 'normal');
};

/** Text auf eine Breite kürzen (mit …). */
const fit = (doc: jsPDF, text: string, width: number): string => {
    if (doc.getTextWidth(text) <= width) return text;
    let low = 0;
    let high = text.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (doc.getTextWidth(`${text.slice(0, mid).trimEnd()}…`) <= width) low = mid;
        else high = mid - 1;
    }
    return `${text.slice(0, low).trimEnd()}…`;
};

/**
 * Ein EAN-13 in das Rechteck (x, y, Breite = Striche samt Ruhezonen).
 * Gibt die Unterkante der Klarschrift zurück.
 */
const drawEan13 = (
    doc: jsPDF,
    code: string,
    x: number,
    y: number,
    width: number,
    barHeight: number,
    digitsPt: number,
): number => {
    const pattern = ean13Pattern(code);
    if (!pattern) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(digitsPt + 1);
        doc.setTextColor(...INK);
        doc.text(code, x + width / 2, y + barHeight / 2, { align: 'center', baseline: 'middle' });
        return y + barHeight;
    }
    const module = width / 113;
    const left = x + 11 * module;
    const guardExtra = Math.min(digitsPt * PT * 0.55, barHeight * 0.12);
    doc.setFillColor(0, 0, 0);
    for (const bar of ean13Bars(pattern)) {
        doc.rect(left + bar.x * module, y, bar.width * module, barHeight + (bar.guard ? guardExtra : 0), 'F');
    }
    doc.setFont(FONT, 'normal');
    doc.setFontSize(digitsPt);
    doc.setTextColor(...INK);
    const baseline = y + barHeight + digitsPt * PT * 0.95;
    doc.text(pattern.text.first, left - 4 * module, baseline, { align: 'center' });
    pattern.text.left.split('').forEach((digit, index) => {
        doc.text(digit, left + (3 + 7 * index + 3.5) * module, baseline, { align: 'center' });
    });
    pattern.text.right.split('').forEach((digit, index) => {
        doc.text(digit, left + (50 + 7 * index + 3.5) * module, baseline, { align: 'center' });
    });
    return baseline + digitsPt * PT * 0.25;
};

/* ═══════════════════════════════════════════════════════════════════════════
   1) ETIKETTEN
   ═════════════════════════════════════════════════════════════════════════ */

export interface LabelItem {
    erpCode: string;
    barcode: string | null;
    name: string;
}

/** Nur Karten mit ERP-Code bekommen ein Etikett. */
export const labelItemsOf = (products: WarehouseProduct[]): LabelItem[] =>
    products
        .filter((product) => Boolean(product.erpCode))
        .map((product) => ({ erpCode: product.erpCode!, barcode: product.barcode, name: product.name }));

/** Ein Etikett in das Rechteck (x, y, w, h) — Masse aus `labelLayout`. */
const drawLabel = (doc: jsPDF, item: LabelItem, x: number, y: number, w: number, h: number, showName: boolean) => {
    const layout = labelLayout(w, h, showName, Boolean(item.barcode));
    if (layout.nameBaseline !== null) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(layout.namePt);
        doc.setTextColor(...INK);
        doc.text(fit(doc, item.name, layout.innerW), x + w / 2, y + layout.nameBaseline, { align: 'center' });
    }
    if (item.barcode) {
        drawEan13(doc, item.barcode, x + layout.barcodeX, y + layout.barTop, layout.barcodeWidth, layout.barHeight, layout.digitsPt);
    }
    doc.setFont(FONT, 'bold');
    doc.setFontSize(layout.codePt);
    doc.setTextColor(...INK);
    doc.text(fit(doc, item.erpCode, layout.innerW), x + w / 2, y + layout.codeBaseline, { align: 'center' });
};

export const buildLabelsPdf = async (items: LabelItem[], label: WarehouseLabelSettings): Promise<jsPDF> => {
    const w = label.widthMm;
    const h = label.heightMm;
    if (label.layout === 'roll') {
        const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: w >= h ? 'landscape' : 'portrait', compress: true });
        await registerFonts(doc);
        items.forEach((item, index) => {
            if (index > 0) doc.addPage([w, h], w >= h ? 'landscape' : 'portrait');
            drawLabel(doc, item, 0, 0, w, h, label.showName);
        });
        return doc;
    }

    // A4-Bogen: so viele Etiketten, wie mit 4 mm Rand passen, mittig.
    const { cols, perPage, offsetX, offsetY } = a4Grid(w, h);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    await registerFonts(doc);
    items.forEach((item, index) => {
        const slot = index % perPage;
        if (index > 0 && slot === 0) doc.addPage('a4', 'portrait');
        const col = slot % cols;
        const row = Math.floor(slot / cols);
        drawLabel(doc, item, offsetX + col * w, offsetY + row * h, w, h, label.showName);
    });
    return doc;
};

/* ═══════════════════════════════════════════════════════════════════════════
   2) DIE LISTE, ZEILE FÜR ZEILE
   ═════════════════════════════════════════════════════════════════════════ */

export interface ListPdfTexts {
    title: string;
    subtitle: string;
    columns: { erpCode: string; barcode: string; name: string; group: string; brandModel: string; supplier: string; quantity: string };
    page: (page: number, pages: number) => string;
}

const qty = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 3 });

export const buildListPdf = async (products: WarehouseProduct[], texts: ListPdfTexts): Promise<jsPDF> => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    await registerFonts(doc);
    const pageW = 297;
    const pageH = 210;
    const margin = 12;
    const rowH = 11.5;
    const headH = 7;
    // Spalten: ERP · Barcode · Name (Rest) · Gruppe · Marke/Modell · Lieferant · Menge
    const fixed = { erp: 30, barcode: 36, group: 42, brand: 40, supplier: 36, qty: 18 };
    const nameW = pageW - 2 * margin - Object.values(fixed).reduce((sum, value) => sum + value, 0);
    const cols = [
        { key: 'erpCode', width: fixed.erp },
        { key: 'barcode', width: fixed.barcode },
        { key: 'name', width: nameW },
        { key: 'group', width: fixed.group },
        { key: 'brandModel', width: fixed.brand },
        { key: 'supplier', width: fixed.supplier },
        { key: 'quantity', width: fixed.qty, right: true },
    ] as const;

    const drawHeader = (first: boolean) => {
        let y = margin;
        if (first) {
            doc.setFont(FONT, 'bold');
            doc.setFontSize(14);
            doc.setTextColor(...INK);
            doc.text(texts.title, margin, y + 5);
            doc.setFont(FONT, 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...MUTED);
            doc.text(texts.subtitle, margin, y + 10);
            y += 15;
        }
        doc.setFillColor(250, 250, 251);
        doc.rect(margin, y, pageW - 2 * margin, headH, 'F');
        doc.setDrawColor(...HAIRLINE);
        doc.setLineWidth(0.2);
        doc.line(margin, y + headH, pageW - margin, y + headH);
        doc.setFont(FONT, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        let x = margin;
        for (const col of cols) {
            const label = texts.columns[col.key];
            if ('right' in col && col.right) doc.text(label, x + col.width - 2, y + 4.6, { align: 'right' });
            else doc.text(label, x + 2, y + 4.6);
            x += col.width;
        }
        return y + headH;
    };

    let y = drawHeader(true);
    products.forEach((product, index) => {
        if (y + rowH > pageH - margin - 6) {
            doc.addPage('a4', 'landscape');
            y = drawHeader(false);
        }
        if (index % 2 === 1) {
            doc.setFillColor(...ZEBRA);
            doc.rect(margin, y, pageW - 2 * margin, rowH, 'F');
        }
        const mid = y + rowH / 2;
        let x = margin;

        doc.setFont(FONT, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...INK);
        doc.text(fit(doc, product.erpCode ?? '—', fixed.erp - 4), x + 2, mid + 1.1);
        x += fixed.erp;

        if (product.barcode) drawEan13(doc, product.barcode, x + 1, y + 1.3, fixed.barcode - 2, rowH - 5.2, 4.6);
        x += fixed.barcode;

        const group = product.materialGroup
            ? [product.materialGroup.category?.name, product.materialGroup.name].filter(Boolean).join(' › ')
            : '—';
        const brandModel = [product.brand, product.modelNumber].filter(Boolean).join(' · ') || '—';
        doc.setFont(FONT, 'normal');
        doc.setFontSize(8.5);
        doc.text(fit(doc, product.name, nameW - 4), x + 2, mid + 1.1);
        x += nameW;
        doc.setTextColor(...MUTED);
        doc.text(fit(doc, group, fixed.group - 4), x + 2, mid + 1.1);
        x += fixed.group;
        doc.text(fit(doc, brandModel, fixed.brand - 4), x + 2, mid + 1.1);
        x += fixed.brand;
        const supplierText = product.supplier
            ? `${product.supplier.name}${product.suppliers.length > 1 ? ` +${product.suppliers.length - 1}` : ''}`
            : '—';
        doc.text(fit(doc, supplierText, fixed.supplier - 4), x + 2, mid + 1.1);
        x += fixed.supplier;
        doc.setTextColor(...INK);
        doc.text(qty.format(product.quantity), x + fixed.qty - 2, mid + 1.1, { align: 'right' });
        y += rowH;
    });

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setFont(FONT, 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(texts.page(page, pages), pageW - margin, pageH - 6, { align: 'right' });
    }
    return doc;
};
