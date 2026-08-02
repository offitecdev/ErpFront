import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
// Arial yerine metrik olarak özdeş, Türkçe karakter destekli Arimo gömülür (tenderPdf ile birebir).
import arialBoldUrl from '../../assets/fonts/ARIALBD.ttf?url';
import arialRegularUrl from '../../assets/fonts/ARIAL.ttf?url';
import arialItalicUrl from '../../assets/fonts/ARIALI.ttf?url';
import defaultLetterheadUrl from '../../assets/docs/sablon.pdf?url';
import { usePdfSettingsStore, type PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';
import { localizeTenderNumber } from '../tenderNumber';
import { companySenderLine } from './addressBlock';

type ReportKind = 'daily' | 'general';

export interface ProjectGeneralReportOptions {
    // Optional bounds. The general report is a signed aggregate of ALL field
    // reports up to now, so these are normally omitted.
    startDate?: string;
    endDate?: string;
    preparedBy?: string;
    /** 'blob' returns the PDF for in-app preview instead of downloading it. */
    output?: 'download' | 'blob';
}

// ── Sayfa geometrisi (A4, mm) — sablon.pdf antetine göre güvenli alan ─────────
const PAGE_H = 297;
const LEFT = 20;            // Sol içerik kenarı (tenderPdf T_X0)
const RIGHT = 195;          // Sağ içerik kenarı (tenderPdf T_X1)
const CONTENT_W = RIGHT - LEFT;
const FIRST_CONTENT_TOP = 48;   // İlk sayfada antet altı (tenderPdf ile aynı)
const REST_CONTENT_TOP = 40;    // Sonraki sayfalarda antet altı
const BOTTOM = PAGE_H - 24;     // Alt antet (Cares Tower / IBAN) üstü
const CELL_PAD = 2;

// ── Renk paleti (tenderPdf: Offitec lacivert + ince gri ızgara) ───────────────
const COLOR_TEXT = [25, 25, 25] as const;
const COLOR_MUTED = [110, 110, 110] as const;
const COLOR_GRID = [205, 205, 205] as const;
const COLOR_NAVY = [27, 42, 85] as const;
const COLOR_WHITE = [255, 255, 255] as const;
const COLOR_ALT_ROW = [245, 245, 247] as const;

// ── Yazı tipi boyutları (puan) — tenderPdf ile uyumlu ─────────────────────────
const FS_BASE = 9;
const FS_HEADER = 9;       // Lacivert şeritlerdeki başlıklar
const FS_TITLE = 16;       // "Gesamtrapport" başlığı
const FS_VALUE = 9;        // Tablo değer hücreleri

// ── Fontlar (tenderPdf ile birebir: Arial/Arimo) ──────────────────────────────
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

// Para/sayı biçimi: "11.034,07" (de-DE: nokta binlik, virgül ondalık)
const numFmt = (value?: number | null) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const moneyFmt = (value: number | null | undefined, currency: string = 'CHF') => `${currency} ${numFmt(value)}`;

// Tablo/imza tarihleri: "18.05.2026"
const dateFmt = (value?: string | Date | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('tr-TR');
};

// Üst bilgi kutusu tarihleri: "26-06-15" (YY-MM-DD, tenderPdf ile aynı)
const dateShort = (value?: string | Date | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

const timeFmt = (value?: string | Date | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

// Yerel tarih anahtarı (YYYY-MM-DD). toISOString (UTC) kullanılmaz; aksi halde
// yerel gece yarısındaki "bugün" UTC'de bir önceki güne kayıp aralık dışında kalır.
const dateKey = (value?: string | Date | null) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
};

const minutesBetween = (start?: string | null, end?: string | null) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
};

const durationFmt = (minutes?: number | null) => {
    const total = Math.max(0, Math.round(Number(minutes || 0)));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return `${hours} saat ${mins} dakika`;
    if (hours) return `${hours} saat`;
    return `${mins} dakika`;
};

const getItemDate = (item: any, keys: string[]) => {
    for (const key of keys) {
        if (item?.[key]) return dateKey(item[key]);
    }
    return '';
};

const inRange = (key: string, start?: string, end?: string) => {
    if (!key) return true;
    if (start && key < start) return false;
    if (end && key > end) return false;
    return true;
};

const reportDate = (report: any) => report?.workDate || report?.reportDate || report?.startedAt;

const sortReports = (reports: any[]) =>
    [...reports].sort((a, b) => dateKey(reportDate(a)).localeCompare(dateKey(reportDate(b))));

const reportsBetween = (reports: any[], start?: string, end?: string) =>
    sortReports(reports).filter((report) => inRange(dateKey(reportDate(report)), start, end));

const appointmentsBetween = (project: ProjectDto, start?: string, end?: string) =>
    (project.appointments || []).filter((appointment) => inRange(dateKey(appointment.startTime), start, end));

const materialsBetween = (project: ProjectDto, start?: string, end?: string) =>
    (project.extraMaterials || []).filter((item: any) => inRange(getItemDate(item, ['createdAt', 'requestedAt', 'updatedAt']), start, end));

const expensesBetween = (project: ProjectDto, start?: string, end?: string) =>
    (project.expenses || []).filter((item: any) => inRange(getItemDate(item, ['expenseDate', 'createdAt', 'addedAt', 'updatedAt']), start, end));

const reportNumber = (project: ProjectDto, report: any, kind: ReportKind, endDate?: string) => {
    const baseDate = kind === 'daily' ? reportDate(report) : endDate;
    const d = baseDate ? new Date(baseDate) : new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const suffix = clean(project.id).slice(-4).toUpperCase() || '0000';
    return `${d.getFullYear()}-${day}-${suffix}`;
};

const authorName = (project: ProjectDto, preparedBy?: string) => {
    if (preparedBy) return preparedBy;
    if (project.manager) return `${project.manager.firstName} ${project.manager.lastName}`.trim();
    return 'Offitec ERP';
};

const addressLines = (address?: string | null) =>
    clean(address)
        .split(/\r?\n|,/)
        .map((line) => line.trim())
        .filter(Boolean);

const plannedMinutesFor = (reports: any[], appointments: any[]) => {
    const fromReports = reports.reduce((sum, report) => sum + (Number(report.plannedMinutesForDay) || 0), 0);
    if (fromReports > 0) return fromReports;
    return appointments.reduce((sum, appointment) => sum + minutesBetween(appointment.startTime, appointment.endTime), 0);
};

const plannedStart = (appointments: any[], report?: any) => {
    const first = [...appointments].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))[0];
    return first?.startTime || report?.startedAt;
};

const plannedEnd = (appointments: any[], report?: any) => {
    const last = [...appointments].sort((a, b) => String(b.endTime).localeCompare(String(a.endTime)))[0];
    return last?.endTime || report?.endedAt;
};

const groupReportsByDate = (reports: any[]) => {
    const groups = new Map<string, any[]>();
    reports.forEach((report) => {
        const key = dateKey(reportDate(report));
        if (!key) return;
        groups.set(key, [...(groups.get(key) || []), report]);
    });
    return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, items]) => ({ key, reports: sortReports(items) }));
};

const scheduleGroupsFor = (kind: ReportKind, reports: any[]) =>
    kind === 'general'
        ? groupReportsByDate(reports)
        : [{ key: dateKey(reportDate(reports[0])), reports }];

const appointmentsForDate = (appointments: any[], key: string) =>
    appointments.filter((appointment) => dateKey(appointment.startTime) === key);

const overtimeRateFor = (reports: any[], project: ProjectDto) => {
    const withRate = reports.find((r) => Number(r.overtimeHourlyRate) > 0);
    return Number(withRate?.overtimeHourlyRate ?? project.overtimeHourlyRate ?? 0);
};

// ── Çizim yardımcıları ────────────────────────────────────────────────────────
const ensurePage = (doc: jsPDF, y: number, needed = 28) => {
    if (y + needed <= BOTTOM) return y;
    doc.addPage();
    return REST_CONTENT_TOP;
};

type CellAlign = 'left' | 'center' | 'right';

// Hücre içine yaslı, dikeyde ortalanmış (çok satırlı) metin
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

// Bölüm başlığı: açık zeminli, ince gri kenarlıklı kart başlığı (saha raporu stili).
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
    bold?: boolean;       // değer hücresini kalın çiz
}

// Lacivert başlıklı, ince gri ızgaralı, alternatif satır gölgeli tablo.
// Sayfa sonunda başlık satırı tekrarlanır.
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

    // Başlık yüksekliği (çok satırlı başlıklar için ölçülür)
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
        // Satır yüksekliği ölç (en uzun hücreye göre)
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

        // Izgara
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

// Tablo altı sağa yaslı toplam satırı: ince gri çizgi + "Etiket   CHF 130,00"
const drawTotalLine = (doc: jsPDF, label: string, valueText: string, y: number, strong = false): number => {
    y = ensurePage(doc, y, 16);
    y += 4;
    const lineX = LEFT + CONTENT_W * 0.42;
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.4);
    doc.line(lineX, y, RIGHT, y);
    y += 6.5;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(strong ? 11.5 : 10.5);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(label, lineX + 2, y);
    doc.text(valueText, RIGHT, y, { align: 'right' });
    return y + 4;
};

// ── SAYFA 1: Üst bilgi kutusu + gönderici/alıcı + başlık ──────────────────────
const drawCoverHeader = (
    doc: jsPDF,
    project: ProjectDto,
    settings: PdfCompanySettings,
    kind: ReportKind,
    report: any,
    preparedBy: string,
    options?: { startDate?: string; endDate?: string }
): { reportNo: string; y: number } => {
    const reportNo = reportNumber(project, report, kind, options?.endDate);
    const today = new Date();
    const implDate = kind === 'general' ? dateShort(today) : dateShort(reportDate(report));
    const reportDateLabel = kind === 'general' ? dateShort(today) : dateShort(reportDate(report));
    const boxTitle = kind === 'general' ? 'Genel Rapor No :' : 'Saha Rapor No :';
    const docTitle = kind === 'general' ? `Gesamtrapport ${reportNo}` : `Montage-Rapport ${reportNo}`;

    // ── Sol lacivert bilgi kutusu ─────────────────────────────────────────────
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
    doc.text(boxTitle, boxX + CELL_PAD + 1, boxY + 5.4);
    doc.text(reportNo, boxRight - CELL_PAD - 1, boxY + 5.4, { align: 'right' });

    const infoRows: [string, string][] = [
        ['Kommission:', project.tender?.tenderNumber ? localizeTenderNumber(project.tender.tenderNumber) : (project.tenderId || '-')],
        ['Uygulanma Tarihi:', implDate],
        ['Rapor Tarihi:', reportDateLabel],
        ['Teknisyen:', preparedBy],
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

    // ── Sağ kolon: gönderici (lacivert) + alıcı ───────────────────────────────
    const rX = 118;
    const rW = RIGHT - rX;
    let rYy = boxY + 2;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_NAVY);
    const sender = companySenderLine(settings);
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

    // ── "Gesamtrapport {no}" başlığı ──────────────────────────────────────────
    const yTitle = Math.max(boxBottom, rYy) + 16;
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_TITLE);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(docTitle, LEFT, yTitle);

    return { reportNo, y: yTitle + 8 };
};

// ── SAYFA 1 tablosu: Gün / Randevu Tarihi / Başlangıç / Bitiş / Çalışılan Saat ─
const drawScheduleTable = (
    doc: jsPDF,
    kind: ReportKind,
    reports: any[],
    appointments: any[],
    y: number
): number => {
    const groups = scheduleGroupsFor(kind, reports);
    const columns: TableColumn[] = [
        { header: 'Gün', width: 16, align: 'center', bold: true },
        { header: 'Randevu Tarihi', width: 44 },
        { header: 'Başlangıç', width: 35 },
        { header: 'Bitiş', width: 35 },
        { header: 'Çalışılan Saat', width: CONTENT_W - 16 - 44 - 35 - 35 },
    ];

    const rows = groups.map((group, index) => {
        const dayAppointments = appointmentsForDate(appointments, group.key);
        const firstReport = group.reports[0];
        const start = group.reports.map((r) => r.startedAt).filter(Boolean).sort()[0]
            || plannedStart(dayAppointments, firstReport);
        const end = group.reports.map((r) => r.endedAt).filter(Boolean).sort().slice(-1)[0]
            || plannedEnd(dayAppointments, firstReport);
        const worked = minutesBetween(start, end);
        return [String(index + 1), dateFmt(group.key), timeFmt(start), timeFmt(end), durationFmt(worked)];
    });

    return drawTable(doc, columns, rows, y, { minRowH: 11 });
};

// İş kalemini "İş Tanımı" (kısa başlık) + "Açıklama" (tam metin) olarak ayırır.
const splitJobItem = (raw: any): { title: string; body: string } => {
    if (raw && typeof raw === 'object') {
        const title = clean(raw.title ?? raw.name ?? raw.label ?? raw.jobTitle);
        const body = clean(raw.description ?? raw.body ?? raw.detail ?? raw.note ?? raw.title);
        return { title: title || body, body: body || title };
    }
    const text = clean(raw);
    const colon = text.indexOf(':');
    if (colon > 0 && colon <= 40) {
        return { title: text.slice(0, colon).trim(), body: text.slice(colon + 1).trim() || text };
    }
    const firstSegment = text.split(/[.,;\n]/)[0]?.trim() || text;
    const title = firstSegment.length > 0 && firstSegment.length <= 60 ? firstSegment : text.slice(0, 60);
    return { title, body: text };
};

const jobsFromReports = (reports: any[]): Array<{ title: string; body: string; note?: string }> => {
    const jobs: Array<{ title: string; body: string; note?: string }> = [];
    reports.forEach((report) => {
        const rawItems: any[] = Array.isArray(report.operationsDoneItems) && report.operationsDoneItems.length > 0
            ? report.operationsDoneItems
            : clean(report.operationsDone).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const note = clean(report.technicalNotes);
        if (rawItems.length === 0 && note) {
            jobs.push({ title: dateFmt(reportDate(report)), body: '-', note });
            return;
        }
        rawItems.forEach((item, idx) => {
            const job = splitJobItem(item);
            jobs.push({ ...job, note: idx === rawItems.length - 1 ? note || undefined : undefined });
        });
    });
    return jobs;
};

// Tek bir iş kalemi kutusu (sol lacivert numara + İş Tanımı / Açıklama satırları)
const drawJobItem = (
    doc: jsPDF,
    index: number,
    job: { title: string; body: string; note?: string },
    y: number
): number => {
    const numberW = 11;
    const boxX = LEFT + numberW;
    const boxW = CONTENT_W - numberW;
    const labelW = 30;
    const rowH = 9;

    const bodyLines = doc.splitTextToSize(job.body, boxW - labelW - 8);
    const noteLines = job.note ? doc.splitTextToSize(`Teknik not: ${job.note}`, boxW - labelW - 8) : [];
    const bodyH = Math.max(rowH, bodyLines.length * 4.4 + 4 + (noteLines.length ? noteLines.length * 4 + 2 : 0));
    const itemH = rowH + bodyH;

    y = ensurePage(doc, y, itemH + 6);

    // Numara hücresi
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(LEFT, y, numberW, itemH, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE + 1);
    doc.setTextColor(...COLOR_WHITE);
    doc.text(String(index + 1), LEFT + numberW / 2, y + itemH / 2 + 1.4, { align: 'center' });

    // Dış çerçeve
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.2);
    doc.rect(boxX, y, boxW, itemH);

    // İş Tanımı satırı
    doc.setFillColor(...COLOR_ALT_ROW);
    doc.rect(boxX, y, labelW, rowH, 'F');
    doc.setFont(FONT, 'bold');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    doc.text('İş Tanımı', boxX + 3, y + rowH / 2 + 1.4);
    doc.setDrawColor(...COLOR_GRID);
    doc.line(boxX + labelW, y, boxX + labelW, y + rowH);
    doc.setFont(FONT, 'normal');
    doc.text(doc.splitTextToSize(job.title, boxW - labelW - 8)[0], boxX + labelW + 4, y + rowH / 2 + 1.4);
    doc.line(boxX, y + rowH, boxX + boxW, y + rowH);

    // Açıklama satırı
    doc.setFillColor(...COLOR_ALT_ROW);
    doc.rect(boxX, y + rowH, labelW, bodyH, 'F');
    doc.setFont(FONT, 'bold');
    doc.text('Açıklama', boxX + 3, y + rowH + 5.4);
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

// Gün başlığı satırı: "1.GÜN :  18.05.2026" (ortalı, ince gri kenarlık)
const drawDayHeader = (doc: jsPDF, index: number, dateLabel: string, y: number): number => {
    const h = 9;
    y = ensurePage(doc, y, h + 24);
    doc.setFillColor(...COLOR_WHITE);
    doc.rect(LEFT, y, CONTENT_W, h, 'F');
    doc.setDrawColor(...COLOR_GRID);
    doc.setLineWidth(0.2);
    doc.rect(LEFT, y, CONTENT_W, h);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR_TEXT);
    doc.text(`${index + 1}.GÜN :  ${dateLabel}`, LEFT + CONTENT_W / 2, y + h / 2 + 1.6, { align: 'center' });
    return y + h;
};

// ── Yapılan Tüm İşler (günlere göre gruplu) ───────────────────────────────────
const drawJobs = (doc: jsPDF, kind: ReportKind, reports: any[], y: number): number => {
    y = sectionBar(doc, 'Yapılan Tüm İşler', y);
    const groups = scheduleGroupsFor(kind, reports);

    const hasAny = groups.some((g) => jobsFromReports(g.reports).length > 0);
    if (!hasAny) {
        doc.setFont(FONT, 'normal');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_TEXT);
        doc.text('-', LEFT + 2, y + 4);
        return y + 12;
    }

    groups.forEach((group, gi) => {
        if (kind === 'general') {
            y = drawDayHeader(doc, gi, dateFmt(group.key), y);
        }
        const jobs = jobsFromReports(group.reports);
        jobs.forEach((job, index) => {
            y = drawJobItem(doc, index, job, y);
        });
        y += 5;
    });

    return y + 2;
};

// ── Ek Çalışmalar (saat + ücret tablosu + toplam) ─────────────────────────────
const drawOvertime = (
    doc: jsPDF,
    kind: ReportKind,
    reports: any[],
    appointments: any[],
    project: ProjectDto,
    currency: string,
    y: number
): { y: number; total: number } => {
    y = sectionBar(doc, 'Ek Çalışmalar', y);
    const groups = scheduleGroupsFor(kind, reports);

    const columns: TableColumn[] = [
        { header: 'Tarih', width: 30, bold: true },
        { header: 'Planlanan Saat', width: 28 },
        { header: 'Azami Saat', width: 33 },
        { header: '%15 Zaman Aşımı Saat Başı Ücreti', width: 44 },
        { header: 'Günlük Ek Çalışma Tutarı', width: CONTENT_W - 30 - 28 - 33 - 44 },
    ];

    let total = 0;
    const rows = groups.map((group) => {
        const dayAppointments = appointmentsForDate(appointments, group.key);
        const planned = plannedMinutesFor(group.reports, dayAppointments);
        const max = Math.ceil(planned * 1.15);
        const rate = overtimeRateFor(group.reports, project);
        const cost = group.reports.reduce((sum, r) => sum + (Number(r.overtimeCost) || 0), 0);
        total += cost;
        return [dateFmt(group.key), durationFmt(planned), durationFmt(max), moneyFmt(rate, currency), moneyFmt(cost, currency)];
    });

    y = drawTable(doc, columns, rows, y, { minRowH: 11 });
    y = drawTotalLine(doc, 'Ek Çalışma Tutarı', moneyFmt(total, currency), y);
    return { y, total };
};

// Raporlardaki kullanılan malzemeleri toplar (her raporun usedMaterials/materials listesi)
const usedMaterialsFromReports = (reports: any[]): any[] => {
    const out: any[] = [];
    reports.forEach((report) => {
        if (Array.isArray(report.usedMaterials)) out.push(...report.usedMaterials);
        else if (Array.isArray(report.materials)) out.push(...report.materials);
    });
    return out;
};

const materialId = (item: any) => item.material?.serialId || item.serialId || item.materialId || '-';
const materialName = (item: any) => item.material?.name || item.name || 'Malzeme';

// ── Kullanılan / Ek Malzemeler (Teklife Dahil mi? + Tutar) ────────────────────
const drawMaterials = (
    doc: jsPDF,
    usedMaterials: any[],
    extraMaterials: any[],
    currency: string,
    y: number
): { y: number; total: number } => {
    y = sectionBar(doc, 'Kullanılan / Ek Malzemeler', y);

    const columns: TableColumn[] = [
        { header: 'Malzeme Id', width: 38 },
        { header: 'Malzeme Adı', width: 62 },
        { header: 'Teklife Dahil mi?', width: 40 },
        { header: 'Malzeme Tutarı(CHF)', width: CONTENT_W - 38 - 62 - 40 },
    ];

    const rows: string[][] = [];
    // Teklife dahil (kullanılan/tender) malzemeler — ek ücret 0,00
    usedMaterials.forEach((item) => {
        rows.push([String(materialId(item)), String(materialName(item)), 'Dahil', numFmt(0)]);
    });
    // Teklife dahil olmayan (ek) malzemeler — ek ücret = miktar × birim fiyat
    let total = 0;
    extraMaterials.forEach((item) => {
        const amount = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        total += amount;
        rows.push([String(materialId(item)), String(materialName(item)), 'Dahil Değil', numFmt(amount)]);
    });

    if (rows.length === 0) rows.push(['-', '-', '-', numFmt(0)]);

    y = drawTable(doc, columns, rows, y, { minRowH: 8.5 });
    y = drawTotalLine(doc, 'Ek Malzeme Tutarı', moneyFmt(total, currency), y);
    return { y, total };
};

// ── Harici Giderler (+ Harici Gider Tutarı + Toplam Tutar) ────────────────────
const drawExpenses = (
    doc: jsPDF,
    expenses: any[],
    currency: string,
    extraMaterialTotal: number,
    overtimeTotal: number,
    y: number
): number => {
    y = sectionBar(doc, 'Harici Giderler', y);

    const columns: TableColumn[] = [
        { header: 'Harici Gider Tipi', width: 45 },
        { header: 'Açıklama', width: CONTENT_W - 45 - 35 },
        { header: 'Tutar (CHF)', width: 35 },
    ];

    let expenseTotal = 0;
    const rows = expenses.map((expense) => {
        const amount = Number(expense.amount) || 0;
        expenseTotal += amount;
        return [String(expense.expenseType || '-'), String(expense.description || '-'), numFmt(amount)];
    });
    if (rows.length === 0) rows.push(['-', '-', numFmt(0)]);

    y = drawTable(doc, columns, rows, y, { minRowH: 14 });
    y = drawTotalLine(doc, 'Harici Gider Tutarı', moneyFmt(expenseTotal, currency), y);

    const grandTotal = extraMaterialTotal + expenseTotal + overtimeTotal;
    y = drawTotalLine(doc, 'Toplam Tutar', moneyFmt(grandTotal, currency), y, true);
    return y;
};

const detectImageFormat = (dataUrl: string): 'PNG' | 'JPEG' => {
    if (/^data:image\/(jpeg|jpg)/i.test(dataUrl)) return 'JPEG';
    return 'PNG';
};

// ── Görseller ─────────────────────────────────────────────────────────────────
const drawImages = (doc: jsPDF, reports: any[], y: number): number => {
    const images: string[] = [];
    reports.forEach((report) => {
        if (Array.isArray(report.images)) {
            report.images.forEach((img: any) => {
                const data = img?.imageData || img?.url || img?.imageUrl;
                if (data) images.push(String(data));
            });
        }
    });

    y = sectionBar(doc, 'Görseller', y);

    if (images.length === 0) {
        doc.setFont(FONT, 'italic');
        doc.setFontSize(FS_BASE);
        doc.setTextColor(...COLOR_MUTED);
        doc.text('Bu rapor için görsel bulunmuyor.', LEFT + 2, y + 4);
        return y + 12;
    }

    const cols = 3;
    const gap = 4;
    const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.72;   // yatay (landscape) oran

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

// ── Onay ve İmza (2 sütun: Servis Teknisyeni + Müşteri Yetkilisi) ─────────────
const drawApproval = (
    doc: jsPDF,
    project: ProjectDto,
    reports: any[],
    preparedBy: string,
    y: number
): number => {
    y = ensurePage(doc, y, 90);
    y = sectionBar(doc, 'Onay ve İmza', y);

    // Lacivert zeminli onay metni kutusu
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    const text = 'Yukarıdaki raporda belirtilmiş olan çalışma süresi , ek çalışma , harici gider ve ek malzeme kalemlerini sahada gerçekleştiğini kabul ediyorum ve onaylıyorum.';
    const lines = doc.splitTextToSize(text, CONTENT_W - 10);
    const textBoxH = lines.length * 4.6 + 7;
    doc.setFillColor(...COLOR_NAVY);
    doc.rect(LEFT, y, CONTENT_W, textBoxH, 'F');
    doc.setTextColor(...COLOR_WHITE);
    doc.text(lines, LEFT + 5, y + 5.5);
    y += textBoxH;   // imza kutusu, onay metni kutusuna bitişik

    // İki sütunlu imza kutusu (rol / ad / tarih ortalı, İmza solda)
    const boxH = 50;
    const colW = CONTENT_W / 2;
    const topH = 26;
    const signDate = dateFmt(reportDate(reports[0]));

    const columns: [string, string][] = [
        ['Servis Teknisyeni', preparedBy],
        ['Müşteri Yetkilisi', project.customer?.companyName || '-'],
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
        doc.text(`Tarih : ${signDate}`, cx, y + 19, { align: 'center' });
        doc.setTextColor(...COLOR_TEXT);
        doc.setFont(FONT, 'normal');
        doc.text('İmza:', x + 5, y + topH + 7);
    });

    // Customer signature into the "Müşteri Yetkilisi" cell — the most recent
    // signed field report in the aggregate.
    const sig = [...reports].reverse().find((r) => r?.customerSignature)?.customerSignature;
    if (sig) {
        try {
            const s = String(sig);
            const fmt = s.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(s, fmt, LEFT + colW + 16, y + topH + 2, colW - 22, boxH - topH - 6, undefined, 'FAST');
        } catch {
            /* ignore bad signature data */
        }
    }

    return y + boxH + 8;
};

// ── Arka plan (sablon.pdf) birleştirme — tenderPdf ile birebir ────────────────
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

// ── Rapor üretimi ─────────────────────────────────────────────────────────────
const saveReport = async (
    project: ProjectDto,
    reports: any[],
    kind: ReportKind,
    options: { startDate?: string; endDate?: string; preparedBy?: string; output?: 'download' | 'blob' } = {}
) => {
    const settings = usePdfSettingsStore.getState().settings;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    // The general report is a signed aggregate of every field report up to now,
    // so the range is open-ended (all history) capped at today.
    const today = new Date().toISOString().slice(0, 10);
    const genStart = options.startDate;
    const genEnd = options.endDate || today;
    const firstReportDate = dateKey(reportDate(reports[0]));
    const filteredReports = kind === 'general'
        ? reportsBetween(reports, genStart, genEnd)
        : reportsBetween(reports, firstReportDate, firstReportDate);
    const filteredReportDate = dateKey(reportDate(filteredReports[0]));
    const appointments = kind === 'general'
        ? appointmentsBetween(project, genStart, genEnd)
        : appointmentsBetween(project, filteredReportDate, filteredReportDate);
    const extraMaterials = kind === 'general'
        ? materialsBetween(project, genStart, genEnd)
        : materialsBetween(project, filteredReportDate, filteredReportDate);
    const expenses = kind === 'general'
        ? expensesBetween(project, genStart, genEnd)
        : expensesBetween(project, filteredReportDate, filteredReportDate);
    const usedMaterials = usedMaterialsFromReports(filteredReports);
    const preparedBy = authorName(project, options.preparedBy);
    const currency = settings.currency || 'CHF';

    await registerFonts(doc);

    // SAYFA 1: Üst bilgi + randevu/saat tablosu
    const cover = drawCoverHeader(doc, project, settings, kind, filteredReports[0], preparedBy, options);
    let y = cover.y;
    y = drawScheduleTable(doc, kind, filteredReports, appointments, y);

    // SAYFA 2: Yapılan işler + ek çalışmalar
    doc.addPage();
    y = REST_CONTENT_TOP;
    y = drawJobs(doc, kind, filteredReports, y);
    const overtime = drawOvertime(doc, kind, filteredReports, appointments, project, currency, y);
    y = overtime.y;

    // SAYFA 3: Kullanılan/Ek malzemeler + harici giderler + toplam
    doc.addPage();
    y = REST_CONTENT_TOP;
    const materials = drawMaterials(doc, usedMaterials, extraMaterials, currency, y);
    y = materials.y;
    y = drawExpenses(doc, expenses, currency, materials.total, overtime.total, y);

    // SAYFA 4: Görseller + onay/imza
    doc.addPage();
    y = REST_CONTENT_TOP;
    y = drawImages(doc, filteredReports, y);
    drawApproval(doc, project, filteredReports, preparedBy, y);

    const contentBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(doc.output('arraybuffer'));
    let finalBytes: Uint8Array<ArrayBufferLike> = contentBytes;
    try {
        const bgBytes = await resolveBackgroundBytes(settings);
        if (bgBytes) finalBytes = await applyPdfBackground(contentBytes, bgBytes);
    } catch (err) {
        console.error('PDF background merge failed:', err);
    }

    if (options.output === 'blob') {
        return new Blob([new Uint8Array(finalBytes)], { type: 'application/pdf' });
    }
    const safeName = clean(project.projectName).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'proje';
    const lastReportDate = dateKey(reportDate(filteredReports[filteredReports.length - 1]));
    const suffix = kind === 'general'
        ? `genel-rapor-${lastReportDate || today}`
        : `saha-raporu-${filteredReportDate}`;
    downloadPdf(finalBytes, `${safeName}-${suffix}.pdf`);
    return null;
};

export const exportProjectReportPdf = async (project: ProjectDto, report: any) => {
    await saveReport(project, [report], 'daily');
};

export const exportProjectGeneralReportPdf = async (project: ProjectDto, options: ProjectGeneralReportOptions = {}) =>
    saveReport(project, project.reports || [], 'general', options);
