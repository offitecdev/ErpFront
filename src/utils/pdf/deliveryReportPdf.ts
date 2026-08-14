/**
 * ── MODERN TESLİM RAPORU (Übergabe-/Abnahme-Rapport) PDF ─────────────────────
 * Tasarım dili `modernReportKit.ts`ten gelir (tenderPdfModern ile aynı kimlik):
 * kod ile çizilen antet/alt bilgi, yumuşak tablo bantları, ince ayraçlar —
 * sablon.pdf arka plan birleştirmesi YOKTUR.
 *  - VERİSİ OLMAYAN BÖLÜM HİÇ ÇİZİLMEZ (not/görsel/checklist boşsa atlanır).
 *  - İmza alanı YALNIZCA müşteri içindir (teknisyen imzası kaldırıldı).
 */
import { jsPDF } from 'jspdf';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';
import type { DeliveryReportDto, DeliveryResponseItem } from '../../lib/api/project';
import { getReportTranslator, type FixedTranslator } from '@/i18n/reportLanguage';
import {
    CONTENT_W, EMPTY, ML,
    addressLines, clean, dateFmt, dateShort, decoratePages, downloadPdf,
    drawApprovalSection, drawBandRow, drawCover, drawImagesGrid,
    drawModernTable, drawSectionTitle, ensureSpace,
    loadBrandAssets, registerFonts,
    COLOR_TEXT, FONT, FS_BASE, LH_BODY, type ModernColumn,
} from './modernReportKit';

// ── Checklist: kategori bandı + modern durum tablosu ─────────────────────────
const drawResponses = (doc: jsPDF, report: DeliveryReportDto, responses: DeliveryResponseItem[], y: number, t: FixedTranslator): number => {
    if (responses.length === 0) return y;

    y = drawSectionTitle(doc, t('projects.delivery.checklist'), y);

    // Kontrol maddesi açıklamasına OLABİLDİĞİNCE geniş alan: durum sütunları
    // dar tutulur (kullanıcı isteği — "madde açıklama alanı çok küçüktü").
    const columns: ModernColumn[] = [
        { header: t('projects.delivery.pdf.colStep'), w: 90 },
        { header: t('projects.delivery.yes'), w: 11, align: 'center' },
        { header: t('projects.delivery.no'), w: 11, align: 'center' },
        { header: t('projects.delivery.na'), w: 15, align: 'center' },
        { header: t('projects.delivery.pdf.colMeasurement'), w: CONTENT_W - 90 - 11 - 11 - 15 },
    ];

    // Her kontrol listesi kendi adıyla (kategori = liste adı) yumuşak bir bantla
    // açılır; düz listelerde kategori boş kalır ve liste adına düşer. Ek alt
    // başlık YOKTUR (kullanıcı isteği).
    const catOf = (r: DeliveryResponseItem) =>
        r.category?.trim() || report.checklistName || t('projects.delivery.uncategorized');
    const categories: string[] = [];
    for (const r of responses) {
        const key = catOf(r);
        if (!categories.includes(key)) categories.push(key);
    }

    const mark = (on: boolean) => (on ? 'X' : '');
    for (const category of categories) {
        const items = responses.filter((r) => catOf(r) === category);
        if (items.length === 0) continue;
        y = ensureSpace(doc, y, 30);
        y = drawBandRow(doc, category, '', y);
        y += 1;
        const rows = items.map((item) => [
            clean(item.label) || EMPTY,
            mark(item.status === 'YES'),
            mark(item.status === 'NO'),
            mark(item.status === 'NA'),
            clean(item.measurement),
        ]);
        y = drawModernTable(doc, columns, rows, y);
        y += 3;
    }

    return y + 3;
};

// ── Notlar — boşsa bölüm hiç çizilmez ────────────────────────────────────────
const drawNotes = (doc: jsPDF, notes: string | null | undefined, y: number, t: FixedTranslator): number => {
    const text = clean(notes);
    if (!text) return y;

    y = drawSectionTitle(doc, t('projects.delivery.notes'), y);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    const lines = doc.splitTextToSize(text, CONTENT_W - 2) as string[];
    y = ensureSpace(doc, y, Math.min(lines.length, 4) * (LH_BODY + 0.2) + 6);
    doc.text(lines, ML + 1, y + 3.6);
    return y + lines.length * (LH_BODY + 0.2) + 8;
};

export interface DeliveryReportPdfParams {
    report: DeliveryReportDto;
    project?: ProjectDto | null;
    fieldImages?: Array<{ imageData: string }>;
    preparedBy?: string;
    /** 'blob' returns the PDF for in-app preview instead of downloading it. */
    output?: 'download' | 'blob';
}

export const exportDeliveryReportPdf = async ({ report, project, fieldImages = [], preparedBy = '', output }: DeliveryReportPdfParams) => {
    const settings = usePdfSettingsStore.getState().settings;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);

    // Render the whole report in the customer's correspondence language.
    const { t, locale } = await getReportTranslator(project?.customer?.language);

    let y = drawCover(doc, {
        rows: [
            { label: t('projects.delivery.pdf.reportNo'), value: clean(report.id).toUpperCase(), emphasize: true },
            // Kommissionsnummer; girilmemişse proje adı (eski davranış).
            { label: t('projects.delivery.pdf.commission'), value: clean(project?.tender?.commissionNumber) || clean(project?.projectName) },
            { label: t('projects.delivery.pdf.executionDate'), value: dateShort(report.sentAt || report.createdAt) },
            { label: t('projects.delivery.pdf.reportDate'), value: dateShort(report.createdAt) },
            { label: t('projects.delivery.pdf.technician'), value: clean(preparedBy) },
        ],
        settings,
        recipientName: clean(project?.customer?.companyName),
        recipientLines: addressLines((project?.customer as any)?.address),
        // Yalnızca başlık + kontrol listesi tabloları (kullanıcı isteği) — liste
        // adı zaten her tablonun kendi bandında durur, alt başlık yazılmaz.
        title: t('projects.delivery.pdf.title'),
    });

    y = drawResponses(doc, report, Array.isArray(report.responses) ? report.responses : [], y, t);
    y = drawNotes(doc, report.notes, y, t);

    // Raporun KENDİ foto ekleri önce, saha raporlarından gelenler arkasına.
    const ownImages = (report.images || []).map((img) => img?.imageData).filter(Boolean) as string[];
    const borrowed = fieldImages.map((img) => img?.imageData).filter(Boolean) as string[];
    const images = [...ownImages, ...borrowed.filter((src) => !ownImages.includes(src))];
    if (images.length > 0) {
        y = drawSectionTitle(doc, t('projects.delivery.pdf.visuals'), y);
        y = drawImagesGrid(doc, images, y);
    }

    drawApprovalSection(doc, {
        title: t('projects.delivery.pdf.approvalTitle'),
        confirmText: t('projects.delivery.pdf.approvalConfirm'),
        roleLabel: t('projects.delivery.pdf.customerRole'),
        customerName: clean(project?.customer?.companyName) || EMPTY,
        dateLabel: t('projects.delivery.pdf.date'),
        dateText: dateFmt(report.signedAt || report.sentAt || report.createdAt, locale),
        signatureLabel: t('projects.delivery.pdf.signature'),
        signatureData: report.customerSignature,
    }, y);

    decoratePages(doc, assets, settings, t);

    const finalBytes = new Uint8Array(doc.output('arraybuffer'));

    if (output === 'blob') {
        return new Blob([new Uint8Array(finalBytes)], { type: 'application/pdf' });
    }
    const safeName = (clean(project?.projectName) || 'teslim').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
    const dateLabel = dateShort(report.createdAt).replace(/[^0-9-]/g, '');
    downloadPdf(finalBytes, `${safeName}-teslim-raporu-${dateLabel}.pdf`);
    return null;
};
