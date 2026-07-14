import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import defaultLetterheadUrl from '../../assets/docs/sablon.pdf?url';
import { usePdfSettingsStore, type PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';
import type { DeliveryReportDto, DeliveryResponseItem } from '../../lib/api/project';
import { getReportTranslator, type FixedTranslator } from '@/i18n/reportLanguage';

// ─────────────────────────────────────────────────────────────────────────────
// TESLİM RAPORU (Schlussrapport) — kullanıcı şablonuna (teslim_rapor) uyan,
// kendi içinde bağımsız PDF üreticisi. Saha/genel rapordan tamamen ayrıdır.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_H = 297;
const LEFT = 20;
const RIGHT = 195;
const CONTENT_W = RIGHT - LEFT;
const FIRST_CONTENT_TOP = 48;
const REST_CONTENT_TOP = 40;
const BOTTOM = PAGE_H - 24;

const COLOR_TEXT = [25, 25, 25] as const;
const COLOR_MUTED = [110, 110, 110] as const;
const COLOR_GRID = [205, 205, 205] as const;
const COLOR_NAVY = [27, 42, 85] as const;
const COLOR_WHITE = [255, 255, 255] as const;

const FONT = 'Arial';
let fontFiles: { regular: string; bold: string; italic: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
};

const registerFonts = async (doc: jsPDF) => {
    if (!fontFiles) {
        const [regular, bold, italic] = await Promise.all([
            fetch(arialRegularUrl).then((res) => res.arrayBuffer()),
            fetch(arialBoldUrl).then((res) => res.arrayBuffer()),
            fetch(arialItalicUrl).then((res) => res.arrayBuffer()),
        ]);
        fontFiles = {
            regular: bufferToBase64(regular),
            bold: bufferToBase64(bold),
            italic: bufferToBase64(italic),
        };
    }
    doc.addFileToVFS('Arial-Regular.ttf', fontFiles.regular);
    doc.addFileToVFS('Arial-Bold.ttf', fontFiles.bold);
    doc.addFileToVFS('Arial-Italic.ttf', fontFiles.italic);
    doc.addFont('Arial-Regular.ttf', FONT, 'normal');
    doc.addFont('Arial-Bold.ttf', FONT, 'bold');
    doc.addFont('Arial-Italic.ttf', FONT, 'italic');
    doc.setFont(FONT, 'normal');
};

const clean = (value: unknown) => String(value ?? '').trim();

const dateShort = (value?: string | Date | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

function base64ToBytes(base64: string): Uint8Array {
    const cleaned = base64.startsWith('data:') ? base64.split(',')[1] : base64;
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function resolveBackgroundBytes(settings: PdfCompanySettings): Promise<Uint8Array | null> {
    if (settings.letterheadBackgroundPdf) return base64ToBytes(settings.letterheadBackgroundPdf);
    if (settings.useBundledLetterhead !== false) {
        try {
            const res = await fetch(defaultLetterheadUrl);
            return new Uint8Array(await res.arrayBuffer());
        } catch (e) {
            console.warn('Bundled letterhead not available:', e);
        }
    }
    return null;
}

async function applyPdfBackground(contentBytes: Uint8Array, bgBytes: Uint8Array): Promise<Uint8Array<ArrayBufferLike>> {
    const contentPdf = await PDFDocument.load(contentBytes);
    const bgPdf = await PDFDocument.load(bgBytes);
    const newDoc = await PDFDocument.create();
    const bgPages = await newDoc.embedPdf(bgPdf, bgPdf.getPageIndices());
    const contentPages = await newDoc.embedPdf(contentPdf, contentPdf.getPageIndices());
    const contentPageCount = contentPdf.getPageCount();
    const A4_W = 595.28;
    const A4_H = 841.89;
    for (let i = 0; i < contentPageCount; i += 1) {
        const page = newDoc.addPage([A4_W, A4_H]);
        const bgIdx = bgPages.length === 1 ? 0 : i === 0 ? 0 : Math.min(1, bgPages.length - 1);
        page.drawPage(bgPages[bgIdx], { x: 0, y: 0, width: A4_W, height: A4_H });
        page.drawPage(contentPages[i], { x: 0, y: 0, width: A4_W, height: A4_H });
    }
    return await newDoc.save();
}

function downloadPdf(bytes: Uint8Array<ArrayBufferLike>, filename: string) {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Çizim yardımcıları ──────────────────────────────────────────────────────
const ensureSpace = (doc: jsPDF, y: number, needed: number) => {
    if (y + needed <= BOTTOM) return y;
    doc.addPage();
    return REST_CONTENT_TOP;
};

const drawCoverHeader = (
    doc: jsPDF,
    report: DeliveryReportDto,
    settings: PdfCompanySettings,
    project: ProjectDto | null | undefined,
    preparedBy: string,
    t: FixedTranslator,
) => {
    const boxW = 95;
    const boxX = LEFT;
    let y = REST_CONTENT_TOP - 6;

    // Navy header bar: "Teslim Rapor No : <no>"
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(boxX, y, boxW, 9, 'F');
    doc.setTextColor(...COLOR_WHITE);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    doc.text(t('projects.delivery.pdf.reportNo'), boxX + 3, y + 6);
    doc.text(clean(report.id).toUpperCase(), boxX + boxW - 3, y + 6, { align: 'right' });
    y += 9;

    // Info rows
    const rows: Array<[string, string]> = [
        [t('projects.delivery.pdf.commission'), clean(project?.projectName) || '-'],
        [t('projects.delivery.pdf.executionDate'), dateShort(report.sentAt || report.createdAt)],
        [t('projects.delivery.pdf.reportDate'), dateShort(report.createdAt)],
        [t('projects.delivery.pdf.technician'), preparedBy || '-'],
    ];
    const rowH = 7;
    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(0.3);
    rows.forEach(([label, value], i) => {
        const ry = y + i * rowH;
        doc.rect(boxX, ry, boxW, rowH);
        doc.setTextColor(...COLOR_TEXT);
        doc.setFont(FONT, 'bold');
        doc.setFontSize(8.5);
        doc.text(label, boxX + 3, ry + 4.8);
        doc.setFont(FONT, 'normal');
        doc.text(doc.splitTextToSize(value, boxW - 38)[0] || '-', boxX + boxW - 3, ry + 4.8, { align: 'right' });
    });

    // Sender (bold) + recipient block (right) — matches the template header.
    const rx = boxX + boxW + 10;
    doc.setTextColor(...COLOR_TEXT);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9);
    const senderLine = [
        clean(settings.companyName),
        [clean(settings.addressLine1), [clean(settings.postalCode), clean(settings.city)].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    ].filter(Boolean).join(' - ');
    doc.text(doc.splitTextToSize(senderLine || '-', RIGHT - rx), rx, y + 4);
    // Recipient (customer)
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9.5);
    doc.text(clean(project?.customer?.companyName) || '-', rx, y + 16);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    const addrLines = [
        clean((project?.customer as any)?.address),
        clean((project?.customer as any)?.city),
    ].filter(Boolean);
    addrLines.forEach((line, i) => doc.text(line, rx, y + 22 + i * 5));

    y += rows.length * rowH + 12;

    // Big title
    doc.setFont(FONT, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(`${t('projects.delivery.pdf.title')}`, LEFT, y);
    if (report.checklistName) {
        y += 6;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(clean(report.checklistName), LEFT, y);
    }
    return y + 8;
};

// Column widths (mm) — total = CONTENT_W (175). Matches the template layout:
// Kategori | Kontrol Adımı | Evet | Hayır | Uygulanamaz | Ölçüm Değerleri / Açıklama
const COLS = { kat: 28, step: 49, yes: 13, no: 13, na: 22, meas: 50 };

const drawTableHeader = (doc: jsPDF, y: number, t: FixedTranslator) => {
    const h = 9;
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(LEFT, y, CONTENT_W, h, 'F');
    doc.setTextColor(...COLOR_WHITE);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(7.5);
    let x = LEFT;
    const cell = (w: number, label: string, align: 'left' | 'center' = 'left') => {
        doc.text(doc.splitTextToSize(label, w - 2)[0] || label, align === 'center' ? x + w / 2 : x + 2, y + 5.8, { align });
        x += w;
    };
    cell(COLS.kat, t('projects.delivery.pdf.colCategory'));
    cell(COLS.step, t('projects.delivery.pdf.colStep'));
    cell(COLS.yes, t('projects.delivery.yes'), 'center');
    cell(COLS.no, t('projects.delivery.no'), 'center');
    cell(COLS.na, t('projects.delivery.na'), 'center');
    cell(COLS.meas, t('projects.delivery.pdf.colMeasurement'));
    return y + h;
};

const rowHeight = (doc: jsPDF, item: DeliveryResponseItem) => {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.5);
    const stepLines = doc.splitTextToSize(item.label, COLS.step - 4) as string[];
    const measLines = doc.splitTextToSize(item.measurement || '', COLS.meas - 4) as string[];
    return Math.max(8, Math.max(stepLines.length, measLines.length, 1) * 4.4 + 3);
};

// One control-step row (the Kategori cell is drawn separately, spanning rows).
const drawItemRow = (doc: jsPDF, item: DeliveryResponseItem, y: number) => {
    const h = rowHeight(doc, item);
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.2);
    let x = LEFT + COLS.kat;
    [COLS.step, COLS.yes, COLS.no, COLS.na, COLS.meas].forEach((w) => { doc.rect(x, y, w, h); x += w; });

    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(doc.splitTextToSize(item.label, COLS.step - 4), LEFT + COLS.kat + 2, y + 4.6);

    const base = LEFT + COLS.kat + COLS.step;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    const mark = (cs: number, cw: number, on: boolean) => { if (on) doc.text('X', cs + cw / 2, y + h / 2 + 1.5, { align: 'center' }); };
    mark(base, COLS.yes, item.status === 'YES');
    mark(base + COLS.yes, COLS.no, item.status === 'NO');
    mark(base + COLS.yes + COLS.no, COLS.na, item.status === 'NA');

    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(doc.splitTextToSize(item.measurement || '', COLS.meas - 4), base + COLS.yes + COLS.no + COLS.na + 2, y + 4.6);
    return y + h;
};

// The left Kategori cell, vertically centred across its rows.
const drawKatCell = (doc: jsPDF, name: string, y: number, h: number) => {
    doc.setFillColor(245, 246, 249);
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.2);
    doc.rect(LEFT, y, COLS.kat, h, 'FD');
    doc.setTextColor(...COLOR_NAVY);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(name, COLS.kat - 4) as string[];
    doc.text(lines, LEFT + COLS.kat / 2, y + h / 2 - (lines.length - 1) * 2.1 + 1, { align: 'center' });
};

const drawResponses = (doc: jsPDF, responses: DeliveryResponseItem[], startY: number, t: FixedTranslator) => {
    const categories: string[] = [];
    for (const r of responses) {
        const key = r.category?.trim() || t('projects.delivery.uncategorized');
        if (!categories.includes(key)) categories.push(key);
    }
    let y = ensureSpace(doc, startY, 18);
    y = drawTableHeader(doc, y, t);

    for (const category of categories) {
        const items = responses.filter((r) => (r.category?.trim() || t('projects.delivery.uncategorized')) === category);
        let i = 0;
        while (i < items.length) {
            // Fit as many rows as possible on the current page, then draw the
            // spanning Kategori cell for that chunk.
            const chunkStart = y;
            const chunk: DeliveryResponseItem[] = [];
            let used = 0;
            while (i < items.length) {
                const h = rowHeight(doc, items[i]);
                if (chunkStart + used + h > BOTTOM) break;
                chunk.push(items[i]); used += h; i += 1;
            }
            if (chunk.length === 0) {
                doc.addPage();
                y = drawTableHeader(doc, REST_CONTENT_TOP, t);
                continue;
            }
            drawKatCell(doc, category, chunkStart, used);
            let ry = chunkStart;
            for (const it of chunk) ry = drawItemRow(doc, it, ry);
            y = ry;
            if (i < items.length) {
                doc.addPage();
                y = drawTableHeader(doc, REST_CONTENT_TOP, t);
            }
        }
    }
    return y;
};

const drawImages = (doc: jsPDF, images: Array<{ imageData: string }>, y: number, t: FixedTranslator) => {
    if (!images.length) return y;
    y = ensureSpace(doc, y, 16);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(t('projects.delivery.pdf.visuals'), LEFT, y + 4);
    y += 8;

    const cols = 3;
    const gap = 4;
    const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.7;
    let col = 0;
    for (const img of images) {
        y = ensureSpace(doc, y, cellH + gap);
        const x = LEFT + col * (cellW + gap);
        try {
            const fmt = img.imageData.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(img.imageData, fmt, x, y, cellW, cellH, undefined, 'FAST');
        } catch {
            doc.setDrawColor(...COLOR_GRID);
            doc.rect(x, y, cellW, cellH);
        }
        col += 1;
        if (col === cols) {
            col = 0;
            y += cellH + gap;
        }
    }
    if (col !== 0) y += cellH + gap;
    return y;
};

const drawApproval = (doc: jsPDF, report: DeliveryReportDto, preparedBy: string, project: ProjectDto | null | undefined, y: number, t: FixedTranslator) => {
    y = ensureSpace(doc, y, 58);
    y += 4;

    // Section title "Onay ve İmza"
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_NAVY);
    doc.text(t('projects.delivery.pdf.approvalTitle'), LEFT, y + 4);
    y += 8;

    // Navy confirmation banner
    const bannerLines = doc.splitTextToSize(t('projects.delivery.pdf.approvalConfirm'), CONTENT_W - 8) as string[];
    const bannerH = bannerLines.length * 4.4 + 4;
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(LEFT, y, CONTENT_W, bannerH, 'F');
    doc.setTextColor(...COLOR_WHITE);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.5);
    doc.text(bannerLines, LEFT + 4, y + 5);
    y += bannerH + 4;

    const colW = CONTENT_W / 2;
    const boxH = 34;
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.3);
    doc.rect(LEFT, y, CONTENT_W, boxH);
    doc.line(LEFT + colW, y, LEFT + colW, y + boxH);

    const signDate = dateShort(report.signedAt || report.sentAt || report.createdAt);
    const labels: Array<[string, string]> = [
        [t('projects.delivery.pdf.technicianRole'), preparedBy || '-'],
        [t('projects.delivery.pdf.customerRole'), clean(project?.customer?.companyName) || '-'],
    ];
    labels.forEach(([role, name], index) => {
        const x = LEFT + index * colW;
        const cx = x + colW / 2;
        doc.setTextColor(...COLOR_TEXT);
        doc.setFont(FONT, 'bold');
        doc.setFontSize(9);
        doc.text(role, cx, y + 6, { align: 'center' });
        doc.setFont(FONT, 'normal');
        doc.text(doc.splitTextToSize(name, colW - 8)[0] || '-', cx, y + 11, { align: 'center' });
        doc.setTextColor(...COLOR_MUTED);
        doc.setFontSize(8);
        doc.text(`${t('projects.delivery.pdf.date')} : ${signDate}`, cx, y + 16, { align: 'center' });
    });

    // Customer signature image into the right cell, if present
    if (report.customerSignature) {
        try {
            const fmt = report.customerSignature.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(report.customerSignature, fmt, LEFT + colW + 6, y + 18, colW - 12, 14, undefined, 'FAST');
        } catch {
            /* ignore bad signature data */
        }
    }
    doc.setTextColor(...COLOR_TEXT);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(8);
    doc.text(`${t('projects.delivery.pdf.signature')}:`, LEFT + 5, y + boxH - 4);
    doc.text(`${t('projects.delivery.pdf.signature')}:`, LEFT + colW + 5, y + boxH - 4);
    return y + boxH + 6;
};

export interface DeliveryReportPdfParams {
    report: DeliveryReportDto;
    project?: ProjectDto | null;
    fieldImages?: Array<{ imageData: string }>;
    preparedBy?: string;
}

export const exportDeliveryReportPdf = async ({ report, project, fieldImages = [], preparedBy = '' }: DeliveryReportPdfParams) => {
    const settings = usePdfSettingsStore.getState().settings;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);

    // Render the whole report in the customer's correspondence language.
    const { t } = await getReportTranslator(project?.customer?.language);

    let y = drawCoverHeader(doc, report, settings, project, preparedBy, t);
    void FIRST_CONTENT_TOP;
    y = drawResponses(doc, Array.isArray(report.responses) ? report.responses : [], y, t);

    if (report.notes) {
        y = ensureSpace(doc, y, 16);
        y += 4;
        doc.setFont(FONT, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...COLOR_NAVY);
        doc.text(t('projects.delivery.notes'), LEFT, y);
        y += 5;
        doc.setFont(FONT, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...COLOR_TEXT);
        const lines = doc.splitTextToSize(report.notes, CONTENT_W) as string[];
        doc.text(lines, LEFT, y);
        y += lines.length * 4.6;
    }

    y = drawImages(doc, fieldImages, y + 4, t);
    drawApproval(doc, report, preparedBy, project, y, t);

    const contentBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(doc.output('arraybuffer'));
    let finalBytes: Uint8Array<ArrayBufferLike> = contentBytes;
    try {
        const bgBytes = await resolveBackgroundBytes(settings);
        if (bgBytes) finalBytes = await applyPdfBackground(contentBytes, bgBytes);
    } catch (err) {
        console.error('PDF background merge failed:', err);
    }

    const safeName = (clean(project?.projectName) || 'teslim').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
    const dateLabel = dateShort(report.createdAt).replace(/[^0-9-]/g, '');
    downloadPdf(finalBytes, `${safeName}-teslim-raporu-${dateLabel}.pdf`);
};
