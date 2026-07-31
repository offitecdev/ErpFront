import { apiClient, getShared } from '../axios';
import type {
    BillingSummaryDto,
    CreateInvoiceInput,
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
        const res = await apiClient.get(`/billing/summary?${params.toString()}`);
        return res.data;
    },

    listInvoices: async (filter: { projectId?: string; salesOrderId?: string; customerId?: string; status?: InvoiceStatus } = {}): Promise<InvoiceDto[]> => {
        const params = new URLSearchParams();
        if (filter.projectId) params.set('projectId', filter.projectId);
        if (filter.salesOrderId) params.set('salesOrderId', filter.salesOrderId);
        if (filter.customerId) params.set('customerId', filter.customerId);
        if (filter.status) params.set('status', filter.status);
        const res = await apiClient.get(`/billing/invoices${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    createInvoice: async (input: CreateInvoiceInput): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.post('/billing/invoices', input);
        return res.data;
    },

    updateStatus: async (id: string, status: InvoiceStatus): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.patch(`/billing/invoices/${id}/status`, { status });
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

    updatePaymentStages: async (id: string, stages: number[] | null): Promise<{ message: string; paymentStages: string | null }> => {
        const res = await apiClient.patch(`/sales-orders/${id}/payment-stages`, { paymentStages: stages });
        return res.data;
    },
};
