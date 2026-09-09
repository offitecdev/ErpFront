/**
 * ── CHECKLISTE — PDF ALS AMTLICHES SCHWARZ-WEISS-DOKUMENT ───────────────────
 * Vorgabe (02.09.2026): «Die Checklisten-PDFs sollen NICHT unserem
 * Standard-PDF folgen — sie sollen als Liste bzw. Tabelle aufgebaut sein, wie
 * ein amtliches Schwarz-Weiss-Dokument.»
 *
 * Darum hängt dieses Dokument bewusst NICHT am modernReportKit-Kleid: kein
 * Logo, keine Kopfwelle, kein Marineblau, keine grauen Bänder, keine Zebra-
 * Zeilen. Es gibt genau EINE Farbe (Schwarz) auf Weiss, Arial, und drei
 * Strichstärken: Haarlinie (0.2) für Zellen, Regel (0.45) für Kopfzeilen und
 * Abschlüsse, Rahmen um jede Tabelle.
 *
 * Aufbau: Laufkopf (Firma links, Dokument-ID rechts) · Titelblock · Angaben
 * als zweispaltige Tabelle · die Punkte als NUMMERIERTE Tabelle (Nr | Punkt |
 * Ergebnis, Abschnitte als volle Zeile) · Fotos · Zeichnungen · Dateien ·
 * Bemerkungen · Unterschriften · Fusszeile mit Seite x von y. Nur SICHTBARE
 * Felder (dieselben Bedingungen wie am Bildschirm); leere Blöcke fehlen ganz.
 *
 * Immer per dynamic import laden (Angebots-PDF-Regel): jsPDF darf nicht in den
 * Startpfad.
 */
import { jsPDF } from 'jspdf';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import { getReportTranslator, type FixedTranslator } from '@/i18n/reportLanguage';
import type { FormSubmissionDto } from '@/lib/api/forms';
import {
    computeFieldVisibility,
    FIELD_UNITS,
    isFormValueEmpty,
    NUMERIC_FIELD_TYPES,
    type FormFieldDef,
    type FormFileValue,
    type FormPhotoValue,
    type FormSignatureValue,
    type FormValues,
} from '@/lib/formFields';
import { clean, dateFmt, dateShort, detectImageFormat, downloadPdf, EMPTY, FONT, registerFonts } from './modernReportKit';

// ── Seitengeometrie (A4, mm) — eigene Masse, unabhängig vom Rapport-Kit ─────
const ML = 18;
const MR = 192;
const W = MR - ML;
/** Unter dem Laufkopf beginnt auf JEDER Seite der Inhalt. */
const CONTENT_TOP = 27;
const CONTENT_BOTTOM = 271;
const TOPLINE_Y = 14.5;
const TOPRULE_Y = 19.5;
const FOOTER_RULE_Y = 277.5;
const FOOTER_TEXT_Y = 280.5;

const BLACK: readonly [number, number, number] = [0, 0, 0];
const HAIR = 0.2;
const RULE = 0.45;

// ── Schrift ──────────────────────────────────────────────────────────────────
const FS_BODY = 9;
const FS_SUB = 7.4;
const FS_SMALL = 7.6;
const PAD_X = 2.2;
const PAD_Y = 1.9;
/** Zeilenhöhe in mm für eine Schriftgrösse in pt (Durchschuss 1.28). */
const lineHeight = (size: number) => size * 0.3528 * 1.28;
const LH_SUB = lineHeight(FS_SUB);

type FontStyle = 'normal' | 'bold' | 'italic';
const font = (doc: jsPDF, size: number, style: FontStyle = 'normal') => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(...BLACK);
};

const hline = (doc: jsPDF, x1: number, x2: number, y: number, width = HAIR) => {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(width);
    doc.line(x1, y, x2, y);
};
const vline = (doc: jsPDF, x: number, y1: number, y2: number, width = HAIR) => {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(width);
    doc.line(x, y1, x, y2);
};
const frame = (doc: jsPDF, x: number, y: number, w: number, h: number, width = HAIR) => {
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(width);
    doc.rect(x, y, w, h);
};

const newPage = (doc: jsPDF): number => {
    doc.addPage();
    return CONTENT_TOP;
};
const ensure = (doc: jsPDF, y: number, needed: number): number => (y + needed <= CONTENT_BOTTOM ? y : newPage(doc));

const splitLines = (doc: jsPDF, text: string, width: number): string[] => {
    if (!text) return [''];
    const lines = doc.splitTextToSize(text, Math.max(4, width)) as string[];
    return lines.length ? lines : [''];
};

// ── Wert als Text — in der Sprache des Dokuments ─────────────────────────────
const valueText = (field: FormFieldDef, value: unknown, t: FixedTranslator, locale: string): string => {
    if (isFormValueEmpty(field, value)) return field.type === 'CHECKBOX' ? t('forms.value.no') : EMPTY;
    switch (field.type) {
        case 'CHECKBOX': return t('forms.value.yes');
        case 'SELECT': return (field.options || []).find((option) => option.id === value)?.label ?? String(value);
        case 'DATE': return dateFmt(String(value), locale);
        case 'PHOTO': return t('forms.value.photoCount', { count: Array.isArray(value) ? value.length : 0 });
        case 'FILE': return Array.isArray(value) ? (value as FormFileValue[]).map((file) => file.name).join(', ') : EMPTY;
        case 'DRAWING': return t('forms.value.drawingPresent');
        case 'SIGNATURE': {
            const signature = value as FormSignatureValue;
            const when = signature?.signedAt ? new Date(signature.signedAt) : null;
            const stamp = when && !Number.isNaN(when.getTime()) ? t('forms.value.signedAt', { date: dateFmt(when, locale) }) : t('forms.value.signed');
            return signature?.name ? `${signature.name} — ${stamp}` : stamp;
        }
        default: {
            if (NUMERIC_FIELD_TYPES.has(field.type)) {
                const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
                const text = Number.isFinite(number) ? number.toLocaleString(locale, { maximumFractionDigits: 3 }) : String(value);
                const unit = FIELD_UNITS[field.type];
                return unit ? `${text} ${unit}` : text;
            }
            return String(value);
        }
    }
};

// ── Tabelle: schwarzer Rahmen, Haarlinien, Kopfzeile auf jeder Seite ─────────
interface Col { w: number; align?: 'left' | 'right' }
interface Cell {
    text: string;
    bold?: boolean;
    size?: number;
    align?: 'left' | 'right';
    /** Kleinere zweite Zeile in derselben Zelle (Hilfetext eines Punktes). */
    sub?: string;
}
/** `full` = EINE Zelle über die ganze Breite (Abschnittszeile). */
interface Row { cells: Cell[]; full?: boolean }

interface LaidRow {
    row: Row;
    widths: number[];
    lines: string[][];
    subLines: string[][];
    h: number;
}

const layoutRow = (doc: jsPDF, cols: Col[], row: Row): LaidRow => {
    const total = cols.reduce((sum, col) => sum + col.w, 0);
    const widths = row.full ? [total] : cols.map((col) => col.w);
    const lines: string[][] = [];
    const subLines: string[][] = [];
    let h = 0;
    row.cells.forEach((cell, index) => {
        const innerW = widths[index] - 2 * PAD_X;
        const size = cell.size ?? FS_BODY;
        font(doc, size, cell.bold ? 'bold' : 'normal');
        const main = splitLines(doc, cell.text, innerW);
        let sub: string[] = [];
        if (cell.sub) {
            font(doc, FS_SUB);
            sub = splitLines(doc, cell.sub, innerW);
        }
        const cellH = 2 * PAD_Y + main.length * lineHeight(size) + (sub.length ? 0.6 + sub.length * LH_SUB : 0);
        h = Math.max(h, cellH);
        lines.push(main);
        subLines.push(sub);
    });
    return { row, widths, lines, subLines, h };
};

const drawRow = (doc: jsPDF, cols: Col[], laid: LaidRow, x0: number, y: number) => {
    let x = x0;
    laid.row.cells.forEach((cell, index) => {
        const w = laid.widths[index];
        const size = cell.size ?? FS_BODY;
        const lh = lineHeight(size);
        const align = cell.align ?? (laid.row.full ? 'left' : cols[index]?.align ?? 'left');
        const tx = align === 'right' ? x + w - PAD_X : x + PAD_X;
        font(doc, size, cell.bold ? 'bold' : 'normal');
        let ty = y + PAD_Y;
        for (const line of laid.lines[index]) {
            doc.text(line, tx, ty, { align, baseline: 'top' });
            ty += lh;
        }
        if (laid.subLines[index].length) {
            font(doc, FS_SUB);
            ty += 0.6;
            for (const line of laid.subLines[index]) {
                doc.text(line, tx, ty, { align, baseline: 'top' });
                ty += LH_SUB;
            }
        }
        x += w;
    });
    // Spaltenlinien nur in mehrspaltigen Zeilen — eine Abschnittszeile läuft durch.
    if (!laid.row.full) {
        let cx = x0;
        for (let index = 0; index < cols.length - 1; index += 1) {
            cx += cols[index].w;
            vline(doc, cx, y, y + laid.h);
        }
    }
};

/**
 * Zeichnet eine Tabelle ab `y` und gibt die Unterkante zurück. Passt eine
 * Zeile nicht mehr auf die Seite, wird der Rahmen geschlossen, die Kopfzeile
 * auf der nächsten Seite wiederholt und dort weitergezeichnet — eine Zeile
 * wird nie geteilt.
 */
const drawTable = (doc: jsPDF, y: number, cols: Col[], header: Cell[] | null, rows: Row[]): number => {
    if (!rows.length) return y;
    const x0 = ML;
    const totalW = cols.reduce((sum, col) => sum + col.w, 0);
    const laidRows = rows.map((row) => layoutRow(doc, cols, row));
    const headerLaid = header ? layoutRow(doc, cols, { cells: header.map((cell) => ({ ...cell, bold: true })) }) : null;
    const headerH = headerLaid?.h ?? 0;

    y = ensure(doc, y, headerH + laidRows[0].h + 1);
    let segTop = y;
    const openSegment = () => {
        segTop = y;
        if (headerLaid) {
            drawRow(doc, cols, headerLaid, x0, y);
            y += headerLaid.h;
            hline(doc, x0, x0 + totalW, y, RULE);
        }
    };
    const closeSegment = () => frame(doc, x0, segTop, totalW, y - segTop, RULE);

    openSegment();
    laidRows.forEach((laid, index) => {
        if (y + laid.h > CONTENT_BOTTOM) {
            closeSegment();
            y = newPage(doc);
            openSegment();
        }
        drawRow(doc, cols, laid, x0, y);
        y += laid.h;
        if (index < laidRows.length - 1) hline(doc, x0, x0 + totalW, y);
    });
    closeSegment();
    return y;
};

// ── Überschriften und Fliesstext ─────────────────────────────────────────────
const drawHeading = (doc: jsPDF, y: number, text: string): number => {
    y = ensure(doc, y, 22);
    font(doc, 10, 'bold');
    doc.text(text, ML, y, { baseline: 'top' });
    y += lineHeight(10) + 0.8;
    hline(doc, ML, MR, y, HAIR);
    return y + 3;
};

const drawParagraph = (doc: jsPDF, y: number, text: string): number => {
    font(doc, FS_BODY);
    const lines = splitLines(doc, text, W - 1);
    const lh = lineHeight(FS_BODY);
    for (const line of lines) {
        y = ensure(doc, y, lh);
        font(doc, FS_BODY);
        doc.text(line, ML, y, { baseline: 'top' });
        y += lh;
    }
    return y;
};

// ── Bilder ──────────────────────────────────────────────────────────────────
const drawFramedImage = (doc: jsPDF, src: string, x: number, y: number, w: number, h: number) => {
    frame(doc, x, y, w, h);
    try {
        const props = doc.getImageProperties(src);
        const ratio = Math.min((w - 1.2) / props.width, (h - 1.2) / props.height);
        const iw = props.width * ratio;
        const ih = props.height * ratio;
        doc.addImage(src, detectImageFormat(src), x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
    } catch {
        try { doc.addImage(src, detectImageFormat(src), x + 0.6, y + 0.6, w - 1.2, h - 1.2, undefined, 'FAST'); } catch { /* ungültiges Bild überspringen */ }
    }
};

const drawPhotos = (doc: jsPDF, photos: FormPhotoValue[], y: number): number => {
    const cols = 3;
    const gap = 4;
    const cellW = (W - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.72;
    const captionH = 4.6;
    photos.forEach((photo, index) => {
        const col = index % cols;
        if (col === 0) y = ensure(doc, y, cellH + captionH + gap);
        const x = ML + col * (cellW + gap);
        drawFramedImage(doc, photo.dataUrl, x, y, cellW, cellH);
        const caption = clean(photo.caption);
        if (caption) {
            font(doc, FS_SMALL);
            const line = splitLines(doc, caption, cellW)[0];
            doc.text(line, x + cellW / 2, y + cellH + 1.2, { align: 'center', baseline: 'top' });
        }
        if (col === cols - 1 || index === photos.length - 1) y += cellH + captionH + gap;
    });
    return y;
};

// ── Unterschriften: Bild über einer schwarzen Linie, darunter Name / Datum ──
const SIGN_GAP = 8;
const SIGN_W = (W - SIGN_GAP) / 2;
const SIGN_IMG_H = 24;
const SIGN_H = 4.6 + SIGN_IMG_H + 1.5 + 2 * lineHeight(FS_SMALL) + 2;

const drawSignature = (doc: jsPDF, x: number, y: number, label: string, signature: FormSignatureValue, t: FixedTranslator, locale: string) => {
    font(doc, FS_SMALL, 'bold');
    doc.text(splitLines(doc, label, SIGN_W)[0], x, y, { baseline: 'top' });
    const imgTop = y + 4.6;
    try {
        const props = doc.getImageProperties(signature.dataUrl);
        const boxW = SIGN_W - 6;
        const ratio = Math.min(boxW / props.width, (SIGN_IMG_H - 1) / props.height);
        const iw = props.width * ratio;
        const ih = props.height * ratio;
        doc.addImage(signature.dataUrl, detectImageFormat(signature.dataUrl), x + 3, imgTop + (SIGN_IMG_H - ih) - 0.5, iw, ih, undefined, 'FAST');
    } catch { /* eine unlesbare Unterschrift lässt die Linie stehen */ }
    const lineY = imgTop + SIGN_IMG_H;
    hline(doc, x, x + SIGN_W, lineY, RULE);
    font(doc, FS_SMALL);
    let ty = lineY + 1.5;
    doc.text(`${t('forms.pdf.signatureName')}: ${clean(signature.name) || EMPTY}`, x, ty, { baseline: 'top' });
    ty += lineHeight(FS_SMALL);
    doc.text(`${t('forms.pdf.signedOn')}: ${signature.signedAt ? dateFmt(signature.signedAt, locale) : EMPTY}`, x, ty, { baseline: 'top' });
};

// ── Laufkopf und Fusszeile auf jeder Seite ───────────────────────────────────
const decorate = (doc: jsPDF, companyLine: string, documentLine: string, footerLeft: string, t: FixedTranslator) => {
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        font(doc, 8);
        // Beide Zeilen teilen sich die Breite: rechts hat Vorrang, links wird gekürzt.
        const rightW = doc.getTextWidth(documentLine);
        const leftMax = W - rightW - 6;
        const left = splitLines(doc, companyLine, leftMax)[0];
        doc.text(left, ML, TOPLINE_Y, { baseline: 'top' });
        doc.text(documentLine, MR, TOPLINE_Y, { align: 'right', baseline: 'top' });
        hline(doc, ML, MR, TOPRULE_Y, RULE);

        hline(doc, ML, MR, FOOTER_RULE_Y, HAIR);
        font(doc, FS_SMALL);
        const pageText = t('forms.pdf.pageOf', { page, total: pages });
        const pageW = doc.getTextWidth(pageText);
        doc.text(splitLines(doc, footerLeft, W - pageW - 6)[0], ML, FOOTER_TEXT_Y, { baseline: 'top' });
        doc.text(pageText, MR, FOOTER_TEXT_Y, { align: 'right', baseline: 'top' });
    }
};

export interface FormSubmissionPdfParams {
    submission: FormSubmissionDto;
    /** 'blob' liefert das Dokument für die Vorschau statt es herunterzuladen. */
    output?: 'download' | 'blob';
}

export const exportFormSubmissionPdf = async ({ submission, output }: FormSubmissionPdfParams): Promise<Blob | null> => {
    const settings = getPdfSettings();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const { t, locale } = await getReportTranslator(submission.customerLanguage);

    const fields = Array.isArray(submission.templateFields) ? submission.templateFields : [];
    const values: FormValues = submission.values || {};
    const visibility = computeFieldVisibility(fields, values);
    const visible = fields.filter((field) => visibility[field.id] !== false);

    const documentId = clean(submission.id).toUpperCase();
    const templateName = clean(submission.templateName) || t('forms.pdf.title');
    const documentDate = dateShort(submission.completedAt || submission.updatedAt || submission.createdAt);
    const customerLine = submission.customerCount > 1 ? clean(submission.linkedCustomerNames) : clean(submission.customerName);

    // ── Titelblock (nur Seite 1) ─────────────────────────────────────────────
    let y = CONTENT_TOP + 2;
    font(doc, 8);
    doc.text(t('forms.pdf.docTitle').toUpperCase(), ML, y, { baseline: 'top', charSpace: 0.7 });
    y += lineHeight(8) + 1.5;
    font(doc, 16, 'bold');
    const titleLines = splitLines(doc, templateName, W);
    for (const line of titleLines) {
        doc.text(line, ML, y, { baseline: 'top' });
        y += lineHeight(16);
    }
    y += 1.5;
    hline(doc, ML, MR, y, RULE);
    y += 5;

    // ── Angaben ──────────────────────────────────────────────────────────────
    const meta: Array<[string, string]> = [
        [t('forms.pdf.formNo'), documentId],
        [t('forms.pdf.template'), clean(submission.templateName)],
        [submission.customerCount > 1 ? t('forms.pdf.customers') : t('forms.pdf.customer'), customerLine],
        [t('forms.pdf.tender'), clean(submission.tenderNumber)],
        [t('forms.pdf.order'), clean(submission.orderNumber)],
        [t('forms.pdf.project'), clean(submission.projectNumber)],
        [t('forms.pdf.date'), documentDate],
        [t('forms.pdf.filledBy'), clean(submission.filledByName)],
    ];
    y = drawTable(
        doc,
        y,
        [{ w: 48 }, { w: W - 48 }],
        null,
        meta.filter(([, value]) => value && value !== EMPTY).map(([label, value]) => ({ cells: [{ text: label, bold: true }, { text: value }] })),
    );
    y += 8;

    // ── Die Punkte als nummerierte Tabelle ───────────────────────────────────
    const rows: Row[] = [];
    let number = 0;
    for (const field of visible) {
        if (field.type === 'SECTION') {
            rows.push({ full: true, cells: [{ text: clean(field.label), bold: true, size: 9.5 }] });
            continue;
        }
        number += 1;
        rows.push({
            cells: [
                { text: String(number) },
                { text: clean(field.label) + (field.required ? ' *' : ''), sub: clean(field.help) || undefined },
                { text: valueText(field, values[field.id], t, locale) },
            ],
        });
    }
    if (rows.some((row) => !row.full)) {
        y = drawHeading(doc, y, t('forms.pdf.fields'));
        y = drawTable(
            doc,
            y,
            [{ w: 10, align: 'right' }, { w: W - 10 - 68 }, { w: 68 }],
            [{ text: t('forms.pdf.colNo'), align: 'right' }, { text: t('forms.pdf.colItem') }, { text: t('forms.pdf.colResult') }],
            rows,
        );
        y += 8;
    }

    // ── Fotos ────────────────────────────────────────────────────────────────
    for (const field of visible) {
        if (field.type !== 'PHOTO') continue;
        const photos = (Array.isArray(values[field.id]) ? values[field.id] : []) as FormPhotoValue[];
        if (!photos.length) continue;
        y = drawHeading(doc, y, `${t('forms.pdf.photos')} — ${clean(field.label)}`);
        y = drawPhotos(doc, photos, y);
        y += 4;
    }

    // ── Zeichnungen ──────────────────────────────────────────────────────────
    for (const field of visible) {
        if (field.type !== 'DRAWING') continue;
        const drawing = values[field.id];
        if (typeof drawing !== 'string' || !drawing) continue;
        const h = W * 0.55;
        y = ensure(doc, y, 22 + h);
        y = drawHeading(doc, y, `${t('forms.pdf.drawing')} — ${clean(field.label)}`);
        drawFramedImage(doc, drawing, ML, y, W, h);
        y += h + 8;
    }

    // ── Dateien (nur die Namen — Inhalte hängen an der Checkliste) ───────────
    const fileRows: Row[] = [];
    for (const field of visible) {
        if (field.type !== 'FILE') continue;
        const files = (Array.isArray(values[field.id]) ? values[field.id] : []) as FormFileValue[];
        for (const file of files) {
            fileRows.push({ cells: [{ text: clean(field.label) }, { text: clean(file.name) }, { text: `${Math.max(1, Math.round(file.size / 1024))} KB` }] });
        }
    }
    if (fileRows.length) {
        y = drawHeading(doc, y, t('forms.pdf.files'));
        y = drawTable(
            doc,
            y,
            [{ w: 56 }, { w: W - 56 - 24 }, { w: 24, align: 'right' }],
            [{ text: t('forms.pdf.colField') }, { text: t('forms.pdf.colFile') }, { text: t('forms.pdf.colSize'), align: 'right' }],
            fileRows,
        );
        y += 8;
    }

    // ── Bemerkungen ──────────────────────────────────────────────────────────
    if (clean(submission.notes)) {
        y = drawHeading(doc, y, t('forms.pdf.notes'));
        y = drawParagraph(doc, y, clean(submission.notes));
        y += 8;
    }

    // ── Unterschriften: zwei nebeneinander, eine allein steht links ──────────
    const signatures = visible
        .filter((field) => field.type === 'SIGNATURE')
        .map((field) => ({ field, signature: values[field.id] as FormSignatureValue | undefined }))
        .filter((entry): entry is { field: FormFieldDef; signature: FormSignatureValue } => Boolean(entry.signature?.dataUrl));
    if (signatures.length) {
        y = ensure(doc, y, 22 + SIGN_H);
        y = drawHeading(doc, y, t('forms.pdf.signatures'));
        for (let index = 0; index < signatures.length; index += 2) {
            y = ensure(doc, y, SIGN_H + 4);
            const pair = signatures.slice(index, index + 2);
            pair.forEach((entry, position) => {
                drawSignature(doc, ML + position * (SIGN_W + SIGN_GAP), y, clean(entry.field.label) || t('forms.pdf.signature'), entry.signature, t, locale);
            });
            y += SIGN_H + 6;
        }
    }

    // ── Laufkopf und Fusszeile ───────────────────────────────────────────────
    const companyLine = [clean(settings.companyName), clean(settings.addressLine1), `${clean(settings.postalCode)} ${clean(settings.city)}`.trim()]
        .filter(Boolean)
        .join(' · ');
    const documentLine = `${t('forms.pdf.documentId')} ${documentId}  ·  ${documentDate}`;
    const footerLeft = `${templateName}  ·  ${documentId}  ·  ${t('forms.pdf.generatedAt', { date: dateFmt(new Date(), locale) })}`;
    decorate(doc, companyLine, documentLine, footerLeft, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const safeName = (clean(submission.templateName) || 'formular').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    const customer = clean(submission.customerName).replace(/[\\/:*?"<>|]/g, '-').slice(0, 40);
    downloadPdf(bytes, `${safeName}${customer ? `-${customer}` : ''}-${dateShort(submission.createdAt).replace(/\./g, '-')}.pdf`);
    return null;
};
