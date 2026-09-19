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
    OrderCancelResultDto,
    OrderLifecycleDto,
    OrderRevertResultDto,
    ProjectListInvoiceDto,
    ProjectListOrderDto,
    UpdateOrderDraftInput,
    AccountingFiguresDto,
    CreditDocumentDto,
    FullCancelPlanDto,
    InvoicePaymentDto,
    ToBillItemDto,
    FullCancelResultDto,
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

    listProjectFlowInvoices: async (): Promise<ProjectListInvoiceDto[]> => {
        const res = await getShared<ProjectListInvoiceDto[]>('/billing/invoices?view=project-list');
        return res.data;
    },

    createInvoice: async (input: CreateInvoiceInput): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.post('/billing/invoices', input);
        return res.data;
    },

    /**
     * Die Nummer, die die nächste Rechnung bekäme — für die Vorschau der
     * Erfassungsmaske. Sie bewegt den Zähler NICHT: vergeben wird sie erst
     * beim Erstellen, darum ist sie eine Auskunft und keine Reservierung.
     */
    nextInvoiceNumber: async (): Promise<string | null> => {
        try {
            const res = await apiClient.get('/billing/invoices/next-number');
            return res.data?.invoiceNumber ?? null;
        } catch {
            return null;
        }
    },

    /** Direktrechnung — die selbst ausgefüllte Vorlage (weder Auftrag noch Projekt). */
    createDirectInvoice: async (input: CreateDirectInvoiceInput): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.post('/billing/invoices/direct', input);
        return res.data;
    },

    /**
     * Statuswechsel. `paidAt` ist der ZAHLUNGSEINGANG: das Markieren als
     * bezahlt trägt ein Datum (voreingestellt heute, im Fenster änderbar);
     * jeder andere Status löscht es serverseitig wieder.
     */
    /**
     * Eine Direktrechnung als GANZES neu schreiben. Nummer und Zahlungsstand
     * bleiben beim Beleg — der Server lässt weder eine bezahlte noch eine
     * stornierte Rechnung ändern.
     */
    updateDirectInvoice: async (id: string, input: CreateDirectInvoiceInput): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.put(`/billing/invoices/${id}/direct`, input);
        return res.data;
    },

    /** Rechnungsdatum + Fälligkeit — auch für gestellte Rechnungen. */
    updateDates: async (id: string, invoiceDate: string, dueDate: string): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.patch(`/billing/invoices/${id}/dates`, { invoiceDate, dueDate });
        return res.data;
    },

    updateStatus: async (id: string, status: InvoiceStatus, paidAt?: string | null): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.patch(`/billing/invoices/${id}/status`, { status, paidAt: paidAt ?? null });
        return res.data;
    },

    /**
     * Produktbilder für das Rechnungs-PDF — auf den Bildrahmen des Belegs
     * verkleinert. Die Direktrechnung druckt dieselbe Positionstabelle wie das
     * Angebot und braucht darum dieselben Bilder; sie hat aber keine Offerte,
     * an der der Weg `/tenders/:id/product-images` hängen könnte.
     */
    productImages: async (articleIds: string[]): Promise<Array<{ id: string; imageUrl: string }>> => {
        if (articleIds.length === 0) return [];
        const res = await apiClient.post('/billing/product-images', { ids: articleIds });
        return Array.isArray(res.data) ? res.data : [];
    },

    // ── Buchhaltung (16.09.2026, Schritt 5) ───────────────────────────────
    /** EINE Rechnung in voller Form — die Detailseite. */
    getInvoice: async (id: string): Promise<InvoiceDto> => {
        const res = await apiClient.get(`/billing/invoices/${id}`);
        return res.data;
    },

    /** Den Entwurf einer Auftragsrechnung neu rechnen. */
    updateOrderDraft: async (id: string, input: UpdateOrderDraftInput): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.put(`/billing/invoices/${id}/draft`, input);
        return res.data;
    },

    /** Ausstellen: der Entwurf bekommt seine RE-Nummer. */
    issueInvoice: async (id: string): Promise<{ message: string; invoice: InvoiceDto }> => {
        const res = await apiClient.post(`/billing/invoices/${id}/issue`);
        return res.data;
    },

    /**
     * Einen ENTWURF verwerfen. Eine ausgestellte Rechnung wird nie gelöscht,
     * auch nicht nach dem Storno — der Server lehnt das ab.
     */
    discardDraft: async (id: string): Promise<void> => {
        await apiClient.delete(`/billing/invoices/${id}`);
    },

    // ── Gegenbelege (17.09.2026, Schritt 6) ────────────────────────────────
    /** Offene Rechnung → Storno-Rechnung (eigene Nummer, negativer Betrag). */
    stornoInvoice: async (id: string, reason: string): Promise<CreditDocumentDto> => {
        const res = await apiClient.post(`/billing/invoices/${id}/storno`, { reason });
        return res.data.document;
    },

    // ── Zahlungseingänge und Übersichten (Schritt 7) ───────────────────────
    addPayment: async (id: string, input: { amount: number | null; paidAt: string; note?: string | null }): Promise<InvoicePaymentDto> => {
        const res = await apiClient.post(`/billing/invoices/${id}/payments`, input);
        return res.data.payment;
    },
    removePayment: async (id: string, paymentId: string): Promise<void> => {
        await apiClient.delete(`/billing/invoices/${id}/payments/${paymentId}`);
    },
    /** Kennzahlen der Buchhaltung — `today` = Kalendertag der Person. */
    figures: async (today: string): Promise<AccountingFiguresDto> => {
        const res = await apiClient.get(`/billing/figures?today=${encodeURIComponent(today)}`);
        return res.data;
    },
    toBill: async (today: string): Promise<ToBillItemDto[]> => {
        const res = await apiClient.get(`/billing/to-bill?today=${encodeURIComponent(today)}`);
        return Array.isArray(res.data) ? res.data : [];
    },

    /** Gutschrift zu einer ausgestellten Rechnung. `amount` fehlt = der ganze Rest. */
    creditInvoice: async (id: string, amount: number | null, reason: string): Promise<CreditDocumentDto> => {
        const res = await apiClient.post(`/billing/invoices/${id}/credit`, { amount, reason });
        return res.data.document;
    },
};

/** «Gesamten Vorgang stornieren» — Vorschau und Ausführung (Schritt 6 / F1). */
export const fullCancelApi = {
    preview: async (scope: 'ORDER' | 'PROJECT', id: string): Promise<FullCancelPlanDto> => {
        const base = scope === 'ORDER' ? '/sales-orders' : '/projects';
        const res = await apiClient.get(`${base}/${id}/full-cancel`);
        return res.data;
    },
    run: async (
        scope: 'ORDER' | 'PROJECT',
        id: string,
        input: { reason: string; credits: Record<string, number>; expectedInvoiceIds: string[] },
    ): Promise<FullCancelResultDto> => {
        const base = scope === 'ORDER' ? '/sales-orders' : '/projects';
        const res = await apiClient.post(`${base}/${id}/full-cancel`, input);
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

    listProjectFlow: async (): Promise<ProjectListOrderDto[]> => {
        const res = await getShared<ProjectListOrderDto[]>('/sales-orders/my-orders?view=project-list');
        return res.data;
    },

    getById: async (id: string): Promise<MyOrderDetailDto> => {
        const res = await apiClient.get(`/sales-orders/${id}`);
        return res.data;
    },

    /**
     * EINEN AUFTRAG ZURÜCKNEHMEN — Projektauftrag, Nachtrag oder Lieferauftrag.
     *
     * Der Server entscheidet die Folgen: Nachträge fallen mit dem Hauptauftrag,
     * das Material geht ans Lager zurück, die Offerte wird wieder ein Entwurf
     * und mit dem LETZTEN Auftrag verschwindet auch das Projekt. Genau das
     * meldet die Antwort zurück, damit die Seite weiss, wohin sie danach geht.
     */
    remove: async (id: string): Promise<{ projectDeleted: boolean; addonIds: string[]; projectId: string | null }> => {
        const res = await apiClient.delete(`/sales-orders/${id}`);
        return res.data;
    },

    /**
     * ── LÖSCHEN, STORNO, ZURÜCK IN ENTWURF (Vorgabe Samet 06.09.2026) ────────
     *
     * Was mit diesem Auftrag geschehen DARF, entscheidet der Server: die
     * Oberfläche fragt, sobald jemand «Auftrag zurücknehmen» öffnet, und zeigt
     * dann nur die Wege, die auch durchgehen — samt der Gründe, warum der
     * andere versperrt ist.
     */
    lifecycle: async (id: string): Promise<OrderLifecycleDto> => {
        const res = await apiClient.get(`/sales-orders/${id}/lifecycle`);
        return res.data;
    },

    /** Der Auftrag verschwindet, seine Offerte wird wieder ein Entwurf. */
    revertToDraft: async (id: string): Promise<OrderRevertResultDto> => {
        const res = await apiClient.post(`/sales-orders/${id}/revert-to-draft`);
        return res.data;
    },

    /** Der Auftrag bleibt stehen und gilt als zurückgenommen. */
    cancel: async (id: string, reason?: string | null): Promise<OrderCancelResultDto> => {
        const res = await apiClient.post(`/sales-orders/${id}/cancel`, { reason: reason || null });
        return res.data;
    },

    uncancel: async (id: string): Promise<{ salesOrderIds: string[]; projectRestored: boolean }> => {
        const res = await apiClient.post(`/sales-orders/${id}/uncancel`);
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
