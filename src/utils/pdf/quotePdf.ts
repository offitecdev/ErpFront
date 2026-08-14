/**
 * ── ANGEBOTS-PDF AUS EINER OFFERT-ID ─────────────────────────────────────────
 * Erzeugt exakt dieselbe Datei wie der Export auf der Offertseite
 * (`ExportModal` → `exportTenderPdf`), braucht aber deren Zustand NICHT: alles
 * — Positionsbaum, Bilder, Dokumentrabatte und Anschreiben — wird direkt aus
 * der API gelesen. Damit können Bildschirme, die nur die Offert-Id kennen (die
 * Auftragsseite), dasselbe Angebot anzeigen und herunterladen.
 *
 * Das Gegenstück auf der Rechnungsseite ist `invoicePdf.ts` (RECHNUNG-Pfad) —
 * beide reiten auf `tenderPdfModern`, damit die Zahlen niemals auseinander-
 * laufen können.
 */
import { tenderApi } from '@/lib/api/tender';
import { buildTree, flattenTenderTreeForPdf } from '@/pages/tender/detail/tenderDetailUtils';
import { discountDisplayName, seedTotalDiscounts } from '@/pages/tender/detail/utils/tenderDiscounts.utils';
import { buildSimpleTenderLines } from '@/pages/tender/detail/utils/tenderLine.utils';
import { attachPdfPositionImages } from '@/pages/tender/detail/utils/tenderPdfImages.utils';
import { computeTenderPricingSummary } from '@/pages/tender/detail/utils/tenderPricing.utils';
import { parseClosingImages } from '@/pages/tender/detail/utils/tenderProduct.utils';
import type { PdfCompanySettings } from '@/store/pdfSettingsStore';
import { toCurrencyCode } from '@/utils/currency';
import {
    buildTenderPdfBytes,
    type PdfLang,
    type TenderPdfData,
    type TenderPdfProgress,
} from './tenderPdfModern';

/**
 * Fertiges Dokument: Vorschau (Blob), Download und Mailanhang (Bytes → Base64)
 * teilen sich dieselben Bytes — das Angebot wird nur EINMAL gerendert.
 */
export interface QuotePdfDocument {
    tenderNumber: string;
    fileName: string;
    bytes: Uint8Array;
    blob: Blob;
}

export interface QuotePdfOptions {
    /** PDF-Sprache; Standard ist Deutsch — wie auf der Offertseite. */
    lang?: PdfLang;
    /** Fortschritt des Seitenaufbaus (Positionen → finalize). */
    onProgress?: (p: TenderPdfProgress) => void;
    /** Fortschritt des Bilddownloads, 0–1. */
    onImageProgress?: (fraction: number) => void;
}

export async function buildQuotePdf(
    tenderId: string,
    settings: PdfCompanySettings,
    options: QuotePdfOptions = {},
): Promise<QuotePdfDocument> {
    const vatRate = Number(settings.vatRate) || 8.1;

    // Die schweren PDF-Textfelder liegen hinter einem eigenen Endpunkt; der
    // Detailabruf bleibt dadurch schlank und beide laufen parallel. Fehlt das
    // Anschreiben (oder schlägt der Abruf fehl), druckt die Vorlage einfach den
    // Standardgruss — das Dokument bleibt gültig.
    const [detail, content] = await Promise.all([
        tenderApi.getById(tenderId, { includeActivities: false, deferOrderPdfContent: true }),
        tenderApi.getPdfContent(tenderId).catch(() => null),
    ]);

    const tender = detail.tender;
    const positionsRaw = detail.positions || [];

    const flat = flattenTenderTreeForPdf(buildTree(positionsRaw, vatRate));
    const positions = await attachPdfPositionImages(tenderId, flat, options.onImageProgress);

    // Preisfusszeile: dieselben Helfer wie Offertbildschirm und Rechnungs-PDF,
    // damit Zwischensumme, gestapelte Rabatte, Netto, MwSt. und Brutto überall
    // identisch sind.
    const summary = computeTenderPricingSummary(
        buildSimpleTenderLines(positionsRaw, vatRate),
        vatRate,
        seedTotalDiscounts(tender),
    );

    const data: TenderPdfData = {
        tenderNumber: tender.tenderNumber,
        version: tender.version,
        commission: tender.commissionNumber,
        customerReference: tender.customerReference,
        createdAt: tender.createdAt,
        validUntil: tender.validUntil,
        customerName: tender.customerName || '',
        customerAddress: tender.customerAddress,
        customerEmail: tender.customerEmail,
        customerPhone: tender.customerPhone,
        createdByName: tender.createdByName,
        positions,
        grandTotal: summary.grossTotal,
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
        coverLetter: content?.coverLetter ?? tender.coverLetter ?? null,
        closingImages: parseClosingImages(content?.closingImages ?? tender.closingImages),
        lang: options.lang ?? 'de',
    };

    // Die Währung der Offerte schlägt die Firmenvorgabe — genau wie beim Export
    // auf der Offertseite.
    const bytes = await buildTenderPdfBytes(
        data,
        { ...settings, currency: toCurrencyCode(tender.currency) },
        options.onProgress,
    );

    return {
        tenderNumber: tender.tenderNumber,
        fileName: `${tender.tenderNumber}.pdf`,
        bytes,
        blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    };
}

/** Speichert ein bereits erzeugtes Dokument — ohne es neu zu rendern. */
export function saveQuotePdf(doc: QuotePdfDocument): void {
    const url = URL.createObjectURL(doc.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
