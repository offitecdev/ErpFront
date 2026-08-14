/**
 * ── MODERN SAHA RAPORU (Montage-Rapport) PDF ─────────────────────────────────
 * Tasarım dili `modernReportKit.ts`ten gelir (tenderPdfModern ile aynı kimlik).
 *  - VERİSİ OLMAYAN BÖLÜM HİÇ ÇİZİLMEZ.
 *  - İmza alanı YALNIZCA müşteri içindir (teknisyen imzası kaldırıldı).
 * Tek para alanı kaynaklar tablosunun "Betrag" sütunudur: kullanılan malzeme
 * daima 0, ek malzeme ve harici gider kendi tutarını taşır (kullanıcı isteği).
 */
import { jsPDF } from 'jspdf';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';
import { getReportTranslator, type FixedTranslator } from '../../i18n/reportLanguage';
import {
    CONTENT_W, EMPTY, ML, MR,
    addressLines, clean, dateFmt, dateShort, decoratePages, downloadPdf,
    drawApprovalSection, drawBandRow, drawCover, drawImagesGrid, drawJobList,
    drawModernTable, drawSectionTitle, durationFmt, ensureSpace,
    loadBrandAssets, minutesBetween, registerFonts, timeFmt,
    COLOR_MUTED, FONT, type JobItem, type ModernColumn,
} from './modernReportKit';

export interface FieldReportOptions {
    appointment?: { startTime?: string | null; endTime?: string | null } | null;
    preparedBy?: string;
    /** 'blob' returns the PDF for in-app preview instead of downloading it. */
    output?: 'download' | 'blob';
}

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

// ── Çalışma saatleri: Geplant / Erfasst satırlı tablo + Überzeit bandı ───────
interface TimeFacts {
    apptStart?: string | null;
    apptEnd?: string | null;
    plannedMin: number;
    workedMin: number;
    maxMin: number;
    overtimeMin: number;
}

function drawTimes(doc: jsPDF, report: any, facts: TimeFacts, y: number, t: FixedTranslator, locale: string): number {
    const hasPlanned = Boolean(facts.apptStart || facts.apptEnd) || facts.plannedMin > 0;
    const hasActual = Boolean(report?.startedAt || report?.endedAt) || facts.workedMin > 0;
    if (!hasPlanned && !hasActual) return y;

    y = drawSectionTitle(doc, t('projects.field.pdf.timesTitle'), y);

    const columns: ModernColumn[] = [
        { header: '', w: 40, bold: true },
        { header: t('projects.field.pdf.colDate'), w: 44 },
        { header: t('projects.field.pdf.colStart'), w: 32, align: 'right' },
        { header: t('projects.field.pdf.colEnd'), w: 32, align: 'right' },
        { header: t('projects.field.pdf.colDuration'), w: CONTENT_W - 40 - 44 - 32 - 32, align: 'right' },
    ];
    const rows: string[][] = [];
    if (hasPlanned) {
        rows.push([
            t('projects.field.pdf.rowPlanned'),
            dateFmt(facts.apptStart || reportWorkDate(report), locale),
            timeFmt(facts.apptStart, locale),
            timeFmt(facts.apptEnd, locale),
            facts.plannedMin > 0 ? durationFmt(facts.plannedMin, t) : EMPTY,
        ]);
    }
    if (hasActual) {
        rows.push([
            t('projects.field.pdf.rowActual'),
            dateFmt(report?.startedAt || reportWorkDate(report), locale),
            timeFmt(report?.startedAt, locale),
            timeFmt(report?.endedAt, locale),
            facts.workedMin > 0 ? durationFmt(facts.workedMin, t) : EMPTY,
        ]);
    }
    y = drawModernTable(doc, columns, rows, y);

    // Überzeit bandı yalnızca gerçekten ek çalışma varken görünür.
    if (facts.overtimeMin > 0) {
        y = drawBandRow(doc, t('projects.field.pdf.overtimeLabel'), durationFmt(facts.overtimeMin, t), y + 1);
        if (facts.maxMin > 0) {
            y = ensureSpace(doc, y, 6);
            doc.setFont(FONT, 'italic');
            doc.setFontSize(7.6);
            doc.setTextColor(...COLOR_MUTED);
            doc.text(`${t('projects.field.pdf.maxApprovedHours')}: ${durationFmt(facts.maxMin, t)}`, MR, y + 3.6, { align: 'right' });
            doc.setFont(FONT, 'normal');
            y += 5;
        }
    }

    return y + 6;
}

// ── Yapılan işler ────────────────────────────────────────────────────────────
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

const jobsFromReport = (report: any): JobItem[] => {
    const rawItems: any[] = Array.isArray(report?.operationsDoneItems) && report.operationsDoneItems.length > 0
        ? report.operationsDoneItems
        : clean(report?.operationsDone).split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    return rawItems.map(splitJobItem);
};

function drawJobs(doc: jsPDF, report: any, y: number, t: FixedTranslator): number {
    const jobs = jobsFromReport(report);
    const note = clean(report?.technicalNotes);
    if (jobs.length === 0 && !note) return y;

    y = drawSectionTitle(doc, t('projects.field.pdf.jobsTitle'), y);
    y = drawJobList(doc, jobs, y, t('projects.field.pdf.technicalNote'));

    // Teknik not: liste sonunda, italik ve soluk — yalnızca doluysa.
    if (note) {
        doc.setFont(FONT, 'italic');
        doc.setFontSize(8.4);
        doc.setTextColor(...COLOR_MUTED);
        const noteLines = doc.splitTextToSize(`${t('projects.field.pdf.technicalNote')}: ${note}`, CONTENT_W - 2) as string[];
        y = ensureSpace(doc, y, noteLines.length * 4 + 4);
        doc.text(noteLines, ML + 1, y + 3.4);
        y += noteLines.length * 4 + 3;
        doc.setFont(FONT, 'normal');
    }

    return y + 5;
}

// ── Malzeme & giderler: TEK tablo, grup bantlı (kullanıcı isteği) ────────────
const materialName = (item: any, t: FixedTranslator) =>
    item?.material?.name || item?.article?.name || item?.name || clean(item?.description) || t('projects.field.pdf.materialFallback');
const materialQty = (item: any) => {
    const qty = Number(item?.quantity ?? item?.qty ?? 0);
    return qty > 0 ? String(qty) : EMPTY;
};

/** Kaynaklar tablosunun tutar sütunu — para birimi ayarlardan gelir. */
const moneyFmt = (value: number) => {
    const currency = usePdfSettingsStore.getState().settings.currency || 'CHF';
    return `${currency} ${new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
};

function drawResources(
    doc: jsPDF,
    usedMaterials: any[],
    extraMaterials: any[],
    expenses: any[],
    y: number,
    t: FixedTranslator,
    locale: string
): number {
    if (usedMaterials.length === 0 && extraMaterials.length === 0 && expenses.length === 0) return y;

    // DÜZ tek tablo (kullanıcı isteği — grup bandı yok): her satırın türü
    // ("Verwendet" / "Zusatzmaterial" / "Externe Kosten") ilk sütunda yazar —
    // ekran editörüyle birebir aynı düzen.
    y = drawSectionTitle(doc, t('projects.field.pdf.resourcesTitle'), y);
    const columns: ModernColumn[] = [
        { header: t('projects.field.pdf.colType'), w: 32 },
        { header: t('projects.field.pdf.materialName'), w: 46 },
        { header: t('projects.field.pdf.expenseDescription'), w: CONTENT_W - 32 - 46 - 14 - 24 - 22 },
        { header: t('projects.field.pdf.colQty'), w: 14, align: 'right' },
        { header: t('common.amount'), w: 24, align: 'right' },
        { header: t('projects.field.pdf.colDate'), w: 22, align: 'right' },
    ];
    // Kullanılan malzeme projeye BEDEL YAZMAZ — tutarı boş değil, açıkça 0
    // basılır (kullanıcı isteği); ek malzeme ve harici gider kendi tutarını yazar.
    const usedRow = (item: any) =>
        [t('projects.field.pdf.usedMaterials'), String(materialName(item, t)), clean(item?.description) || EMPTY, materialQty(item), moneyFmt(0), EMPTY];
    const extraRow = (item: any) =>
        [
            t('projects.field.pdf.extraMaterials'),
            String(materialName(item, t)),
            clean(item?.description) || EMPTY,
            materialQty(item),
            moneyFmt((Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0)),
            EMPTY,
        ];
    const rows = [
        ...usedMaterials.map(usedRow),
        ...extraMaterials.map(extraRow),
        ...expenses.map((expense) => [
            t('projects.field.pdf.expensesTitle'),
            clean(expense?.expenseType) || EMPTY,
            // Harici giderin açıklaması kaldırıldı (kullanıcı isteği).
            EMPTY,
            EMPTY,
            moneyFmt(Number(expense?.amount) || 0),
            dateFmt(expense?.expenseDate, locale),
        ]),
    ];
    // Tür sütunu birleşik: "Verwendet" bir kez yazılır, malzemeler yanında
    // tek tek listelenir.
    y = drawModernTable(doc, columns, rows, y, { mergeFirstColumn: true });
    return y + 6;
}

function drawImages(doc: jsPDF, report: any, y: number, t: FixedTranslator): number {
    const images: string[] = [];
    if (Array.isArray(report?.images)) {
        report.images.forEach((img: any) => {
            const data = img?.imageData || img?.url || img?.imageUrl;
            if (data) images.push(String(data));
        });
    }
    if (images.length === 0) return y;

    y = drawSectionTitle(doc, t('projects.field.pdf.imagesTitle'), y);
    return drawImagesGrid(doc, images, y);
}

// ── Saha raporu üretimi ──────────────────────────────────────────────────────
export const exportFieldReportPdf = async (project: ProjectDto, report: any, options: FieldReportOptions = {}) => {
    const settings = usePdfSettingsStore.getState().settings;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const preparedBy = authorName(project, report, options.preparedBy);

    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);

    // Rapor, müşterinin tercih ettiği yazışma dilinde üretilir.
    const { t, locale } = await getReportTranslator(project.customer?.language);

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
    const overtimeMin = Math.max(0, workedMin - plannedMin);

    const reportNo = reportNumber(project, report);
    // Kommission = teklifin Kommissionsnummer'ı. Girilmemişse eskiden olduğu gibi
    // teklif numarasına, o da yoksa teklif kimliğine düşer.
    const commission = clean(project.tender?.commissionNumber)
        || (project.tender?.tenderNumber ? project.tender.tenderNumber : clean(project.tenderId));

    // İçerik tek akış hâlinde dizilir; her bölüm verisi varsa kendini çizer.
    let y = drawCover(doc, {
        rows: [
            { label: t('projects.field.pdf.reportNo'), value: reportNo, emphasize: true },
            { label: t('projects.field.pdf.commission'), value: commission },
            { label: t('projects.field.pdf.executionDate'), value: dateShort(reportWorkDate(report)) },
            { label: t('projects.field.pdf.reportDate'), value: dateShort(report?.reportDate || reportWorkDate(report)) },
            { label: t('projects.field.pdf.technician'), value: preparedBy },
        ],
        settings,
        recipientName: clean(project.customer?.companyName) || clean(project.customerId),
        recipientLines: addressLines(project.customer?.address),
        title: `${t('projects.field.pdf.title')} ${reportNo}`,
    });
    y = drawTimes(doc, report, { apptStart, apptEnd, plannedMin, workedMin, maxMin, overtimeMin }, y, t, locale);
    y = drawJobs(doc, report, y, t);
    y = drawResources(doc, usedMaterials, extraMaterials, expenses, y, t, locale);
    y = drawImages(doc, report, y, t);
    drawApprovalSection(doc, {
        title: t('projects.field.pdf.approvalTitle'),
        confirmText: t('projects.field.pdf.approvalConfirm'),
        roleLabel: t('projects.field.pdf.customerRole'),
        customerName: clean(project.customer?.companyName) || EMPTY,
        dateLabel: t('projects.field.pdf.date'),
        dateText: dateFmt(reportWorkDate(report), locale),
        signatureLabel: t('projects.field.pdf.signature'),
        signatureData: report?.customerSignature,
    }, y);

    decoratePages(doc, assets, settings, t);

    const finalBytes = new Uint8Array(doc.output('arraybuffer'));

    if (options.output === 'blob') {
        return new Blob([new Uint8Array(finalBytes)], { type: 'application/pdf' });
    }
    const safeName = clean(project.projectName).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'proje';
    const dateLabel = dateShort(reportWorkDate(report)).replace(/[^0-9-]/g, '');
    downloadPdf(finalBytes, `${safeName}-saha-raporu-${dateLabel}.pdf`);
    return null;
};
