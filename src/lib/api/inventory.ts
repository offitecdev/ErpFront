import { apiClient } from '../axios';
import type {
    InventoryLocation,
    InventoryArticle,
    ArticleStockSummary,
    StockBalanceRow,
    StockMovementRow,
    PurchaseProposalRow,
    InventoryDashboard,
    MovementType,
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

    articlesSummary: async (): Promise<ArticleStockSummary[]> => {
        const res = await apiClient.get('/inventory/articles/summary');
        return res.data;
    },

    scanMovement: async (input: {
        codeOrBarcode: string;
        movementType: MovementType;
        quantity: number;
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

    getById: async (id: string): Promise<InventoryArticle> => {
        const res = await apiClient.get(`/articles/${id}`);
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
