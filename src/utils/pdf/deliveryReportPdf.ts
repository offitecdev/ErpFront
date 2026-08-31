/**
 * ── MODERN TESLİM RAPORU (Übergabe-/Abnahme-Rapport) PDF ─────────────────────
 * Tasarım dili `modernReportKit.ts`ten gelir (tenderPdfModern ile aynı kimlik):
 * kod ile çizilen antet/alt bilgi, yumuşak tablo bantları, ince ayraçlar —
 * sablon.pdf arka plan birleştirmesi YOKTUR.
 *  - VERİSİ OLMAYAN BÖLÜM HİÇ ÇİZİLMEZ (not/görsel/checklist boşsa atlanır).
 *  - İmza alanı İKİ karttır: solda teknisyen, sağda müşteri.
 */
import { jsPDF } from 'jspdf';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import type { ProjectDto } from '../../types/project';
import type { DeliveryReportDto, DeliveryResponseItem } from '../../lib/api/project';
import { getReportTranslator, type FixedTranslator } from '@/i18n/reportLanguage';
import {
    CONTENT_W, EMPTY,
    addressLines, clean, dateFmt, dateShort, decoratePages, downloadPdf,
    drawApprovalSection, drawCover, drawImagesGrid,
    drawModernTable, drawNoteBlock, drawSectionTitle, drawSubTitle, ensureSpace,
    loadBrandAssets, registerFonts,
    type ModernColumn,
} from './modernReportKit';

// ── Checklist: kategori bandı + modern durum tablosu ─────────────────────────
const drawResponses = (doc: jsPDF, report: DeliveryReportDto, responses: DeliveryResponseItem[], y: number, t: FixedTranslator): number => {
    if (responses.length === 0) return y;

    y = drawSectionTitle(doc, t('projects.delivery.checklist'), y);

    // Sauberere Tabelle (Vorgabe 19.08.2026): statt drei Kreuzchen-Spalten EINE
    // Status-Spalte mit dem ausgeschriebenen Wort — der Kontrollpunkt und seine
    // Beschreibung bekommen dadurch spürbar mehr Platz.
    const columns: ModernColumn[] = [
        { header: t('projects.delivery.pdf.colStep'), w: 96 },
        { header: t('common.status'), w: 22, align: 'center' },
        { header: t('projects.delivery.pdf.colMeasurement'), w: CONTENT_W - 96 - 22 },
    ];

    // Her kontrol listesi kendi adıyla (kategori = liste adı) bir ALT BAŞLIKLA
    // açılır; düz listelerde kategori boş kalır ve liste adına düşer.
    const catOf = (r: DeliveryResponseItem) =>
        r.category?.trim() || report.checklistName || t('projects.delivery.uncategorized');
    const categories: string[] = [];
    for (const r of responses) {
        const key = catOf(r);
        if (!categories.includes(key)) categories.push(key);
    }

    const statusText = (status: DeliveryResponseItem['status']) => {
        if (status === 'YES') return t('projects.delivery.yes');
        if (status === 'NO') return t('projects.delivery.no');
        if (status === 'NA') return t('projects.delivery.na');
        return EMPTY;
    };
    for (const category of categories) {
        const items = responses.filter((r) => catOf(r) === category);
        if (items.length === 0) continue;
        y = ensureSpace(doc, y, 30);
        // Die Zwischenüberschrift trägt den Erledigungsstand der Liste.
        const done = items.filter((item) => item.status !== null).length;
        y = drawSubTitle(doc, category, `${done}/${items.length}`, y);
        const rows = items.map((item) => [
            clean(item.label) || EMPTY,
            statusText(item.status),
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
    return drawNoteBlock(doc, text, y) + 2;
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
    const settings = getPdfSettings();
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
        numberedSections: true,
    });

    y = drawResponses(doc, report, Array.isArray(report.responses) ? report.responses : [], y, t);
    y = drawNotes(doc, report.notes, y, t);

    // Raporun KENDİ foto ekleri önce, saha raporlarından gelenler arkasına.
    const ownImages = (report.images || []).map((img) => img?.imageData).filter(Boolean) as string[];
    const borrowed = fieldImages.map((img) => img?.imageData).filter(Boolean) as string[];
    const images = [...ownImages, ...borrowed.filter((src) => !ownImages.includes(src))];
    if (images.length > 0) {
        // Bölüm adları üç rapor türünde de AYNI kaynaktan gelir: "Bilder" ve
        // "Bestätigung" artık her yerde tek anahtardan okunur (kullanıcı isteği
        // 19.08.2026 — teslim raporu İngilizcede "Images", montaj raporu
        // "Photos" diyordu).
        y = drawSectionTitle(doc, t('projects.field.pdf.imagesTitle'), y);
        y = drawImagesGrid(doc, images, y);
    }

    drawApprovalSection(doc, {
        title: t('projects.field.pdf.approvalTitle'),
        confirmText: t('projects.delivery.pdf.approvalConfirm'),
        signers: [
            {
                roleLabel: t('projects.delivery.pdf.technicianRole'),
                name: clean(preparedBy) || EMPTY,
                dateLabel: t('projects.delivery.pdf.date'),
                dateText: dateFmt(report.technicianSignedAt || report.sentAt || report.createdAt, locale),
                signatureLabel: t('projects.delivery.pdf.signature'),
                signatureData: report.technicianSignature,
            },
            {
                roleLabel: t('projects.delivery.pdf.customerRole'),
                name: clean(project?.customer?.companyName) || EMPTY,
                dateLabel: t('projects.delivery.pdf.date'),
                dateText: dateFmt(report.signedAt || report.sentAt || report.createdAt, locale),
                signatureLabel: t('projects.delivery.pdf.signature'),
                signatureData: report.customerSignature,
            },
        ],
    }, y);

    decoratePages(doc, assets, settings, t);

    const finalBytes = new Uint8Array(doc.output('arraybuffer'));

    if (output === 'blob') {
        return new Blob([new Uint8Array(finalBytes)], { type: 'application/pdf' });
    }
    const safeName = (clean(project?.projectName) || 'teslim').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
    const dateLabel = dateShort(report.createdAt).replace(/\./g, '-');
    downloadPdf(finalBytes, `${safeName}-teslim-raporu-${dateLabel}.pdf`);
    return null;
};
