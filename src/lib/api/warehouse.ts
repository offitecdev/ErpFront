import i18n from '../../i18n';
import { t } from '../../i18n/translate';
import { apiClient } from '../axios';
import { cachedQuery, readQuery, refreshQuery } from './queryCache';
import type {
    WarehouseAvailability,
    WarehouseCatalog,
    WarehouseCategory,
    WarehouseExport,
    WarehouseGroup,
    WarehouseImportDetail,
    WarehouseImportList,
    WarehouseImportPreview,
    WarehouseImportResult,
    WarehouseImportRowInput,
    WarehouseImportSummary,
    WarehouseLabelSettings,
    WarehouseListQuery,
    WarehouseLookup,
    WarehouseProduct,
    WarehouseProductDetail,
    WarehouseProductInput,
    WarehouseProductPage,
    WarehouseSerial,
    WarehouseSerialInput,
    WarehouseSettings,
    WarehouseSupplierOption,
} from '../../types/warehouse';

/**
 * ── DEPO (26.09.2026) ───────────────────────────────────────────────────────
 * Liste, Kategorien und Einstellungen lesen über den gemeinsamen Speicher
 * (`readQuery`): ein zweites Öffnen zeichnet sofort, die Antwort kommt still
 * nach. Jede Schreibanfrage an /warehouse macht die Einträge alt (Tag
 * `warehouse`, siehe WRITE_TAGS in queryCache.ts).
 */

const TAGS = ['warehouse'];
const PAGE_CACHE = { freshMs: 15_000, staleMs: 600_000, tags: TAGS };

const listParams = (query: WarehouseListQuery): Record<string, string> => {
    const params: Record<string, string> = {};
    if (query.search?.trim()) params.search = query.search.trim();
    if (query.groups?.length) params.groups = query.groups.join(',');
    if (query.barcode?.trim()) params.barcode = query.barcode.trim();
    if (query.sort) params.sort = query.sort;
    if (query.dir) params.dir = query.dir;
    if (query.page && query.page > 1) params.page = String(query.page);
    if (query.pageSize) params.pageSize = String(query.pageSize);
    return params;
};

const listKey = (query: WarehouseListQuery): string => `warehouse:products:${new URLSearchParams(listParams(query)).toString()}`;

export const warehouseApi = {
    status: async (): Promise<WarehouseAvailability> => (await apiClient.get('/warehouse/status')).data,

    list: async (query: WarehouseListQuery): Promise<WarehouseProductPage> =>
        (await apiClient.get('/warehouse/products', { params: listParams(query) })).data,
    /** Alle Karten der Abfrage für PDF und Excel (ohne Seiten). */
    exportRows: async (query: WarehouseListQuery): Promise<WarehouseExport> =>
        (await apiClient.get('/warehouse/export', { params: listParams({ ...query, page: 1, pageSize: undefined }) })).data,
    get: async (id: string): Promise<WarehouseProductDetail> => (await apiClient.get(`/warehouse/products/${id}`)).data,
    create: async (input: WarehouseProductInput): Promise<WarehouseProductDetail> =>
        (await apiClient.post('/warehouse/products', input)).data,
    update: async (id: string, input: WarehouseProductInput): Promise<WarehouseProductDetail> =>
        (await apiClient.patch(`/warehouse/products/${id}`, input)).data,
    remove: async (id: string): Promise<void> => { await apiClient.delete(`/warehouse/products/${id}`); },
    /** «Ürün ekle» — Bestand ± n (Karten ohne Seriennummernpflicht; negativ = Scan zurück). */
    receive: async (id: string, quantity: number): Promise<WarehouseProduct> =>
        (await apiClient.post(`/warehouse/products/${id}/receive`, { quantity })).data,

    addSerial: async (productId: string, input: WarehouseSerialInput): Promise<{ serial: WarehouseSerial; product: WarehouseProduct }> =>
        (await apiClient.post(`/warehouse/products/${productId}/serials`, input)).data,
    removeSerial: async (id: string): Promise<{ product: WarehouseProduct | null }> =>
        (await apiClient.delete(`/warehouse/serials/${id}`)).data,

    /** Scan: Seriennummer, Barcode, Herstellerbarcode oder ERP-Code. */
    lookup: async (code: string): Promise<WarehouseLookup> =>
        (await apiClient.get('/warehouse/lookup', { params: { code } })).data,

    /* Hauptkategorien und Materialgruppen */
    catalog: async (): Promise<WarehouseCatalog> => (await apiClient.get('/warehouse/material-groups')).data,
    createCategory: async (input: { name: string; code: string }): Promise<WarehouseCategory> =>
        (await apiClient.post('/warehouse/categories', input)).data,
    updateCategory: async (id: string, input: { name?: string; code?: string }): Promise<WarehouseCategory> =>
        (await apiClient.patch(`/warehouse/categories/${id}`, input)).data,
    removeCategory: async (id: string): Promise<void> => { await apiClient.delete(`/warehouse/categories/${id}`); },
    createGroup: async (input: { categoryId: string; name: string; code: string }): Promise<WarehouseGroup> =>
        (await apiClient.post('/warehouse/material-groups', input)).data,
    updateGroup: async (id: string, input: { name?: string; code?: string; categoryId?: string }): Promise<WarehouseGroup> =>
        (await apiClient.patch(`/warehouse/material-groups/${id}`, input)).data,
    removeGroup: async (id: string): Promise<void> => { await apiClient.delete(`/warehouse/material-groups/${id}`); },
    assignCodes: async (groupId: string): Promise<{ assigned: number }> =>
        (await apiClient.post(`/warehouse/material-groups/${groupId}/assign-codes`)).data,

    /* Etikett */
    settings: async (): Promise<WarehouseSettings> => (await apiClient.get('/warehouse/settings')).data,
    saveSettings: async (label: WarehouseLabelSettings): Promise<WarehouseSettings> =>
        (await apiClient.put('/warehouse/settings', { label })).data,

    /* Excel-Aktarım */
    imports: async (): Promise<WarehouseImportList> => (await apiClient.get('/warehouse/imports')).data,
    previewImport: async (rows: WarehouseImportRowInput[]): Promise<WarehouseImportPreview> =>
        (await apiClient.post('/warehouse/imports/preview', { rows })).data,
    requestImport: async (fileName: string | null, rows: WarehouseImportRowInput[]): Promise<{ import: WarehouseImportSummary; skipped: number }> =>
        (await apiClient.post('/warehouse/imports', { fileName, rows })).data,
    importDetail: async (id: string): Promise<WarehouseImportDetail> => (await apiClient.get(`/warehouse/imports/${id}`)).data,
    approveImport: async (id: string): Promise<{ import: WarehouseImportSummary; result: WarehouseImportResult }> =>
        (await apiClient.post(`/warehouse/imports/${id}/approve`)).data,
    rejectImport: async (id: string, note: string): Promise<{ import: WarehouseImportSummary }> =>
        (await apiClient.post(`/warehouse/imports/${id}/reject`, { note })).data,
    cancelImport: async (id: string): Promise<{ import: WarehouseImportSummary }> =>
        (await apiClient.post(`/warehouse/imports/${id}/cancel`)).data,

    suppliers: async (q: string): Promise<WarehouseSupplierOption[]> =>
        (await apiClient.get('/warehouse/suppliers', { params: q.trim() ? { q: q.trim() } : {} })).data.items,
};

/* ── Lesen mit Speicher ───────────────────────────────────────────────────── */

export const readWarehouseProducts = (
    query: WarehouseListQuery,
    onValue: (value: WarehouseProductPage, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(listKey(query), () => warehouseApi.list(query), PAGE_CACHE, onValue, onError);

export const readWarehouseCatalog = (
    onValue: (value: WarehouseCatalog, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery('warehouse:catalog', warehouseApi.catalog, PAGE_CACHE, onValue, onError);

export const refreshWarehouseCatalog = () => refreshQuery('warehouse:catalog', warehouseApi.catalog, PAGE_CACHE);

export const readWarehouseSettings = (
    onValue: (value: WarehouseSettings, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery('warehouse:settings', warehouseApi.settings, PAGE_CACHE, onValue, onError);

export const cachedWarehouseSettings = () => cachedQuery('warehouse:settings', warehouseApi.settings, PAGE_CACHE);

export const readWarehouseProduct = (
    id: string,
    onValue: (value: WarehouseProductDetail, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(`warehouse:product:${id}`, () => warehouseApi.get(id), PAGE_CACHE, onValue, onError);

/* ── Fehler ───────────────────────────────────────────────────────────────── */

export const warehouseErrorOf = (error: unknown): {
    code: string | null;
    message: string | null;
    params: Record<string, string | number> | null;
    status: number | null;
} => {
    const response = (error as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
    const data = response?.data;
    return {
        code: typeof data?.code === 'string' ? data.code : null,
        message: typeof data?.error === 'string' ? data.error : null,
        params: (data?.params as Record<string, string | number>) ?? null,
        status: typeof response?.status === 'number' ? response.status : null,
    };
};

/**
 * Die Meldung zu einer Antwort: kennt die Oberfläche die Kennung
 * (warehouse.err.*), steht ihre Übersetzung da — sonst ein ruhiger Satz in
 * der gewählten Sprache (der Text des Servers ist Deutsch).
 */
export const warehouseErrorText = (error: unknown, fallbackKey = 'warehouse.err.generic'): string => {
    const failure = warehouseErrorOf(error);
    const key = failure.code ? `warehouse.err.${failure.code}` : '';
    if (key && i18n.exists(key)) return t(key, failure.params ?? undefined);
    if (failure.status === 403) return t('warehouse.err.forbidden');
    return t(fallbackKey);
};
