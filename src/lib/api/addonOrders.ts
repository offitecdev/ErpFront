import type { TenderDiscountEntry } from '@/pages/sales/detail/utils/tenderDiscounts.utils';
import { apiClient } from '../axios';
import type { PaymentStage } from '../paymentSchedule';
import type { OrderBillingFiguresDto } from '../../types/billing';

/**
 * ── NACHTRÄGE (Zusatzaufträge, NT-…) ─────────────────────────────────────────
 * Der eigene Weg des Zusatzauftrags (`/addon-orders`, 05.09.2026): die Liste
 * aller Nachträge, der Beleg aus der Id allein und der FREIE Nachtrag, dessen
 * Positionen (Produkte/Material aus dem Katalog, freie Zeilen) direkt erfasst
 * werden — unabhängig von den Rapporten.
 */

export interface AddonOrderListItemDto {
    id: string;
    orderNumber: string;
    legacyNumber?: string | null;
    revisionNumber?: number | null;
    orderType: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    /** Geschäftsdatum (Tag der Zusatzarbeit / des Nachtrags); leer = createdAt. */
    orderDate?: string | null;
    parentSalesOrderId: string;
    parentSalesOrder?: { id: string; orderNumber: string; orderType?: string | null; tenderId?: string | null } | null;
    projectId?: string | null;
    project?: { id: string; projectNumber?: string | null; projectName: string } | null;
    customerId?: string | null;
    customer?: { id: string; companyName: string } | null;
    createdBy?: { firstName?: string | null; lastName?: string | null } | null;
    billingSummary?: OrderBillingFiguresDto | null;
}

export interface AddonDocumentLine {
    description: string;
    quantity: number;
    unitPrice: number;
    unit: string;
    discounts: TenderDiscountEntry[];
    sortOrder: number;
}

export interface AddonOrderLineMaterialDto {
    documentLine?: AddonDocumentLine | null;
    id: string;
    quantity: number;
    unitPrice: number;
    description?: string | null;
    addedAt: string;
    /** true = dem Nachtrag selbst gestempelt (bearbeitbar); false = geerbt (alte Nachträge). */
    own: boolean;
    article: { id: string; name: string; articleCode: string; unit?: string | null; salePrice: number } | null;
}

export interface AddonOrderLineExpenseDto {
    documentLine?: AddonDocumentLine | null;
    id: string;
    expenseType: string;
    amount: number;
    description?: string | null;
    expenseDate: string;
    own: boolean;
}

export interface AddonOrderLineOvertimeDto {
    id: string;
    workDate: string;
    reportDate?: string | null;
    overtimeMinutes: number;
    overtimeHourlyRate: number;
    overtimeCost: number;
    operationsDone?: string | null;
    employee?: { id: string; firstName: string; lastName: string } | null;
}

/** Alles, was das Nachtrags-PDF und der Editor brauchen — in EINER Antwort. */
export interface AddonOrderDocumentDto {
    addonDiscounts?: string | null;
    id: string;
    orderNumber: string;
    legacyNumber?: string | null;
    revisionNumber?: number | null;
    status: string;
    totalAmount: number;
    orderDate?: string | null;
    createdAt: string;
    /** Einleitungstext des Belegs; NULL = Standardsatz der Vorlage. */
    confirmationNote?: string | null;
    /** Zahlungsplan als JSON-Ratenliste (`SalesOrder.paymentStages`); NULL = frei. */
    paymentStages?: string | null;
    /** Bereits fakturiert → Positionen sind eingefroren. */
    invoiced: boolean;
    parentSalesOrder: { id: string; orderNumber: string; orderDate?: string | null; createdAt: string; tenderId?: string | null } | null;
    project: { id: string; projectNumber?: string | null; projectName: string } | null;
    customer: { id: string; companyName: string; address?: string | null; mainEmail?: string | null; mainPhone?: string | null } | null;
    tender: {
        id: string;
        tenderNumber: string;
        commissionNumber?: string | null;
        customerReference?: string | null;
        currency?: string | null;
        salespersonName?: string | null;
        billingAddress?: string | null;
        installationAddress?: string | null;
        deliveryAddress?: string | null;
    } | null;
    createdBy: { id: string; firstName: string; lastName: string } | null;
    lines: {
        materials: AddonOrderLineMaterialDto[];
        expenses: AddonOrderLineExpenseDto[];
        overtime: AddonOrderLineOvertimeDto[];
    };
}

/** Eine Zeile, wie der Editor sie schickt. PRODUCT = Artikel × Menge × Preis, TEXT = freie Zeile mit Betrag. */
export interface AddonOrderLineInput {
    longDescription?: string | null;
    unit?: string | null;
    discounts?: TenderDiscountEntry[];
    id?: string | null;
    kind: 'PRODUCT' | 'TEXT';
    articleId?: string | null;
    quantity?: number | null;
    /** Leer = Verkaufspreis des Artikels. */
    unitPrice?: number | null;
    amount?: number | null;
    description?: string | null;
}

export interface AddonOrderSavedDto {
    id: string;
    orderNumber: string;
    totalAmount: number;
    orderDate?: string | null;
    confirmationNote?: string | null;
    paymentStages?: string | null;
}

/** Ein Artikel des Hauptauftrags, der gemindert werden kann (16.09.2026). */
export interface MinderungSourceDto {
    articleId: string;
    description: string;
    unit: string;
    /** Preis, zu dem der Artikel verkauft wurde (netto). */
    unitPrice: number;
    /** Menge, die noch wegfallen kann. */
    available: number;
}

export const addonOrdersApi = {
    /** Was im Hauptauftrag steht und gemindert werden kann. */
    minderungSources: async (parentSalesOrderId: string, excludeAddonId?: string | null): Promise<MinderungSourceDto[]> => {
        const params = new URLSearchParams({ parentSalesOrderId });
        if (excludeAddonId) params.set('excludeAddonId', excludeAddonId);
        const res = await apiClient.get(`/addon-orders/minderung-sources?${params}`);
        return Array.isArray(res.data?.items) ? res.data.items : [];
    },

    list: async (filter: { parentSalesOrderId?: string | null; projectId?: string | null; customerId?: string | null; search?: string } = {}): Promise<AddonOrderListItemDto[]> => {
        const params = new URLSearchParams();
        if (filter.parentSalesOrderId) params.set('parentSalesOrderId', filter.parentSalesOrderId);
        if (filter.projectId) params.set('projectId', filter.projectId);
        if (filter.customerId) params.set('customerId', filter.customerId);
        if (filter.search) params.set('search', filter.search);
        const res = await apiClient.get(`/addon-orders${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    document: async (id: string): Promise<AddonOrderDocumentDto> => {
        const res = await apiClient.get(`/addon-orders/${id}/document`);
        return res.data;
    },

    create: async (input: {
        parentSalesOrderId: string;
        discounts?: TenderDiscountEntry[];
        orderDate?: string | null;
        note?: string | null;
        /** Ratenliste; null oder weggelassen = freier Plan. */
        paymentStages?: PaymentStage[] | null;
        lines: AddonOrderLineInput[];
    }): Promise<{ message: string; salesOrder: AddonOrderSavedDto }> => {
        const res = await apiClient.post('/addon-orders', input);
        return res.data;
    },

    /** Positionen ersetzen (letzter Stand gilt); Datum, Text und Zahlungsplan optional. */
    replaceLines: async (id: string, input: { discounts?: TenderDiscountEntry[]; lines?: AddonOrderLineInput[]; orderDate?: string | null; note?: string | null; paymentStages?: PaymentStage[] | null }): Promise<{ message: string; salesOrder: AddonOrderSavedDto }> => {
        const res = await apiClient.put(`/addon-orders/${id}/lines`, input);
        return res.data;
    },
};
