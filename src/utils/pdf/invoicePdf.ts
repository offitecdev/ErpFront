import { parsePaymentStages as parseInvoicePaymentStages } from '@/lib/paymentSchedule';
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
import { buildTree, flattenTenderTreeForPdf } from '@/pages/sales/detail/tenderDetailUtils';
import { buildSimpleTenderLines } from '@/pages/sales/detail/utils/tenderLine.utils';
import {
    applyDiscounts,
    discountDisplayName,
    MAX_LINE_DISCOUNTS,
    parseDiscountList,
    seedTotalDiscounts,
    type TenderDiscountEntry,
} from '@/pages/sales/detail/utils/tenderDiscounts.utils';
import { lineTotalWithTax } from '@/pages/sales/detail/tenderDetailUtils';
import { billingApi } from '@/lib/api/billing';
import { ALL_SECTIONS, invoiceDiscounts, parseInvoiceSections } from '@/pages/sales/invoices/invoiceShared';
import { computeTenderPricingSummary } from '@/pages/sales/detail/utils/tenderPricing.utils';
import { attachPdfPositionImages } from '@/pages/sales/detail/utils/tenderPdfImages.utils';
import type { PaymentStage } from '@/lib/paymentSchedule';
import type { InvoiceDto, InvoiceKind, InvoiceLineItemDto } from '@/types/billing';
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
    /**
     * Siparişin ödeme planı (taksit yüzdesi + vade). Doluysa faturanın sonuna
     * "Zahlungsplan" tablosu eklenir — müşteri hangi taksidin ne zaman ve ne
     * kadar ödeneceğini faturanın kendisinde görür.
     */
    paymentStages?: PaymentStage[] | null;
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
    STORNO: 'Stornorechnung',
    GUTSCHRIFT: 'Gutschrift',
} as const)[kind] ?? 'Rechnung';

/**
 * ── GEGENBELEG (17.09.2026, Schritt 6) ──────────────────────────────────────
 * Storno-Rechnung und Gutschrift drucken EINE Zeile mit Verweis auf die
 * Rechnung, die sie betreffen, darunter den Grund — und den Betrag negativ.
 * Die Zeilen des Originals stehen als Beleg am Datensatz, der Kunde liest hier
 * aber nur, WAS zurückgenommen wird.
 */
const buildCreditPositions = (
    invoice: InvoiceDto,
    vatRate: number,
): { positions: TenderPdfData['positions']; totals: TenderPdfTotals } => {
    const gross = round2(Number(invoice.amount) || 0);
    const net = vatRate > 0 ? round2(gross / (1 + vatRate / 100)) : gross;
    const ref = invoice.reversesInvoice;
    const refText = ref
        ? `${invoiceKindTitle(ref.kind)} Nr. ${ref.invoiceNumber}${ref.invoiceDate ? ` vom ${fmtDay(ref.invoiceDate)}` : ''}`
        : '';
    const title = invoice.kind === 'STORNO'
        ? `Storno ${refText}`.trim()
        : `Gutschrift zu ${refText}`.trim();
    const lines: string[] = [];
    if (ref && invoice.kind === 'GUTSCHRIFT' && Math.abs(Math.abs(gross) - Math.abs(Number(ref.amount) || 0)) > 0.005) {
        const chf = (value: number) => `CHF ${Math.abs(value).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        lines.push(`Rechnungsbetrag ${chf(Number(ref.amount) || 0)}, davon gutgeschrieben ${chf(gross)}`);
    }
    if (invoice.creditReason) lines.push(`Grund: ${invoice.creditReason}`);
    return {
        positions: [{
            shortDescription: `1 ${title}`,
            longDescription: lines.join('\n') || null,
            rowType: 'PRODUCT',
            isTopLevel: true,
            hierarchyLevel: 1,
            quantity: 1,
            unit: 'Pau.',
            unitPrice: net,
            taxRate: vatRate,
            lineTotal: gross,
        }],
        totals: { netTotal: net, vatTotal: round2(gross - net), grossTotal: gross },
    };
};

const isCreditDocument = (invoice: Pick<InvoiceDto, 'kind'>) => invoice.kind === 'STORNO' || invoice.kind === 'GUTSCHRIFT';

/** AKONTO/ZWISCHEN/SCHLUSS satırının kalın başlığı ("Anzahlung von 50.00%"). */
const partialRowTitle = (kind: InvoiceKind, percent: number): string => {
    if (kind === 'SCHLUSS') return `Restbetrag ${fmtPct(percent)}`;
    if (kind === 'ZWISCHEN') return `Zwischenzahlung von ${fmtPct(percent)}`;
    return `Anzahlung von ${fmtPct(percent)}`;
};

/**
 * Zeilenrabatt einer Rechnungszeile, aufgelöst gegen seine eigene Grundlage —
 * ein Eintrag je Zeile in der Rabattspalte, GENAU wie `pdfLineDiscounts` es für
 * eine Offertposition tut (tenderDetailUtils).
 */
const pdfLineDiscounts = (line: InvoiceLineItemDto, base: number) => {
    const entries = parseDiscountList(line.discounts ?? null, MAX_LINE_DISCOUNTS);
    if (entries.length === 0) return undefined;
    const rows = applyDiscounts(base, entries).applied
        .map((entry, index) => ({
            name: discountDisplayName(entry, index),
            kind: entry.kind,
            percent: entry.percent,
            amount: entry.amount,
        }))
        .filter((entry) => entry.amount > 0);
    return rows.length > 0 ? rows : undefined;
};

/**
 * DIREKTRECHNUNG: die Positionen stehen auf der Rechnung selbst — es gibt keine
 * Offerte, aus der sie nachgeladen werden könnten.
 *
 * ── DIESELBE TABELLE WIE DAS ANGEBOT (05.09.2026) ────────────────────────────
 * Vorgabe Samet: „Die Rechnung muss GENAU der Offertentabelle entsprechen — mit
 * Beschreibung und allem." Eine Zeile wird darum Feld für Feld so gebaut, wie
 * `flattenTenderTreeForPdf` eine Offertposition baut:
 *
 *   shortDescription  „1 Bezeichnung"        (Positionsnummer + Name)
 *   longDescription   die Beschreibung darunter
 *   quantity · unit · unitPrice              die drei Zahlen der Zeile
 *   discount/discounts                       der Zeilenrabatt in seiner Spalte
 *   taxRate                                  der Steuersatz der Rechnung
 *   lineTotal         Netto × (1 + MWST)     — BRUTTO, wie auf der Offerte
 *   imageUrl          das Produktbild
 *
 * `lineTotal` ist der einzige Punkt, an dem man sich vertun kann: die
 * Betragsspalte der Offerte zeigt den Zeilenbetrag MIT Steuer
 * (`lineTotalWithTax`), während der Summenblock darunter Netto/MWST/Total
 * trennt. Genau diese Lesart gilt hier — sonst stünden in derselben Spalte
 * zweier Belege zwei verschiedene Zahlen.
 */
const buildDirectPositions = (
    invoice: InvoiceDto,
    vatRate: number,
    discounts: TenderDiscountEntry[],
): { positions: TenderPdfData['positions']; totals: TenderPdfTotals } => {
    const lines = [...(invoice.lineItems || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    // Zwischensumme = die Zeilen NACH ihrem eigenen Rabatt (`lineTotal` ist
    // netto); darunter greift der RABATTABSCHNITT des Belegs, jeder Rabatt auf
    // das, was der vorige übrig lässt — dieselbe Rechnung wie auf der Offerte,
    // damit Beleg und Angebot dieselben Zahlen zeigen.
    const subtotal = round2(lines.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0));
    const breakdown = applyDiscounts(subtotal, discounts);
    const netTotal = round2(breakdown.remaining);
    // Gedruckt wird der GESPEICHERTE Betrag: er ist die Zahl, die der QR-Teil
    // einzieht. Die Steuer ergibt sich als Differenz, damit Beleg und Zahlteil
    // nie um einen Rappen auseinanderliegen.
    const grossTotal = round2(Number(invoice.amount) || round2(netTotal * (1 + vatRate / 100)));
    const discountRows = breakdown.applied
        // Der Name wird über den Platz in der GANZEN Liste gebildet ("Rabatt 2"),
        // darum erst benennen und dann die wirkungslosen Zeilen weglassen.
        .map((entry, index) => ({
            name: discountDisplayName(entry, index),
            percent: entry.percent,
            amount: entry.amount,
        }))
        .filter((entry) => entry.amount > 0);

    return {
        positions: lines.map((line, index) => {
            const net = round2(Number(line.lineTotal) || 0);
            return {
                shortDescription: `${index + 1} ${line.description}`,
                // Die Beschreibung steht UNTER der Bezeichnung — dieselbe
                // Stelle und dieselbe Schrift wie auf der Offerte.
                longDescription: line.longDescription || null,
                // 'PRODUCT' ist eine der Zeilenarten, die NIE zum Kapitel werden
                // (`NEVER_CHAPTER_ROW_TYPES`) — eine Position zum Preis 0 behält so
                // ihre Preisspalten und fällt nicht als Titelband aus der Tabelle.
                rowType: 'PRODUCT',
                isTopLevel: true,
                hierarchyLevel: 1,
                // Das Produktbild hängt am Katalogartikel; `sourceId` ist seine
                // Kennung (siehe CreateDirectInvoiceUseCase).
                sourceArticleId: line.sourceId ?? null,
                quantity: Number(line.quantity) || 0,
                unit: line.unit || 'Stk.',
                unitPrice: Number(line.unitAmount) || 0,
                discount: Number(line.discount) || undefined,
                discounts: pdfLineDiscounts(line, round2((Number(line.quantity) || 0) * (Number(line.unitAmount) || 0))),
                taxRate: vatRate,
                // Betragsspalte = Zeilenbetrag MIT Steuer, wie auf der Offerte.
                lineTotal: round2(lineTotalWithTax(net, vatRate)),
            };
        }),
        totals: {
            subtotal,
            discounts: discountRows,
            totalDiscountAmount: round2(breakdown.totalAmount),
            combinedDiscountPercent: breakdown.combinedPercent,
            netTotal,
            vatTotal: round2(grossTotal - netTotal),
            grossTotal,
        },
    };
};

/* ── MINDERUNG AUF DER RECHNUNG (16.09.2026) ──────────────────────────────────
   Ein Nachtrag mit Minussumme wird nicht selbst verrechnet, sondern von der
   Rechnung seines Hauptauftrags abgezogen. Der Server legt ihn dort als eigene
   Minuszeile an (Quelle = der Nachtrag). Der Beleg zeigt ihn mit Namen, damit
   der Kunde sieht, warum der Betrag kleiner ist. */
const MINDERUNG_LABEL: Record<PdfLang, string> = { de: 'Minderung', en: 'Reduction', tr: 'Eksiltme' };

const minderungLinesOf = (invoice: InvoiceDto, lang: PdfLang): Array<{ label: string; gross: number }> =>
    [...(invoice.lineItems || [])]
        .filter((line) => Number(line.lineTotal) < 0 && line.sourceId && line.sourceId !== invoice.salesOrderId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((line) => ({
            label: `${MINDERUNG_LABEL[lang]} ${String(line.description || '').replace(/^Minderung\s+/, '').replace(/\s*\(%[^)]*\)\s*$/, '')}`.trim(),
            gross: round2(Number(line.lineTotal) || 0),
        }));

/** Yüzdelik fatura: tek satırlık pozisyon listesi + net/KDV/brüt özeti. */
const buildPartialPositions = (
    invoice: InvoiceDto,
    ctx: InvoiceOrderContext,
    vatRate: number,
    lang: PdfLang = 'de',
): { positions: TenderPdfData['positions']; totals: TenderPdfTotals } => {
    const gross = round2(Number(invoice.amount) || 0);
    const net = vatRate > 0 ? round2(gross / (1 + vatRate / 100)) : gross;
    const kind = invoice.kind;
    const minderungen = minderungLinesOf(invoice, lang);
    // Mit Minderungen trägt die erste Zeile den Auftragsanteil, jede Minderung
    // folgt als eigene Minuszeile — die Zeilen summieren sich zum Betrag.
    const orderGross = minderungen.length
        ? round2(gross - minderungen.reduce((sum, row) => sum + row.gross, 0))
        : gross;
    const netOf = (value: number) => (vatRate > 0 ? round2(value / (1 + vatRate / 100)) : value);

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
                unitPrice: netOf(orderGross),
                taxRate: vatRate,
                lineTotal: orderGross,
            },
            ...minderungen.map((row, index) => ({
                shortDescription: `${index + 2} ${row.label}`,
                longDescription: null,
                rowType: 'PRODUCT',
                isTopLevel: true,
                hierarchyLevel: 1,
                quantity: 1,
                unit: 'Pau.',
                unitPrice: netOf(row.gross),
                taxRate: vatRate,
                lineTotal: row.gross,
            })),
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
    invoice?: InvoiceDto,
    lang: PdfLang = 'de',
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

        const discounts = summary.discounts
            .filter((entry) => entry.amount > 0)
            .map((entry, index) => ({
                name: discountDisplayName(entry, index),
                percent: entry.percent,
                amount: entry.amount,
            }));

        /* MINDERUNG: die Offerte zeigt den ganzen Auftrag, die Rechnung ist
           um die Minderungen kleiner. Sie stehen im Summenblock nach den
           Rabatten, jede mit ihrem Namen (netto), und das Total ist der
           Rechnungsbetrag. Fehlen die Zeilen (ältere Antwort), deckt eine
           Sammelzeile die Differenz — nie ein Total, das nicht stimmt. */
        const invoiceGross = invoice ? round2(Number(invoice.amount) || 0) : summary.grossTotal;
        const gap = round2(invoiceGross - summary.grossTotal);
        if (invoice && gap < -0.01) {
            const toNet = (value: number) => (vatRate > 0 ? value / (1 + vatRate / 100) : value);
            const named = minderungLinesOf(invoice, lang);
            const rows = named.length
                ? named
                : [{ label: MINDERUNG_LABEL[lang], gross: gap }];
            const minderungNet = rows.reduce((sum, row) => sum + round2(toNet(-row.gross)), 0);
            const netTotal = round2(summary.netTotal - minderungNet);
            return {
                positions: withImages,
                totals: {
                    subtotal: discounts.length ? summary.netBeforeDiscounts : summary.netTotal,
                    discounts: [
                        ...discounts,
                        ...rows.map((row) => ({ name: row.label, percent: 0, amount: round2(toNet(-row.gross)) })),
                    ],
                    totalDiscountAmount: round2(summary.totalDiscountAmount + minderungNet),
                    combinedDiscountPercent: summary.combinedDiscountPercent,
                    netTotal,
                    vatTotal: round2(invoiceGross - netTotal),
                    grossTotal: invoiceGross,
                },
            };
        }

        return {
            positions: withImages,
            totals: {
                subtotal: summary.netBeforeDiscounts,
                discounts,
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
/**
 * Eine Direktrechnung trägt ihren Empfänger selbst (`recipientName`) — es gibt
 * weder Auftrag noch Offerte, aus der er käme. Genau daran ist sie zu erkennen.
 */
export const isDirectInvoice = (invoice: Pick<InvoiceDto, 'salesOrderId' | 'projectId' | 'recipientName'>): boolean =>
    !invoice.salesOrderId && !invoice.projectId && Boolean(invoice.recipientName);

/**
 * Produktbilder der Direktrechnung nachziehen. Das Angebot holt sie über die
 * Offerte (`attachPdfPositionImages`); eine Direktrechnung hat keine, also
 * fragt sie über die ARTIKEL-Kennungen ihrer Zeilen. Die Bilder sind serverseitig
 * schon auf den Bildrahmen des Belegs verkleinert.
 *
 * Ein Fehlschlag ist NICHT fatal — dann entsteht das PDF ohne Bilder, genau wie
 * beim Angebot.
 */
const attachDirectPositionImages = async (
    positions: TenderPdfData['positions'],
): Promise<TenderPdfData['positions']> => {
    const ids = [...new Set(
        positions.map((row) => (row as { sourceArticleId?: string | null }).sourceArticleId).filter(Boolean),
    )] as string[];
    if (ids.length === 0) return positions;
    try {
        const images = await billingApi.productImages(ids);
        if (images.length === 0) return positions;
        const byId = new Map(images.map((row) => [row.id, row.imageUrl]));
        return positions.map((row) => {
            const articleId = (row as { sourceArticleId?: string | null }).sourceArticleId;
            const imageUrl = articleId ? byId.get(articleId) : undefined;
            return imageUrl ? { ...row, imageUrl } : row;
        });
    } catch {
        return positions;
    }
};

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
    const direct = isDirectInvoice(invoice);
    const credit = isCreditDocument(invoice);
    // Der Steuersatz der Direktrechnung ist EINGEFROREN: ein später geänderter
    // Firmenwert darf eine gestellte Rechnung nicht rückwirkend verschieben.
    const vatRate = direct && invoice.vatRate != null
        ? Number(invoice.vatRate)
        : Number(settings.vatRate) || 8.1;
    const title = invoiceKindTitle(invoice.kind);
    // Eine Direktrechnung hat keine Offerte — nichts nachzuladen.
    const ctx = direct ? rawCtx : await enrichContextFromTender(rawCtx);

    // ── DIE DREI ABSCHNITTE (nur die Direktrechnung trägt sie) ───────────────
    // Vorgabe Samet: ein entfernter Abschnitt erscheint AUCH NICHT im PDF.
    //  - „Rabatt" weg     → der Stapel wird weder gerechnet noch gedruckt
    //  - „Positionen" weg → keine Tabelle; der Beleg zeigt nur die Summe
    //  - „Schlusstext" weg → keine Karte unter dem Total
    // Eine Auftragsrechnung kennt die Abschnitte nicht: sie druckt wie bisher.
    const sections = direct && !credit ? parseInvoiceSections(invoice.sections) : ALL_SECTIONS;
    const discounts = direct && sections.discount ? invoiceDiscounts(invoice) : [];

    // Direktrechnung: die eigenen Positionen. Sonst RECHNUNG aus der Offerte
    // (alle Positionen) bzw. in jedem anderen Fall die eine Prozentzeile.
    const body = credit
        ? buildCreditPositions(invoice, vatRate)
        : direct
        ? buildDirectPositions(invoice, vatRate, discounts)
        : ((invoice.kind === 'RECHNUNG' && ctx.tenderId
            ? await buildFullPositions(ctx.tenderId, vatRate, onProgress, invoice, lang)
            : null)
            ?? buildPartialPositions(invoice, ctx, vatRate, lang));

    // Kartta TAM BEŞ satır (kullanıcı isteği): Auftrags-Nr. YOK, Fälligkeit
    // EN SONDA. Kommission tekliften gelir (faturalama ekranında girilmez).
    // Die Bilder kosten eine Runde zum Server — sie werden nur geholt, wenn die
    // Positionstabelle auch wirklich gedruckt wird (Abschnitt „Positionen").
    const positions = direct && !credit && sections.positions
        ? await attachDirectPositionImages(body.positions)
        : body.positions;

    const infoRows: NonNullable<TenderPdfData['infoRows']> = credit
        ? [
            { label: 'Beleg-Nr.', value: invoice.invoiceNumber, emphasize: true },
            { label: 'Datum', value: fmtDay(invoice.invoiceDate || invoice.createdAt) },
            { label: 'Zu Rechnung', value: invoice.reversesInvoice?.invoiceNumber || '' },
            { label: 'Salesperson', value: invoice.salespersonName || ctx.salespersonName || '' },
            { label: 'Kommission', value: invoice.commissionNumber || ctx.commissionNumber || '' },
        ]
        : [
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
        // Direktrechnung: Empfänger und Adresse stehen AUF der Rechnung.
        customerName: (direct ? invoice.recipientName : null)
            || ctx.customerName || invoice.customer?.companyName || '',
        customerAddress: (direct ? invoice.recipientAddress : null) || ctx.billingAddress || null,
        // Einleitungstext über der Positionstabelle ("Für die ausgeführten
        // Arbeiten erlauben wir uns zu berechnen:") — er steht auf Seite 1
        // unter dem Titel, genau wie der Einleitungstext der Offerte.
        coverLetter: direct ? (invoice.introText || null) : null,
        positions,
        grandTotal: round2(Number(invoice.amount) || 0),
        totals: body.totals,
        // Zahlungsplan des AUFTRAGS — nur auf der Vollrechnung sinnvoll: eine
        // Teilrechnung IST bereits eine Rate, dort würde der Plan gegen den
        // Rechnungsbetrag (nicht gegen die Auftragssumme) gerechnet.
        paymentStages: invoice.kind === 'RECHNUNG' ? (direct ? parseInvoicePaymentStages(invoice.paymentStages) : ctx.paymentStages ?? null) : null,
        // Ein Gegenbeleg verlangt kein Geld: keine Zahlungsbedingung, kein QR-Teil.
        // Zahlungsbedingungen gehören auf die RECHNUNG, nicht auf die Offerte:
        // erst hier gibt es einen fälligen Betrag, auf den sich "zahlbar innert
        // 30 Tagen" überhaupt beziehen kann. Auf der Direktrechnung IST diese
        // Karte der Abschnitt „Schlusstext": entfernt heisst, sie fällt weg.
        showPaymentTerms: !credit && sections.closing,
        paymentTermsText: direct && !credit ? (invoice.closingText || null) : null,
        // Abschnitt „Positionen" entfernt: keine Tabelle, nur die Summe.
        hidePositionsTable: direct && !credit && !sections.positions,
        // Die Absenderzeile des Belegs. Sie ist beim Erstellen aus den
        // Mandanteneinstellungen vorbelegt und dann eingefroren — der
        // QR-Gläubiger bleibt davon unberührt (er muss zum Konto passen).
        senderLine: direct ? (invoice.senderAddress || null) : null,
        qrBillEnabled: !credit,
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
