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
import { resolveConfirmationValidUntil } from '@/lib/orderConfirmation';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import { buildTree, flattenTenderTreeForPdf } from '@/pages/sales/detail/tenderDetailUtils';
import { discountDisplayName, seedTotalDiscounts } from '@/pages/sales/detail/utils/tenderDiscounts.utils';
import { buildSimpleTenderLines } from '@/pages/sales/detail/utils/tenderLine.utils';
import { attachPdfPositionImages } from '@/pages/sales/detail/utils/tenderPdfImages.utils';
import { computeTenderPricingSummary } from '@/pages/sales/detail/utils/tenderPricing.utils';
import { parseClosingImages } from '@/pages/sales/detail/utils/tenderProduct.utils';
import type { PdfCompanySettings } from '@/store/pdfSettingsStore';
import { toCurrencyCode } from '@/utils/currency';
import {
    buildTenderPdfBytes,
    pdfStringsFor,
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
    /** Dateiname ohne Endung; leer = die Offertnummer. */
    fileBaseName?: string;
    /**
     * AUFTRAGSBESTÄTIGUNG. Gesetzt, druckt derselbe Generator dasselbe Angebot
     * als Bestätigung: gleiches Gesicht, gleiche Zahlen — nur die IDENTITÄT auf
     * der Titelseite wechselt (AB-Nummer, Auftragsdatum, eigene Gültigkeit,
     * Verkäufer = wer den Auftrag erteilt hat) und der Einleitungstext ist der
     * des Auftrags.
     */
    confirmation?: OrderConfirmationIdentity;
}

/**
 * Was die Auftragsbestätigung von der Offerte unterscheidet — mehr ist es
 * nicht. Alles Übrige (Positionen, Rabatte, Zahlungsplan, Schlussbilder) kommt
 * unverändert aus der Offerte, damit Angebot und Bestätigung niemals andere
 * Zahlen zeigen können.
 */
export interface OrderConfirmationIdentity {
    /** AB-2026-40010 — die Nummer des Auftrags. */
    orderNumber: string;
    /** Auftragsdatum (Entstehung des Auftrags), nicht das Offertdatum. */
    orderDate?: string | null;
    /** «Gültig bis»; leer = Auftragsdatum + 1 Monat. */
    validUntil?: string | null;
    /** Verkäufer — der Ersteller des Auftrags; leer = der der Offerte. */
    salespersonName?: string | null;
    /** Einleitungstext der Titelseite; leer = der Einleitungstext der Offerte. */
    introText?: string | null;
}

/** TT.MM.JJJJ — dieselbe Schreibweise, die die Vorlage überall druckt. */
const shortDate = (iso?: string | null): string => {
    if (!iso) return '';
    // Ein reines Tagesdatum (JJJJ-MM-TT, wie es das «Gültig bis»-Feld liefert)
    // liest `new Date` als UTC-Mitternacht — westlich von Greenwich wäre der
    // gedruckte Tag dann der Vortag. Es wird darum direkt zerlegt.
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (day) return `${day[3]}.${day[2]}.${day[1]}`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

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
        // Zahlungsplan: die Offerte legt nur die PROZENTE fest (Fälligkeiten
        // hängen am Auftrag) — die Tabelle am Dokumentende zeigt dann eine
        // Spalte weniger.
        paymentStages: parsePaymentStages(tender.paymentStages),
        coverLetter: content?.coverLetter ?? tender.coverLetter ?? null,
        closingImages: parseClosingImages(content?.closingImages ?? tender.closingImages),
        lang: options.lang ?? 'de',
    };

    // ── Auftragsbestätigung: die Identität ist die des AUFTRAGS ─────────────
    // Dieselbe Seite wie das Angebot, nur mit der AB-Nummer im Titel, dem
    // AUFTRAGSDATUM statt des Offertdatums, einer eigenen Gültigkeit (Vorgabe:
    // ein Monat) und dem Verkäufer, der den Auftrag erteilt hat. Der
    // Einleitungstext startet beim Text der Offerte und kann am Auftrag
    // überschrieben werden — `coverLetter` ist genau die Stelle, an der die
    // Vorlage ihn druckt (er ersetzt dort die Standardanrede).
    const confirmation = options.confirmation;
    if (confirmation?.orderNumber) {
        const L = pdfStringsFor(data.lang);
        const noColon = (label: string) => label.replace(/\s*:\s*$/, '');
        // Das Datum des Auftrags — nur wenn der Aufrufer keines mitgibt, fällt
        // es auf das der Offerte zurück (die Bestätigung braucht IRGENDEIN
        // Datum, ehe sie eines erfindet).
        const orderDate = confirmation.orderDate || tender.createdAt;
        data.tenderNumber = confirmation.orderNumber;
        data.docTitle = L.confirmationTitle;
        data.validUntil = resolveConfirmationValidUntil(confirmation.validUntil, orderDate);
        data.createdAt = orderDate;
        data.infoRows = [
            { label: noColon(L.confirmationNumber), value: confirmation.orderNumber, emphasize: true },
            { label: noColon(L.kommission), value: tender.commissionNumber || '' },
            { label: noColon(L.confirmationDate), value: shortDate(orderDate) },
            { label: noColon(L.validUntil), value: shortDate(data.validUntil) },
            { label: noColon(L.referenz), value: tender.customerReference || '' },
            {
                label: noColon(L.seller),
                value: confirmation.salespersonName
                    || (tender as { salespersonName?: string | null }).salespersonName
                    || tender.createdByName
                    || '',
            },
        ];
        if (confirmation.introText && confirmation.introText.trim()) {
            data.coverLetter = confirmation.introText;
        }
    }

    // Die Währung der Offerte schlägt die Firmenvorgabe — genau wie beim Export
    // auf der Offertseite.
    const bytes = await buildTenderPdfBytes(
        data,
        { ...settings, currency: toCurrencyCode(tender.currency) },
        options.onProgress,
    );

    return {
        tenderNumber: data.tenderNumber,
        fileName: `${options.fileBaseName || data.tenderNumber}.pdf`,
        bytes,
        blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    };
}

/**
 * ── AUFTRAGSBESTÄTIGUNG ─────────────────────────────────────────────────────
 * Der Beleg, der nach der Erteilung an den Kunden geht: dieselbe Offerte, in
 * denselben Markenfarben und mit denselben Zahlen — aber ausgestellt auf den
 * AUFTRAG. Deshalb ist es KEIN eigener Generator: eine zweite Rechenstrecke
 * wäre eine zweite Wahrheit, und Angebot und Bestätigung dürfen sich nie
 * widersprechen.
 *
 * Es ist der EINZIGE Beleg des Auftrags. Bis 29.08.2026 stand daneben ein
 * zweiter, ganz roter «Verkaufs-PDF»-Ausdruck mit eigenem Text; er wurde
 * abgeschafft — diesen Namen trägt jetzt der Knopf, der dieses Dokument
 * erzeugt.
 */
export function buildOrderConfirmationPdf(
    tenderId: string,
    settings: PdfCompanySettings,
    confirmation: OrderConfirmationIdentity,
    options: Omit<QuotePdfOptions, 'confirmation' | 'orderNumber' | 'theme'> = {},
): Promise<QuotePdfDocument> {
    return buildQuotePdf(tenderId, settings, { ...options, confirmation });
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
