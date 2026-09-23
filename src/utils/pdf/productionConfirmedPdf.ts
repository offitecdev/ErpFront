/**
 * ── BESTÄTIGTE BESTELLUNGEN — DAS GRAUE BLATT (21.09.2026, Vorgabe Samet) ───
 *
 * «Üretimde onaylanmış siparişlerin tamamını içeren bir belge … gri olmalı,
 *  direkt, temiz sayfa. Dalga olsun ama dalganın siyah beyaz hâlini kullan.»
 * Zweite Fassung desselben Tages: «yatay olmasın dikey olsun … tablo direkt
 *  normal tablo olsun, normal tablo, siyah tablo … yazılar Arial olsun,
 *  temiz olsun, sade.»
 *
 * Also:
 *  - A4 HOCHKANT, Schrift ARIAL — nichts anderes steht auf dem Blatt.
 *  - Eine GEWÖHNLICHE Tabelle: schwarzes Gitter, jede Zelle umrandet, der
 *    Kopf grau hinterlegt und fett. Keine Karte, kein Zebra, keine Farbe.
 *    Jede Zeile trägt ihre Angaben selbst (nichts wird ausgelassen, weil es
 *    sich wiederholt) — eine Tabelle, wie man sie kennt.
 *  - Briefkopf: Logo und Welle in GRAUSTUFEN. Die Welle wird nicht neu
 *    gezeichnet — die beiden Farbstopps ihres Verlaufs (`header-wave.svg`,
 *    maschinell erzeugt, siehe pdf-header-wave) werden vor dem Rastern durch
 *    zwei Grautöne ersetzt, danach läuft ein Luminanz-Durchgang über die
 *    Pixel: was die Marke später auch färbt, hier bleibt es schwarzweiss.
 *  - Die Währung steht im Spaltenkopf, solange alle Zeilen dieselbe tragen —
 *    nur ein gemischtes Blatt schreibt sie in die Zellen.
 */
import { jsPDF } from 'jspdf';

import { getReportTranslator, type FixedTranslator } from '@/i18n/reportLanguage';
import { getPdfSettings, type PdfCompanySettings } from '@/store/pdfSettingsStore';
import { localizePurchaseCode, purchaseLangOf, type PurchaseDocLang } from '@/utils/purchaseCode';

import { companySenderLine, drawFittedSingleLine } from './addressBlock';

import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import offitecLogoUrl from '../../assets/images/offitec.png?url';
import headerWaveUrl from '../../assets/images/header-wave.svg?url';

/** Eine Zeile einer bestätigten Bestellung — genau das, was die Seite zeigt. */
export interface ConfirmedOrderPdfRow {
    purchaseOrderNumber: string;
    supplierName: string | null;
    projectNumber: string | null;
    projectName: string | null;
    deviceName: string | null;
    name: string;
    code: string | null;
    quantity: number;
    unit: string | null;
    netPrice: number;
    lineTotal: number;
    currency: string | null;
    receivedQuantity: number;
    approvedAt: string;
}

export interface ConfirmedOrderPdfInput {
    rows: ConfirmedOrderPdfRow[];
    totals: { orderedTotal: number; receivedTotal: number; lineCount: number };
    /** Was gedruckt wird: «Alle Projekte» oder das Projekt, auf das gefiltert ist. */
    scope?: string | null;
}

// ── Blattmasse (A4 hochkant, mm) ────────────────────────────────────────────
const ML = 12;
const MR = 198;
const CONTENT_W = MR - ML;

const LOGO_X = ML;
const LOGO_Y = 8.2;
const LOGO_H = 11.6;
const LOGO_MAX_W = 50;

/* Die Welle im Mass der sauberen Lieferantenbelege, rechtsbündig. */
const WAVE_W = 127.8;
const WAVE_H = 24.6;
const WAVE_TOP = 3.2;
const WAVE_RASTER_DPI = 400;
const WAVE_VIEW = '0 0 1460 280';

const TITLE_Y = 38;
const META_Y = 43.4;
const CONTENT_TOP_FIRST = 48;
const CONTENT_TOP_REST = 34;
const CONTENT_BOTTOM = 278;
const FOOTER_RULE_Y = 288.13;
const FOOTER_TEXT_Y = 291.85;

// ── Töne: Schwarz, zwei Grau ────────────────────────────────────────────────
const COLOR_TEXT = [0, 0, 0] as const;
const COLOR_SUB = [70, 70, 70] as const;
const COLOR_MUTED = [130, 130, 130] as const;
const COLOR_GRID = [0, 0, 0] as const;
const COLOR_HEAD_BG = [232, 232, 232] as const;
const COLOR_TOTAL_BG = [242, 242, 242] as const;

// ── Schrift & Mass der Tabelle ──────────────────────────────────────────────
const FONT = 'Arial';
const FS_TITLE = 13.5;
const FS_META = 7.4;
const FS_HEAD = 7.2;
const FS_BODY = 7.2;
const FS_SUB = 6.3;
const FS_FOOTER = 5.6;
const LH_BODY = 3.1;
const LH_SUB = 2.7;
const CELL_PAD_X = 1.5;
const ROW_PAD_T = 1.7;
const ROW_PAD_B = 1.6;
const HEAD_PAD_T = 1.8;
const HEAD_PAD_B = 1.7;
/* Gitter: aussen und unter dem Kopf etwas kräftiger als innen. */
const LINE_INNER = 0.15;
const LINE_FRAME = 0.3;

type Align = 'left' | 'right';
type ColumnKey = 'order' | 'project' | 'device' | 'article' | 'qty' | 'net' | 'total' | 'received' | 'date';

interface Column {
    key: ColumnKey;
    caption: string;
    x: number;
    w: number;
    align: Align;
}

/* Hochkant sind 186 mm zu verteilen. Gemessen am längsten Wert der Spalte:
   «120.5 Stk», «1'234.5678», «EUR 7'247.50», «02.09.2026»; Lieferant steht
   unter der Bestellnummer, der Projektname unter der Projektnummer und der
   Artikelcode unter dem Artikel — sonst passt keine der zehn Angaben. */
const WIDTHS: Array<[ColumnKey, number, Align]> = [
    ['order', 26, 'left'],
    ['project', 25, 'left'],
    ['device', 21, 'left'],
    ['article', 0, 'left'],
    ['qty', 14, 'right'],
    ['net', 16, 'right'],
    ['total', 19.5, 'right'],
    ['received', 13, 'right'],
    ['date', 17, 'left'],
];

// ── Fonts / Logo / Welle ────────────────────────────────────────────────────
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
            fetch(arialRegularUrl).then((r) => r.arrayBuffer()),
            fetch(arialBoldUrl).then((r) => r.arrayBuffer()),
        ]);
        fontFiles = { regular: bufferToBase64(regular), bold: bufferToBase64(bold) };
    }
    doc.addFileToVFS('Arial-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('Arial-Bold.ttf', fontFiles.bold);
    doc.addFont('Arial-Regular.ttf', FONT, 'normal');
    doc.addFont('Arial-Bold.ttf', FONT, 'bold');
    doc.setFont(FONT, 'normal');
}

/** Jedes Pixel auf seine Helligkeit — danach ist das Bild wirklich schwarzweiss. */
function desaturate(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
        const grey = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
        data[i] = grey;
        data[i + 1] = grey;
        data[i + 2] = grey;
    }
    ctx.putImageData(image, 0, 0);
}

let logoCache: { dataUrl: string; w: number; h: number } | null = null;

/** Das Logo in Graustufen; misslingt das Umrechnen, bleibt der Kopf ohne Bild. */
async function loadGreyLogo(): Promise<{ dataUrl: string; w: number; h: number } | null> {
    if (logoCache) return logoCache;
    try {
        const img = new Image();
        img.decoding = 'sync';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('logo decode failed'));
            img.src = offitecLogoUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        desaturate(ctx, canvas.width, canvas.height);
        const h = LOGO_H;
        const w = Math.min(LOGO_MAX_W, h * (canvas.width / canvas.height));
        logoCache = { dataUrl: canvas.toDataURL('image/png'), w, h };
        return logoCache;
    } catch (e) {
        console.warn('Logo could not be greyscaled for the production document:', e);
        return null;
    }
}

/* Die beiden Farbstopps der Welle (Marine → Rot) werden durch zwei Grautöne
   ersetzt: dunkel, wo die Marke marine ist, hell, wo sie rot ist. Ändert die
   Marke ihren Verlauf, greift immer noch der Luminanz-Durchgang darunter. */
const GREY_STOPS: Array<[RegExp, string]> = [
    [/#1f2a54/gi, '#2b2b2d'],
    [/#d32026/gi, '#9c9ca1'],
];

let waveCache: string | null = null;

async function loadGreyWave(): Promise<string | null> {
    if (waveCache) return waveCache;
    try {
        const pxW = Math.round((WAVE_W / 25.4) * WAVE_RASTER_DPI);
        const pxH = Math.round((WAVE_H / 25.4) * WAVE_RASTER_DPI);
        const svgText = await fetch(headerWaveUrl).then((r) => r.text());
        const grey = GREY_STOPS.reduce((text, [pattern, tone]) => text.replace(pattern, tone), svgText);
        const sized = grey.replace(/<svg\b[^>]*>/, (tag) =>
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
        desaturate(ctx, pxW, pxH);
        waveCache = canvas.toDataURL('image/png');
        return waveCache;
    } catch (e) {
        console.warn('Header wave could not be rendered in black and white:', e);
        return null;
    }
}

// ── Kleine Helfer ───────────────────────────────────────────────────────────
const EMPTY = '—';

/* Schmale und geschützte Leerzeichen aus Intl gehören nicht in die Schrift. */
const clean = (value: string | null | undefined): string =>
    String(value ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

const numberFormat = (min: number, max: number) =>
    new Intl.NumberFormat('de-CH', { minimumFractionDigits: min, maximumFractionDigits: max });

const amountText = (value: number | null | undefined): string => clean(numberFormat(2, 2).format(Number(value) || 0));
const priceText = (value: number | null | undefined): string => clean(numberFormat(2, 4).format(Number(value) || 0));
const plainQty = (value: number | null | undefined): string => clean(numberFormat(0, 3).format(Number(value) || 0));

const qtyText = (value: number | null | undefined, unit: string | null | undefined): string =>
    clean(`${plainQty(value)} ${clean(unit)}`);

const dateText = (iso: string | null | undefined, locale: string): string => {
    if (!iso) return EMPTY;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return EMPTY;
    return clean(new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date));
};

const stampText = (locale: string): string => clean(new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date()));

/** Zeilen eines Textes in der Zellbreite; was nicht passt, endet mit «…». */
function wrap(doc: jsPDF, text: string, width: number, size: number, maxLines: number, style: 'normal' | 'bold' = 'normal'): string[] {
    const value = clean(text);
    if (!value) return [];
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, Math.max(4, width)) as string[];
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]}…`;
    while (last.length > 1 && doc.getTextWidth(last) > width) last = `${last.slice(0, -2)}…`;
    kept[maxLines - 1] = last;
    return kept;
}

// ── Kopf, Fuss ──────────────────────────────────────────────────────────────
function drawPageHeader(doc: jsPDF, logo: { dataUrl: string; w: number; h: number } | null, wave: string | null, s: PdfCompanySettings) {
    if (logo) {
        try {
            doc.addImage(logo.dataUrl, 'PNG', LOGO_X, LOGO_Y, logo.w, logo.h, 'offitec-logo-grey', 'FAST');
        } catch { /* ohne Bild bleibt der Name */ }
    } else {
        doc.setFont(FONT, 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...COLOR_TEXT);
        doc.text(clean(s.companyName), ML, 16.5);
    }
    if (wave) {
        try {
            doc.addImage(wave, 'PNG', MR - WAVE_W, WAVE_TOP, WAVE_W, WAVE_H, 'offitec-wave-grey', 'FAST');
        } catch { /* ohne Welle bleibt der Kopf ruhig */ }
    }
}

function drawPageFooter(doc: jsPDF, page: number, total: number, title: string, t: FixedTranslator, s: PdfCompanySettings) {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(ML, FOOTER_RULE_Y, MR, FOOTER_RULE_Y);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_FOOTER);
    doc.setTextColor(...COLOR_MUTED);
    const right = `${title}  ·  ${t('production.pdf.page', { page, total })}`;
    doc.text(right, MR, FOOTER_TEXT_Y, { align: 'right' });
    const rightW = doc.getTextWidth(right);
    drawFittedSingleLine(doc, companySenderLine(s, '  ·  '), ML, FOOTER_TEXT_Y, CONTENT_W - rightW - 8, FS_FOOTER, 4.4);
}

// ── Die Tabelle ─────────────────────────────────────────────────────────────
function buildColumns(t: FixedTranslator, currencyNote: string): Column[] {
    const captions: Record<ColumnKey, string> = {
        order: t('production.columns.purchaseOrder'),
        project: t('production.columns.project'),
        device: t('production.columns.device'),
        article: t('production.columns.article'),
        qty: t('production.columns.quantity'),
        net: `${t('production.columns.netPrice')}${currencyNote}`,
        total: `${t('production.columns.lineTotal')}${currencyNote}`,
        received: t('production.columns.received'),
        date: t('production.columns.approvedAt'),
    };
    const fixed = WIDTHS.reduce((sum, [, w]) => sum + w, 0);
    let x = ML;
    return WIDTHS.map(([key, w, align]) => {
        const width = key === 'article' ? CONTENT_W - fixed : w;
        const column: Column = { key, caption: clean(captions[key]), x, w: width, align };
        x += width;
        return column;
    });
}

/** Senkrechte Striche einer Zeile und der Strich darunter — das Gitter. */
function drawGridRow(doc: jsPDF, y: number, height: number, columns: Column[], bottomWeight = LINE_INNER) {
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(LINE_INNER);
    for (const column of columns) doc.line(column.x, y, column.x, y + height);
    doc.setLineWidth(LINE_FRAME);
    doc.line(ML, y, ML, y + height);
    doc.line(MR, y, MR, y + height);
    doc.setLineWidth(bottomWeight);
    doc.line(ML, y + height, MR, y + height);
}

/**
 * Die Schrift der Spaltentitel: so gross wie möglich, aber klein genug, dass
 * KEIN Wort mitten drin bricht («Nettopre/is»). Alle Titel tragen dieselbe
 * Grösse — sonst steht der Kopf krumm. Gilt für jede Sprache: «Satın alma
 * siparişi» ist länger als «Bestellung».
 */
function headSizeFor(doc: jsPDF, columns: Column[]): number {
    const words = columns.map((column) => ({
        width: column.w - CELL_PAD_X * 2,
        parts: column.caption.split(/\s+/).filter(Boolean),
    }));
    doc.setFont(FONT, 'bold');
    let size = FS_HEAD;
    while (size > 5.4) {
        doc.setFontSize(size);
        if (words.every((entry) => entry.parts.every((word) => doc.getTextWidth(word) <= entry.width))) break;
        size -= 0.1;
    }
    return size;
}

/** Der Kopf der Tabelle: grau hinterlegt, fett, schwarz umrandet. */
function drawTableHead(doc: jsPDF, y: number, columns: Column[]): number {
    const size = headSizeFor(doc, columns);
    const cells = columns.map((column) => ({
        column,
        lines: wrap(doc, column.caption, column.w - CELL_PAD_X * 2, size, 2, 'bold'),
    }));
    const lineCount = Math.max(1, ...cells.map((cell) => cell.lines.length));
    const height = HEAD_PAD_T + lineCount * LH_BODY + HEAD_PAD_B;

    doc.setFillColor(...COLOR_HEAD_BG);
    doc.rect(ML, y, CONTENT_W, height, 'F');

    doc.setFont(FONT, 'bold');
    doc.setFontSize(size);
    doc.setTextColor(...COLOR_TEXT);
    for (const { column, lines } of cells) {
        lines.forEach((line, index) => {
            const baseline = y + HEAD_PAD_T + LH_BODY * (index + 1) - 0.9;
            const x = column.align === 'right' ? column.x + column.w - CELL_PAD_X : column.x + CELL_PAD_X;
            doc.text(line, x, baseline, column.align === 'right' ? { align: 'right' } : undefined);
        });
    }

    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(LINE_FRAME);
    doc.line(ML, y, MR, y);
    drawGridRow(doc, y, height, columns, LINE_FRAME);
    return y + height;
}

interface Cell { lines: string[]; subs: string[]; align: Align; x: number; w: number }

function buildCells(doc: jsPDF, row: ConfirmedOrderPdfRow, columns: Column[], locale: string, lang: PurchaseDocLang, withCurrency: boolean): Cell[] {
    return columns.map((column) => {
        const width = column.w - CELL_PAD_X * 2;
        const text = (value: string, maxLines = 1) => wrap(doc, value, width, FS_BODY, maxLines);
        const sub = (value: string | null | undefined, maxLines = 1) =>
            (clean(value) ? wrap(doc, clean(value), width, FS_SUB, maxLines) : []);
        const money = (value: number, currency: string | null) =>
            (withCurrency ? `${clean(currency).toUpperCase() || 'CHF'} ${amountText(value)}` : amountText(value));
        let lines: string[] = [];
        let subs: string[] = [];
        switch (column.key) {
            /* Der Kode steht in der Sprache des Belegs (BE- / SP- / PO-),
               darunter der Lieferant. */
            case 'order':
                lines = text(localizePurchaseCode(row.purchaseOrderNumber, lang));
                subs = sub(row.supplierName, 2);
                break;
            case 'project':
                lines = text(clean(row.projectNumber) || EMPTY);
                subs = sub(row.projectName);
                break;
            case 'device': lines = text(clean(row.deviceName) || EMPTY, 2); break;
            case 'article':
                lines = text(row.name, 3);
                subs = sub(row.code);
                break;
            case 'qty': lines = text(qtyText(row.quantity, row.unit)); break;
            case 'net': lines = text(priceText(row.netPrice)); break;
            case 'total': lines = text(money(row.lineTotal, row.currency)); break;
            case 'received': lines = text(row.receivedQuantity ? plainQty(row.receivedQuantity) : EMPTY); break;
            case 'date': lines = text(dateText(row.approvedAt, locale)); break;
        }
        return { lines, subs, align: column.align, x: column.x, w: column.w };
    });
}

const cellHeight = (cell: Cell): number => cell.lines.length * LH_BODY + cell.subs.length * LH_SUB;
const rowHeight = (cells: Cell[]): number => ROW_PAD_T + Math.max(LH_BODY, ...cells.map(cellHeight)) + ROW_PAD_B;

function drawRow(doc: jsPDF, cells: Cell[], y: number, columns: Column[]): number {
    const height = rowHeight(cells);
    for (const cell of cells) {
        let baseline = y + ROW_PAD_T + LH_BODY - 0.9;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BODY);
        doc.setTextColor(...COLOR_TEXT);
        const x = cell.align === 'right' ? cell.x + cell.w - CELL_PAD_X : cell.x + CELL_PAD_X;
        for (const line of cell.lines) {
            doc.text(line, x, baseline, cell.align === 'right' ? { align: 'right' } : undefined);
            baseline += LH_BODY;
        }
        if (cell.subs.length) {
            doc.setFontSize(FS_SUB);
            doc.setTextColor(...COLOR_SUB);
            baseline -= LH_BODY - LH_SUB - 0.2;
            for (const line of cell.subs) {
                doc.text(line, x, baseline, cell.align === 'right' ? { align: 'right' } : undefined);
                baseline += LH_SUB;
            }
        }
    }
    drawGridRow(doc, y, height, columns);
    return height;
}

/**
 * Die Schlusszeile der Tabelle: links die Zeilenzahl und der Wert des
 * Eingangs, rechts in der Spalte «Zeilensumme» das Bestellte — fett, grau
 * hinterlegt, wie das Total einer gewöhnlichen Tabelle.
 */
function drawTotalsRow(
    doc: jsPDF,
    y: number,
    columns: Column[],
    input: ConfirmedOrderPdfInput,
    t: FixedTranslator,
    currency: string,
): number {
    const totalColumn = columns.find((column) => column.key === 'total')!;
    const height = ROW_PAD_T + LH_BODY + ROW_PAD_B;

    doc.setFillColor(...COLOR_TOTAL_BG);
    doc.rect(ML, y, CONTENT_W, height, 'F');

    const baseline = y + ROW_PAD_T + LH_BODY - 0.9;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BODY);
    doc.setTextColor(...COLOR_TEXT);
    const left = [
        clean(t('production.pdf.rows', { count: input.totals.lineCount })),
        `${clean(t('production.figures.received'))} ${currency} ${amountText(input.totals.receivedTotal)}`,
    ].join('  ·  ');
    drawFittedSingleLine(doc, left, ML + CELL_PAD_X, baseline, totalColumn.x - ML - CELL_PAD_X * 2, FS_BODY, 5.6);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BODY);
    doc.text(
        `${clean(t('production.figures.ordered'))}  ${currency} ${amountText(input.totals.orderedTotal)}`,
        MR - CELL_PAD_X,
        baseline,
        { align: 'right' },
    );

    /* Die Schlusszeile trägt nur den Rahmen — keine Trennstriche, damit die
       Angabe links durchlaufen kann. */
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(LINE_FRAME);
    doc.rect(ML, y, CONTENT_W, height, 'S');
    doc.setLineWidth(LINE_INNER);
    doc.line(totalColumn.x, y, totalColumn.x, y + height);
    return height;
}

// ── Der Beleg ───────────────────────────────────────────────────────────────
export async function buildConfirmedOrdersPdfBytes(
    input: ConfirmedOrderPdfInput,
    settings: PdfCompanySettings = getPdfSettings(),
): Promise<Uint8Array> {
    const { t, lng, locale } = await getReportTranslator();
    const lang = purchaseLangOf(lng);
    const title = clean(t('production.pdf.title'));

    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.setProperties({ title });
    doc.viewerPreferences({ DisplayDocTitle: true });
    await registerFonts(doc);
    doc.setCharSpace(0);

    const [logo, wave] = await Promise.all([loadGreyLogo(), loadGreyWave()]);

    /* Gerechnet wird NICHT umgerechnet — wie auf der Seite. Tragen alle Zeilen
       dieselbe Währung, steht sie im Spaltenkopf und die Zellen bleiben nackte
       Zahlen; sonst schreibt jede Zelle ihre eigene Währung. */
    const currencies = new Set(input.rows.map((row) => clean(row.currency).toUpperCase()).filter(Boolean));
    const mixed = currencies.size > 1;
    const currency = currencies.size === 1 ? [...currencies][0]! : (settings.currency || 'CHF');
    const columns = buildColumns(t, mixed ? '' : ` (${currency})`);

    // Titel und die EINE Angabenzeile — kein Kasten.
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_TITLE);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(title, ML, TITLE_Y);

    const meta = [
        clean(settings.companyName),
        clean(input.scope) || clean(t('production.lines.allProjects')),
        clean(t('production.pdf.rows', { count: input.totals.lineCount })),
        clean(t('production.pdf.created', { date: stampText(locale) })),
    ].filter(Boolean).join('  ·  ');
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_META);
    doc.setTextColor(...COLOR_MUTED);
    drawFittedSingleLine(doc, meta, ML, META_Y, CONTENT_W, FS_META, 5.6);

    let y = drawTableHead(doc, CONTENT_TOP_FIRST, columns);

    if (input.rows.length === 0) {
        const empty: Cell[] = [{ lines: [clean(t('production.pdf.empty'))], subs: [], align: 'left', x: ML, w: CONTENT_W }];
        y += drawRow(doc, empty, y, columns);
    }

    for (const row of input.rows) {
        const cells = buildCells(doc, row, columns, locale, lang, mixed);
        if (y + rowHeight(cells) > CONTENT_BOTTOM) {
            doc.addPage();
            y = drawTableHead(doc, CONTENT_TOP_REST, columns);
        }
        y += drawRow(doc, cells, y, columns);
    }

    // Die Schlusszeile bleibt bei der Tabelle.
    if (y + ROW_PAD_T + LH_BODY + ROW_PAD_B > CONTENT_BOTTOM) {
        doc.addPage();
        y = drawTableHead(doc, CONTENT_TOP_REST, columns);
    }
    drawTotalsRow(doc, y, columns, input, t, currency);

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        drawPageHeader(doc, logo, wave, settings);
        drawPageFooter(doc, page, pageCount, title, t, settings);
    }

    return new Uint8Array(doc.output('arraybuffer'));
}

const fileName = (title: string): string => {
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = title
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `${slug || 'Document'}_${stamp}.pdf`;
};

export async function exportConfirmedOrdersPdf(input: ConfirmedOrderPdfInput): Promise<void> {
    const { t } = await getReportTranslator();
    const bytes = await buildConfirmedOrdersPdfBytes(input);
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(clean(t('production.pdf.title')));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
