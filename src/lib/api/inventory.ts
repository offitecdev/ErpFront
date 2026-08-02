import { apiClient, getShared } from '../axios';
import type {
    InventoryLocation,
    InventoryArticle,
    ArticleStockSummary,
    ArticleStockInfo,
    ArticleDetail,
    ArticleDetailStats,
    ArticleDetailPatch,
    ArticleSuppliersSummary,
    ArticleListPage,
    ArticleQuickPickPage,
    StockBalanceRow,
    StockMovementRow,
    PurchaseProposalRow,
    InventoryDashboard,
    MovementType,
    SupplierRow,
    ArticleSupplierRow,
    SearchItem,
    LowStockResponse,
    ItemSuppliersResponse,
    SupplyRequestRow,
    SupplyRequestStatus,
    CreateSupplyRequestInput,
    ItemType,
    MovementListPage,
    MovementListQuery,
    SupplierSearchItem,
    BulkArticleItemInput,
    BulkArticlesResult,
    BulkMovementItemInput,
    BulkMovementsResult,
    PurchaseOrderRow,
    PurchaseOrderListPage,
    PurchaseOrderListQuery,
    PurchaseOrderStatus,
    PurchaseOrderTextTemplate,
    PurchaseOrderTextTemplatePage,
    CreatePurchaseOrderInput,
    UpdatePurchaseOrderInput,
    SendPurchaseOrderMailInput,
    SendPurchaseOrderMailResult,
    ReceivePurchaseOrderInput,
    ReceivePurchaseOrderResult,
} from '../../types/inventory';

export const inventoryApi = {
    dashboard: async (): Promise<InventoryDashboard> => {
        const res = await apiClient.get('/inventory/dashboard');
        return res.data;
    },

    listLocations: async (): Promise<InventoryLocation[]> => {
        const res = await apiClient.get('/inventory/locations');
        return res.data;
    },

    createLocation: async (input: {
        locationName: string;
        locationType: InventoryLocation['locationType'];
        parentLocationId?: string | null;
    }): Promise<InventoryLocation> => {
        const res = await apiClient.post('/inventory/locations', input);
        return res.data;
    },

    getBalances: async (locationId?: string): Promise<StockBalanceRow[]> => {
        const params = locationId ? `?locationId=${locationId}` : '';
        const res = await apiClient.get(`/inventory/balances${params}`);
        return res.data;
    },

    articlesSummary: async (includeImages = false): Promise<ArticleStockSummary[]> => {
        // Base64 thumbnails make this list response ~1MB+; only request them for
        // consumers that actually render images (e.g. the product picker).
        const query = includeImages ? '?includeImages=true' : '';
        try {
            const res = await apiClient.get(`/inventory/articles/summary${query}`);
            return res.data;
        } catch {
            const res = await apiClient.get(`/articles?includeStock=true${includeImages ? '&includeImages=true' : ''}`);
            return res.data;
        }
    },

    // Server-side pagination for the products list / tender picker — pulls one
    // page (default 15) at a time with search/status/itemType applied in the DB.
    // Returns only the lean fields the table shows plus id; images and detail
    // fields are NOT fetched here (load product detail separately by id).
    articlesSummaryPaged: async (params: {
        page?: number;
        pageSize?: number;
        search?: string;
        status?: string;
        itemType?: string;
        includeDescription?: boolean;
        // Kolon bazlı filtreler (tablo filtre satırı) — DB'de tek kolona daraltır.
        code?: string;
        name?: string;
        barcode?: string;
        sortBy?: string;
        sortDirection?: 'asc' | 'desc';
    }): Promise<ArticleListPage> => {
        const query = new URLSearchParams();
        query.set('page', String(params.page ?? 1));
        query.set('pageSize', String(params.pageSize ?? 15));
        if (params.search) query.set('search', params.search);
        if (params.status) query.set('status', params.status);
        if (params.itemType) query.set('itemType', params.itemType);
        if (params.includeDescription) query.set('includeDescription', 'true');
        if (params.code) query.set('code', params.code);
        if (params.name) query.set('name', params.name);
        if (params.barcode) query.set('barcode', params.barcode);
        if (params.sortBy) query.set('sortBy', params.sortBy);
        if (params.sortDirection) query.set('sortDirection', params.sortDirection);
        const res = await apiClient.get(`/inventory/articles/summary/paged?${query.toString()}`);
        return res.data;
    },

    /**
     * Product picker feed. Returns ONLY the fields that end up on a quote line —
     * id, name, description, unit, price — instead of the full article record
     * (code, category, barcodes, status, stock levels, created date) plus the
     * stock-balance JOIN behind `totalQuantity`. None of that is shown in the
     * picker, and none of it is copied onto the line.
     */
    articlesQuickPick: async (params: {
        page?: number;
        pageSize?: number;
        search?: string;
    }): Promise<ArticleQuickPickPage> => {
        const query = new URLSearchParams();
        query.set('page', String(params.page ?? 1));
        query.set('pageSize', String(params.pageSize ?? 15));
        query.set('lean', 'true');
        query.set('includeDescription', 'true');
        if (params.search) query.set('search', params.search);
        const res = await apiClient.get(`/inventory/articles/summary/paged?${query.toString()}`);
        return res.data;
    },

    // Tek ürünün yalın canlı stok bilgisi (sayaç + ortalama maliyet). Depo/lokasyon,
    // tedarikçi listesi ve görsel çekilmez — stok hareketi sonrası hızlı yenileme için.
    getArticleStock: async (id: string): Promise<ArticleStockInfo> => {
        const res = await apiClient.get(`/inventory/articles/${id}/stock`);
        return res.data;
    },

    // Ürün detay ekranının başlık tablosu — yalnızca ekranda görünen alanlar.
    // Tedarikçiler ve hareketler bu yanıtta YOKTUR; kendi uçlarından, ilgili
    // düğmeye basıldığında yüklenirler.
    getArticleDetail: async (id: string): Promise<ArticleDetail> => {
        const res = await getShared<ArticleDetail>(`/inventory/articles/${id}/detail`);
        return res.data;
    },

    // Maliyet ve açık sipariş taraması ana başlığı bloke etmez; id bilindiği
    // için detay isteğiyle aynı anda başlatılır.
    getArticleDetailStats: async (id: string): Promise<ArticleDetailStats> => {
        const res = await getShared<ArticleDetailStats>(`/inventory/articles/${id}/detail-stats`);
        return res.data;
    },

    // Görsel JSON/base64 yerine binary gelir. `version` değişmez bir cache key'i
    // oluşturur; aynı kayıt yeniden açıldığında tarayıcı indirme yapmaz.
    getArticleImage: async (id: string, version: string): Promise<Blob | null> => {
        const query = new URLSearchParams({ v: version });
        const res = await getShared<Blob>(`/inventory/articles/${id}/image?${query.toString()}`, {
            responseType: 'blob',
        });
        return res.status === 204 || !res.data || res.data.size === 0 ? null : res.data;
    },

    // Tedarikçi popup'ı — yalnızca popup açıldığında çağrılır.
    getArticleSuppliersSummary: async (id: string): Promise<ArticleSuppliersSummary> => {
        const res = await apiClient.get(`/inventory/articles/${id}/suppliers-summary`);
        return res.data;
    },

    /**
     * Detay ekranındaki "Kaydet" düğmesinin TEK ucu: alanlar, açıklama ve
     * görsel aynı istekte gider. `imageUrl` alanı hiç gönderilmezse görsel
     * değişmez; `null` gönderilirse silinir.
     */
    saveArticleDetail: async (articleId: string, patch: ArticleDetailPatch): Promise<ArticleDetail> => {
        const res = await apiClient.patch(`/inventory/articles/${articleId}/detail`, patch);
        return res.data;
    },

    searchItems: async (q: string): Promise<SearchItem[]> => {
        const res = await apiClient.get(`/inventory/search-items?q=${encodeURIComponent(q)}`);
        return res.data;
    },

    scanMovement: async (input: {
        codeOrBarcode: string;
        movementType: MovementType;
        quantity: number;
        unitCost?: number | null;
        supplierId?: string | null;
        itemKind?: 'PRODUCT' | 'MATERIAL';
        materialId?: string | null;
        sourceLocationId?: string | null;
        destLocationId?: string | null;
        referenceId?: string | null;
        description?: string | null;
    }): Promise<{ message: string; data: StockMovementRow }> => {
        const res = await apiClient.post('/inventory/movements/scan', input);
        return res.data;
    },

    getMovements: async (articleId: string): Promise<StockMovementRow[]> => {
        const res = await apiClient.get(`/inventory/movements/${articleId}`);
        return res.data;
    },

    // Tüm stok hareketleri — sayfalı, genel arama + kolon filtreleri.
    listMovements: async (params: MovementListQuery): Promise<MovementListPage> => {
        const query = new URLSearchParams();
        query.set('page', String(params.page ?? 1));
        query.set('pageSize', String(params.pageSize ?? 20));
        if (params.articleId) query.set('articleId', params.articleId);
        if (params.search) query.set('search', params.search);
        if (params.code) query.set('code', params.code);
        if (params.name) query.set('name', params.name);
        if (params.description) query.set('description', params.description);
        if (params.type) query.set('type', params.type);
        if (params.dateFrom) query.set('dateFrom', params.dateFrom);
        if (params.dateTo) query.set('dateTo', params.dateTo);
        const res = await apiClient.get(`/inventory/movements?${query.toString()}`);
        return res.data;
    },

    // Toplu ürün/malzeme ekleme (tablo / Excel içe aktarımı). Mükerrer kodlar
    // satır bazında reddedilir; `overwrite` ile kodu kayıtlı satır hata yerine
    // mevcut ürünü GÜNCELLER (dosya kazanır — sipariş Excel aktarımı bunu kullanır).
    // `itemType` ekranın türünü belirtir (PRODUCT/MATERIAL).
    bulkCreateArticles: async (
        items: BulkArticleItemInput[],
        itemType?: ItemType,
        options?: { overwrite?: boolean },
    ): Promise<BulkArticlesResult> => {
        const res = await apiClient.post('/inventory/articles/bulk', {
            items,
            itemType,
            ...(options?.overwrite ? { overwrite: true } : {}),
        });
        return res.data;
    },

    // Toplu stok hareketi (giriş/çıkış). Satır bazında hata döner.
    bulkCreateMovements: async (items: BulkMovementItemInput[]): Promise<BulkMovementsResult> => {
        const res = await apiClient.post('/inventory/movements/bulk', { items });
        return res.data;
    },

    // Tedarikçi seçici için yalın arama (ilk 10 kayıt).
    searchSuppliers: async (q: string, limit = 10): Promise<SupplierSearchItem[]> => {
        const query = new URLSearchParams();
        if (q) query.set('q', q);
        query.set('limit', String(limit));
        const res = await apiClient.get(`/inventory/suppliers/search?${query.toString()}`);
        return res.data;
    },

    listProposals: async (): Promise<PurchaseProposalRow[]> => {
        const res = await apiClient.get('/inventory/proposals');
        return res.data;
    },

    resolveProposal: async (id: string, isApproved: boolean): Promise<void> => {
        await apiClient.patch(`/inventory/proposals/${id}/resolve`, { isApproved });
    },

    listSuppliers: async (): Promise<SupplierRow[]> => {
        const res = await apiClient.get('/inventory/suppliers');
        return res.data;
    },

    getSupplier: async (id: string): Promise<SupplierRow> => {
        const res = await apiClient.get(`/inventory/suppliers/${id}`);
        return res.data;
    },

    createSupplier: async (input: Partial<SupplierRow>): Promise<SupplierRow> => {
        const res = await apiClient.post('/inventory/suppliers', input);
        return res.data;
    },

    updateSupplier: async (id: string, patch: Partial<SupplierRow>): Promise<SupplierRow> => {
        const res = await apiClient.patch(`/inventory/suppliers/${id}`, patch);
        return res.data;
    },

    listArticleSuppliers: async (articleId: string): Promise<ArticleSupplierRow[]> => {
        const res = await apiClient.get(`/inventory/articles/${articleId}/suppliers`);
        return res.data;
    },

    saveArticleSupplier: async (articleId: string, input: Partial<ArticleSupplierRow> & Partial<SupplierRow>): Promise<ArticleSupplierRow> => {
        const res = await apiClient.post(`/inventory/articles/${articleId}/suppliers`, input);
        return res.data;
    },

    updateArticleSupplier: async (articleId: string, linkId: string, input: Partial<ArticleSupplierRow>): Promise<ArticleSupplierRow> => {
        const res = await apiClient.patch(`/inventory/articles/${articleId}/suppliers/${linkId}`, input);
        return res.data;
    },

    deleteArticleSupplier: async (articleId: string, linkId: string): Promise<void> => {
        await apiClient.delete(`/inventory/articles/${articleId}/suppliers/${linkId}`);
    },
};

// Tedarik Talepleri (Supply Requests) — yalnızca ilgili kayıtları çeker.
export const supplyApi = {
    // Minimum/kritik seviyeye düşen ürün + malzemeler (eşiği tanımlı olanlar).
    lowStock: async (): Promise<LowStockResponse> => {
        const res = await apiClient.get('/inventory/supply/low-stock');
        return res.data;
    },

    // Bir kalemin daha önce alım yaptığı tedarikçiler + son alım özeti.
    itemSuppliers: async (kind: ItemType, id: string): Promise<ItemSuppliersResponse> => {
        const res = await apiClient.get(`/inventory/supply/item/${kind}/${id}/suppliers`);
        return res.data;
    },

    listRequests: async (status: SupplyRequestStatus = 'PENDING'): Promise<SupplyRequestRow[]> => {
        const res = await apiClient.get(`/inventory/supply/requests?status=${status}`);
        return res.data;
    },

    createRequest: async (input: CreateSupplyRequestInput): Promise<SupplyRequestRow & { emailPreview?: boolean }> => {
        const res = await apiClient.post('/inventory/supply/requests', input);
        return res.data;
    },

    receiveRequest: async (id: string): Promise<SupplyRequestRow> => {
        const res = await apiClient.patch(`/inventory/supply/requests/${id}/receive`);
        return res.data;
    },

    deleteRequest: async (id: string): Promise<void> => {
        await apiClient.delete(`/inventory/supply/requests/${id}`);
    },
};

// Satın Alma Siparişleri (Purchase Orders) — tek sipariş = tek tedarikçi.
export const purchaseOrdersApi = {
    list: async (params: PurchaseOrderListQuery): Promise<PurchaseOrderListPage> => {
        const query = new URLSearchParams();
        query.set('page', String(params.page ?? 1));
        query.set('pageSize', String(params.pageSize ?? 20));
        if (params.search) query.set('search', params.search);
        if (params.status) query.set('status', params.status);
        if (params.supplierId) query.set('supplierId', params.supplierId);
        if (params.reference) query.set('reference', params.reference);
        if (params.quote) query.set('quote', params.quote);
        if (params.project) query.set('project', params.project);
        if (params.supplier) query.set('supplier', params.supplier);
        if (params.dateFrom) query.set('dateFrom', params.dateFrom);
        if (params.dateTo) query.set('dateTo', params.dateTo);
        const res = await apiClient.get(`/inventory/purchase-orders?${query.toString()}`);
        return res.data;
    },

    get: async (id: string): Promise<PurchaseOrderRow> => {
        const res = await apiClient.get(`/inventory/purchase-orders/${id}`);
        return res.data;
    },

    // Çoklu tedarikçi seçiminde tedarikçi başına bir sipariş oluşur.
    create: async (orders: CreatePurchaseOrderInput[]): Promise<{ createdCount: number; orders: PurchaseOrderRow[] }> => {
        const res = await apiClient.post('/inventory/purchase-orders', { orders });
        return res.data;
    },

    // Ad değişikliği durumu etkilemez; mail sonrası içerik değişikliği UPDATED yapar.
    update: async (id: string, patch: UpdatePurchaseOrderInput): Promise<PurchaseOrderRow> => {
        const res = await apiClient.patch(`/inventory/purchase-orders/${id}`, patch);
        return res.data;
    },

    // Elle durum değişikliği — COMPLETED dışındaki durumlar arasında serbest
    // (COMPLETED yalnızca receive/mark-stocked ile yazılır).
    setStatus: async (id: string, status: Exclude<PurchaseOrderStatus, 'COMPLETED'>): Promise<PurchaseOrderRow> => {
        const res = await apiClient.patch(`/inventory/purchase-orders/${id}/status`, { status });
        return res.data;
    },

    // Mal kabul: satırları stoğa aktarır (tek satır / seçili / complete=tamamı).
    // Stok hareketi + bakiye + siparişin receivedQuantity alanı tek istekte yazılır.
    receive: async (id: string, input: ReceivePurchaseOrderInput): Promise<ReceivePurchaseOrderResult> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/receive`, input);
        return res.data;
    },

    sendMail: async (id: string, input: SendPurchaseOrderMailInput): Promise<SendPurchaseOrderMailResult> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/send-mail`, input);
        return res.data;
    },

    // Stok aktarımı tamamlandığında StockPage tarafından çağrılır.
    markStocked: async (id: string): Promise<PurchaseOrderRow> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/mark-stocked`);
        return res.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/inventory/purchase-orders/${id}`);
    },

    // ── Ön yazı (Anschreiben) taslakları — tenant geneli, SAYFALI ───────────
    // Detay penceresindeki "Taslaklar" listesi 15'erli sayfalar hâlinde gelir:
    // taslak sayısı büyüdükçe pencere tek seferde her şeyi çekmez.
    listTextTemplates: async (page = 1, pageSize = 15): Promise<PurchaseOrderTextTemplatePage> => {
        const res = await apiClient.get(`/inventory/purchase-orders/text-templates?page=${page}&pageSize=${pageSize}`);
        return res.data;
    },

    createTextTemplate: async (input: { title: string; content: string }): Promise<PurchaseOrderTextTemplate> => {
        const res = await apiClient.post('/inventory/purchase-orders/text-templates', input);
        return res.data;
    },

    updateTextTemplate: async (
        templateId: string,
        patch: { title?: string; content?: string },
    ): Promise<PurchaseOrderTextTemplate> => {
        const res = await apiClient.patch(`/inventory/purchase-orders/text-templates/${templateId}`, patch);
        return res.data;
    },

    deleteTextTemplate: async (templateId: string): Promise<void> => {
        await apiClient.delete(`/inventory/purchase-orders/text-templates/${templateId}`);
    },
};

export const articleApi = {
    list: async (params?: {
        search?: string;
        category?: string;
        status?: string;
        onlyActive?: boolean;
        includeStock?: boolean;
    }): Promise<InventoryArticle[] | ArticleStockSummary[]> => {
        const search = new URLSearchParams();
        if (params?.search) search.set('search', params.search);
        if (params?.category) search.set('category', params.category);
        if (params?.status) search.set('status', params.status);
        if (params?.onlyActive) search.set('onlyActive', 'true');
        if (params?.includeStock) search.set('includeStock', 'true');
        const qs = search.toString();
        const res = await apiClient.get(`/articles${qs ? '?' + qs : ''}`);
        return res.data;
    },

    getById: async (id: string, options?: { includeImages?: boolean }): Promise<InventoryArticle> => {
        // includeImages: false skips the base64 image payload (megabytes) for
        // consumers that only need text/pricing fields (e.g. the tender picker).
        const query = options?.includeImages === false ? '?includeImages=false' : '';
        const res = await apiClient.get(`/articles/${id}${query}`);
        return res.data;
    },

    lookupByCode: async (code: string): Promise<InventoryArticle | null> => {
        try {
            const res = await apiClient.get(`/articles/lookup/${encodeURIComponent(code)}`);
            return res.data;
        } catch {
            return null;
        }
    },

    create: async (data: Partial<InventoryArticle>): Promise<InventoryArticle> => {
        const res = await apiClient.post('/articles', data);
        return res.data;
    },

    update: async (id: string, patch: Partial<InventoryArticle>): Promise<InventoryArticle> => {
        const res = await apiClient.patch(`/articles/${id}`, patch);
        return res.data;
    },

    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/articles/${id}`);
    },
};
