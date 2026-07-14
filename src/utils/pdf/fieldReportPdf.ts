import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
// Arimo (Arial-metrik, Türkçe karakterli) gömülür — diğer PDF üreticileriyle birebir.
import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import defaultLetterheadUrl from '../../assets/docs/sablon.pdf?url';
import { usePdfSettingsStore, type PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';
import { getReportTranslator, type FixedTranslator } from '../../i18n/reportLanguage';
import { localizeTenderNumber } from '../tenderNumber';

// ─────────────────────────────────────────────────────────────────────────────
// SAHA RAPORU (Montage-Rapport) — kullanıcı görsellerine birebir uyan, PARASIZ çıktı.
// Genel rapordan tamamen ayrı, kendi içinde bağımsız bir üreticidir.
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldReportOptions {
    appointment?: { startTime?: string | null; endTime?: string | null } | null;
    preparedBy?: string;
}

// ── Sayfa geometrisi (A4, mm) — sablon.pdf antetine göre güvenli alan ─────────
const PAGE_H = 297;
const LEFT = 20;
const RIGHT = 195;
const CONTENT_W = RIGHT - LEFT;
const FIRST_CONTENT_TOP = 48;
const REST_CONTENT_TOP = 40;
const BOTTOM = PAGE_H - 24;
const CELL_PAD = 2;

// ── Renk paleti ───────────────────────────────────────────────────────────────
const COLOR_TEXT = [25, 25, 25] as const;
const COLOR_MUTED = [110, 110, 110] as const;
const COLOR_GRID = [205, 205, 205] as const;
const COLOR_NAVY = [27, 42, 85] as const;
const COLOR_WHITE = [255, 255, 255] as const;
const COLOR_ALT_ROW = [245, 245, 247] as const;

const FS_BASE = 9;
const FS_HEADER = 9;
const FS_TITLE = 16;
const FS_VALUE = 9;

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

// ── Biçimleyiciler ────────────────────────────────────────────────────────────
const clean = (value: unknown) => String(value ?? '').trim();

const dateFmt = (value?: string | Date | null, locale = 'tr-TR') => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString(locale);
};

// Üst kutu tarihleri: "26-06-15" (YY-MM-DD)
const dateShort = (value?: string | Date | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

const timeFmt = (value?: string | Date | null, locale = 'tr-TR') => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

const minutesBetween = (start?: string | null, end?: string | null) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
};

const durationFmt = (minutes: number | null | undefined, t: FixedTranslator) => {
    const total = Math.max(0, Math.round(Number(minutes || 0)));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return t('projects.field.pdf.durationHm', { h: hours, m: mins });
    if (hours) return t('projects.field.pdf.durationH', { h: hours });
    return t('projects.field.pdf.durationM', { m: mins });
};

const reportWorkDate = (report: any) => report?.workDate || report?.reportDate || report?.startedAt;

const reportNumber = (project: ProjectDto, report: any) => {
    const baseDate = reportWorkDate(report);
    const d = baseDate ? new Date(baseDate) : new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const suffix = clean(project.id).slice(-4).toUpperCase() || '0000';
    return `${d.getFullYear()}-${day}-${suffix}`;
};

const authorName = (project: ProjectDto, report: any, preparedBy?: string) => {
    if (preparedBy) return preparedBy;
    if (report?.employee) return `${report.employee.firstName || ''} ${report.employee.lastName || ''}`.trim() || 'Offitec ERP';
    if (project.manager) return `${project.manager.firstName} ${project.manager.lastName}`.trim();
    return 'Offitec ERP';
};

const addressLines = (address?: string | null) =>
    clean(address)
        .split(/\r?\n|,/)
        .map((line) => line.trim())
        .filter(Boolean);

// Müşteri adresinden şehir ("4410 Liestal" → "Liestal"); bulunamazsa yedek değer.
const cityFrom = (address?: string | null, fallback = '-') => {
    for (const line of addressLines(address)) {
        const match = line.match(/\b\d{4,6}\s+(.+)$/);
        if (match) return match[1].trim();
    }
    return fallback;
};

const countryLabel = (code: string | undefined, t: FixedTranslator) => {
    const c = clean(code).toUpperCase();
    if (c === 'CH' || c === 'CHE') return t('projects.field.pdf.countryCH');
    if (c === 'DE') return t('projects.field.pdf.countryDE');
    if (c === 'AT') return t('projects.field.pdf.countryAT');
    return code || '-';
};

// ── Çizim yardımcıları ────────────────────────────────────────────────────────
const ensurePage = (doc: jsPDF, y: number, needed = 28) => {
    if (y + needed <= BOTTOM) return y;
    doc.addPage();
    return REST_CONTENT_TOP;
};

type CellAlign = 'left' | 'center' | 'right';

const drawCellText = (
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    options: { size?: number; style?: 'normal' | 'bold' | 'italic'; color?: readonly [number, number, number]; align?: CellAlign } = {}
) => {
    const size = options.size ?? FS_VALUE;
    const style = options.style ?? 'normal';
    const align = options.align ?? 'left';
    const lineHeight = size >= 9 ? 4.4 : 3.9;
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(...(options.color ?? COLOR_TEXT));
    const pad = CELL_PAD + 1;
    const lines = doc.splitTextToSize(text || '-', width - pad * 2);
    const textHeight = (lines.length - 1) * lineHeight;
    const firstLineY = y + (height - textHeight) / 2 + size * 0.32;
    let tx = x + pad;
    let opts: { align: CellAlign } | undefined;
    if (align === 'center') { tx = x + width / 2; opts = { align: 'center' }; }
    else if (align === 'right') { tx = x + width - pad; opts = { align: 'right' }; }
    doc.text(lines, tx, firstLineY, opts);
};

const sectionBar = (doc: jsPDF, title: string, y: number, gapAfter = 0): number => {
    const barH = 9;
    y = ensurePage(doc, y, barH + gapAfter + 12);
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(LEFT, y, CONTENT_W, barH, 'F');
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.3);
    doc.rect(LEFT, y, CONTENT_W, barH);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(title, LEFT + 4, y + barH / 2 + 1.6);
    return y + barH + gapAfter;
};

interface TableColumn {
    header: string;
    width: number;
    align?: CellAlign;
    bold?: boolean;
}

const drawTable = (
    doc: jsPDF,
    columns: TableColumn[],
    rows: string[][],
    y: number,
    options: { minRowH?: number; alt?: boolean } = {}
): number => {
    const minRowH = options.minRowH ?? 9;
    const alt = options.alt ?? true;
    const pad = CELL_PAD + 1;

    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_HEADER);
    let headLines = 1;
    columns.forEach((col) => {
        headLines = Math.max(headLines, doc.splitTextToSize(col.header, col.width - pad * 2).length);
    });
    const headH = Math.max(9, headLines * 4.3 + 4);

    const drawHeader = (yy: number) => {
        doc.setFillColor(...COLOR_NAVY);
        doc.rect(LEFT, yy, CONTENT_W, headH, 'F');
        let x = LEFT;
        columns.forEach((col) => {
            drawCellText(doc, col.header, x, yy, col.width, headH, { size: FS_HEADER, style: 'bold', color: COLOR_WHITE, align: col.align });
            x += col.width;
        });
        return yy + headH;
    };

    y = ensurePage(doc, y, headH + minRowH + 2);
    y = drawHeader(y);

    rows.forEach((row, index) => {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_VALUE);
        let maxLines = 1;
        columns.forEach((col, ci) => {
            maxLines = Math.max(maxLines, doc.splitTextToSize(row[ci] ?? '', col.width - pad * 2).length);
        });
        const rowH = Math.max(minRowH, maxLines * 4.5 + 4);

        if (y + rowH > BOTTOM) {
            doc.addPage();
            y = drawHeader(REST_CONTENT_TOP);
        }

        if (alt && index % 2 === 1) {
            doc.setFillColor(...COLOR_ALT_ROW);
            doc.rect(LEFT, y, CONTENT_W, rowH, 'F');
        }

        let x = LEFT;
        columns.forEach((col, ci) => {
            drawCellText(doc, row[ci] ?? '', x, y, col.width, rowH, {
                size: FS_VALUE,
                style: col.bold ? 'bold' : 'normal',
                align: col.align,
            });
            x += col.width;
        });

        doc.setDrawColor(...COLOR_GRID);
        doc.setLineWidth(0.2);
        doc.rect(LEFT, y, CONTENT_W, rowH);
        let gx = LEFT;
        for (let i = 0; i < columns.length - 1; i += 1) {
            gx += columns[i].width;
            doc.line(gx, y, gx, y + rowH);
        }
        y += rowH;
    });

    return y;
};

// ── SAYFA 1: Üst bilgi kutusu + gönderici/alıcı + başlık ──────────────────────
const drawCoverHeader = (
    doc: jsPDF,
    project: ProjectDto,
    settings: PdfCompanySettings,
    report: any,
    preparedBy: string,
    t: FixedTranslator
): { reportNo: string; y: number } => {
    const reportNo = reportNumber(project, report);
    const implDate = dateShort(reportWorkDate(report));
    const reportDateLabel = dateShort(report?.reportDate || reportWorkDate(report));

    // Sol lacivert bilgi kutusu
    const boxX = LEFT;
    const boxW = 88;
    const boxRight = boxX + boxW;
    const boxY = FIRST_CONTENT_TOP - 2;
    const barH = 8;
    const lineH = 7.5;

    doc.setFillColor(...COLOR_NAVY);
    doc.rect(boxX, boxY, boxW, barH, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_WHITE);
    doc.text(`${t('projects.field.pdf.reportNo')} :`, boxX + CELL_PAD + 1, boxY + 5.4);
    doc.text(reportNo, boxRight - CELL_PAD - 1, boxY + 5.4, { align: 'right' });

    const infoRows: [string, string][] = [
        [`${t('projects.field.pdf.commission')}:`, project.tender?.tenderNumber ? localizeTenderNumber(project.tender.tenderNumber) : (project.tenderId || '-')],
        [`${t('projects.field.pdf.executionDate')}:`, implDate],
        [`${t('projects.field.pdf.reportDate')}:`, reportDateLabel],
        [`${t('projects.field.pdf.technician')}:`, preparedBy],
    ];

    let ry = boxY + barH;
    doc.setFontSize(FS_BASE);
    for (const [label, value] of infoRows) {
        doc.setFont(FONT, 'bold');
        doc.setTextColor(...COLOR_TEXT);
        doc.text(label, boxX + CELL_PAD + 1, ry + 5);
        doc.setFont(FONT, 'normal');
        doc.text(value, boxRight - CELL_PAD - 1, ry + 5, { align: 'right' });
        ry += lineH;
        doc.setDrawColor(...COLOR_GRID);
        doc.setLineWidth(0.1);
        if (ry < boxY + barH + infoRows.length * lineH - 0.01) {
            doc.line(boxX, ry, boxRight, ry);
        }
    }

    const boxBottom = boxY + barH + infoRows.length * lineH;
    doc.setDrawColor(...COLOR_NAVY);
    doc.setLineWidth(0.3);
    doc.rect(boxX, boxY, boxW, boxBottom - boxY);

    // Sağ kolon: gönderici (lacivert) + alıcı
    const rX = 118;
    const rW = RIGHT - rX;
    let rYy = boxY + 2;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_NAVY);
    const sender = `${settings.companyName} - ${settings.addressLine1} ${settings.addressLine2}, ${settings.postalCode} ${settings.city}`
        .replace(/\s+/g, ' ').trim();
    const senderLines = doc.splitTextToSize(sender, rW);
    doc.text(senderLines, rX, rYy + 3);
    rYy += senderLines.length * 4.6 + 5;

    doc.setFont(FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLOR_TEXT);
    const customerName = project.customer?.companyName || project.customerId || '-';
    doc.text(doc.splitTextToSize(customerName, rW), rX, rYy);
    rYy += 4.8;
    const customerAddress = addressLines(project.customer?.address);
    if (customerAddress.length > 0) {
        const addr = doc.splitTextToSize(customerAddress.slice(0, 4).join('\n'), rW);
        doc.text(addr, rX, rYy);
        rYy += addr.length * 4.8;
    }

    const yTitle = Math.max(boxBottom, rYy) + 16;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_TITLE);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(`${t('projects.field.pdf.title')} ${reportNo}`, LEFT, yTitle);

    return { reportNo, y: yTitle + 8 };
};

// ── SAYFA 1 tablosu: 4 sütunlu, etiket/değer satırları (görsele birebir) ──────
const drawScheduleGrid = (
    doc: jsPDF,
    groups: Array<{ labels: string[]; values: string[] }>,
    y: number
): number => {
    const cols = 4;
    const colW = CONTENT_W / cols;
    const rowH = 11;

    const drawRowGrid = (yy: number) => {
        doc.setDrawColor(...COLOR_GRID);
        doc.setLineWidth(0.2);
        doc.rect(LEFT, yy, CONTENT_W, rowH);
        for (let i = 1; i < cols; i += 1) {
            doc.line(LEFT + i * colW, yy, LEFT + i * colW, yy + rowH);
        }
    };

    groups.forEach((group, gi) => {
        y = ensurePage(doc, y, rowH * 2 + 2);
        // Etiket satırı — ilk grup lacivert, diğerleri açık gri.
        const labelNavy = gi === 0;
        const labelFill = labelNavy ? COLOR_NAVY : COLOR_ALT_ROW;
        doc.setFillColor(labelFill[0], labelFill[1], labelFill[2]);
        doc.rect(LEFT, y, CONTENT_W, rowH, 'F');
        group.labels.forEach((label, ci) => {
            drawCellText(doc, label, LEFT + ci * colW, y, colW, rowH, {
                size: FS_HEADER, style: 'bold', color: labelNavy ? COLOR_WHITE : COLOR_TEXT,
            });
        });
        drawRowGrid(y);
        y += rowH;

        // Değer satırı — beyaz zemin.
        group.values.forEach((value, ci) => {
            drawCellText(doc, value, LEFT + ci * colW, y, colW, rowH, { size: FS_VALUE, color: COLOR_TEXT });
        });
        drawRowGrid(y);
        y += rowH;
    });

    return y;
};

// ── Yapılan Tüm İşler ─────────────────────────────────────────────────────────
const splitJobItem = (raw: any): { title: string; body: string } => {
    if (raw && typeof raw === 'object') {
        const title = clean(raw.title ?? raw.name ?? raw.label ?? raw.jobTitle);
        const body = clean(raw.description ?? raw.body ?? raw.detail ?? raw.note ?? raw.title);
        return { title: title || body, body: body || title };
    }
    const text = clean(raw).replace(/^[-•\s]+/, '');
    const colon = text.indexOf(':');
    if (colon > 0 && colon <= 40) {
        return { title: text.slice(0, colon).trim(), body: text.slice(colon + 1).trim() || text };
    }
    const firstSegment = text.split(/[.,;\n]/)[0]?.trim() || text;
    const title = firstSegment.length > 0 && firstSegment.length <= 60 ? firstSegment : text.slice(0, 60);
    return { title, body: text };
};

const jobsFromReport = (report: any): Array<{ title: string; body: string; note?: string }> => {
    const rawItems: any[] = Array.isArray(report.operationsDoneItems) && report.operationsDoneItems.length > 0
        ? report.operationsDoneItems
        : clean(report.operationsDone).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const note = clean(report.technicalNotes);
    if (rawItems.length === 0) {
        return note ? [{ title: '-', body: '-', note }] : [];
    }
    return rawItems.map((item, idx) => ({
        ...splitJobItem(item),
        note: idx === rawItems.length - 1 ? note || undefined : undefined,
    }));
};

const drawJobItem = (
    doc: jsPDF,
    index: number,
    job: { title: string; body: string; note?: string },
    y: number,
    t: FixedTranslator
): number => {
    const numberW = 11;
    const boxX = LEFT + numberW;
    const boxW = CONTENT_W - numberW;
    const labelW = 30;
    const rowH = 9;

    const bodyLines = doc.splitTextToSize(job.body, boxW - labelW - 8);
    const noteLines = job.note ? doc.splitTextToSize(`${t('projects.field.pdf.technicalNote')}: ${job.note}`, boxW - labelW - 8) : [];
    const bodyH = Math.max(rowH, bodyLines.length * 4.4 + 4 + (noteLines.length ? noteLines.length * 4 + 2 : 0));
    const itemH = rowH + bodyH;

    y = ensurePage(doc, y, itemH + 6);

    doc.setFillColor(...COLOR_NAVY);
    doc.rect(LEFT, y, numberW, itemH, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE + 1);
    doc.setTextColor(...COLOR_WHITE);
    doc.text(String(index + 1), LEFT + numberW / 2, y + itemH / 2 + 1.4, { align: 'center' });

    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.2);
    doc.rect(boxX, y, boxW, itemH);

    doc.setFillColor(...COLOR_ALT_ROW);
    doc.rect(boxX, y, labelW, rowH, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(t('projects.field.pdf.jobDefinition'), boxX + 3, y + rowH / 2 + 1.4);
    doc.setDrawColor(...COLOR_GRID);
    doc.line(boxX + labelW, y, boxX + labelW, y + rowH);
    doc.setFont(FONT, 'normal');
    doc.text(doc.splitTextToSize(job.title, boxW - labelW - 8)[0], boxX + labelW + 4, y + rowH / 2 + 1.4);
    doc.line(boxX, y + rowH, boxX + boxW, y + rowH);

    doc.setFillColor(...COLOR_ALT_ROW);
    doc.rect(boxX, y + rowH, labelW, bodyH, 'F');
    doc.setFont(FONT, 'bold');
    doc.text(t('projects.field.pdf.description'), boxX + 3, y + rowH + 5.4);
    doc.line(boxX + labelW, y + rowH, boxX + labelW, y + itemH);
    doc.setFont(FONT, 'normal');
    doc.text(bodyLines, boxX + labelW + 4, y + rowH + 5);
    if (noteLines.length > 0) {
        doc.setFontSize(8.2);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(noteLines, boxX + labelW + 4, y + rowH + 5 + bodyLines.length * 4.4 + 2);
        doc.setTextColor(...COLOR_TEXT);
        doc.setFontSize(FS_BASE);
    }

    return y + itemH;
};

const drawJobs = (doc: jsPDF, report: any, y: number, t: FixedTranslator): number => {
    y = sectionBar(doc, t('projects.field.pdf.jobsTitle'), y);
    const jobs = jobsFromReport(report);
    if (jobs.length === 0) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_TEXT);
        doc.text('-', LEFT + 2, y + 4);
        return y + 12;
    }
    jobs.forEach((job, index) => { y = drawJobItem(doc, index, job, y, t); });
    return y + 4;
};

// ── Ek Çalışma (sadece süreler — PARASIZ) ─────────────────────────────────────
const drawOvertime = (
    doc: jsPDF,
    plannedMin: number,
    maxMin: number,
    workedMin: number,
    overtimeMin: number,
    y: number,
    t: FixedTranslator
): number => {
    y = sectionBar(doc, t('projects.field.pdf.overtimeTitle'), y);
    const columns: TableColumn[] = [
        { header: t('projects.field.pdf.plannedHours'), width: CONTENT_W / 4 },
        { header: t('projects.field.pdf.maxHours'), width: CONTENT_W / 4 },
        { header: t('projects.field.pdf.totalWorkedHours'), width: CONTENT_W / 4 },
        { header: t('projects.field.pdf.overtimeDuration'), width: CONTENT_W / 4 },
    ];
    const rows = [[durationFmt(plannedMin, t), durationFmt(maxMin, t), durationFmt(workedMin, t), durationFmt(overtimeMin, t)]];
    return drawTable(doc, columns, rows, y, { minRowH: 12, alt: false });
};

const materialId = (item: any) => item.material?.serialId || item.serialId || item.materialId || '-';
const materialName = (item: any, t: FixedTranslator) => item.material?.name || item.name || t('projects.field.pdf.materialFallback');

// ── Malzeme tablosu (Id + Adı — PARASIZ) ──────────────────────────────────────
const drawMaterialTable = (doc: jsPDF, title: string, items: any[], y: number, t: FixedTranslator): number => {
    y = sectionBar(doc, title, y);
    const columns: TableColumn[] = [
        { header: t('projects.field.pdf.materialId'), width: 45 },
        { header: t('projects.field.pdf.materialName'), width: CONTENT_W - 45 },
    ];
    const rows = items.length > 0
        ? items.map((item) => [String(materialId(item)), String(materialName(item, t))])
        : [['-', '-']];
    return drawTable(doc, columns, rows, y, { minRowH: 9 });
};

// ── Harici Giderler (yalnızca tip + açıklama — PARASIZ) ────────────────────────
const drawExpenses = (doc: jsPDF, expenses: any[], y: number, t: FixedTranslator): number => {
    if (expenses.length === 0) return y;
    y = sectionBar(doc, t('projects.field.pdf.expensesTitle'), y);
    const columns: TableColumn[] = [
        { header: t('projects.field.pdf.expenseType'), width: 55 },
        { header: t('projects.field.pdf.expenseDescription'), width: CONTENT_W - 55 },
    ];
    const rows = expenses.map((expense) => [String(expense.expenseType || '-'), String(expense.description || '-')]);
    return drawTable(doc, columns, rows, y, { minRowH: 11 });
};

const detectImageFormat = (dataUrl: string): 'PNG' | 'JPEG' => {
    if (/^data:image\/(jpeg|jpg)/i.test(dataUrl)) return 'JPEG';
    return 'PNG';
};

const drawImages = (doc: jsPDF, report: any, y: number, t: FixedTranslator): number => {
    const images: string[] = [];
    if (Array.isArray(report.images)) {
        report.images.forEach((img: any) => {
            const data = img?.imageData || img?.url || img?.imageUrl;
            if (data) images.push(String(data));
        });
    }

    y = sectionBar(doc, t('projects.field.pdf.imagesTitle'), y);

    if (images.length === 0) {
        doc.setFont(FONT, 'italic');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(t('projects.field.pdf.noImages'), LEFT + 2, y + 4);
        return y + 12;
    }

    const cols = 3;
    const gap = 4;
    const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.72;

    images.forEach((src, index) => {
        const col = index % cols;
        if (col === 0) y = ensurePage(doc, y, cellH + gap);
        const x = LEFT + col * (cellW + gap);
        doc.setDrawColor(...COLOR_GRID);
        doc.setLineWidth(0.2);
        doc.rect(x, y, cellW, cellH);
        try {
            doc.addImage(src, detectImageFormat(src), x, y, cellW, cellH);
        } catch { /* geçersiz görsel atlanır */ }
        if (col === cols - 1 || index === images.length - 1) y += cellH + gap;
    });

    return y + 4;
};

// ── Onay ve İmza ──────────────────────────────────────────────────────────────
const drawApproval = (doc: jsPDF, project: ProjectDto, report: any, preparedBy: string, y: number, t: FixedTranslator, locale: string): number => {
    y = ensurePage(doc, y, 90);
    y = sectionBar(doc, t('projects.field.pdf.approvalTitle'), y);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    const text = t('projects.field.pdf.approvalConfirm');
    const lines = doc.splitTextToSize(text, CONTENT_W - 10);
    const textBoxH = lines.length * 4.6 + 7;
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(LEFT, y, CONTENT_W, textBoxH, 'F');
    doc.setTextColor(...COLOR_WHITE);
    doc.text(lines, LEFT + 5, y + 5.5);
    y += textBoxH;

    const boxH = 50;
    const colW = CONTENT_W / 2;
    const topH = 26;
    const signDate = dateFmt(reportWorkDate(report), locale);

    const columns: [string, string][] = [
        [t('projects.field.pdf.technicianRole'), preparedBy],
        [t('projects.field.pdf.customerRole'), project.customer?.companyName || '-'],
    ];

    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.3);
    doc.rect(LEFT, y, CONTENT_W, boxH);
    doc.setLineWidth(0.2);
    doc.line(LEFT, y + topH, LEFT + CONTENT_W, y + topH);
    doc.line(LEFT + colW, y, LEFT + colW, y + boxH);

    columns.forEach(([role, name], index) => {
        const x = LEFT + index * colW;
        const cx = x + colW / 2;
        doc.setTextColor(...COLOR_TEXT);
        doc.setFont(FONT, 'bold');
        doc.setFontSize(FS_BASE);
        doc.text(role, cx, y + 7, { align: 'center' });
        doc.setFont(FONT, 'normal');
        doc.text(doc.splitTextToSize(name, colW - 8)[0], cx, y + 13, { align: 'center' });
        doc.setTextColor(...COLOR_MUTED);
        doc.text(`${t('projects.field.pdf.date')} : ${signDate}`, cx, y + 19, { align: 'center' });
        doc.setTextColor(...COLOR_TEXT);
        doc.setFont(FONT, 'normal');
        doc.text(`${t('projects.field.pdf.signature')}:`, x + 5, y + topH + 7);
    });

    // Customer signature image into the "Müşteri Yetkilisi" cell, if captured.
    if (report?.customerSignature) {
        try {
            const sig = String(report.customerSignature);
            const fmt = sig.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(sig, fmt, LEFT + colW + 16, y + topH + 2, colW - 22, boxH - topH - 6, undefined, 'FAST');
        } catch {
            /* ignore bad signature data */
        }
    }

    return y + boxH + 8;
};

// ── Arka plan (sablon.pdf) birleştirme ────────────────────────────────────────
async function resolveBackgroundBytes(settings: PdfCompanySettings): Promise<Uint8Array | null> {
    if (settings.letterheadBackgroundPdf) {
        return base64ToBytes(settings.letterheadBackgroundPdf);
    }
    if (settings.useBundledLetterhead !== false) {
        try {
            const res = await fetch(defaultLetterheadUrl);
            const buf = await res.arrayBuffer();
            return new Uint8Array(buf);
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

function base64ToBytes(base64: string): Uint8Array {
    const cleaned = base64.startsWith('data:') ? base64.split(',')[1] : base64;
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
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

// ── Saha raporu üretimi ───────────────────────────────────────────────────────
export const exportFieldReportPdf = async (project: ProjectDto, report: any, options: FieldReportOptions = {}) => {
    const settings = usePdfSettingsStore.getState().settings;
    const currency = settings.currency || 'CHF';
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const preparedBy = authorName(project, report, options.preparedBy);

    // Bu rapora (randevuya) bağlı ek malzemeler ve harici giderler.
    const appointmentId = report?.appointmentId || null;
    const extraMaterials = (project.extraMaterials || []).filter((m: any) =>
        appointmentId ? m.appointmentId === appointmentId : false);
    const expenses = (project.expenses || []).filter((e: any) =>
        appointmentId ? e.appointmentId === appointmentId : false);
    const usedMaterials = Array.isArray(report?.usedMaterials) ? report.usedMaterials : [];

    // Süre hesapları (randevu = planlanan; rapor = gerçekleşen).
    const apptStart = options.appointment?.startTime || report?.startedAt;
    const apptEnd = options.appointment?.endTime || report?.endedAt;
    const plannedMin = minutesBetween(apptStart, apptEnd) || Number(report?.plannedMinutesForDay || 0);
    const workedMin = minutesBetween(report?.startedAt, report?.endedAt) || Number(report?.workedMinutes || 0);
    const tolerance = Number((project as any).overtimeTolerancePercent ?? 15);
    const maxMin = Math.ceil(plannedMin * (1 + tolerance / 100));
    // Görsele göre "Ek Çalışma Süresi" = çalışılan − planlanan.
    const overtimeMin = Math.max(0, workedMin - plannedMin);

    await registerFonts(doc);

    // Rapor, müşterinin tercih ettiği yazışma dilinde üretilir.
    const { t, locale } = await getReportTranslator(project.customer?.language);

    // SAYFA 1: üst bilgi + randevu/saat tablosu
    const cover = drawCoverHeader(doc, project, settings, report, preparedBy, t);
    let y = cover.y;
    y = drawScheduleGrid(doc, [
        {
            labels: [t('projects.field.pdf.appointmentDate'), t('projects.field.pdf.plannedStart'), t('projects.field.pdf.plannedEnd'), t('projects.field.pdf.plannedHours')],
            values: [dateFmt(apptStart || reportWorkDate(report), locale), timeFmt(apptStart, locale), timeFmt(apptEnd, locale), durationFmt(plannedMin, t)],
        },
        {
            labels: [t('projects.field.pdf.maxApprovedHours'), t('projects.field.pdf.start'), t('projects.field.pdf.end'), t('projects.field.pdf.totalWorkedHours')],
            values: [durationFmt(maxMin, t), timeFmt(report?.startedAt, locale), timeFmt(report?.endedAt, locale), durationFmt(workedMin, t)],
        },
        {
            labels: [t('projects.field.pdf.serviceType'), t('projects.field.pdf.preparedBy'), t('projects.field.pdf.currency'), t('projects.field.pdf.countryCity')],
            values: [t('projects.field.pdf.serviceTypeAssembly'), preparedBy, currency, `${countryLabel(settings.country, t)} / ${cityFrom(project.customer?.address, settings.city)}`],
        },
    ], y);

    // SAYFA 2: yapılan işler + ek çalışma + kullanılan malzemeler
    doc.addPage();
    y = REST_CONTENT_TOP;
    y = drawJobs(doc, report, y, t);
    y = drawOvertime(doc, plannedMin, maxMin, workedMin, overtimeMin, y, t);
    y += 4;
    y = drawMaterialTable(doc, t('projects.field.pdf.usedMaterials'), usedMaterials, y, t);

    // SAYFA 3: ek malzemeler + harici giderler + görseller + onay
    doc.addPage();
    y = REST_CONTENT_TOP;
    y = drawMaterialTable(doc, t('projects.field.pdf.extraMaterials'), extraMaterials, y, t);
    y += 4;
    y = drawExpenses(doc, expenses, y, t);
    y += 4;
    y = drawImages(doc, report, y, t);
    drawApproval(doc, project, report, preparedBy, y, t, locale);

    const contentBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(doc.output('arraybuffer'));
    let finalBytes: Uint8Array<ArrayBufferLike> = contentBytes;
    try {
        const bgBytes = await resolveBackgroundBytes(settings);
        if (bgBytes) finalBytes = await applyPdfBackground(contentBytes, bgBytes);
    } catch (err) {
        console.error('PDF background merge failed:', err);
    }

    const safeName = clean(project.projectName).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'proje';
    const dateLabel = dateShort(reportWorkDate(report)).replace(/[^0-9-]/g, '');
    downloadPdf(finalBytes, `${safeName}-saha-raporu-${dateLabel}.pdf`);
};
