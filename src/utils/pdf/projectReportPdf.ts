/**
 * ── MODERN GENEL RAPOR (Gesamtrapport) PDF ───────────────────────────────────
 * Tasarım dili `modernReportKit.ts`ten gelir (tenderPdfModern ile aynı kimlik):
 * kod ile çizilen antet/alt bilgi, yumuşak tablo bantları, ince ayraçlar —
 * sablon.pdf arka plan birleştirmesi YOKTUR.
 *  - VERİSİ OLMAYAN BÖLÜM HİÇ ÇİZİLMEZ.
 *  - İmza alanı YALNIZCA müşteri içindir (teknisyen imzası kaldırıldı).
 * Saha raporundan farkı: bu rapor TÜM saha raporlarının imzalı toplamıdır ve
 * tutarları (ek çalışma / ek malzeme / harici gider) İÇERİR. Tutarlar kalem
 * kalem toplanmaz: bölüm toplamı bandı yoktur, en altta TEK blok hâlinde
 * "Zwischensumme" + "Gesamtbetrag" yazar (kullanıcı isteği 19.08.2026).
 */
import { jsPDF } from 'jspdf';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';
import { getReportTranslator, type FixedTranslator } from '../../i18n/reportLanguage';
import {
    CONTENT_W, EMPTY,
    BAND_ROW_H, BAND_ROW_STRONG_H,
    addressLines, clean, dateFmt, dateShort, decoratePages, downloadPdf,
    drawApprovalSection, drawBandRow, drawCover, drawImagesGrid, drawJobList,
    drawModernTable, drawSectionTitle, drawSubTitle, durationFmt, ensureSpace,
    loadBrandAssets, minutesBetween, registerFonts, timeFmt,
    type JobItem, type ModernColumn,
} from './modernReportKit';

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

// ── Biçimleyiciler / veri seçimi (eski üreticiyle birebir aynı mantık) ───────
// İsviçre okunuşu: 1'234.50 (de-DE "1.234,50" veriyordu ve aynı sütun montaj
// raporunda noktalı, genel raporda virgüllü çıkıyordu — kullanıcı isteği).
const numFmt = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const moneyFmt = (value: number | null | undefined, currency: string = 'CHF') => `${currency} ${numFmt(value)}`;

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

// ── Çalışma günleri tablosu — gün yoksa bölüm hiç çizilmez ───────────────────
const drawScheduleTable = (
    doc: jsPDF,
    groups: Array<{ key: string; reports: any[] }>,
    appointments: any[],
    y: number,
    t: FixedTranslator,
    locale: string
): number => {
    if (groups.length === 0) return y;

    y = drawSectionTitle(doc, t('projects.field.pdf.timesTitle'), y);

    const columns: ModernColumn[] = [
        { header: t('projects.general.pdf.colDay'), w: 16, align: 'center', bold: true },
        { header: t('projects.field.pdf.colDate'), w: 44 },
        { header: t('projects.field.pdf.colStart'), w: 34, align: 'right' },
        { header: t('projects.field.pdf.colEnd'), w: 34, align: 'right' },
        { header: t('projects.field.pdf.colDuration'), w: CONTENT_W - 16 - 44 - 34 - 34, align: 'right' },
    ];

    const rows = groups.map((group, index) => {
        const dayAppointments = appointmentsForDate(appointments, group.key);
        const firstReport = group.reports[0];
        const start = group.reports.map((r) => r.startedAt).filter(Boolean).sort()[0]
            || plannedStart(dayAppointments, firstReport);
        const end = group.reports.map((r) => r.endedAt).filter(Boolean).sort().slice(-1)[0]
            || plannedEnd(dayAppointments, firstReport);
        const worked = minutesBetween(start, end);
        return [String(index + 1), dateFmt(group.key, locale), timeFmt(start, locale), timeFmt(end, locale), durationFmt(worked, t)];
    });

    return drawModernTable(doc, columns, rows, y) + 6;
};

// ── Yapılan işler (günlere göre gruplu) — iş yoksa bölüm hiç çizilmez ────────
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

const jobsFromReports = (reports: any[]): JobItem[] => {
    const jobs: JobItem[] = [];
    reports.forEach((report) => {
        const rawItems: any[] = Array.isArray(report.operationsDoneItems) && report.operationsDoneItems.length > 0
            ? report.operationsDoneItems
            : clean(report.operationsDone).split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
        const note = clean(report.technicalNotes);
        if (rawItems.length === 0 && note) {
            jobs.push({ title: dateFmt(reportDate(report)), body: EMPTY, note });
            return;
        }
        rawItems.forEach((item, idx) => {
            const job = splitJobItem(item);
            jobs.push({ ...job, note: idx === rawItems.length - 1 ? note || undefined : undefined });
        });
    });
    return jobs;
};

const drawJobs = (
    doc: jsPDF,
    kind: ReportKind,
    groups: Array<{ key: string; reports: any[] }>,
    y: number,
    t: FixedTranslator,
    locale: string
): number => {
    const hasAny = groups.some((g) => jobsFromReports(g.reports).length > 0);
    if (!hasAny) return y;

    y = drawSectionTitle(doc, t('projects.field.pdf.jobsTitle'), y);

    groups.forEach((group, gi) => {
        const jobs = jobsFromReports(group.reports);
        if (jobs.length === 0) return;
        if (kind === 'general' && groups.length > 1) {
            // Gün ara başlığı — BÖLÜM İÇİ grup başlığı (basamak 3). Eskiden
            // toplam bandıyla aynı görünüyordu; artık zeminsiz alt başlık.
            y = drawSubTitle(doc, t('projects.general.pdf.dayHeading', { n: gi + 1 }), dateFmt(group.key, locale), y);
            y += 1;
        }
        y = drawJobList(doc, jobs, y, t('projects.field.pdf.technicalNote'));
        y += 2;
    });

    return y + 4;
};

// ── Ek çalışmalar — tutar yoksa bölüm hiç çizilmez ───────────────────────────
const drawOvertime = (
    doc: jsPDF,
    groups: Array<{ key: string; reports: any[] }>,
    appointments: any[],
    project: ProjectDto,
    currency: string,
    y: number,
    t: FixedTranslator,
    locale: string
): { y: number; total: number } => {
    const rows: string[][] = [];
    let total = 0;
    groups.forEach((group) => {
        const dayAppointments = appointmentsForDate(appointments, group.key);
        const planned = plannedMinutesFor(group.reports, dayAppointments);
        const max = Math.ceil(planned * 1.15);
        const rate = overtimeRateFor(group.reports, project);
        const cost = group.reports.reduce((sum, r) => sum + (Number(r.overtimeCost) || 0), 0);
        total += cost;
        if (cost > 0) {
            rows.push([
                dateFmt(group.key, locale),
                durationFmt(planned, t),
                durationFmt(max, t),
                moneyFmt(rate, currency),
                moneyFmt(cost, currency),
            ]);
        }
    });
    if (rows.length === 0 || total <= 0) return { y, total: 0 };

    y = drawSectionTitle(doc, t('projects.general.pdf.overtimeTitle'), y);
    const columns: ModernColumn[] = [
        { header: t('projects.field.pdf.colDate'), w: 30 },
        { header: t('projects.general.pdf.plannedHours'), w: 36, align: 'right' },
        { header: t('projects.general.pdf.maxHours'), w: 36, align: 'right' },
        { header: t('projects.general.pdf.hourlyRate'), w: 38, align: 'right' },
        { header: t('projects.general.pdf.overtimeAmount'), w: CONTENT_W - 30 - 36 - 36 - 38, align: 'right' },
    ];
    // Bölüm toplamı bandı KALDIRILDI (kullanıcı isteği 19.08.2026): genel rapor
    // tutarları kalem kalem toplamaz — tek toplam bloğu belgenin en altındadır.
    y = drawModernTable(doc, columns, rows, y);
    return { y: y + 6, total };
};

// ── Malzeme & giderler: TEK tablo, grup bantlı (kullanıcı isteği) ────────────
// Gruplar anlamı taşır: "Verwendete Materialien" teklife dahildir (tutar yok),
// "Zusatzmaterial" ve "Externe Kosten" faturalanır — ayrı "dahil mi?" sütununa
// gerek kalmaz.
const materialName = (item: any, t: FixedTranslator) =>
    item?.material?.name || item?.article?.name || item?.name || clean(item?.description) || t('projects.field.pdf.materialFallback');

const drawResources = (
    doc: jsPDF,
    usedMaterials: any[],
    extraMaterials: any[],
    expenses: any[],
    currency: string,
    y: number,
    t: FixedTranslator,
    locale: string
): { y: number; extraTotal: number; expenseTotal: number } => {
    if (usedMaterials.length === 0 && extraMaterials.length === 0 && expenses.length === 0) {
        return { y, extraTotal: 0, expenseTotal: 0 };
    }

    // DÜZ tek tablo (kullanıcı isteği — grup bandı yok): satır türü ilk sütunda.
    y = drawSectionTitle(doc, t('projects.field.pdf.resourcesTitle'), y);

    // Sütun düzeni MONTAJ RAPORUYLA BİREBİR aynıdır (kullanıcı isteği).
    const columns: ModernColumn[] = [
        { header: t('projects.field.pdf.colType'), w: 32 },
        { header: t('projects.field.pdf.materialName'), w: 46 },
        { header: t('projects.field.pdf.expenseDescription'), w: CONTENT_W - 32 - 46 - 22 - 16 - 28 },
        { header: t('projects.field.pdf.colDate'), w: 22, align: 'right' },
        { header: t('projects.field.pdf.colQty'), w: 16, align: 'right' },
        { header: t('common.amount'), w: 28, align: 'right' },
    ];

    let extraTotal = 0;
    const extraRows = extraMaterials.map((item) => {
        const amount = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        extraTotal += amount;
        return [t('projects.field.pdf.extraMaterials'), String(materialName(item, t)), clean(item.description) || EMPTY, EMPTY, String(Number(item.quantity) || 0), moneyFmt(amount, currency)];
    });
    let expenseTotal = 0;
    const expenseRows = expenses.map((expense) => {
        const amount = Number(expense.amount) || 0;
        expenseTotal += amount;
        return [t('projects.field.pdf.expensesTitle'), clean(expense.expenseType) || EMPTY, clean(expense.description) || EMPTY, dateFmt(expense.expenseDate, locale), EMPTY, moneyFmt(amount, currency)];
    });
    // Kullanılan malzeme projeye bedel yazmaz; tutar boş değil, açıkça 0
    // basılır — montaj raporundaki okunuşun aynısı.
    const usedRows = usedMaterials.map((item) => [
        t('projects.field.pdf.usedMaterials'), String(materialName(item, t)), clean(item.description) || EMPTY, EMPTY,
        String(Number(item.quantity ?? item.qty) || 0) || EMPTY, moneyFmt(0, currency),
    ]);

    // Tür sütunu montaj raporundaki gibi birleşiktir: etiket bir kez yazılır.
    // Kalem bazlı ara toplam bantları KALDIRILDI (kullanıcı isteği 19.08.2026);
    // tutarlar yalnızca en alttaki tek toplam bloğunda özetlenir.
    y = drawModernTable(doc, columns, [...usedRows, ...extraRows, ...expenseRows], y, { mergeFirstColumn: true });

    return { y: y + 6, extraTotal, expenseTotal };
};

// ── Görseller — yoksa bölüm hiç çizilmez ─────────────────────────────────────
const drawImages = (doc: jsPDF, reports: any[], y: number, t: FixedTranslator): number => {
    const images: string[] = [];
    reports.forEach((report) => {
        if (Array.isArray(report.images)) {
            report.images.forEach((img: any) => {
                const data = img?.imageData || img?.url || img?.imageUrl;
                if (data) images.push(String(data));
            });
        }
    });
    if (images.length === 0) return y;

    y = drawSectionTitle(doc, t('projects.field.pdf.imagesTitle'), y);
    return drawImagesGrid(doc, images, y);
};

// ── Rapor üretimi ────────────────────────────────────────────────────────────
const saveReport = async (
    project: ProjectDto,
    reports: any[],
    kind: ReportKind,
    options: ProjectGeneralReportOptions = {}
) => {
    const settings = getPdfSettings();
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
    const usedMaterials: any[] = [];
    filteredReports.forEach((report) => {
        if (Array.isArray(report.usedMaterials)) usedMaterials.push(...report.usedMaterials);
        else if (Array.isArray(report.materials)) usedMaterials.push(...report.materials);
    });
    const preparedBy = authorName(project, options.preparedBy);
    const currency = settings.currency || 'CHF';

    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);

    // Rapor, müşterinin tercih ettiği yazışma dilinde üretilir.
    const { t, locale } = await getReportTranslator(project.customer?.language);

    const reportNo = reportNumber(project, filteredReports[0], kind, options.endDate);
    // Kommission = teklifin Kommissionsnummer'ı; yoksa teklif numarası/kimliği.
    const commission = clean(project.tender?.commissionNumber)
        || (project.tender?.tenderNumber ? project.tender.tenderNumber : clean(project.tenderId));
    const titleWord = kind === 'general' ? t('projects.general.pdf.title') : t('projects.field.pdf.title');
    const coverDate = kind === 'general' ? dateShort(new Date()) : dateShort(reportDate(filteredReports[0]));
    const groups = scheduleGroupsFor(kind, filteredReports);

    // İçerik tek akış hâlinde dizilir; her bölüm verisi varsa kendini çizer.
    let y = drawCover(doc, {
        rows: [
            { label: t('projects.field.pdf.reportNo'), value: reportNo, emphasize: true },
            { label: t('projects.field.pdf.commission'), value: commission },
            { label: t('projects.field.pdf.executionDate'), value: coverDate },
            { label: t('projects.field.pdf.reportDate'), value: coverDate },
            { label: t('projects.field.pdf.technician'), value: preparedBy },
        ],
        settings,
        recipientName: clean(project.customer?.companyName) || clean(project.customerId),
        recipientLines: addressLines(project.customer?.address),
        // Yalnızca rapor adı — numara kapak kartında (bkz. fieldReportPdf).
        title: titleWord,
        numberedSections: true,
    });

    y = drawScheduleTable(doc, groups, appointments, y, t, locale);
    y = drawJobs(doc, kind, groups, y, t, locale);
    const overtime = drawOvertime(doc, groups, appointments, project, currency, y, t, locale);
    y = overtime.y;
    const resources = drawResources(doc, usedMaterials, extraMaterials, expenses, currency, y, t, locale);
    y = resources.y;

    // Belgenin TEK toplam bloğu (kullanıcı isteği 19.08.2026): kalem kalem
    // dökülmez, yalnızca ara toplam + genel toplam yazılır. Yalnızca
    // faturalanacak bir tutar gerçekten varsa çizilir ve blok bölünmez.
    const grandTotal = overtime.total + resources.extraTotal + resources.expenseTotal;
    if (grandTotal > 0) {
        y = ensureSpace(doc, y, BAND_ROW_H + BAND_ROW_STRONG_H + 3);
        y = drawBandRow(doc, t('projects.general.pdf.subtotal'), moneyFmt(grandTotal, currency), y);
        y = drawBandRow(doc, t('projects.field.pdf.grandTotal'), moneyFmt(grandTotal, currency), y + 1, true);
        y += 6;
    }

    y = drawImages(doc, filteredReports, y, t);

    // İmzaları toplamın kapsadığı EN SON imzalı saha raporundan alırız.
    const lastSigned = [...filteredReports].reverse();
    const signature = lastSigned.find((r) => r?.customerSignature)?.customerSignature;
    const technicianReport = lastSigned.find((r: any) => r?.technicianSignature);
    const technicianName = technicianReport?.employee
        ? `${technicianReport.employee.firstName || ''} ${technicianReport.employee.lastName || ''}`.trim()
        : preparedBy;
    drawApprovalSection(doc, {
        title: t('projects.field.pdf.approvalTitle'),
        confirmText: t('projects.general.pdf.approvalConfirm'),
        signers: [
            {
                roleLabel: t('projects.field.pdf.technicianRole'),
                name: clean(technicianName) || EMPTY,
                dateLabel: t('projects.field.pdf.date'),
                dateText: technicianReport?.technicianSignedAt
                    ? dateFmt(technicianReport.technicianSignedAt, locale)
                    : dateFmt(reportDate(filteredReports[0]), locale),
                signatureLabel: t('projects.field.pdf.signature'),
                signatureData: technicianReport?.technicianSignature,
            },
            {
                roleLabel: t('projects.field.pdf.customerRole'),
                name: clean(project.customer?.companyName) || EMPTY,
                dateLabel: t('projects.field.pdf.date'),
                dateText: dateFmt(reportDate(filteredReports[0]), locale),
                signatureLabel: t('projects.field.pdf.signature'),
                signatureData: signature,
            },
        ],
    }, y);

    decoratePages(doc, assets, settings, t);

    const finalBytes = new Uint8Array(doc.output('arraybuffer'));

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
