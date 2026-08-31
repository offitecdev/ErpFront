/**
 * ── MODERN SAHA RAPORU (Montage-Rapport) PDF ─────────────────────────────────
 * Tasarım dili `modernReportKit.ts`ten gelir (tenderPdfModern ile aynı kimlik).
 *  - VERİSİ OLMAYAN BÖLÜM HİÇ ÇİZİLMEZ.
 *  - İmza alanı İKİ karttır: solda teknisyen, sağda müşteri.
 * Tek para alanı kaynaklar tablosunun "Betrag" sütunudur: kullanılan malzeme
 * daima 0, ek malzeme ve harici gider kendi tutarını taşır (kullanıcı isteği).
 * Tablonun altında ÜÇ toplam bandı durur: Total Zusatzmaterial, Total externe
 * Kosten ve Gesamtbetrag (yalnızca tutarı olanlar çizilir).
 */
import { jsPDF } from 'jspdf';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';
import { getReportTranslator, type FixedTranslator } from '../../i18n/reportLanguage';
import {
    BAND_ROW_H, BAND_ROW_STRONG_H, CONTENT_W, EMPTY, MR,
    addressLines, clean, dateFmt, dateShort, decoratePages, downloadPdf,
    drawApprovalSection, drawBandRow, drawCover, drawImagesGrid, drawJobList,
    drawModernTable, drawNoteBlock, drawSectionTitle, durationFmt, ensureSpace,
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
    // Überzeit bandı tablosundan kopmasın diye son satırla birlikte ölçülür.
    y = drawModernTable(doc, columns, rows, y, {
        reserveAfter: facts.overtimeMin > 0 ? BAND_ROW_H + (facts.maxMin > 0 ? 6 : 1) : 0,
    });

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

    // Teknik not: liste sonunda, artık yumuşak bir not kartında (daha derli
    // toplu görünüm — kullanıcı isteği).
    if (note) y = drawNoteBlock(doc, `${t('projects.field.pdf.technicalNote')}: ${note}`, y + 2);

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
    const currency = getPdfSettings().currency || 'CHF';
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
    // Sütun düzeni GENEL RAPORLA BİREBİR aynıdır (kullanıcı isteği 19.08.2026):
    // Typ | Bezeichnung | Beschreibung | Datum | Menge | Betrag. Tutar en sağda
    // durur ki toplam satırının değeriyle aynı hizaya gelsin.
    const columns: ModernColumn[] = [
        { header: t('projects.field.pdf.colType'), w: 32 },
        { header: t('projects.field.pdf.materialName'), w: 46 },
        { header: t('projects.field.pdf.expenseDescription'), w: CONTENT_W - 32 - 46 - 22 - 16 - 28 },
        { header: t('projects.field.pdf.colDate'), w: 22, align: 'right' },
        { header: t('projects.field.pdf.colQty'), w: 16, align: 'right' },
        { header: t('common.amount'), w: 28, align: 'right' },
    ];
    // Kullanılan malzeme projeye BEDEL YAZMAZ — tutarı boş değil, açıkça 0
    // basılır (kullanıcı isteği); ek malzeme ve harici gider kendi tutarını yazar.
    const usedRow = (item: any) =>
        [t('projects.field.pdf.usedMaterials'), String(materialName(item, t)), clean(item?.description) || EMPTY, EMPTY, materialQty(item), moneyFmt(0)];
    const extraRow = (item: any) =>
        [
            t('projects.field.pdf.extraMaterials'),
            String(materialName(item, t)),
            clean(item?.description) || EMPTY,
            EMPTY,
            materialQty(item),
            moneyFmt((Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0)),
        ];
    const rows = [
        ...usedMaterials.map(usedRow),
        ...extraMaterials.map(extraRow),
        ...expenses.map((expense) => [
            t('projects.field.pdf.expensesTitle'),
            clean(expense?.expenseType) || EMPTY,
            // Harici giderin açıklaması kaldırıldı (kullanıcı isteği).
            EMPTY,
            dateFmt(expense?.expenseDate, locale),
            EMPTY,
            moneyFmt(Number(expense?.amount) || 0),
        ]),
    ];
    // Toplamlar (kullanıcı isteği 19.08.2026): kullanılan malzeme projeye bedel
    // yazmadığı (tutarı 0) için toplama girmez — yalnızca ek malzeme ve harici
    // gider faturalanır, genel toplam bu ikisinin toplamıdır.
    const extraTotal = extraMaterials.reduce(
        (sum: number, item: any) => sum + (Number(item?.quantity) || 0) * (Number(item?.unitPrice) || 0),
        0,
    );
    const expenseTotal = expenses.reduce((sum: number, expense: any) => sum + (Number(expense?.amount) || 0), 0);
    const grandTotal = extraTotal + expenseTotal;

    // Tür sütunu birleşik: "Verwendet" bir kez yazılır, malzemeler yanında
    // tek tek listelenir. Ardından gelecek toplam bantları için yer ayrılır ki
    // toplamlar tablodan kopup boş sayfada kalmasın.
    const bandCount = (extraTotal > 0 ? 1 : 0) + (expenseTotal > 0 ? 1 : 0);
    const reserveAfter = grandTotal > 0 ? bandCount * (BAND_ROW_H + 1) + BAND_ROW_STRONG_H + 1 : 0;
    y = drawModernTable(doc, columns, rows, y, { mergeFirstColumn: true, reserveAfter });
    if (extraTotal > 0) y = drawBandRow(doc, t('projects.field.pdf.extraMaterialTotal'), moneyFmt(extraTotal), y + 1);
    if (expenseTotal > 0) y = drawBandRow(doc, t('projects.field.pdf.expenseTotal'), moneyFmt(expenseTotal), y + 1);
    if (grandTotal > 0) y = drawBandRow(doc, t('projects.field.pdf.grandTotal'), moneyFmt(grandTotal), y + 1, true);
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
    const settings = getPdfSettings();
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
        // Belge başlığı yalnızca RAPOR ADIDIR; numara kapak kartındaki
        // "Rapport-Nr." satırında durur — üç rapor türünde de aynı okunuş
        // (kullanıcı isteği 19.08.2026).
        title: t('projects.field.pdf.title'),
        numberedSections: true,
    });
    y = drawTimes(doc, report, { apptStart, apptEnd, plannedMin, workedMin, maxMin, overtimeMin }, y, t, locale);
    y = drawJobs(doc, report, y, t);
    y = drawResources(doc, usedMaterials, extraMaterials, expenses, y, t, locale);
    y = drawImages(doc, report, y, t);
    drawApprovalSection(doc, {
        title: t('projects.field.pdf.approvalTitle'),
        confirmText: t('projects.field.pdf.approvalConfirm'),
        signers: [
            {
                roleLabel: t('projects.field.pdf.technicianRole'),
                name: preparedBy || EMPTY,
                dateLabel: t('projects.field.pdf.date'),
                dateText: report?.technicianSignedAt ? dateFmt(report.technicianSignedAt, locale) : dateFmt(reportWorkDate(report), locale),
                signatureLabel: t('projects.field.pdf.signature'),
                signatureData: report?.technicianSignature,
            },
            {
                roleLabel: t('projects.field.pdf.customerRole'),
                name: clean(project.customer?.companyName) || EMPTY,
                dateLabel: t('projects.field.pdf.date'),
                dateText: dateFmt(report?.signedAt || reportWorkDate(report), locale),
                signatureLabel: t('projects.field.pdf.signature'),
                signatureData: report?.customerSignature,
            },
        ],
    }, y);

    decoratePages(doc, assets, settings, t);

    const finalBytes = new Uint8Array(doc.output('arraybuffer'));

    if (options.output === 'blob') {
        return new Blob([new Uint8Array(finalBytes)], { type: 'application/pdf' });
    }
    const safeName = clean(project.projectName).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'proje';
    const dateLabel = dateShort(reportWorkDate(report)).replace(/\./g, '-');
    downloadPdf(finalBytes, `${safeName}-saha-raporu-${dateLabel}.pdf`);
    return null;
};
