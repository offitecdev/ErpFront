import type { PaymentStage } from '../lib/paymentSchedule';
import type { ProjectStatus } from './project';

export type InvoiceStatus = 'ISSUED' | 'PAID' | 'CANCELLED';
export type InvoiceBillingType = 'FULL' | 'PARTIAL';
/**
 * Rechnung = tam fatura (tüm pozisyonlar, %100) | Akonto = avans faturası |
 * Zwischen = ara fatura | Schluss = kalan yüzdeyi kapatan son fatura.
 * billingType bundan türetilir (RECHNUNG/SCHLUSS → FULL, diğerleri → PARTIAL).
 */
export type InvoiceKind = 'RECHNUNG' | 'AKONTO' | 'ZWISCHEN' | 'SCHLUSS';
/**
 * Rechnungstyp der Liste — vom Server ABGELEITET, nicht gespeichert:
 *  PROJECT  = Projektauftrag  (Rechnung hängt an einem Projekt)
 *  DELIVERY = Lieferauftrag   (Auftrag ohne Projekt)
 *  DIRECT   = Direktrechnung  (selbst ausgefüllte Vorlage)
 * Siehe `deriveInvoiceCategory` im Server.
 */
export type InvoiceCategory = 'PROJECT' | 'DELIVERY' | 'DIRECT';
export type InvoiceLineSourceType = 'ORDER' | 'OVERTIME' | 'EXPENSE' | 'EXTRA_MATERIAL' | 'MANUAL';

export interface InvoiceLineItemDto {
    id: string;
    invoiceId: string;
    description: string;
    sourceType: InvoiceLineSourceType;
    sourceId?: string | null;
    quantity: number;
    unitAmount: number;
    lineTotal: number;
    /** Mengeneinheit (Stk., Std., Pau.) — nur Direktrechnungen füllen sie. */
    unit?: string | null;
    /** Platz auf dem Beleg. */
    sortOrder?: number;
}

export interface InvoiceDto {
    id: string;
    tenantId: string;
    customerId?: string | null;
    projectId?: string | null;
    salesOrderId?: string | null;
    invoiceNumber: string;
    billingType: InvoiceBillingType;
    kind: InvoiceKind;
    invoiceDate?: string | null;
    dueDate?: string | null;
    salespersonName?: string | null;
    commissionNumber?: string | null;
    billedPercent: number;
    baseAmount: number;
    amount: number;
    status: InvoiceStatus;
    notes?: string | null;
    /** Direktrechnung: Empfänger, Einleitung und Steuersatz stehen auf der
        Rechnung selbst — bei Auftragsrechnungen bleiben sie leer und der PDF-Bau
        liest weiter aus der Offerte. */
    recipientName?: string | null;
    recipientAddress?: string | null;
    introText?: string | null;
    vatRate?: number | null;
    issuedByEmployeeId: string;
    createdAt: string;
    updatedAt: string;
    lineItems?: InvoiceLineItemDto[];
    /** Vom Server abgeleitet (Listenendpunkt); ältere Antworten lassen ihn weg. */
    category?: InvoiceCategory;
    /** Auftragsart des hängenden Auftrags (INVOICE / REGIE / PROJECT_*). */
    orderType?: string | null;
    customer?: { id: string; companyName: string } | null;
    project?: { id: string; projectNumber?: string | null; projectName: string } | null;
    salesOrder?: {
        id: string;
        orderNumber: string;
        orderType?: string | null;
        /** Offerte hinter dem Auftrag — die Gesamtrechnung druckt ihre Positionen. */
        tenderId?: string | null;
        /** Ratenplan des Auftrags als JSON-Zeichenkette (Zahlungsplan im PDF). */
        paymentStages?: string | null;
    } | null;
    issuedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface BillingSummaryInvoice {
    id: string;
    invoiceNumber: string;
    billingType: InvoiceBillingType;
    kind?: InvoiceKind;
    billedPercent: number;
    amount: number;
    status: InvoiceStatus;
    createdAt: string;
}

/**
 * The two figures every billing column is derived from — see
 * `orderBillingTotals`. The My Orders list gets only these; the order detail
 * page gets the full `BillingSummaryDto`.
 */
export interface OrderBillingFiguresDto {
    baseAmount: number;
    billedAmount: number;
    /**
     * Summed share of the active invoices. Travels with the two amounts because
     * "fully billed" is decided on the percentage — see `isFullyBilled`, which
     * is what keeps a 100% invoiced order from showing a stray rappen open.
     */
    billedPercent: number;
}

export interface BillingSummaryDto extends OrderBillingFiguresDto {
    /** Fiilen ödenmiş (PAID) pay — ödeme planı ilerlemesi bunu izler. */
    paidPercent?: number;
    paidAmount?: number;
    remainingPercent: number;
    remainingAmount: number;
    /** Order-level payment schedule (percent + due date per stage); null when free-form. */
    paymentStages?: PaymentStage[] | null;
    /** Derived next stage to bill; null when done or no schedule. */
    nextStage?: { index: number; percent: number; date: string | null; suggestedPercent: number } | null;
    invoices: BillingSummaryInvoice[];
}

/** An additional order as the My Orders list needs it: label + billing figures. */
export interface MyOrderListAddonDto {
    id: string;
    orderNumber: string;
    totalAmount: number;
    createdAt?: string;
    /** Ek işin ait olduğu randevu/iş günü — liste satırındaki tarih budur. */
    orderDate?: string | null;
    billingSummary?: OrderBillingFiguresDto | null;
}

/**
 * One row of `GET /sales-orders/my-orders`.
 *
 * A list shape on purpose — the endpoint selects the table's own columns and
 * the sub-orders under them, nothing more. Anything richer (order status,
 * payment schedule, tender/project/creator relations, the invoice breakdown)
 * lives on `MyOrderDetailDto` and is only fetched when a single order is opened.
 */
export interface MyOrderDto {
    id: string;
    orderNumber: string;
    totalAmount: number;
    createdAt: string;
    /**
     * Teklif onaylanırken seçilen yol. PROJECT_* = proje siparişi, INVOICE =
     * teslimat siparişi; liste bu seçimi rozetle gösterir.
     */
    orderType?: string | null;
    /** Kept so the project screens can group this feed by project. */
    projectId?: string | null;
    /**
     * Bağlı proje — sipariş listesinde gösterilir. NULL ise sipariş bir projeye
     * bağlı değildir (teklifin proje açmayan yolu) ve listede "Teslimat
     * siparişi" olarak işaretlenir.
     */
    project?: { id: string; projectNumber?: string | null; projectName: string } | null;
    customer?: { id: string; companyName: string } | null;
    addonSalesOrders?: MyOrderListAddonDto[];
    billingSummary?: OrderBillingFiguresDto | null;
}

/** An additional order on the detail page — the full row plus its own summary. */
export interface MyOrderAddonDto extends MyOrderListAddonDto {
    orderType: string;
    status: string;
    revisionNumber?: number | null;
    createdAt: string;
    orderDate?: string | null;
    /** JSON percent array copied from the tender (e.g. "[30,20,10,40]"). */
    paymentStages?: string | null;
    billingSummary?: BillingSummaryDto | null;
}

export interface MyOrderReportDto {
    id: string;
    workDate: string;
    /** Entry timestamp — the addon-order slices are cut on this, not on workDate. */
    reportDate?: string | null;
    reportType: string;
    operationsDone: string;
    technicalNotes?: string | null;
    workedMinutes: number;
    overtimeMinutes: number;
    overtimeCost: number;
    overtimeHourlyRate?: number;
    isSigned: boolean;
    signedAt?: string | null;
    employee?: { id: string; firstName: string; lastName: string } | null;
}

export interface MyOrderCostSummary {
    orderAmount: number;
    expensesTotal: number;
    extraMaterialsTotal: number;
    overtimeTotal: number;
    addonTotal: number;
    grandTotal: number;
}

export interface MyOrderDetailDto extends MyOrderDto {
    tenantId: string;
    orderType: string;
    status: string;
    /** JSON percent array copied from the tender (e.g. "[30,20,10,40]"). */
    paymentStages?: string | null;
    /** Geschäftsdatum des Auftrags; leer = `createdAt`. */
    orderDate?: string | null;
    customerId?: string | null;
    /**
     * Auftragsbestätigung: Einleitungstext der Titelseite. NULL = noch nie
     * bearbeitet, dann gilt der Einleitungstext der Offerte.
     */
    confirmationNote?: string | null;
    /** «Gültig bis» der Bestätigung. NULL = Auftragsdatum + 1 Monat. */
    confirmationValidUntil?: string | null;
    customer?: { id: string; companyName: string; mainEmail?: string | null; mainPhone?: string | null; address?: string | null } | null;
    createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
    /**
     * Siparişin doğduğu teklif. Adresler ve teslim tarihi SİPARİŞTE DEĞİL burada
     * durur; sipariş görünümünün genel bakışı hangisini göstereceğini `orderType`
     * ile seçer: proje siparişinde montaj adresi, teslimat siparişinde teslimat
     * adresi + teslim tarihi.
     */
    tender?: {
        id: string;
        tenderNumber: string;
        commissionNumber?: string | null;
        /** Verkäufer — teklifin satıcısı; boşsa teklifi oluşturan kişi kullanılır. */
        salespersonName?: string | null;
        createdBy?: { firstName: string; lastName: string } | null;
        billingAddress?: string | null;
        installationAddress?: string | null;
        deliveryAddress?: string | null;
        internalDeliveryDate?: string | null;
    } | null;
    addonSalesOrders?: MyOrderAddonDto[];
    billingSummary?: BillingSummaryDto | null;
    parentSalesOrder?: { id: string; orderNumber: string } | null;
    project?: {
        id: string;
        projectName: string;
        status: ProjectStatus;
        plannedBudget?: number;
        actualCost?: number;
        startDate?: string | null;
        endDate?: string | null;
        phases?: Array<{ id: string; phaseName: string; progressPercentage: number; isCompleted: boolean }>;
    } | null;
    reports?: MyOrderReportDto[];
    expenses?: Array<{ id: string; expenseType: string; amount: number; description?: string | null; expenseDate: string }>;
    // Malzeme/ürün birleşmesi (2026-08-14): satırlar `article` taşır; eski
    // yanıtların `material` biçimi opsiyonel yedek olarak kaldı.
    extraMaterials?: Array<{ id: string; quantity: number; unitPrice: number; description?: string | null; addedAt: string; article?: { id: string; name: string; articleCode: string } | null; material?: { id: string; name: string; serialId: string } | null }>;
    costSummary?: MyOrderCostSummary;
}

export interface CreateInvoiceInput {
    salesOrderId?: string | null;
    projectId?: string | null;
    billingType: InvoiceBillingType;
    kind?: InvoiceKind | null;
    percent?: number | null;
    /** Rechnungsdatum (ISO gün). Verilmezse sunucu "şimdi" kullanır. */
    invoiceDate?: string | null;
    /** Fälligkeit / vade (ISO gün). */
    dueDate?: string | null;
    salespersonName?: string | null;
    commissionNumber?: string | null;
    // invoiceNumber kasıtlı olarak YOK: Rechnungsnummer sunucuda üretilir
    // (RE- serisi yalnızca ileri gider), gövdeden gelen numara kabul edilmez.
    notes?: string | null;
}

/** Eine Position der Direktrechnung, so wie sie im Editor steht. */
export interface DirectInvoiceLineInput {
    description: string;
    quantity?: number | null;
    unitAmount?: number | null;
    unit?: string | null;
    /** Katalogartikel, aus dem die Zeile kopiert wurde (Herkunftsnachweis). */
    articleId?: string | null;
}

/**
 * Direktrechnung — die selbst ausgefüllte Vorlage: kein Auftrag, kein Projekt.
 * Der Empfänger und der Steuersatz stehen darum in der Anfrage; die Positionen
 * SIND der Betrag (Preise netto, `vatRate` schlägt darauf).
 */
export interface CreateDirectInvoiceInput {
    customerId?: string | null;
    recipientName: string;
    /** Ganze Zeilen, wie sie im Empfängerblock stehen sollen. */
    recipientAddress?: string | null;
    introText?: string | null;
    invoiceDate?: string | null;
    dueDate?: string | null;
    salespersonName?: string | null;
    commissionNumber?: string | null;
    vatRate?: number | null;
    notes?: string | null;
    lines: DirectInvoiceLineInput[];
}
