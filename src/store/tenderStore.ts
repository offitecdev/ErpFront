import { create } from 'zustand';
import { tenderApi, articleApi, type TenderListFilter } from '../lib/api/tender';
import { inventoryApi } from '../lib/api/inventory';
import type {
    TenderListItem,
    TenderDetailDto,
    TenderPdfContentDto,
    TenderSummaryReport,
    CostInput,
    ArticleDto,
    TenderFormat,
    PositionDto,
    TenderChangeLog,
} from '../types/tender';
import type { ArticleStockSummary, InventoryLocation } from '../types/inventory';

interface TenderState {
    list: TenderListItem[];
    listTotal: number;
    listPage: number;
    listPageSize: number;
    listTotalPages: number;
    loadingList: boolean;
    filter: TenderListFilter;
    setFilter: (f: TenderListFilter) => void;
    fetchList: (override?: TenderListFilter) => Promise<void>;

    detail: TenderDetailDto | null;
    loadingDetail: boolean;
    fetchDetail: (id: string, silent?: boolean) => Promise<void>;
    ensurePdfContent: (id: string) => Promise<TenderPdfContentDto>;

    summary: TenderSummaryReport | null;
    loadingSummary: boolean;
    fetchSummary: (id: string) => Promise<void>;

    articles: ArticleDto[];
    fetchArticles: () => Promise<void>;
    createArticle: (data: Omit<ArticleDto, 'id' | 'tenantId'>) => Promise<ArticleDto>;

    stockArticles: ArticleStockSummary[];
    stockArticlesLoading: boolean;
    stockArticlesLoaded: boolean;
    stockArticlesHaveImages: boolean;
    locations: InventoryLocation[];
    fetchStockArticles: (force?: boolean, includeImages?: boolean) => Promise<void>;
    fetchLocations: () => Promise<void>;

    activities: any[];
    fetchActivities: (tenderId: string) => Promise<void>;
    logs: TenderChangeLog[];
    fetchLogs: (tenderId: string) => Promise<void>;

    createTender: (input: { customerId?: string | null; tenderNumber: string; format: TenderFormat; validUntil?: string | null }) => Promise<TenderListItem>;
    importTender: (input: { customerId: string; xmlContent: string; format: TenderFormat }) => Promise<TenderListItem>;
    importSalesOrderCsv: (input: { csvContent: string; fileName?: string | null }) => Promise<TenderListItem | null>;
    deleteTender: (id: string) => Promise<void>;
    addPosition: (tenderId: string, p: Partial<PositionDto>) => Promise<void>;
    updatePosition: (tenderId: string, positionId: string, patch: {
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
    }) => Promise<void>;
    saveCalculation: (tenderId: string, positionId: string, cost: CostInput) => Promise<void>;
    approveTender: (id: string) => Promise<void>;
    createVersion: (id: string) => Promise<TenderListItem>;
    deletePosition: (tenderId: string, positionId: string) => Promise<void>;
    mapArticle: (
        tenderId: string,
        positionId: string,
        articleId: string,
        qty: number,
        options?: { discount?: number }
    ) => Promise<void>;
    removeArticleMapping: (tenderId: string, positionId: string, mappingId: string) => Promise<void>;
}

let stockArticlesRequest: Promise<void> | null = null;
let stockArticlesRequestHasImages = false;
let detailRequestId: string | null = null;
let detailRequest: Promise<void> | null = null;
let pdfContentRequestId: string | null = null;
let pdfContentRequest: Promise<TenderPdfContentDto> | null = null;

export const useTenderStore = create<TenderState>((set, get) => ({
    list: [],
    listTotal: 0,
    listPage: 1,
    listPageSize: 10,
    listTotalPages: 1,
    loadingList: false,
    filter: {},
    setFilter: (filter) => set({ filter }),

    fetchList: async (override) => {
        // Verilen filtre SAKLANIR. TenderList her turda override geçiyor ama
        // bunu `filter`a yazan kimse yoktu; `filter` sonsuza dek {} kalıyordu.
        // İçe aktarma / onaylama / yeni sürüm sonrası mutasyonlar fetchList'i
        // ARGÜMANSIZ çağırdığından istek {} ile gidiyor, sayfalama düşüyor ve
        // sunucu tenant'ın BÜTÜN tekliflerini tek cevapta döndürüyordu.
        if (override) set({ filter: override });
        const filter = override ?? get().filter;

        // Liste her zaman sayfalı çekilir — sayfa/pageSize verilmediyse mevcut
        // sayfa boyutuna düşülür. "Hepsini getir" yolu bilinçli olarak yok:
        // bu store yalnızca sayfalı teklif listesini besliyor.
        const paged = {
            ...filter,
            page: filter.page ?? get().listPage,
            pageSize: filter.pageSize ?? get().listPageSize,
        };

        set({ loadingList: true });
        try {
            const res = await tenderApi.listPaged(paged);
            set({
                list: res.items,
                listTotal: res.total,
                listPage: res.page,
                listPageSize: res.pageSize,
                listTotalPages: res.totalPages,
            });
        } finally {
            set({ loadingList: false });
        }
    },

    detail: null,
    loadingDetail: false,
    fetchDetail: async (id, silent = false) => {
        if (detailRequestId === id && detailRequest) return detailRequest;
        if (!silent) set({ loadingDetail: true });
        try {
            // Image-less load. Product/line images are no longer embedded in the
            // tender detail (they were several MB of base64 and only ever needed
            // for the PDF) — they are fetched on demand at PDF-generation time.
            detailRequestId = id;
            detailRequest = tenderApi.getById(id, {
                includeImages: false,
                includeActivities: false,
                deferOrderPdfContent: true,
            }).then((detail) => {
                set((state) => {
                    const current = state.detail;
                    // A silent background refresh must not throw away PDF content
                    // that was already loaded on demand for the same order.
                    if (
                        detail.tender.pdfContentDeferred
                        && current?.tender.id === detail.tender.id
                        && current.tender.pdfContentDeferred === false
                    ) {
                        return {
                            detail: {
                                ...detail,
                                tender: {
                                    ...detail.tender,
                                    coverLetter: current.tender.coverLetter,
                                    closingNote: current.tender.closingNote,
                                    closingImages: current.tender.closingImages,
                                    pdfContentDeferred: false,
                                },
                            },
                        };
                    }
                    return { detail };
                });
            });
            await detailRequest;
        } finally {
            if (detailRequestId === id) {
                detailRequestId = null;
                detailRequest = null;
            }
            if (!silent) set({ loadingDetail: false });
        }
    },
    ensurePdfContent: async (id) => {
        const current = get().detail;
        if (current?.tender.id === id && !current.tender.pdfContentDeferred) {
            return {
                coverLetter: current.tender.coverLetter,
                closingNote: current.tender.closingNote,
                closingImages: current.tender.closingImages,
            };
        }
        if (pdfContentRequestId === id && pdfContentRequest) return pdfContentRequest;

        pdfContentRequestId = id;
        pdfContentRequest = tenderApi.getPdfContent(id).then((content) => {
            set((state) => {
                if (state.detail?.tender.id !== id) return {};
                return {
                    detail: {
                        ...state.detail,
                        tender: {
                            ...state.detail.tender,
                            ...content,
                            pdfContentDeferred: false,
                        },
                    },
                };
            });
            return content;
        });

        try {
            return await pdfContentRequest;
        } finally {
            if (pdfContentRequestId === id) {
                pdfContentRequestId = null;
                pdfContentRequest = null;
            }
        }
    },

    summary: null,
    loadingSummary: false,
    fetchSummary: async (id) => {
        set({ loadingSummary: true });
        try {
            const summary = await tenderApi.getSummary(id);
            set({ summary });
        } finally {
            set({ loadingSummary: false });
        }
    },

    articles: [],
    fetchArticles: async () => {
        const articles = await articleApi.list();
        set({ articles });
    },
    createArticle: async (data) => {
        const created = await articleApi.create(data);
        set({ articles: [created, ...get().articles] });
        return created;
    },

    stockArticles: [],
    stockArticlesLoading: false,
    stockArticlesLoaded: false,
    stockArticlesHaveImages: false,
    locations: [],
    fetchStockArticles: async (force = false, includeImages = false) => {
        const state = get();
        // Already have what the caller needs (and images too, if requested).
        if (!force && state.stockArticlesLoaded && (!includeImages || state.stockArticlesHaveImages)) return;
        // A non-image fetch can piggyback on an in-flight request; an image
        // fetch must go out on its own if the pending one is image-less.
        if (!force && stockArticlesRequest && (!includeImages || stockArticlesRequestHasImages)) {
            return stockArticlesRequest;
        }

        stockArticlesRequestHasImages = includeImages;
        stockArticlesRequest = (async () => {
            set({ stockArticlesLoading: true });
            try {
                const stockArticles = await inventoryApi.articlesSummary(includeImages);
                set({ stockArticles, stockArticlesLoaded: true, stockArticlesHaveImages: includeImages });
            } finally {
                set({ stockArticlesLoading: false });
                stockArticlesRequest = null;
            }
        })();

        return stockArticlesRequest;
    },
    fetchLocations: async () => {
        const locations = await inventoryApi.listLocations();
        set({ locations });
    },

    activities: [],
    fetchActivities: async (tenderId) => {
        const activities = await tenderApi.getActivities(tenderId);
        set({ activities });
    },
    logs: [],
    fetchLogs: async (tenderId) => {
        const logs = await tenderApi.getLogs(tenderId);
        set({ logs });
    },

    createTender: async (input) => {
        const created = await tenderApi.createManual(input);
        set({ list: [created, ...get().list] });
        return created;
    },

    importTender: async (input) => {
        const res = await tenderApi.importXml(input);
        await get().fetchList();
        return res.tender;
    },

    importSalesOrderCsv: async (input) => {
        const res = await tenderApi.importSalesOrderCsv(input);
        await get().fetchList();
        return res.tender;
    },

    deleteTender: async (id) => {
        await tenderApi.delete(id);
        set({ list: get().list.filter((t) => t.id !== id) });
    },

    addPosition: async (tenderId, p) => {
        await tenderApi.addPosition(tenderId, p);
        if (get().detail?.tender.id === tenderId) {
            await get().fetchDetail(tenderId, true);
        }
    },
    updatePosition: async (tenderId, positionId, patch) => {
        const updated = await tenderApi.updatePosition(tenderId, positionId, patch);
        if (get().detail?.tender.id === tenderId) {
            set({
                detail: {
                    ...get().detail!,
                    positions: get().detail!.positions.map((position) =>
                        position.id === positionId
                            ? {
                                ...position,
                                ...updated,
                                calculation: updated.calculation ?? position.calculation,
                                articleMappings: updated.articleMappings ?? position.articleMappings,
                            }
                            : position
                    ),
                },
            });
        }
    },

    saveCalculation: async (tenderId, positionId, cost) => {
        const res = await tenderApi.calculate(tenderId, positionId, cost);
        if (get().detail?.tender.id === tenderId) {
            set({
                detail: {
                    ...get().detail!,
                    positions: get().detail!.positions.map((position) =>
                        position.id === positionId
                            ? { ...position, calculation: res.calculation }
                            : position
                    ),
                },
            });
        }
    },

    approveTender: async (id) => {
        await tenderApi.approve(id);
        if (get().detail?.tender.id === id) await get().fetchDetail(id);
        await get().fetchList();
    },

    createVersion: async (id) => {
        const res = await tenderApi.createVersion(id);
        await get().fetchList();
        return res.tender;
    },

    deletePosition: async (tenderId, positionId) => {
        await tenderApi.deletePosition(tenderId, positionId);
        if (get().detail?.tender.id === tenderId) {
            await get().fetchDetail(tenderId, true);
        }
    },

    mapArticle: async (tenderId, positionId, articleId, qty, options) => {
        await tenderApi.mapArticle(tenderId, positionId, articleId, qty, options);
        if (get().detail?.tender.id === tenderId) await get().fetchDetail(tenderId, true);
    },

    removeArticleMapping: async (tenderId, positionId, mappingId) => {
        const res = await tenderApi.removeArticleMapping(tenderId, positionId, mappingId);
        if (get().detail?.tender.id === tenderId) {
            set({
                detail: {
                    ...get().detail!,
                    positions: get().detail!.positions.map((position) =>
                        position.id === positionId
                            ? {
                                ...position,
                                calculation: res.updatedCalculation !== undefined ? res.updatedCalculation : position.calculation,
                                articleMappings: position.articleMappings?.filter((mapping) => mapping.id !== mappingId),
                            }
                            : position
                    ),
                },
            });
        }
    },
}));
