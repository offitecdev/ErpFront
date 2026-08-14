import { apiClient, getShared, MAIL_REQUEST_TIMEOUT_MS } from '../axios';
import type {
    TenderListItem,
    TenderDetailDto,
    TenderPdfContentDto,
    TenderSummaryReport,
    PositionDto,
    CalculationItemDto,
    CostInput,
    ArticleDto,
    TenderFormat,
    TenderChangeLog,
    TenderChatterDto,
    TenderDocumentDto,
    TenderMailDraftDto,
    TenderTextTemplateDto,
    OfferScheduleSlotDto,
    PositionArticleMappingDto,
    TenderMaterialUsageDto,
} from '../../types/tender';
import type { PersonLite } from '../../types/maintenance';

const noteRequests = new Map<string, Promise<TenderChangeLog>>();

export interface TenderListFilter {
    customerId?: string;
    status?: 'Draft' | 'Approved' | 'Exported';
    search?: string;
    // Kolon bazlı filtreler + sıralama (Ürünler listesindeki desenle aynı) — sunucuda daraltır.
    tenderNumber?: string;
    customerName?: string;
    creatorName?: string;
    // İki durumlu iş akışı (taslak / sipariş) ve e-posta gönderim durumu.
    orderState?: 'draft' | 'order';
    mailSent?: 'yes' | 'no';
    sortBy?: 'tenderNumber' | 'customerName' | 'status' | 'createdAt';
    sortDirection?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    // 'list' → sunucu yalnızca liste tablosunun kolonlarını döner. Tam gövdeye
    // ihtiyaç duyan çağıranlar (uyarı yığını, PDF yolları) bunu göndermez.
    fields?: 'list';
}

const applyTenderFilterParams = (params: URLSearchParams, filter: TenderListFilter) => {
    if (filter.customerId) params.set('customerId', filter.customerId);
    if (filter.status) params.set('status', filter.status);
    if (filter.search) params.set('search', filter.search);
    if (filter.tenderNumber) params.set('tenderNumber', filter.tenderNumber);
    if (filter.customerName) params.set('customerName', filter.customerName);
    if (filter.creatorName) params.set('creatorName', filter.creatorName);
    if (filter.orderState) params.set('orderState', filter.orderState);
    if (filter.mailSent) params.set('mailSent', filter.mailSent);
    if (filter.sortBy) params.set('sortBy', filter.sortBy);
    if (filter.sortDirection) params.set('sortDirection', filter.sortDirection);
    if (filter.fields) params.set('fields', filter.fields);
};

export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export const tenderApi = {
    list: async (filter: TenderListFilter = {}): Promise<TenderListItem[]> => {
        const params = new URLSearchParams();
        applyTenderFilterParams(params, filter);
        if (filter.page) params.set('page', String(filter.page));
        if (filter.pageSize) params.set('pageSize', String(filter.pageSize));
        const res = await apiClient.get(`/tenders${params.toString() ? '?' + params : ''}`);
        return Array.isArray(res.data) ? res.data : res.data.items || [];
    },

    listPaged: async (filter: TenderListFilter = {}): Promise<PaginatedResult<TenderListItem>> => {
        const params = new URLSearchParams();
        applyTenderFilterParams(params, filter);
        params.set('page', String(filter.page ?? 1));
        params.set('pageSize', String(filter.pageSize ?? 10));
        // getShared: StrictMode'un çift koşan efekti tek HTTP isteğine iner.
        const res = await getShared<PaginatedResult<TenderListItem> | TenderListItem[]>(`/tenders?${params.toString()}`);
        if (Array.isArray(res.data)) {
            return { items: res.data, total: res.data.length, page: 1, pageSize: res.data.length || 10, totalPages: 1 };
        }
        return res.data;
    },

    getById: async (
        id: string,
        options?: {
            includeImages?: boolean;
            light?: boolean;
            includeActivities?: boolean;
            deferOrderPdfContent?: boolean;
        },
    ): Promise<TenderDetailDto> => {
        const params = new URLSearchParams();
        if (options?.includeImages) params.set('includeImages', 'true');
        // light=true keeps the response to plain position figures (no article/material
        // mappings, long descriptions or activities) — enough for read-only summaries.
        if (options?.light) params.set('light', 'true');
        if (options?.includeActivities === false) params.set('includeActivities', 'false');
        if (options?.deferOrderPdfContent) params.set('deferOrderPdfContent', 'true');
        const res = await apiClient.get(`/tenders/${id}${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    getPdfContent: async (id: string): Promise<TenderPdfContentDto> => {
        const res = await apiClient.get(`/tenders/${id}/pdf-content`);
        return res.data;
    },

    // Fetch ONLY the image URLs needed for the PDF — product images by article id
    // plus per-position uploaded images by position id — instead of re-loading the
    // whole tender detail with every image inlined.
    getProductImages: async (
        id: string,
        articleIds: string[],
        positionIds: string[] = [],
        // Receives 0..1 as the response body arrives, so the PDF overlay can show
        // real download progress instead of sitting on a fixed number.
        onProgress?: (fraction: number) => void,
    ): Promise<Array<{ id: string; imageUrl: string | null }>> => {
        const ids = [...new Set(articleIds.filter(Boolean))];
        const posIds = [...new Set(positionIds.filter(Boolean))];
        if (ids.length === 0 && posIds.length === 0) return [];
        const res = await apiClient.post(`/tenders/${id}/product-images`, { ids, positionIds: posIds }, {
            onDownloadProgress: onProgress
                ? (event) => {
                    // `total` is present because the API answers with a plain JSON
                    // body (Content-Length set, no compression middleware). Without
                    // it there is nothing to scale against, so the bar just holds.
                    if (!event.total) return;
                    onProgress(Math.min(1, event.loaded / event.total));
                }
                : undefined,
        });
        return res.data;
    },

    // Teklif kodu (AN-2026-10001) sunucuda DocumentCounter'dan üretilir; gövdede
    // gönderilen bir `tenderNumber` backend tarafından yok sayılır.
    createManual: async (input: {
        customerId?: string | null;
        format: TenderFormat;
        validUntil?: string | null;
    }): Promise<TenderListItem> => {
        const res = await apiClient.post('/tenders', input);
        return res.data;
    },

    updateMeta: async (id: string, input: {
        customerId?: string | null;
        format?: TenderFormat;
        validUntil?: string | null;
        billingAddress?: string | null;
        installationAddress?: string | null;
        deliveryAddress?: string | null;
        billingSameAsInstallation?: boolean | null;
        internalDeliveryDate?: string | null;
        commissionNumber?: string | null;
        /** Kundenreferenz — "Referenz" on the offer PDF. */
        customerReference?: string | null;
        priceList?: string | null;
        currency?: string | null;
        directDiscount?: number | null;
        directDiscountLabel?: string | null;
        extraDiscount?: number | null;
        extraDiscountLabel?: string | null;
        /** Stacked document discounts as JSON — see `tenderDiscounts.utils.ts`. */
        totalDiscounts?: string | null;
        paymentStages?: string | null;
        coverLetter?: string | null;
        closingNote?: string | null;
        closingImages?: string | null;
        /** CC-Empfänger der Offerte; eine leere Liste löscht sie. */
        ccEmails?: string[];
    }): Promise<TenderListItem> => {
        try {
            const res = await apiClient.patch(`/tenders/${id}/meta`, input);
            return res.data;
        } catch (error: any) {
            if (error.response?.status !== 404) throw error;
            const fallback = await apiClient.patch(`/tenders/${id}`, input);
            return fallback.data;
        }
    },

    importXml: async (input: {
        customerId: string;
        xmlContent: string;
        format: TenderFormat;
    }): Promise<{ message: string; tender: TenderListItem }> => {
        const res = await apiClient.post('/tenders/import', input);
        return res.data;
    },

    importSalesOrderCsv: async (input: {
        csvContent: string;
        fileName?: string | null;
    }): Promise<{
        message: string;
        tender: TenderListItem | null;
        tenders: TenderListItem[];
        summary: {
            tenderCount: number;
            createdCustomers: number;
            createdArticles: number;
            createdPositions: number;
            sourceRows: number;
        };
    }> => {
        const res = await apiClient.post('/tenders/import-sales-order-csv', input);
        return res.data;
    },

    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/tenders/${id}`);
    },

    addPosition: async (
        tenderId: string,
        position: Partial<PositionDto>
    ): Promise<{ message: string; positionId: string; position?: PositionDto }> => {
        const res = await apiClient.post(`/tenders/${tenderId}/positions`, position);
        return res.data;
    },

    addPositions: async (
        tenderId: string,
        positions: Array<{ clientId: string; position: Partial<PositionDto> }>
    ): Promise<{
        message: string;
        positions: Array<{ clientId: string; positionId: string; position?: PositionDto }>;
    }> => {
        const res = await apiClient.post(`/tenders/${tenderId}/positions/batch`, { positions });
        return res.data;
    },

    savePositions: async (
        tenderId: string,
        input: {
            positions: Array<{ clientId: string; position: Partial<PositionDto> }>;
            updates: Array<{ positionId: string; patch: Partial<PositionDto> }>;
            deleteIds: string[];
            meta: Partial<TenderListItem>;
            summary?: {
                previousGrandTotal: number;
                nextGrandTotal: number;
                previousTotalDiscounts: string;
                nextTotalDiscounts: string;
            };
        }
    ): Promise<{
        message: string;
        positions: Array<{ clientId: string; positionId: string; position?: PositionDto }>;
        updatedPositions: PositionDto[];
        deletedPositionIds: string[];
        updatedTender: Partial<TenderListItem> | null;
    }> => {
        const res = await apiClient.post(`/tenders/${tenderId}/positions/save`, input);
        return res.data;
    },

    deletePosition: async (
        tenderId: string,
        positionId: string
    ): Promise<void> => {
        await apiClient.delete(`/tenders/${tenderId}/positions/${positionId}`);
    },

    calculate: async (
        tenderId: string,
        positionId: string,
        cost: CostInput
    ): Promise<{ message: string; calculation: CalculationItemDto }> => {
        const res = await apiClient.post(
            `/tenders/${tenderId}/positions/${positionId}/calculate`,
            cost
        );
        return res.data;
    },

    approve: async (id: string): Promise<{ message: string; tender: TenderListItem }> => {
        const res = await apiClient.patch(`/tenders/${id}/approve`);
        return res.data;
    },

    createVersion: async (id: string): Promise<{ message: string; tender: TenderListItem }> => {
        const res = await apiClient.post(`/tenders/${id}/version`);
        return res.data;
    },

    exportFile: async (
        id: string,
        format: 'PDF' | 'CRBX' | 'SIA451'
    ): Promise<{ message: string; data: any }> => {
        const res = await apiClient.get(`/tenders/${id}/export?format=${format}`);
        return res.data;
    },

    getSummary: async (id: string): Promise<TenderSummaryReport> => {
        const res = await apiClient.get(`/tenders/${id}/report`);
        return res.data;
    },

    updatePosition: async (
        tenderId: string,
        positionId: string,
        patch: {
            shortDescription?: string;
            longDescription?: string | null;
            quantity?: number;
            unit?: string | null;
            unitPrice?: number | null;
            discount?: number | null;
            taxRate?: number | null;
            imageUrl?: string | null;
            npkCode?: string | null;
            rowType?: string;
            sourceArticleId?: string | null;
            displayOrder?: number;
        }
    ): Promise<PositionDto> => {
        const res = await apiClient.patch(`/tenders/${tenderId}/positions/${positionId}`, patch);
        return res.data;
    },

    mapArticle: async (
        tenderId: string,
        positionId: string,
        articleId: string,
        quantityMultiplier: number,
        options?: { discount?: number }
    ): Promise<any> => {
        const res = await apiClient.post(
            `/tenders/${tenderId}/positions/${positionId}/articles`,
            {
                articleId,
                quantityMultiplier,
                discount: options?.discount ?? 0,
            }
        );
        return res.data;
    },

    removeArticleMapping: async (
        tenderId: string,
        positionId: string,
        mappingId: string
    ): Promise<{ message: string; mappingId: string; positionId: string; updatedCalculation?: CalculationItemDto | null }> => {
        const res = await apiClient.delete(`/tenders/${tenderId}/positions/${positionId}/articles/${mappingId}`);
        return res.data;
    },

    updateArticleMapping: async (
        tenderId: string,
        positionId: string,
        mappingId: string,
        patch: { quantityMultiplier?: number; discount?: number | null }
    ): Promise<{ message: string; mapping: PositionArticleMappingDto; updatedCalculation?: CalculationItemDto | null }> => {
        const res = await apiClient.patch(`/tenders/${tenderId}/positions/${positionId}/articles/${mappingId}`, patch);
        return res.data;
    },

    /**
     * Teklife "malzeme" (ürün) ekler. Gövde alanı geriye uyum için `materialId`
     * adını korur — malzeme/ürün birleşmesinden (2026-08-14) beri bir ürün
     * (Article) id'si taşır.
     */
    mapMaterial: async (
        tenderId: string,
        materialId: string,
        quantity: number,
        description?: string
    ): Promise<{ message: string; usage: TenderMaterialUsageDto }> => {
        const res = await apiClient.post(
            `/tenders/${tenderId}/materials`,
            {
                materialId,
                quantity,
                description,
            }
        );
        return res.data;
    },

    getMaterials: async (tenderId: string): Promise<TenderMaterialUsageDto[]> => {
        const res = await apiClient.get(`/tenders/${tenderId}/materials`);
        return res.data;
    },

    removeMaterialMapping: async (
        tenderId: string,
        mappingId: string
    ): Promise<{ message: string; mappingId: string }> => {
        const res = await apiClient.delete(`/tenders/${tenderId}/materials/${mappingId}`);
        return res.data;
    },

    getActivities: async (id: string): Promise<any[]> => {
        const res = await apiClient.get(`/tenders/${id}/activities`);
        return res.data;
    },

    getLogs: async (id: string): Promise<TenderChangeLog[]> => {
        const res = await apiClient.get(`/tenders/${id}/logs`);
        return res.data;
    },

    getChatter: async (id: string): Promise<TenderChatterDto> => {
        const res = await apiClient.get(`/tenders/${id}/chatter`);
        return res.data;
    },

    addNote: async (id: string, input: { noteText: string }): Promise<TenderChangeLog> => {
        const key = `${id}|${input.noteText.trim()}`;
        const pending = noteRequests.get(key);
        if (pending) return pending;

        const request = apiClient
            .post<TenderChangeLog>(`/tenders/${id}/notes`, input)
            .then((res) => res.data)
            .finally(() => noteRequests.delete(key));
        noteRequests.set(key, request);
        return request;
    },

    getDocuments: async (id: string): Promise<TenderDocumentDto[]> => {
        const res = await apiClient.get(`/tenders/${id}/documents`);
        return res.data;
    },

    getDocumentContent: async (id: string, documentId: string): Promise<TenderDocumentDto> => {
        const res = await apiClient.get(`/tenders/${id}/documents/${documentId}/content`);
        return res.data;
    },

    addDocument: async (id: string, input: {
        fileName: string;
        file: File;
        fileType: string;
        category?: string;
    }): Promise<TenderDocumentDto> => {
        const form = new FormData();
        form.append('file', input.file, input.fileName);
        form.append('fileType', input.fileType);
        form.append('category', input.category || 'tender');
        const res = await apiClient.post(`/tenders/${id}/documents`, form);
        return res.data;
    },

    getScheduleSlots: async (id: string): Promise<OfferScheduleSlotDto[]> => {
        const res = await apiClient.get(`/tenders/${id}/schedule-slots`);
        return res.data;
    },

    createScheduleSlot: async (id: string, input: { startTime: string; endTime: string; notes?: string; technicianIds?: string[] }): Promise<OfferScheduleSlotDto> => {
        const res = await apiClient.post(`/tenders/${id}/schedule-slots`, input);
        return res.data;
    },

    updateScheduleSlot: async (id: string, slotId: string, input: { startTime: string; endTime: string; notes?: string; technicianIds?: string[] }): Promise<OfferScheduleSlotDto> => {
        const res = await apiClient.patch(`/tenders/${id}/schedule-slots/${slotId}`, input);
        return res.data;
    },

    deleteScheduleSlot: async (id: string, slotId: string): Promise<void> => {
        await apiClient.delete(`/tenders/${id}/schedule-slots/${slotId}`);
    },

    listTechnicians: async (): Promise<PersonLite[]> => {
        const res = await apiClient.get('/tenders/options/technicians');
        return res.data;
    },

    // ── Tenant-wide offer-mail drafts (shared by all tenders) ───────────────
    listMailDrafts: async (): Promise<TenderMailDraftDto[]> => {
        const res = await apiClient.get('/tenders/mail-drafts');
        return res.data;
    },

    createMailDraft: async (input: { subject: string; message: string | null }): Promise<TenderMailDraftDto> => {
        const res = await apiClient.post('/tenders/mail-drafts', input);
        return res.data;
    },

    updateMailDraft: async (draftId: string, patch: { subject?: string; message?: string | null }): Promise<TenderMailDraftDto> => {
        const res = await apiClient.patch(`/tenders/mail-drafts/${draftId}`, patch);
        return res.data;
    },

    deleteMailDraft: async (draftId: string): Promise<void> => {
        await apiClient.delete(`/tenders/mail-drafts/${draftId}`);
    },

    // ── Tenant-wide intro-text templates (Textbausteine) ────────────────────
    listTextTemplates: async (): Promise<TenderTextTemplateDto[]> => {
        const res = await apiClient.get('/tenders/text-templates');
        return res.data;
    },

    createTextTemplate: async (input: { title: string; content: string | null; isDefault?: boolean }): Promise<TenderTextTemplateDto> => {
        const res = await apiClient.post('/tenders/text-templates', input);
        return res.data;
    },

    updateTextTemplate: async (templateId: string, patch: { title?: string; content?: string | null; isDefault?: boolean }): Promise<TenderTextTemplateDto> => {
        const res = await apiClient.patch(`/tenders/text-templates/${templateId}`, patch);
        return res.data;
    },

    deleteTextTemplate: async (templateId: string): Promise<void> => {
        await apiClient.delete(`/tenders/text-templates/${templateId}`);
    },

    sendOfferMail: async (id: string, input: {
        fromEmail?: string;
        fromName?: string;
        to: string;
        subject: string;
        message: string;
        attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
    }) => {
        const res = await apiClient.post(`/tenders/${id}/send-offer-mail`, input, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    /** Vorschläge für das CC-Feld: der Kunde der Offerte und seine Kontaktpersonen. */
    getMailRecipients: async (id: string): Promise<{
        customer: { name: string; email: string } | null;
        contacts: Array<{ id: string; name: string; title?: string | null; email: string }>;
    }> => {
        const res = await apiClient.get(`/tenders/${id}/mail-recipients`);
        return res.data;
    },

    /**
     * Auftragsbestätigung an den Kunden — läuft direkt nach dem Erstellen des
     * Auftrags. Empfänger und CC bestimmt der Server aus der Offerte; Betreff
     * und Text sind optional (der Server hat einen deutschen Standardtext).
     */
    sendOrderMail: async (id: string, input: {
        to?: string;
        subject?: string;
        message?: string;
        attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
    } = {}): Promise<{ message: string; to: string; cc: string[]; orderNumber: string; preview?: boolean }> => {
        const res = await apiClient.post(`/tenders/${id}/send-order-mail`, input, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    markOfferAccepted: async (id: string) => {
        const res = await apiClient.patch(`/tenders/${id}/mark-offer-accepted`);
        return res.data;
    },
};

export const articleApi = {
    list: async (): Promise<ArticleDto[]> => {
        const res = await apiClient.get('/articles');
        return res.data;
    },
    listWithStock: async (): Promise<any[]> => {
        const res = await apiClient.get('/articles?includeStock=true');
        return res.data;
    },
    create: async (data: {
        articleCode: string;
        name: string;
        baseCost: number;
        salePrice?: number | null;
        unit: string;
        description?: string | null;
    }): Promise<ArticleDto> => {
        const res = await apiClient.post('/articles', data);
        return res.data;
    },
};
