/**
 * ── FATURA PDF ───────────────────────────────────────────────────────────────
 * Modern teklif şablonunun (tenderPdfModern) fatura sürümü. Şablonun kendisi
 * yeniden kullanılır: başlık (`docTitle`), kapak bilgi kartı (`infoRows`) ve
 * QR fatura alanları fatura verisiyle doldurulur.
 *
 * Fatura türleri (Invoice.kind):
 *  - RECHNUNG  → tam fatura: teklifin TÜM pozisyonları, iskontolar ve KDV ile
 *                aynen teklif PDF'indeki gibi listelenir (%100 faturalanır).
 *  - AKONTO    → tek satır: "Anzahlung von 50.00%" (kalın) + sipariş referansı.
 *  - ZWISCHEN  → tek satır: "Zwischenzahlung von 15.00%" + sipariş referansı.
 *  - SCHLUSS   → tek satır: "Restbetrag 25.00%" + daha önce verrechnet oran.
 *
 * Son sayfa her zaman İsviçre QR faturasıdır (Empfangsschein + Zahlteil, ortada
 * İsviçre haçı); "Zusätzliche Informationen" satırına fatura numarası yazılır.
 */
import { tenderApi } from '@/lib/api/tender';
import { buildTree, flattenTenderTreeForPdf } from '@/pages/tender/detail/tenderDetailUtils';
import { buildSimpleTenderLines } from '@/pages/tender/detail/utils/tenderLine.utils';
import { discountDisplayName, seedTotalDiscounts } from '@/pages/tender/detail/utils/tenderDiscounts.utils';
import { computeTenderPricingSummary } from '@/pages/tender/detail/utils/tenderPricing.utils';
import { attachPdfPositionImages } from '@/pages/tender/detail/utils/tenderPdfImages.utils';
import type { InvoiceDto, InvoiceKind } from '@/types/billing';
import type { PdfCompanySettings } from '@/store/pdfSettingsStore';
import {
    buildTenderPdfBytes,
    type PdfLang,
    type TenderPdfData,
    type TenderPdfProgress,
    type TenderPdfTotals,
} from './tenderPdfModern';

/** Faturanın bağlı olduğu siparişten PDF'in ihtiyaç duyduğu bağlam. */
export interface InvoiceOrderContext {
    orderNumber: string;
    /** Ana siparişin teklifi — RECHNUNG pozisyonları buradan gelir. */
    tenderId?: string | null;
    customerName?: string | null;
    /** Fatura adresi (Zahlbar durch bloğu ve alıcı adresi). */
    billingAddress?: string | null;
    salespersonName?: string | null;
    commissionNumber?: string | null;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const fmtDay = (iso?: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const fmtPct = (value: number) => `${(Number(value) || 0).toFixed(2)}%`;

/** Belge başlığı — faturalar Almanca kesilir, dil yalnızca gövde etiketlerini etkiler. */
export const invoiceKindTitle = (kind: InvoiceKind): string => ({
    RECHNUNG: 'Rechnung',
    AKONTO: 'Akontorechnung',
    ZWISCHEN: 'Zwischenrechnung',
    SCHLUSS: 'Schlussrechnung',
} as const)[kind] ?? 'Rechnung';

/** AKONTO/ZWISCHEN/SCHLUSS satırının kalın başlığı ("Anzahlung von 50.00%"). */
const partialRowTitle = (kind: InvoiceKind, percent: number): string => {
    if (kind === 'SCHLUSS') return `Restbetrag ${fmtPct(percent)}`;
    if (kind === 'ZWISCHEN') return `Zwischenzahlung von ${fmtPct(percent)}`;
    return `Anzahlung von ${fmtPct(percent)}`;
};

/** Yüzdelik fatura: tek satırlık pozisyon listesi + net/KDV/brüt özeti. */
const buildPartialPositions = (
    invoice: InvoiceDto,
    ctx: InvoiceOrderContext,
    vatRate: number,
): { positions: TenderPdfData['positions']; totals: TenderPdfTotals } => {
    const gross = round2(Number(invoice.amount) || 0);
    const net = vatRate > 0 ? round2(gross / (1 + vatRate / 100)) : gross;
    const kind = invoice.kind;

    const refLines = [`${invoiceKindTitle(kind)} Nr. ${invoice.invoiceNumber} zum Auftrag ${ctx.orderNumber}`];
    if (kind === 'SCHLUSS') {
        const already = round2(Math.max(0, 100 - (Number(invoice.billedPercent) || 0)));
        if (already > 0) refLines.push(`Bereits verrechnet: ${fmtPct(already)}`);
    }

    return {
        positions: [
            {
                shortDescription: `1 ${partialRowTitle(kind, Number(invoice.billedPercent) || 0)}`,
                longDescription: refLines.join('\n'),
                rowType: 'TITLE',
                isTopLevel: true,
                hierarchyLevel: 1,
                quantity: 1,
                unit: 'Pau.',
                unitPrice: net,
                taxRate: vatRate,
                lineTotal: gross,
            },
        ],
        totals: { netTotal: net, vatTotal: round2(gross - net), grossTotal: gross },
    };
};

/**
 * Tam fatura (RECHNUNG): teklifin pozisyon ağacı — görseller, satır iskontoları
 * ve belge iskontolarıyla — teklif PDF'iyle birebir aynı şekilde çizilir.
 */
const buildFullPositions = async (
    tenderId: string,
    vatRate: number,
    onProgress?: (p: TenderPdfProgress) => void,
): Promise<{ positions: TenderPdfData['positions']; totals: TenderPdfTotals } | null> => {
    try {
        const detail = await tenderApi.getById(tenderId, { includeActivities: false, deferOrderPdfContent: true });
        const positionsRaw = detail.positions || [];
        if (positionsRaw.length === 0) return null;

        const tree = buildTree(positionsRaw, vatRate);
        const flat = flattenTenderTreeForPdf(tree);
        const withImages = await attachPdfPositionImages(tenderId, flat);

        const simpleRows = buildSimpleTenderLines(positionsRaw, vatRate);
        const documentDiscounts = seedTotalDiscounts(detail.tender);
        const summary = computeTenderPricingSummary(simpleRows, vatRate, documentDiscounts);
        onProgress?.({ stage: 'positions', done: 0, total: withImages.length });

        return {
            positions: withImages,
            totals: {
                subtotal: summary.netBeforeDiscounts,
                discounts: summary.discounts
                    .filter((entry) => entry.amount > 0)
                    .map((entry, index) => ({
                        name: discountDisplayName(entry, index),
                        percent: entry.percent,
                        amount: entry.amount,
                    })),
                totalDiscountAmount: summary.totalDiscountAmount,
                combinedDiscountPercent: summary.combinedDiscountPercent,
                netTotal: summary.netTotal,
                vatTotal: summary.vatTotal,
                grossTotal: summary.grossTotal,
            },
        };
    } catch (e) {
        console.warn('Invoice PDF: tender positions could not be loaded, falling back to a single line.', e);
        return null;
    }
};

/**
 * Adres/komisyon/satıcı eksikse tekliften tamamlar: fatura adresi > müşteri
 * adresi; Verkäufer = teklifin satıcısı, yoksa teklifi oluşturan kişi (teklif
 * PDF'inin Verkäufer satırıyla aynı kural). Proje sekmesinden gelen bağlam
 * adres taşımaz — "doğru adres" HER ZAMAN tekliften okunur (kullanıcı isteği).
 */
const enrichContextFromTender = async (ctx: InvoiceOrderContext): Promise<InvoiceOrderContext> => {
    if (!ctx.tenderId || (ctx.billingAddress && ctx.commissionNumber && ctx.salespersonName)) return ctx;
    try {
        const detail = await tenderApi.getById(ctx.tenderId, { light: true, includeActivities: false });
        const tender = detail.tender as {
            billingAddress?: string | null;
            customerAddress?: string | null;
            customerName?: string | null;
            commissionNumber?: string | null;
            salespersonName?: string | null;
            createdByName?: string | null;
        };
        return {
            ...ctx,
            billingAddress: ctx.billingAddress || tender.billingAddress || tender.customerAddress || null,
            customerName: ctx.customerName || tender.customerName || null,
            commissionNumber: ctx.commissionNumber || tender.commissionNumber || null,
            salespersonName: ctx.salespersonName || tender.salespersonName || tender.createdByName || null,
        };
    } catch {
        return ctx;
    }
};

export async function buildInvoicePdfBytes(
    invoice: InvoiceDto,
    rawCtx: InvoiceOrderContext,
    settings: PdfCompanySettings,
    onProgress?: (p: TenderPdfProgress) => void,
    lang: PdfLang = 'de',
): Promise<Uint8Array> {
    const vatRate = Number(settings.vatRate) || 8.1;
    const title = invoiceKindTitle(invoice.kind);
    const ctx = await enrichContextFromTender(rawCtx);

    // RECHNUNG bir teklife bağlıysa tüm pozisyonlar; diğer her durumda tek satır.
    const body = (invoice.kind === 'RECHNUNG' && ctx.tenderId
        ? await buildFullPositions(ctx.tenderId, vatRate, onProgress)
        : null)
        ?? buildPartialPositions(invoice, ctx, vatRate);

    // Kartta TAM BEŞ satır (kullanıcı isteği): Auftrags-Nr. YOK, Fälligkeit
    // EN SONDA. Kommission tekliften gelir (faturalama ekranında girilmez).
    const infoRows: NonNullable<TenderPdfData['infoRows']> = [
        { label: 'Rechnungs-Nr.', value: invoice.invoiceNumber, emphasize: true },
        { label: 'Rechnungsdatum', value: fmtDay(invoice.invoiceDate || invoice.createdAt) },
        { label: 'Salesperson', value: invoice.salespersonName || ctx.salespersonName || '' },
        { label: 'Kommission', value: invoice.commissionNumber || ctx.commissionNumber || '' },
        { label: 'Fälligkeit', value: fmtDay(invoice.dueDate) },
    ];

    const data: TenderPdfData = {
        tenderNumber: invoice.invoiceNumber,
        version: 1,
        createdAt: invoice.invoiceDate || invoice.createdAt,
        customerName: ctx.customerName || invoice.customer?.companyName || '',
        customerAddress: ctx.billingAddress || null,
        positions: body.positions,
        grandTotal: round2(Number(invoice.amount) || 0),
        totals: body.totals,
        qrBillEnabled: true,
        lang,
        docTitle: title,
        infoRows,
        // Kapak mektubu YOK: tablo doğrudan ilk sayfada, başlığın altında başlar.
        introMode: 'none',
        startTableOnFirstPage: true,
        qrAdditionalInfo: invoice.invoiceNumber,
    };

    return buildTenderPdfBytes(data, settings, onProgress);
}

export async function exportInvoicePdf(
    invoice: InvoiceDto,
    ctx: InvoiceOrderContext,
    settings: PdfCompanySettings,
    onProgress?: (p: TenderPdfProgress) => void,
): Promise<void> {
    const bytes = await buildInvoicePdfBytes(invoice, ctx, settings, onProgress);
    onProgress?.({ stage: 'download' });
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
