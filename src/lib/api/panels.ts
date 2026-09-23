import { apiClient } from '../axios';
import { itGateHeaders } from '../itGate';
import { readQuery, refreshQuery } from './queryCache';
import type {
    PanelLabelResult,
    PanelModel,
    PanelModelPreview,
    PanelSettings,
    PanelSettingsPage,
    PanelTypeFamily,
    PanelUnit,
    PanelUnitsPage,
} from '../../types/panel';

/**
 * ── SCHALTSCHRÄNKE (20.09.2026) ─────────────────────────────────────────────
 * Alles unter `/production/panels`. Gelesen wird über den gemeinsamen Speicher
 * (`readQuery`) wie im übrigen Produktionsmodul; geschrieben wird direkt, und
 * die Seite lädt danach neu (`refreshPanel*`).
 */

const TAGS = ['production'];
const PAGE_CACHE = { freshMs: 15_000, staleMs: 600_000, tags: TAGS };

const get = async <T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> => {
    const clean = params
        ? Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''))
        : undefined;
    const res = await apiClient.get(url, clean ? { params: clean } : undefined);
    return res.data as T;
};

export interface PanelModelInput {
    typeFamilyId: string;
    ratingValue: number;
    variantCode?: string | null;
    name?: string | null;
    codeSchemeId?: string | null;
    ratedVoltage?: number | null;
    ratedCurrent?: number | null;
    phaseCount?: number | null;
    frequency?: number | null;
    shortCircuitIcw?: number | null;
    shortCircuitTime?: number | null;
    shortCircuitIpk?: number | null;
    ipRating?: string | null;
    standard?: string | null;
    ceMarking?: boolean;
    notes?: string | null;
    hasCustomDeviation?: boolean;
    salePrice?: number | null;
    unit?: string | null;
}

export interface IssueSerialsInput {
    panelModelId: string;
    count: number;
    /** FRAGE 7 — Nachtrag eines Altschranks aus dem eigenen Block. */
    retro?: boolean;
    year?: number;
    orderNumber?: string | null;
    customerName?: string | null;
    siteName?: string | null;
    projectId?: string | null;
    productionProjectId?: string | null;
    productionItemId?: string | null;
    notes?: string | null;
}

export const panelApi = {
    settings: () => get<PanelSettingsPage>('/production/panels/settings'),
    saveSettings: async (patch: Partial<PanelSettings>): Promise<PanelSettings> =>
        (await apiClient.put('/production/panels/settings', patch, { headers: itGateHeaders() })).data,

    families: (activeOnly = false) =>
        get<PanelTypeFamily[]>('/production/panels/families', activeOnly ? { active: 'true' } : undefined),
    createFamily: async (input: Partial<PanelTypeFamily>): Promise<PanelTypeFamily> =>
        (await apiClient.post('/production/panels/families', input)).data,
    updateFamily: async (id: string, patch: Partial<PanelTypeFamily>): Promise<PanelTypeFamily> =>
        (await apiClient.patch(`/production/panels/families/${id}`, patch)).data,
    deleteFamily: async (id: string): Promise<void> => {
        await apiClient.delete(`/production/panels/families/${id}`);
    },

    /** Welche Modellnummer käme heraus — die Maske zeigt sie beim Tippen. */
    previewModel: async (input: { typeFamilyId: string; ratingValue: number; variantCode?: string | null }): Promise<PanelModelPreview> =>
        (await apiClient.post('/production/panels/models/preview', input)).data,

    models: (params: { q?: string; familyId?: string; active?: string } = {}) =>
        get<PanelModel[]>('/production/panels/models', params),
    model: (id: string) => get<PanelModel>(`/production/panels/models/${id}`),
    createModel: async (input: PanelModelInput): Promise<PanelModel> =>
        (await apiClient.post('/production/panels/models', input)).data,
    updateModel: async (id: string, patch: Partial<PanelModel> & { name?: string }): Promise<PanelModel> =>
        (await apiClient.patch(`/production/panels/models/${id}`, patch)).data,
    deleteModel: async (id: string): Promise<void> => {
        await apiClient.delete(`/production/panels/models/${id}`);
    },

    units: (params: { q?: string; status?: string; modelId?: string; projectId?: string; take?: number; skip?: number } = {}) =>
        get<PanelUnitsPage>('/production/panels/units', params),
    unit: (id: string) => get<PanelUnit>(`/production/panels/units/${id}`),
    /** `count` Seriennummern ziehen — hier entstehen die Schränke. */
    issueSerials: async (input: IssueSerialsInput): Promise<{ units: PanelUnit[]; count: number }> =>
        (await apiClient.post('/production/panels/units', input)).data,
    updateUnit: async (id: string, patch: Partial<PanelUnit>): Promise<PanelUnit> =>
        (await apiClient.patch(`/production/panels/units/${id}`, patch)).data,
    deleteUnit: async (id: string): Promise<void> => {
        await apiClient.delete(`/production/panels/units/${id}`);
    },
    setStatus: async (id: string, status: string): Promise<PanelUnit> =>
        (await apiClient.post(`/production/panels/units/${id}/status`, { status })).data,
    /** Ins Lager: IN, Menge 1, mit der Seriennummer auf der Bewegung. */
    stockIn: async (id: string, body: { unitCost?: number | null; description?: string | null } = {}): Promise<PanelUnit> =>
        (await apiClient.post(`/production/panels/units/${id}/stock-in`, body)).data,
    /** Typenschild einfrieren (danach zeigt das PDF genau diese Werte). */
    printLabel: async (id: string): Promise<PanelLabelResult> =>
        (await apiClient.post(`/production/panels/units/${id}/label`, {})).data,

    lookup: (serial: string) => get<PanelUnit>('/production/panels/lookup', { serial }),
};

/* ── Lesen mit Speicher ───────────────────────────────────────────────────── */

export const readPanelSettings = (
    onValue: (value: PanelSettingsPage, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery('panels:settings', panelApi.settings, PAGE_CACHE, onValue, onError);

export const refreshPanelSettings = () => refreshQuery('panels:settings', panelApi.settings, PAGE_CACHE);

export const readPanelFamilies = (
    onValue: (value: PanelTypeFamily[], fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery('panels:families', () => panelApi.families(), PAGE_CACHE, onValue, onError);

export const refreshPanelFamilies = () => refreshQuery('panels:families', () => panelApi.families(), PAGE_CACHE);

export const readPanelModels = (
    params: { q?: string; familyId?: string },
    onValue: (value: PanelModel[], fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(
    `panels:models:${params.familyId ?? ''}:${params.q ?? ''}`,
    () => panelApi.models(params),
    PAGE_CACHE,
    onValue,
    onError,
);

export const refreshPanelModels = (params: { q?: string; familyId?: string } = {}) =>
    refreshQuery(`panels:models:${params.familyId ?? ''}:${params.q ?? ''}`, () => panelApi.models(params), PAGE_CACHE);

export const readPanelUnits = (
    params: { q?: string; status?: string; modelId?: string },
    onValue: (value: PanelUnitsPage, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(
    `panels:units:${params.status ?? ''}:${params.modelId ?? ''}:${params.q ?? ''}`,
    () => panelApi.units(params),
    PAGE_CACHE,
    onValue,
    onError,
);

export const refreshPanelUnits = (params: { q?: string; status?: string; modelId?: string } = {}) =>
    refreshQuery(
        `panels:units:${params.status ?? ''}:${params.modelId ?? ''}:${params.q ?? ''}`,
        () => panelApi.units(params),
        PAGE_CACHE,
    );

export const readPanelUnit = (
    id: string,
    onValue: (value: PanelUnit, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(`panels:unit:${id}`, () => panelApi.unit(id), PAGE_CACHE, onValue, onError);

export const refreshPanelUnit = (id: string) => refreshQuery(`panels:unit:${id}`, () => panelApi.unit(id), PAGE_CACHE);
