/**
 * ── CHECKLISTE / FORMULAR — PDF ──────────────────────────────────────────────
 * Ausgabe eines ausgefüllten Formulars in der Gestaltung von modernReportKit
 * (tenderPdfModern-Kennung): Kopfkarte mit Vorlage / Kunde / Beleg-Nummern /
 * Datum / ausgefüllt von, dann die Felder als Tabelle "Feld | Wert" — je
 * Abschnitt eine Band-Zeile — anschliessend Fotos, Zeichnungen, Dateiliste
 * und die Unterschriften als Karten. Nur SICHTBARE Felder (Bedingungen wie
 * auf dem Bildschirm); leere Blöcke werden gar nicht gezeichnet.
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
import {
    CONTENT_BOTTOM, CONTENT_TOP_REST, CONTENT_W, EMPTY, ML, MR,
    COLOR_CARD_BORDER, COLOR_HAIRLINE, COLOR_LABEL, COLOR_MUTED, COLOR_NAVY, COLOR_TEXT,
    FONT, FS_BASE, LH_BODY,
    clean, dateFmt, dateShort, decoratePages, detectImageFormat, downloadPdf,
    drawCover, drawModernTable, drawSectionTitle, drawSubTitle, ensureSpace,
    fitFontSize, loadBrandAssets, registerFonts,
    type ModernColumn,
} from './modernReportKit';

/** Wert als Text — wie formatFormValue, aber in der Sprache des Dokuments. */
const valueText = (field: FormFieldDef, value: unknown, t: FixedTranslator, locale: string): string => {
    if (isFormValueEmpty(field, value)) return field.type === 'CHECKBOX' ? t('forms.value.no') : EMPTY;
    switch (field.type) {
        case 'CHECKBOX': return t('forms.value.yes');
        case 'SELECT': return (field.options || []).find((option) => option.id === value)?.label ?? String(value);
        case 'DATE': {
            const date = new Date(String(value));
            return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(locale);
        }
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

/** Bild proportional in einen Rahmen setzen (Fotos, Zeichnungen). */
const drawFramedImage = (doc: jsPDF, src: string, x: number, y: number, w: number, h: number) => {
    doc.setDrawColor(...COLOR_HAIRLINE);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, h);
    try {
        const props = doc.getImageProperties(src);
        const ratio = Math.min((w - 1) / props.width, (h - 1) / props.height);
        const iw = props.width * ratio;
        const ih = props.height * ratio;
        doc.addImage(src, detectImageFormat(src), x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
    } catch {
        try { doc.addImage(src, detectImageFormat(src), x + 0.5, y + 0.5, w - 1, h - 1, undefined, 'FAST'); } catch { /* ungültiges Bild überspringen */ }
    }
};

/** Foto-Raster mit Bildunterschrift (3 Spalten). */
const drawPhotos = (doc: jsPDF, photos: FormPhotoValue[], y: number): number => {
    const cols = 3;
    const gap = 4;
    const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.72;
    const captionH = 4.5;
    photos.forEach((photo, index) => {
        const col = index % cols;
        if (col === 0) y = ensureSpace(doc, y, cellH + captionH + gap);
        const x = ML + col * (cellW + gap);
        drawFramedImage(doc, photo.dataUrl, x, y, cellW, cellH);
        if (clean(photo.caption)) {
            doc.setFont(FONT, 'normal');
            doc.setFontSize(7.4);
            doc.setTextColor(...COLOR_MUTED);
            const caption = clean(photo.caption);
            fitFontSize(doc, caption, cellW, 7.4, 5.8);
            doc.text(caption, x + cellW / 2, y + cellH + 3.2, { align: 'center' });
        }
        if (col === cols - 1 || index === photos.length - 1) y += cellH + captionH + gap;
    });
    return y + 2;
};

/** Unterschriftskarte wie im Abnahme-Rapport (weisses Feld, Name, Zeitpunkt). */
const drawSignatureCard = (doc: jsPDF, label: string, signature: FormSignatureValue, y: number, t: FixedTranslator, locale: string): number => {
    const cardW = 80;
    const cardH = 44;
    y = ensureSpace(doc, y, cardH + 6);
    const cardX = ML;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLOR_CARD_BORDER);
    doc.setLineWidth(0.25);
    doc.rect(cardX, y, cardW, cardH, 'FD');
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(cardX, y, 1.2, cardH, 'F');
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_LABEL);
    doc.text(label, cardX + 4.5, y + 5.2);
    const when = signature.signedAt ? dateFmt(signature.signedAt, locale) : '';
    if (when) doc.text(when, cardX + cardW - 3.5, y + 5.2, { align: 'right' });
    if (clean(signature.name)) {
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...COLOR_NAVY);
        fitFontSize(doc, clean(signature.name), cardW - 9, 9, 6.4);
        doc.text(clean(signature.name), cardX + 4.5, y + 10.4);
    }
    const sigTop = y + 12.5;
    const lineY = y + cardH - 7.5;
    try {
        const props = doc.getImageProperties(signature.dataUrl);
        const boxW = cardW - 16;
        const boxH = lineY - sigTop - 1.5;
        const ratio = Math.min(boxW / props.width, boxH / props.height);
        const w = props.width * ratio;
        const h = props.height * ratio;
        doc.addImage(signature.dataUrl, detectImageFormat(signature.dataUrl), cardX + (cardW - w) / 2, sigTop + (boxH - h) / 2, w, h, undefined, 'FAST');
    } catch { /* bozuk imza verisi kartı düşürmesin */ }
    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(0.3);
    doc.line(cardX + 4.5, lineY, cardX + cardW - 4.5, lineY);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_LABEL);
    doc.text(t('forms.pdf.signature'), cardX + 4.5, lineY + 3.6);
    doc.setTextColor(...COLOR_TEXT);
    return y + cardH + 6;
};

const drawParagraph = (doc: jsPDF, text: string, y: number): number => {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    const lines = doc.splitTextToSize(text, CONTENT_W - 2) as string[];
    let cy = y + 3.6;
    for (const line of lines) {
        if (cy > CONTENT_BOTTOM - 1.5) { doc.addPage(); cy = CONTENT_TOP_REST + 3.6; }
        doc.text(line, ML + 1, cy);
        cy += LH_BODY + 0.2;
    }
    return cy + 4;
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
    const assets = await loadBrandAssets(doc);
    const { t, locale } = await getReportTranslator(submission.customerLanguage);

    const fields = Array.isArray(submission.templateFields) ? submission.templateFields : [];
    const values: FormValues = submission.values || {};
    const visibility = computeFieldVisibility(fields, values);
    const visible = fields.filter((field) => visibility[field.id] !== false);

    let y = drawCover(doc, {
        rows: [
            { label: t('forms.pdf.formNo'), value: clean(submission.id).toUpperCase(), emphasize: true },
            { label: t('forms.pdf.template'), value: clean(submission.templateName) },
            // Geteilte Checkliste: der Briefkopf trägt den ersten Kunden, die
            // Zeile hier nennt alle beteiligten (16.08.2026).
            ...(submission.customerCount > 1
                ? [{ label: t('forms.pdf.customers'), value: clean(submission.linkedCustomerNames) }]
                : []),
            { label: t('forms.pdf.tender'), value: clean(submission.tenderNumber) },
            { label: t('forms.pdf.order'), value: clean(submission.orderNumber) },
            { label: t('forms.pdf.project'), value: clean(submission.projectNumber) },
            { label: t('forms.pdf.date'), value: dateShort(submission.completedAt || submission.updatedAt || submission.createdAt) },
            { label: t('forms.pdf.filledBy'), value: clean(submission.filledByName) },
        ],
        settings,
        recipientName: clean(submission.customerName),
        recipientLines: [],
        title: clean(submission.templateName) || t('forms.pdf.title'),
        subtitle: t('forms.pdf.subtitle'),
        numberedSections: true,
    });

    // ── Felder als Tabelle, je Abschnitt eine Bandzeile ──────────────────────
    const columns: ModernColumn[] = [
        { header: t('forms.pdf.colField'), w: 70 },
        { header: t('forms.pdf.colValue'), w: CONTENT_W - 70 },
    ];
    type Group = { title: string | null; rows: string[][] };
    const groups: Group[] = [];
    let current: Group = { title: null, rows: [] };
    for (const field of visible) {
        if (field.type === 'SECTION') {
            if (current.rows.length || current.title) groups.push(current);
            current = { title: field.label, rows: [] };
            continue;
        }
        current.rows.push([field.label + (field.required ? ' *' : ''), valueText(field, values[field.id], t, locale)]);
    }
    if (current.rows.length || current.title) groups.push(current);

    if (groups.some((group) => group.rows.length)) {
        y = drawSectionTitle(doc, t('forms.pdf.fields'), y);
        for (const group of groups) {
            if (group.title) {
                y = ensureSpace(doc, y, 24);
                // Abschnittsgruppe = Zwischenüberschrift (Stufe 3), nicht das
                // Summenband — siehe Titelstufen in modernReportKit.
                y = drawSubTitle(doc, group.title, '', y);
            }
            if (group.rows.length) {
                y = drawModernTable(doc, columns, group.rows, y);
                y += 3;
            }
        }
        y += 2;
    }

    // ── Fotos ────────────────────────────────────────────────────────────────
    for (const field of visible) {
        if (field.type !== 'PHOTO') continue;
        const photos = (Array.isArray(values[field.id]) ? values[field.id] : []) as FormPhotoValue[];
        if (!photos.length) continue;
        y = drawSectionTitle(doc, `${t('forms.pdf.photos')} — ${field.label}`, y);
        y = drawPhotos(doc, photos, y);
    }

    // ── Zeichnungen (eine je Zeile, breit) ────────────────────────────────────
    for (const field of visible) {
        if (field.type !== 'DRAWING') continue;
        const drawing = values[field.id];
        if (typeof drawing !== 'string' || !drawing) continue;
        const h = CONTENT_W * 0.55;
        y = drawSectionTitle(doc, `${t('forms.pdf.drawing')} — ${field.label}`, y);
        y = ensureSpace(doc, y, h + 4);
        drawFramedImage(doc, drawing, ML, y, CONTENT_W, h);
        y += h + 6;
    }

    // ── Dateien (nur die Namen — Inhalte hängen am Formular, nicht am PDF) ───
    const fileRows: string[][] = [];
    for (const field of visible) {
        if (field.type !== 'FILE') continue;
        const files = (Array.isArray(values[field.id]) ? values[field.id] : []) as FormFileValue[];
        for (const file of files) fileRows.push([field.label, file.name, `${Math.max(1, Math.round(file.size / 1024))} KB`]);
    }
    if (fileRows.length) {
        y = drawSectionTitle(doc, t('forms.pdf.files'), y);
        y = drawModernTable(doc, [
            { header: t('forms.pdf.colField'), w: 60 },
            { header: t('forms.pdf.colFile'), w: CONTENT_W - 60 - 24 },
            { header: t('forms.pdf.colSize'), w: 24, align: 'right' },
        ], fileRows, y);
        y += 4;
    }

    // ── Bemerkungen ──────────────────────────────────────────────────────────
    if (clean(submission.notes)) {
        y = drawSectionTitle(doc, t('forms.pdf.notes'), y);
        y = drawParagraph(doc, clean(submission.notes), y);
    }

    // ── Unterschriften ───────────────────────────────────────────────────────
    const signatures = visible
        .filter((field) => field.type === 'SIGNATURE')
        .map((field) => ({ field, signature: values[field.id] as FormSignatureValue | undefined }))
        .filter((entry): entry is { field: FormFieldDef; signature: FormSignatureValue } => Boolean(entry.signature?.dataUrl));
    if (signatures.length) {
        y = drawSectionTitle(doc, t('forms.pdf.signatures'), y);
        for (const entry of signatures) y = drawSignatureCard(doc, entry.field.label, entry.signature, y, t, locale);
    }

    // Kleiner Schlussvermerk: wann/von wem der Stand ist.
    y = ensureSpace(doc, y, 10);
    doc.setFont(FONT, 'italic');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(t('forms.pdf.generatedAt', { date: dateFmt(new Date(), locale) }), MR, y + 4, { align: 'right' });

    decoratePages(doc, assets, settings, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const safeName = (clean(submission.templateName) || 'formular').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    const customer = clean(submission.customerName).replace(/[\\/:*?"<>|]/g, '-').slice(0, 40);
    downloadPdf(bytes, `${safeName}${customer ? `-${customer}` : ''}-${dateShort(submission.createdAt).replace(/\./g, '-')}.pdf`);
    return null;
};
