import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import openSansBoldUrl from '../../assets/fonts/OpenSans-Bold.ttf?url';
import openSansRegularUrl from '../../assets/fonts/OpenSans-Regular.ttf?url';
import overpassSemiBoldUrl from '../../assets/fonts/Overpass-SemiBold.ttf?url';
import defaultLetterheadUrl from '../../assets/docs/offitec-letterhead.pdf?url';
import { usePdfSettingsStore, type PdfCompanySettings } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';

type ReportKind = 'daily' | 'general';

export interface ProjectGeneralReportOptions {
    startDate: string;
    endDate: string;
    preparedBy?: string;
}

const LEFT = 25;
const RIGHT = 185;
const CONTENT_W = RIGHT - LEFT;
const PAGE_H = 297;
const FIRST_CONTENT_TOP = 56;
const REST_CONTENT_TOP = 48;
const BOTTOM = PAGE_H - 29;
const PDF_FONT = 'OpenSans';
const TITLE_FONT = 'Overpass';

let fontFiles: { openSansRegular: string; openSansBold: string; overpassSemiBold: string } | null = null;

const bufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
};

const registerFonts = async (doc: jsPDF) => {
    if (!fontFiles) {
        const [openSansRegular, openSansBold, overpassSemiBold] = await Promise.all([
            fetch(openSansRegularUrl).then((res) => res.arrayBuffer()),
            fetch(openSansBoldUrl).then((res) => res.arrayBuffer()),
            fetch(overpassSemiBoldUrl).then((res) => res.arrayBuffer()),
        ]);
        fontFiles = {
            openSansRegular: bufferToBase64(openSansRegular),
            openSansBold: bufferToBase64(openSansBold),
            overpassSemiBold: bufferToBase64(overpassSemiBold),
        };
    }

    doc.addFileToVFS('OpenSans-Regular.ttf', fontFiles.openSansRegular);
    doc.addFileToVFS('OpenSans-Bold.ttf', fontFiles.openSansBold);
    doc.addFileToVFS('Overpass-SemiBold.ttf', fontFiles.overpassSemiBold);
    doc.addFont('OpenSans-Regular.ttf', PDF_FONT, 'normal');
    doc.addFont('OpenSans-Bold.ttf', PDF_FONT, 'bold');
    doc.addFont('OpenSans-Bold.ttf', PDF_FONT, 'semibold');
    doc.addFont('Overpass-SemiBold.ttf', TITLE_FONT, 'semibold');
};

const clean = (value: unknown) => String(value ?? '').trim();

const money = (value: number, currency: 'CHF' | 'EUR' = 'CHF') =>
    new Intl.NumberFormat('de-CH', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);

const numberFmt = (value: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(Number(value) || 0);

const dateFmt = (value?: string | Date | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('tr-TR');
};

const timeFmt = (value?: string | Date | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const dateKey = (value?: string | Date | null) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
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

const expensesBetween = (project: ProjectDto, start?: string, end?: string) =>
    (project.expenses || []).filter((expense: any) => inRange(getItemDate(expense, ['expenseDate', 'createdAt', 'updatedAt']), start, end));

const materialsBetween = (project: ProjectDto, start?: string, end?: string) =>
    (project.extraMaterials || []).filter((item: any) => inRange(getItemDate(item, ['createdAt', 'requestedAt', 'updatedAt']), start, end));

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

const serviceLocation = (project: ProjectDto) => {
    const lines = addressLines(project.customer?.address);
    const city = lines.slice(-1)[0];
    return city ? `İsviçre / ${city}` : 'İsviçre / Basel';
};

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

const appointmentsForDate = (appointments: any[], key: string) =>
    appointments.filter((appointment) => dateKey(appointment.startTime) === key);

const ensurePage = (doc: jsPDF, y: number, needed = 28) => {
    if (y + needed <= BOTTOM) return y;
    doc.addPage();
    return REST_CONTENT_TOP;
};

const sectionTitle = (doc: jsPDF, title: string, y: number) => {
    y = ensurePage(doc, y, 20);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(LEFT, y, RIGHT, y);
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(title, LEFT + 2, y + 8);
    doc.line(LEFT, y + 12, RIGHT, y + 12);
    return y + 22;
};

const writeWrapped = (doc: jsPDF, text: string, x: number, y: number, width: number, size = 9) => {
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(text || '-', width);
    doc.text(lines, x, y);
    return y + Math.max(1, lines.length) * (size <= 8.5 ? 4.3 : 4.8);
};

const drawCentered = (
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    options: { size?: number; style?: 'normal' | 'bold' | 'semibold' } = {}
) => {
    const size = options.size ?? 9;
    const style = options.style ?? 'normal';
    const lines = doc.splitTextToSize(text || '-', width - 3);
    const lineHeight = size >= 9 ? 4.6 : 4.1;
    const textHeight = (lines.length - 1) * lineHeight;
    const firstLineY = y + (height - textHeight) / 2 + size * 0.32;

    doc.setFont(PDF_FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
    doc.text(lines, x + width / 2, firstLineY, { align: 'center' });
};

const drawIntro = (
    doc: jsPDF,
    project: ProjectDto,
    kind: ReportKind,
    report: any,
    options?: { startDate?: string; endDate?: string }
) => {
    const reportNo = reportNumber(project, report, kind, options?.endDate);
    const reportDateLabel = kind === 'general'
        ? `${dateFmt(options?.startDate)} - ${dateFmt(options?.endDate)}`
        : dateFmt(reportDate(report));

    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(0, 0, 0);
    doc.text('Offitec GmbH - Regentstrasse 15, 4107 Ettingen', LEFT + 1, FIRST_CONTENT_TOP);

    doc.setFontSize(10);
    const customerY = FIRST_CONTENT_TOP + 14;
    doc.text(project.customer?.companyName || project.customerId || '-', LEFT + 1, customerY);
    const customerAddress = addressLines(project.customer?.address);
    if (customerAddress.length > 0) {
        doc.text(customerAddress.slice(0, 4), LEFT + 1, customerY + 5.6);
    }

    const metaX = 122;
    const valueX = 184;
    const rows = [
        ['Rapor Numarası:', reportNo],
        ['Rapor Tarihi:', reportDateLabel],
        ['Müşteri Numarası:', project.customerId || '-'],
        ['Sözleşme Numarası:', project.tender?.tenderNumber || project.tenderId || '-'],
    ];

    doc.setFontSize(10);
    rows.forEach(([label, value], index) => {
        const y = FIRST_CONTENT_TOP + 1 + index * 6.6;
        doc.setFont(PDF_FONT, 'bold');
        doc.text(label, metaX, y);
        doc.setFont(PDF_FONT, 'normal');
        doc.text(String(value), valueX, y, { align: 'right' });
    });

    doc.setFont(TITLE_FONT, 'semibold');
    doc.setFontSize(18);
    doc.text('Regierapport', LEFT, 118);

    return sectionTitle(doc, 'Randevu Detay ve Saat Planı', 132);
};

const drawSchedule = (
    doc: jsPDF,
    project: ProjectDto,
    kind: ReportKind,
    reports: any[],
    appointments: any[],
    preparedBy: string,
    y: number,
    currency: 'CHF' | 'EUR'
) => {
    const tableX = LEFT + 9;
    const tableW = CONTENT_W - 18;
    const colW = tableW / 4;
    const labelH = 12;
    const valueH = 14;

    let cy = y + 6;
    const scheduleGroups = kind === 'general'
        ? groupReportsByDate(reports)
        : [{ key: dateKey(reportDate(reports[0])), reports }];

    scheduleGroups.forEach((group, groupIndex) => {
        const dayAppointments = appointmentsForDate(appointments, group.key);
        const firstReport = group.reports[0];
        const firstPlannedStart = plannedStart(dayAppointments, firstReport);
        const firstPlannedEnd = plannedEnd(dayAppointments, firstReport);
        const firstActualStart = group.reports.map((r) => r.startedAt).filter(Boolean).sort()[0];
        const lastActualEnd = group.reports.map((r) => r.endedAt).filter(Boolean).sort().slice(-1)[0];
        const actualMinutes = group.reports.reduce((sum, item) => sum + minutesBetween(item.startedAt, item.endedAt), 0);
        const plannedMinutes = plannedMinutesFor(group.reports, dayAppointments);
        const maxMinutes = Math.ceil(plannedMinutes * 1.15);
        const blocks = [
            {
                labels: ['Randevu Tarihi', 'Planlanan\nBaşlangıç', 'Planlanan Bitiş', 'Planlanan Saat'],
                values: [dateFmt(firstPlannedStart || reportDate(firstReport)), timeFmt(firstPlannedStart), timeFmt(firstPlannedEnd), durationFmt(plannedMinutes)],
            },
            {
                labels: ['Azami Onaylı Saat', 'Gerçek Başlangıç', 'Gerçek Bitiş', 'Gerçek Toplam\nSüre'],
                values: [durationFmt(maxMinutes), timeFmt(firstActualStart), timeFmt(lastActualEnd), durationFmt(actualMinutes)],
            },
            {
                labels: ['Servis Tipi', 'Raporu Hazırlayan', 'Para Birimi', 'Ülke/Şehir'],
                values: ['Montaj', preparedBy || '-', currency, serviceLocation(project)],
            },
        ];

        cy = ensurePage(doc, cy, 86);
        if (kind === 'general') {
            if (groupIndex > 0) cy += 4;
            doc.setFont(PDF_FONT, 'bold');
            doc.setFontSize(9.2);
            doc.text(dateFmt(group.key), tableX, cy);
            cy += 7;
        }

        blocks.forEach((block) => {
        block.labels.forEach((label, col) => {
            const x = tableX + col * colW;
            doc.setFillColor(242, 242, 242);
            doc.rect(x, cy, colW, labelH, 'F');
            drawCentered(doc, label, x, cy, colW, labelH, { size: 8.7, style: 'bold' });
            drawCentered(doc, block.values[col], x, cy + labelH, colW, valueH, { size: 10, style: 'normal' });
            if (col > 0) {
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.25);
                doc.line(x, cy, x, cy + labelH + valueH);
            }
        });
        cy += labelH + valueH;
    });
    });

    return cy + 8;
};

const splitJobText = (report: any) => {
    const explicitTitle = clean(report.workTitle || report.jobTitle || report.title || report.subject || report.summary);
    const body = clean(report.operationsDone) || '-';
    if (explicitTitle) return { title: explicitTitle, body };

    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1 && lines[0].length <= 80) {
        return { title: lines[0], body: lines.slice(1).join('\n') || '-' };
    }
    return { title: dateFmt(reportDate(report)), body };
};

const drawJobs = (doc: jsPDF, reports: any[], y: number) => {
    y = sectionTitle(doc, 'Yapılan Tüm İşler', y);
    if (reports.length === 0) return writeWrapped(doc, '-', LEFT + 2, y, CONTENT_W - 4);

    reports.forEach((report, index) => {
        const job = splitJobText(report);
        const jobDate = dateFmt(reportDate(report));
        const jobTitle = job.title === jobDate ? jobDate : `${jobDate} - ${job.title}`;
        const bodyLines = doc.splitTextToSize(job.body, 134);
        const noteLines = report.technicalNotes ? doc.splitTextToSize(`Teknik not: ${clean(report.technicalNotes)}`, 134) : [];
        const itemH = Math.max(44, 25 + bodyLines.length * 4.8 + noteLines.length * 4.2);

        y = ensurePage(doc, y, itemH + 12);

        const numberX = LEFT + 9;
        const numberW = 12;
        const boxX = numberX + numberW;
        const boxW = CONTENT_W - 32;
        const headerH = 10;
        const labelW = 35;

        doc.setFillColor(245, 245, 245);
        doc.rect(numberX, y, numberW, headerH, 'F');
        doc.setFont(PDF_FONT, 'normal');
        doc.setFontSize(10);
        doc.text(String(index + 1), numberX + numberW / 2, y + 6.5, { align: 'center' });

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.25);
        doc.rect(boxX, y, boxW, itemH);
        doc.setFillColor(248, 248, 248);
        doc.rect(boxX, y, boxW, headerH, 'F');
        doc.setDrawColor(135, 135, 135);
        doc.setLineWidth(0.55);
        doc.line(boxX, y + headerH, boxX + boxW, y + headerH);
        doc.setLineWidth(0.45);
        doc.line(boxX + labelW, y, boxX + labelW, y + headerH);

        doc.setFont(PDF_FONT, 'bold');
        doc.setFontSize(9.5);
        doc.text('İş Tanımı', boxX + 4, y + 6.5);
        doc.setFont(PDF_FONT, 'normal');
        doc.setFontSize(10);
        doc.text(doc.splitTextToSize(jobTitle, boxW - labelW - 12)[0], boxX + labelW + 9, y + 6.5);

        doc.setFont(PDF_FONT, 'normal');
        doc.setFontSize(9.5);
        doc.text(bodyLines, boxX + 4, y + headerH + 9);
        let textY = y + headerH + 9 + bodyLines.length * 4.8;
        if (noteLines.length > 0) {
            doc.setFontSize(8.4);
            doc.setTextColor(85, 85, 85);
            doc.text(noteLines, boxX + 4, textY + 2);
            doc.setTextColor(0, 0, 0);
        }

        y += itemH + 11;
    });

    return y;
};

const drawOfferTotal = (doc: jsPDF, project: ProjectDto, y: number, currency: 'CHF' | 'EUR') => {
    y = sectionTitle(doc, 'Toplam Teklif Tutarı', y);
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(9);
    doc.text('Toplam Teklif Tutarı', 126, y + 6);
    doc.text(money(Number(project.plannedBudget) || 0, currency), RIGHT, y + 6, { align: 'right' });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(LEFT, y + 12, RIGHT, y + 12);
    return y + 24;
};

const drawFourColumnTable = (
    doc: jsPDF,
    y: number,
    labels: string[],
    values: string[],
    tableX = LEFT + 1,
    tableW = CONTENT_W - 2
) => {
    const colW = tableW / 4;
    const headerH = 15;
    const valueH = 16;

    labels.forEach((label, index) => {
        const x = tableX + index * colW;
        doc.setFillColor(242, 242, 242);
        doc.rect(x, y, colW, headerH, 'F');
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.rect(x, y, colW, headerH + valueH);
        drawCentered(doc, label, x, y, colW, headerH, { size: 8.2, style: 'bold' });
        drawCentered(doc, values[index], x, y + headerH, colW, valueH, { size: 9, style: 'normal' });
    });

    return y + headerH + valueH;
};

const drawOvertime = (doc: jsPDF, reports: any[], appointments: any[], kind: ReportKind, y: number, currency: 'CHF' | 'EUR') => {
    y = sectionTitle(doc, 'Ek Çalışma Tutarı', y);
    y = ensurePage(doc, y, 58);

    const groups = kind === 'general'
        ? groupReportsByDate(reports)
        : [{ key: dateKey(reportDate(reports[0])), reports }];

    groups.forEach((group, index) => {
        const dayAppointments = appointmentsForDate(appointments, group.key);
        const planned = plannedMinutesFor(group.reports, dayAppointments);
        const max = Math.ceil(planned * 1.15);
        const overtimeMinutes = group.reports.reduce((sum, report) => sum + (Number(report.overtimeMinutes) || 0), 0);
        const overtimeCost = group.reports.reduce((sum, report) => sum + (Number(report.overtimeCost) || 0), 0);
        const rate = group.reports.find((report) => Number(report.overtimeHourlyRate) > 0)?.overtimeHourlyRate || 0;

        y = ensurePage(doc, y, kind === 'general' ? 70 : 58);
        if (kind === 'general') {
            if (index > 0) y += 3;
            doc.setFont(PDF_FONT, 'bold');
            doc.setFontSize(9.2);
            doc.text(dateFmt(group.key), LEFT + 1, y + 3);
            y += 8;
        }

        y = drawFourColumnTable(
            doc,
            y + 6,
            ['Planlanan Saat', 'Azami Saat', '%15 Zaman Aşımı\nSaat Başı Ücreti', 'Fazladan Çalışılan\nSaat'],
            [durationFmt(planned), durationFmt(max), money(Number(rate) || 0, currency), durationFmt(overtimeMinutes)]
        );

        y += 9;
        doc.setFont(PDF_FONT, 'bold');
        doc.setFontSize(9);
        doc.text(kind === 'general' ? 'Günlük Ek Çalışma Tutarı' : 'Ek Çalışma Tutarı', 116, y);
        doc.setFont(PDF_FONT, 'normal');
        doc.text(money(overtimeCost, currency), RIGHT, y, { align: 'right' });
        y += 9;
    });

    const overtimeCost = reports.reduce((sum, report) => sum + (Number(report.overtimeCost) || 0), 0);
    y += 4;
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(9);
    doc.text(kind === 'general' ? 'Toplam Ek Çalışma Tutarı' : 'Ek Çalışma Tutarı', kind === 'general' ? 112 : 126, y);
    doc.setFont(PDF_FONT, 'normal');
    doc.text(money(overtimeCost, currency), RIGHT, y, { align: 'right' });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(LEFT, y + 5, RIGHT, y + 5);
    return y + 17;
};

const drawMaterials = (doc: jsPDF, materials: any[], y: number, currency: 'CHF' | 'EUR') => {
    y = sectionTitle(doc, 'Ek Malzeme Tutarı', y);
    y = ensurePage(doc, y, 40);

    const tableX = LEFT + 12;
    const widths = [30, 76, 44];
    const headers = ['Malzeme Id', 'Malzeme Adı', `Malzeme Tutarı(${currency})`];
    let cy = y + 6;

    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(8.5);
    headers.forEach((header, index) => {
        const x = tableX + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
        doc.setDrawColor(185, 185, 185);
        doc.rect(x, cy, widths[index], 8);
        doc.text(header, x + widths[index] / 2, cy + 5.4, { align: 'center' });
    });
    cy += 8;

    const rows = materials.length > 0 ? materials : [{ material: { serialId: '-', name: '-' }, quantity: 0, unitPrice: 0 }];
    rows.forEach((item) => {
        cy = ensurePage(doc, cy, 22);
        const name = item.material?.name || item.name || item.materialId || 'Ek malzeme';
        const amount = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        const values = [
            item.material?.serialId || item.serialId || item.materialId || '-',
            name,
            numberFmt(amount),
        ];
        values.forEach((value, index) => {
            const x = tableX + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
            doc.setDrawColor(190, 190, 190);
            doc.rect(x, cy, widths[index], 7);
            doc.text(doc.splitTextToSize(String(value), widths[index] - 4), x + widths[index] / 2, cy + 5, { align: 'center' });
        });
        cy += 7;
    });

    const total = materials.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    cy += 13;
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(9);
    doc.text('Ek Malzeme Tutarı', 126, cy);
    doc.setFont(PDF_FONT, 'normal');
    doc.text(money(total, currency), RIGHT, cy, { align: 'right' });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(LEFT, cy + 5, RIGHT, cy + 5);
    return cy + 17;
};

const drawExpenses = (doc: jsPDF, expenses: any[], y: number, currency: 'CHF' | 'EUR') => {
    y = sectionTitle(doc, 'Harici Giderler', y);
    y = ensurePage(doc, y, 45);

    const tableX = LEFT;
    const widths = [38, 92, 30];
    const headers = ['Harici Gider Tipi', 'Açıklama', `Tutar (${currency})`];
    let cy = y + 6;

    headers.forEach((header, index) => {
        const x = tableX + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
        doc.setFillColor(242, 242, 242);
        doc.rect(x, cy, widths[index], 9, 'F');
        doc.setDrawColor(185, 185, 185);
        doc.rect(x, cy, widths[index], 9);
        drawCentered(doc, header, x, cy, widths[index], 9, { size: 8, style: 'bold' });
    });
    cy += 9;

    const rows = expenses.length > 0 ? expenses : [{ expenseType: '-', description: '-', amount: 0 }];
    rows.forEach((expense) => {
        const descLines = doc.splitTextToSize(clean(expense.description) || '-', widths[1] - 8);
        const rowH = Math.max(15, descLines.length * 4.3 + 6);
        cy = ensurePage(doc, cy, rowH + 22);
        const values = [clean(expense.expenseType) || '-', descLines, numberFmt(Number(expense.amount) || 0)];
        values.forEach((value, index) => {
            const x = tableX + widths.slice(0, index).reduce((sum, width) => sum + width, 0);
            doc.setDrawColor(190, 190, 190);
            doc.rect(x, cy, widths[index], rowH);
            doc.setFont(PDF_FONT, 'normal');
            doc.setFontSize(8);
            if (Array.isArray(value)) {
                doc.text(value, x + 5, cy + 6);
            } else {
                doc.text(value, x + widths[index] / 2, cy + rowH / 2 + 2, { align: 'center' });
            }
        });
        cy += rowH;
    });

    const total = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    cy += 15;
    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(9);
    doc.text('Harici Gider Tutarı', 126, cy);
    doc.setFont(PDF_FONT, 'normal');
    doc.text(money(total, currency), RIGHT, cy, { align: 'right' });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(LEFT, cy + 5, RIGHT, cy + 5);
    return cy + 17;
};

const drawGrandTotal = (
    doc: jsPDF,
    project: ProjectDto,
    reports: any[],
    expenses: any[],
    materials: any[],
    y: number,
    currency: 'CHF' | 'EUR'
) => {
    y = ensurePage(doc, y, 18);
    const extraMaterialTotal = materials.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const overtimeTotal = reports.reduce((sum, report) => sum + (Number(report.overtimeCost) || 0), 0);
    const finalTotal = Number(project.plannedBudget || 0) + extraMaterialTotal + expenseTotal + overtimeTotal;

    doc.setFont(PDF_FONT, 'bold');
    doc.setFontSize(9);
    doc.text('Toplam Tutar', 126, y);
    doc.text(money(finalTotal, currency), RIGHT, y, { align: 'right' });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(LEFT, y + 5, RIGHT, y + 5);
    return y + 17;
};

const drawApproval = (doc: jsPDF, project: ProjectDto, reports: any[], preparedBy: string, y: number) => {
    y = ensurePage(doc, y, 82);
    y = sectionTitle(doc, 'ONAY ve İMZA', y);

    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(9.2);
    const text = 'Yukarıdaki raporda belirtilmiş olan çalışma süresi, ek çalışma, harici gider ve ek malzeme kalemlerini sahada gerçekleştiğini kabul ediyorum ve onaylıyorum.';
    y = writeWrapped(doc, text, LEFT + 3, y, CONTENT_W - 6, 9.2) + 10;

    y = ensurePage(doc, y, 58);
    const boxX = LEFT + 6;
    const boxW = CONTENT_W - 12;
    const boxH = 56;
    const colW = boxW / 3;
    const topH = 36;
    const signDate = dateFmt(reportDate(reports[0]));
    const managerName = project.manager ? `${project.manager.firstName} ${project.manager.lastName}`.trim() : 'Offitec ERP';
    const columns = [
        ['Servis Teknisyeni', preparedBy || managerName],
        ['Müşteri Yetkilisi', project.customer?.companyName || '-'],
        ['Operasyon Kontrol', managerName],
    ];

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.rect(boxX, y, boxW, boxH);
    doc.line(boxX, y + topH, boxX + boxW, y + topH);
    doc.line(boxX + colW, y, boxX + colW, y + boxH);
    doc.line(boxX + colW * 2, y, boxX + colW * 2, y + boxH);

    columns.forEach(([role, name], index) => {
        const x = boxX + index * colW;
        drawCentered(doc, `${role}\n${name}\nTarih : ${signDate}\n\nİmza:`, x + 3, y + 6, colW - 6, topH - 6, { size: 8.6 });
    });

    return y + boxH + 8;
};

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

const saveReport = async (
    project: ProjectDto,
    reports: any[],
    kind: ReportKind,
    options: { startDate?: string; endDate?: string; preparedBy?: string } = {}
) => {
    const settings = usePdfSettingsStore.getState().settings;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const firstReportDate = dateKey(reportDate(reports[0]));
    const filteredReports = kind === 'general'
        ? reportsBetween(reports, options.startDate, options.endDate)
        : reportsBetween(reports, firstReportDate, firstReportDate);
    const filteredReportDate = dateKey(reportDate(filteredReports[0]));
    const appointments = kind === 'general'
        ? appointmentsBetween(project, options.startDate, options.endDate)
        : appointmentsBetween(project, filteredReportDate, filteredReportDate);
    const expenses = kind === 'general'
        ? expensesBetween(project, options.startDate, options.endDate)
        : expensesBetween(project, filteredReportDate, filteredReportDate);
    const materials = kind === 'general'
        ? materialsBetween(project, options.startDate, options.endDate)
        : materialsBetween(project, filteredReportDate, filteredReportDate);
    const preparedBy = authorName(project, options.preparedBy);
    const currency = settings.currency || 'CHF';

    await registerFonts(doc);
    doc.setFont(PDF_FONT, 'normal');
    doc.setTextColor(0, 0, 0);

    let y = drawIntro(doc, project, kind, filteredReports[0], options);
    drawSchedule(doc, project, kind, filteredReports, appointments, preparedBy, y, currency);

    doc.addPage();
    y = REST_CONTENT_TOP;
    y = drawJobs(doc, filteredReports, y);
    y = drawOfferTotal(doc, project, y, currency);
    y = drawOvertime(doc, filteredReports, appointments, kind, y, currency);
    y = drawMaterials(doc, materials, y, currency);
    y = drawExpenses(doc, expenses, y, currency);
    y = drawGrandTotal(doc, project, filteredReports, expenses, materials, y, currency);
    drawApproval(doc, project, filteredReports, preparedBy, y);

    const contentBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(doc.output('arraybuffer'));
    let finalBytes: Uint8Array<ArrayBufferLike> = contentBytes;
    try {
        const bgBytes = await resolveBackgroundBytes(settings);
        if (bgBytes) finalBytes = await applyPdfBackground(contentBytes, bgBytes);
    } catch (err) {
        console.error('PDF background merge failed:', err);
    }

    const safeName = clean(project.projectName).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'proje';
    const suffix = kind === 'general'
        ? `genel-saha-raporu-${options.startDate}-${options.endDate}`
        : `saha-raporu-${filteredReportDate}`;
    downloadPdf(finalBytes, `${safeName}-${suffix}.pdf`);
};

export const exportProjectReportPdf = async (project: ProjectDto, report: any) => {
    await saveReport(project, [report], 'daily');
};

export const exportProjectGeneralReportPdf = async (project: ProjectDto, options: ProjectGeneralReportOptions) => {
    await saveReport(project, project.reports || [], 'general', options);
};
