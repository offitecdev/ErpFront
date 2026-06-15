import { create } from 'zustand';
import { inventoryApi, articleApi } from '../lib/api/inventory';
import type {
    InventoryLocation,
    InventoryArticle,
    ArticleStockSummary,
    StockBalanceRow,
    StockMovementRow,
    PurchaseProposalRow,
    InventoryDashboard,
    MovementType,
} from '../types/inventory';

interface InventoryState {
    dashboard: InventoryDashboard | null;
    dashboardLoading: boolean;
    fetchDashboard: () => Promise<void>;

    locations: InventoryLocation[];
    fetchLocations: () => Promise<void>;
    createLocation: (input: {
        locationName: string;
        locationType: InventoryLocation['locationType'];
        parentLocationId?: string | null;
    }) => Promise<void>;

    articles: ArticleStockSummary[];
    articlesLoading: boolean;
    fetchArticlesSummary: () => Promise<void>;
    createArticle: (data: Partial<InventoryArticle>) => Promise<InventoryArticle>;
    updateArticle: (id: string, patch: Partial<InventoryArticle>) => Promise<InventoryArticle>;
    deleteArticle: (id: string) => Promise<void>;

    balances: StockBalanceRow[];
    fetchBalances: (locationId?: string) => Promise<void>;

    movements: StockMovementRow[];
    fetchMovements: (articleId: string) => Promise<void>;

    proposals: PurchaseProposalRow[];
    fetchProposals: () => Promise<void>;
    resolveProposal: (id: string, isApproved: boolean) => Promise<void>;

    scanMovement: (input: {
        codeOrBarcode: string;
        movementType: MovementType;
        quantity: number;
        unitCost?: number | null;
        sourceLocationId?: string | null;
        destLocationId?: string | null;
        referenceId?: string | null;
        description?: string | null;
    }) => Promise<StockMovementRow>;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
    dashboard: null,
    dashboardLoading: false,
    fetchDashboard: async () => {
        set({ dashboardLoading: true });
        try {
            const dashboard = await inventoryApi.dashboard();
            set({ dashboard });
        } finally {
            set({ dashboardLoading: false });
        }
    },

    locations: [],
    fetchLocations: async () => {
        const locations = await inventoryApi.listLocations();
        set({ locations });
    },
    createLocation: async (input) => {
        const created = await inventoryApi.createLocation(input);
        set({ locations: [created, ...get().locations] });
    },

    articles: [],
    articlesLoading: false,
    fetchArticlesSummary: async () => {
        set({ articlesLoading: true });
        try {
            const articles = await inventoryApi.articlesSummary();
            set({ articles });
        } finally {
            set({ articlesLoading: false });
        }
    },
    createArticle: async (data) => {
        const created = await articleApi.create(data);
        await get().fetchArticlesSummary();
        return created;
    },
    updateArticle: async (id, patch) => {
        const updated = await articleApi.update(id, patch);
        await get().fetchArticlesSummary();
        return updated;
    },
    deleteArticle: async (id) => {
        await articleApi.delete(id);
        set({ articles: get().articles.filter((a) => a.id !== id) });
    },

    balances: [],
    fetchBalances: async (locationId) => {
        const balances = await inventoryApi.getBalances(locationId);
        set({ balances });
    },

    movements: [],
    fetchMovements: async (articleId) => {
        const movements = await inventoryApi.getMovements(articleId);
        set({ movements });
    },

    proposals: [],
    fetchProposals: async () => {
        const proposals = await inventoryApi.listProposals();
        set({ proposals });
    },
    resolveProposal: async (id, isApproved) => {
        await inventoryApi.resolveProposal(id, isApproved);
        await get().fetchProposals();
        await get().fetchDashboard();
    },

    scanMovement: async (input) => {
        const res = await inventoryApi.scanMovement(input);
        await get().fetchDashboard();
        await get().fetchArticlesSummary();
        return res.data;
    },
}));
