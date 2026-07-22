import { apiClient } from '../axios';
import type {
    InventoryLocation,
    InventoryArticle,
    ArticleStockSummary,
    ArticleStockInfo,
    ArticleListPage,
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
        const res = await apiClient.get(`/inventory/articles/summary/paged?${query.toString()}`);
        return res.data;
    },

    // Tek ürünün yalın canlı stok bilgisi (sayaç + ortalama maliyet). Depo/lokasyon,
    // tedarikçi listesi ve görsel çekilmez — stok hareketi sonrası hızlı yenileme için.
    getArticleStock: async (id: string): Promise<ArticleStockInfo> => {
        const res = await apiClient.get(`/inventory/articles/${id}/stock`);
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
