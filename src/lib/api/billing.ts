import { apiClient, getShared } from '../axios';
import type { PaymentStage } from '../paymentSchedule';
import type {
    BillingSummaryDto,
    CreateDirectInvoiceInput,
    CreateInvoiceInput,
    InvoiceCategory,
    InvoiceDto,
    InvoiceStatus,
    MyOrderDetailDto,
    MyOrderDto,
} from '../../types/billing';

export const billingApi = {
    getSummary: async (target: { salesOrderId?: string; projectId?: string }): Promise<BillingSummaryDto> => {
        const params = new URLSearchParams();
        if (target.salesOrderId) params.set('salesOrderId', target.salesOrderId);
        if (target.projectId) params.set('projectId', target.projectId);
        const res = await getShared<BillingSummaryDto>(`/billing/summary?${params.toString()}`);
        return res.data;
    },

    listInvoices: async (filter: { projectId?: string; salesOrderId?: string; customerId?: string; status?: InvoiceStatus; category?: InvoiceCategory } = {}): Promise<InvoiceDto[]> => {
        const params = new URLSearchParams();
        if (filter.projectId) params.set('projectId', filter.projectId);
        if (filter.salesOrderId) params.set('salesOrderId', filter.salesOrderId);
        if (filter.customerId) params.set('customerId', filter.customerId);
        if (filter.status) params.set('status', filter.status);
        // Rechnungstyp — vom Server aus dem Beleg abgeleitet, nicht gespeichert.
        if (filter.category) params.set('category', filter.category);
        const res = await apiClient.get(`/billing/invoices${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    createInvoice: async (input: CreateInvoiceInput): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.post('/billing/invoices', input);
        return res.data;
    },

    /** Direktrechnung — die selbst ausgefüllte Vorlage (weder Auftrag noch Projekt). */
    createDirectInvoice: async (input: CreateDirectInvoiceInput): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.post('/billing/invoices/direct', input);
        return res.data;
    },

    updateStatus: async (id: string, status: InvoiceStatus): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.patch(`/billing/invoices/${id}/status`, { status });
        return res.data;
    },

    /** Kalıcı silme — sunucu yalnızca iptal edilmiş faturalar için izin verir. */
    deleteInvoice: async (id: string): Promise<{ message: string }> => {
        const res = await apiClient.delete(`/billing/invoices/${id}`);
        return res.data;
    },
};

export const myOrdersApi = {
    // getShared: StrictMode'un çift koşan efekti tek HTTP isteğine iner. Aynı
    // feed'i paralel isteyen proje ekranları da (akış rozetleri, süreç modalı)
    // tek çağrıyı paylaşır. Cevap paylaşıldığı için çağıranlar diziyi MUTATE
    // ETMEMELİ — hepsi filter/map/[...].sort ile yeni dizi üretiyor.
    list: async (search?: string): Promise<MyOrderDto[]> => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        const res = await getShared<MyOrderDto[]>(`/sales-orders/my-orders${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    getById: async (id: string): Promise<MyOrderDetailDto> => {
        const res = await apiClient.get(`/sales-orders/${id}`);
        return res.data;
    },

    updatePaymentStages: async (id: string, stages: PaymentStage[] | null): Promise<{ message: string; paymentStages: string | null }> => {
        const res = await apiClient.patch(`/sales-orders/${id}/payment-stages`, { paymentStages: stages });
        return res.data;
    },

    /**
     * Auftragsbestätigung: Einleitungstext und «Gültig bis» des Auftrags. Beide
     * werden zusammen geschrieben — genau die zwei Felder, die das Fenster der
     * Auftragskarte zeigt. NULL bedeutet «zurück auf die Vorgabe» (Text der
     * Offerte, Auftragsdatum + 1 Monat), nicht «leer drucken».
     */
    updateOrderConfirmation: async (
        id: string,
        input: { confirmationNote?: string | null; confirmationValidUntil?: string | null },
    ): Promise<{ message: string; confirmationNote: string | null; confirmationValidUntil: string | null }> => {
        const res = await apiClient.patch(`/sales-orders/${id}/order-confirmation`, input);
        return res.data;
    },
};
