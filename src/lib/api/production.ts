import i18n from '../../i18n';
import { t } from '../../i18n/translate';
import { apiClient } from '../axios';
import { itGateHeaders } from '../itGate';
import { readQuery, refreshQuery } from './queryCache';
import type { PurchaseOrderRow } from '../../types/inventory';
import type {
    ProductionItemDetail,
    ProductionLinesPage,
    ProductionOrderNode,
    ProductionOverview,
    ProductionPickerProject,
    ProductionProject,
    ProductionProjectDetail,
    ProductionProjectDevices,
    ProductionPurchaseAssignment,
    ProductionSelection,
    ProductionSettings,
    ProductionSyncResult,
} from '../../types/production';

/**
 * ── PRODUKTION (19.09.2026) ─────────────────────────────────────────────────
 * Die Seiten lesen über den gemeinsamen Speicher (`readQuery`): ein zweites
 * Öffnen zeichnet sofort, die Antwort des Servers kommt still nach. Jede
 * Schreibanfrage an /inventory oder /production macht die Einträge alt
 * (Tag `production`, siehe queryCache.ts).
 */

const TAGS = ['production'];
const PAGE_CACHE = { freshMs: 20_000, staleMs: 600_000, tags: TAGS };

const get = async <T>(url: string, params?: Record<string, string | undefined>): Promise<T> => {
    const clean = params ? Object.fromEntries(Object.entries(params).filter(([, value]) => value)) : undefined;
    const res = await apiClient.get(url, clean ? { params: clean } : undefined);
    return res.data as T;
};

export const productionApi = {
    sync: async (force = false): Promise<ProductionSyncResult> =>
        (await apiClient.post('/production/sync', { force })).data,

    overview: () => get<ProductionOverview>('/production/overview'),
    project: (id: string) => get<ProductionProjectDetail>(`/production/projects/${id}`),
    /** Prozess-Stufe «Geräte» eines Produktionsprojekts (24.09.2026). */
    devices: (id: string) => get<ProductionProjectDevices>(`/production/projects/${id}/devices`),
    lines: (params: { projectId?: string; search?: string } = {}) => get<ProductionLinesPage>('/production/lines', params),
    item: (id: string) => get<ProductionItemDetail>(`/production/items/${id}`),

    pickerProjects: async (search?: string): Promise<ProductionPickerProject[]> =>
        (await get<{ items: ProductionPickerProject[] }>('/production/picker/projects', { search })).items,
    pickerProject: (id: string) => get<{ project: ProductionProject; orders: ProductionOrderNode[] }>(`/production/picker/projects/${id}`),
    assignment: (purchaseOrderId: string) => get<ProductionPurchaseAssignment>(`/production/picker/purchase-orders/${purchaseOrderId}`),

    settings: () => get<ProductionSettings>('/production/settings'),
    saveSettings: async (sourceTenantIds: string[]): Promise<{ settings: ProductionSettings; sync: ProductionSyncResult }> =>
        (await apiClient.put('/production/settings', { sourceTenantIds }, { headers: itGateHeaders() })).data,

    /**
     * Projekt und Geräte an einer bestehenden Bestellung setzen (Bestellseite,
     * Wareneingang) — `lineItemIds` je Zeile, wenn mehrere Geräte gewählt sind.
     */
    setPurchaseAssignment: async (
        purchaseOrderId: string,
        selection: ProductionSelection,
        lineItemIds?: Array<string | null>,
    ): Promise<PurchaseOrderRow> =>
        (await apiClient.put(`/inventory/purchase-orders/${purchaseOrderId}/production`, {
            production: selection,
            ...(lineItemIds ? { lineItemIds } : {}),
        })).data,
};

/* ── Lesen mit Speicher ───────────────────────────────────────────────────── */

export const readProductionOverview = (
    onValue: (value: ProductionOverview, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery('production:overview', productionApi.overview, PAGE_CACHE, onValue, onError);

export const refreshProductionOverview = () => refreshQuery('production:overview', productionApi.overview, PAGE_CACHE);

export const readProductionProject = (
    id: string,
    onValue: (value: ProductionProjectDetail, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(`production:project:${id}`, () => productionApi.project(id), PAGE_CACHE, onValue, onError);

export const refreshProductionProject = (id: string) =>
    refreshQuery(`production:project:${id}`, () => productionApi.project(id), PAGE_CACHE);

export const readProductionDevices = (
    id: string,
    onValue: (value: ProductionProjectDevices, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(`production:devices:${id}`, () => productionApi.devices(id), PAGE_CACHE, onValue, onError);

export const readProductionLines = (
    params: { projectId?: string; search?: string },
    onValue: (value: ProductionLinesPage, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(
    `production:lines:${params.projectId ?? ''}:${params.search ?? ''}`,
    () => productionApi.lines(params),
    PAGE_CACHE,
    onValue,
    onError,
);

export const readProductionItem = (
    id: string,
    onValue: (value: ProductionItemDetail, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(`production:item:${id}`, () => productionApi.item(id), PAGE_CACHE, onValue, onError);

/** Fehlerkennung einer Antwort (`production.err.*`, `APPROVAL_FIELDS_MISSING` …). */
export const productionErrorOf = (error: unknown): {
    code: string | null;
    message: string | null;
    params: Record<string, string | number> | null;
    details: unknown;
} => {
    const data = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
    return {
        code: typeof data?.code === 'string' ? data.code : null,
        message: typeof data?.error === 'string' ? data.error : null,
        params: (data?.params as Record<string, string | number>) ?? null,
        details: data?.details ?? null,
    };
};

/**
 * Die Meldung zu einer Antwort: kennt die Oberfläche die Kennung
 * (production.err.*), steht ihre Übersetzung da — sonst der Text des Servers.
 */
export const productionErrorText = (error: unknown, fallback: string): string => {
    const failure = productionErrorOf(error);
    const key = failure.code ? `production.err.${failure.code}` : '';
    if (key && i18n.exists(key)) return t(key, failure.params ?? undefined);
    return failure.message || fallback;
};
