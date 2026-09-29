import i18n from '../../i18n';
import { t } from '../../i18n/translate';
import { apiClient } from '../axios';
import { readQuery, refreshQuery } from './queryCache';
import type {
    Bom,
    BomAreaView,
    BomOrderLineInput,
    BomOrdersResult,
    BomProduct,
    BomProposal,
    BomRequestLineInput,
    BomRequestProposal,
    BomLineInput,
    BomPurchaseRevisionDetail,
    BomRevisionDetail,
    BomRevisionPreview,
    BomSettings,
    BomTemplate,
    BomTemplateInput,
    BomTemplateSummary,
    BomTableAiResult,
    BomProcurementInput,
    BomProcurementSummary,
    BomReceiptAllocation,
    CostingProject,
    CostingProjectSummary,
} from '../../types/productionBom';
import type { BuiltInArea } from '../../types/productionTasks';

/**
 * ── BOM DER PRODUKTION (27.09.2026) ──────────────────────────────────────────
 * Vorlagen, die BOMs eines Geräts, «Sipariş oluştur» und die BOM-Bestellungen.
 * Lesen über den gemeinsamen Speicher, wo es sich lohnt (Vorlagen); die
 * Gerätefläche liest frisch — Bestand und Bestellungen ändern sich woanders.
 */

const TAGS = ['production', 'warehouse'];
const PAGE_CACHE = { freshMs: 15_000, staleMs: 600_000, tags: TAGS };
const enc = encodeURIComponent;

const areaParam = (area: BuiltInArea) => (area === 'ELECTRICAL' ? 'electrical' : 'mechanical');

export const productionBomApi = {
    settings: async (): Promise<BomSettings> => (await apiClient.get('/production/bom/settings')).data,
    /** Nur Mitgeschicktes ändert sich (Zahl und Kodes getrennt speicherbar). */
    saveSettings: async (patch: { maxPerArea?: number; codes?: BomSettings['codes'] }): Promise<BomSettings> =>
        (await apiClient.put('/production/bom/settings', patch)).data,

    templates: async (): Promise<{ items: BomTemplateSummary[]; canEdit: boolean }> =>
        (await apiClient.get('/production/bom/templates')).data,
    template: async (id: string): Promise<BomTemplate> => (await apiClient.get(`/production/bom/templates/${enc(id)}`)).data,
    createTemplate: async (input: BomTemplateInput): Promise<BomTemplate> =>
        (await apiClient.post('/production/bom/templates', input)).data,
    saveTemplate: async (id: string, input: BomTemplateInput): Promise<BomTemplate> =>
        (await apiClient.put(`/production/bom/templates/${enc(id)}`, input)).data,
    removeTemplate: async (id: string): Promise<void> => {
        await apiClient.delete(`/production/bom/templates/${enc(id)}`);
    },
    seedExamples: async (): Promise<{ templates: number; products: number; groups: number }> =>
        (await apiClient.post('/production/bom/templates/examples', {})).data,
    searchProducts: async (q: string, signal?: AbortSignal): Promise<BomProduct[]> =>
        ((await apiClient.get('/production/bom/products', { params: { q }, signal })).data as { items: BomProduct[] }).items,

    deviceView: async (deviceId: string, area: BuiltInArea): Promise<BomAreaView> =>
        (await apiClient.get(`/production/bom/devices/${enc(deviceId)}`, { params: { area: areaParam(area) } })).data,
    /** Eine leere Alt-BOM unter der Haupt-BOM — ihr Kod kommt aus den Einstellungen. */
    createSub: async (deviceId: string, area: BuiltInArea, prefix: string): Promise<{ bom: Bom }> =>
        (await apiClient.post(`/production/bom/devices/${enc(deviceId)}`, { area, prefix })).data,
    bom: async (bomId: string): Promise<{ bom: Bom }> => (await apiClient.get(`/production/bom/boms/${enc(bomId)}`)).data,
    saveLines: async (bomId: string, lines: BomLineInput[]): Promise<{ bom: Bom }> =>
        (await apiClient.put(`/production/bom/boms/${enc(bomId)}/lines`, { lines })).data,
    removeBom: async (bomId: string): Promise<void> => {
        await apiClient.delete(`/production/bom/boms/${enc(bomId)}`);
    },
    /** Die Freigabe ist endgültig (27.09.2026) — «unapprove» gibt es nicht mehr, geändert wird über eine Revision. */
    transition: async (bomId: string, action: 'approve' | 'complete' | 'reopen' | 'consume'): Promise<{ bom: Bom }> =>
        (await apiClient.post(`/production/bom/boms/${enc(bomId)}/${action}`, {})).data,
    /** «Revize et» — die Arbeitskopie der geltenden Zeilen; der Grund ist Pflicht. */
    startRevision: async (bomId: string, reason: string): Promise<{ bom: Bom }> =>
        (await apiClient.post(`/production/bom/boms/${enc(bomId)}/revision`, { reason })).data,
    discardRevision: async (bomId: string): Promise<{ bom: Bom }> =>
        (await apiClient.delete(`/production/bom/boms/${enc(bomId)}/revision`)).data,
    /** Was die Freigabe schreibt — `keep` = Bestellungen, die trotz Minderung bleiben. */
    revisionPreview: async (bomId: string, keep: string[]): Promise<BomRevisionPreview> =>
        (await apiClient.get(`/production/bom/boms/${enc(bomId)}/revision/preview`, { params: keep.length ? { keep: keep.join(',') } : {} })).data,
    approveRevision: async (bomId: string, keep: string[]): Promise<{ bom: Bom; preview: BomRevisionPreview }> =>
        (await apiClient.post(`/production/bom/boms/${enc(bomId)}/revision/approve`, { keep })).data,
    revisionDetail: async (bomId: string, revision: number): Promise<BomRevisionDetail> =>
        (await apiClient.get(`/production/bom/boms/${enc(bomId)}/revisions/${revision}`)).data,
    /** Die Bestellung VOR ihrer Revision `number` (für das alte PDF). */
    purchaseRevision: async (purchaseOrderId: string, number: number): Promise<BomPurchaseRevisionDetail> =>
        (await apiClient.get(`/production/bom/purchases/${enc(purchaseOrderId)}/revisions/${number}`)).data,
    purchaseRevisionQuote: async (purchaseOrderId: string, number: number): Promise<Blob> =>
        (await apiClient.get(`/production/bom/purchases/${enc(purchaseOrderId)}/revisions/${number}/quote-file`, { responseType: 'blob' })).data,
    proposal: async (bomId: string): Promise<BomProposal> =>
        (await apiClient.get(`/production/bom/boms/${enc(bomId)}/order-proposal`)).data,
    /** Seit 27.09.2026 abends nur der Einkauf — `procurementRequestId` = der Talep der BOM, aus dem die Belege entstehen. */
    createOrders: async (bomId: string, lines: BomOrderLineInput[], procurementRequestId?: string | null): Promise<BomOrdersResult> =>
        (await apiClient.post(`/production/bom/boms/${enc(bomId)}/orders`, { lines, ...(procurementRequestId ? { procurementRequestId } : {}) })).data,
    /** «Fiyat talebi» — im Entwurf; aus einem Talep PRICE des Einkaufs auch danach. */
    requestProposal: async (bomId: string, procurementRequestId?: string | null): Promise<BomRequestProposal> =>
        (await apiClient.get(`/production/bom/boms/${enc(bomId)}/request-proposal`, { params: procurementRequestId ? { procurementRequestId } : {} })).data,
    /** Je Lieferant eine Preisanfrage (Name, Modell, Menge). Gleiche Antwortform wie «Sipariş oluştur». */
    createRequests: async (bomId: string, lines: BomRequestLineInput[], procurementRequestId?: string | null): Promise<BomOrdersResult> =>
        (await apiClient.post(`/production/bom/boms/${enc(bomId)}/price-requests`, { lines, ...(procurementRequestId ? { procurementRequestId } : {}) })).data,

    /* ── Talep an den Einkauf (27.09.2026 abends) ── */
    /** Die BOM stellt einen Talep — ohne Lieferant, ohne Preis. */
    createProcurementRequest: async (bomId: string, input: BomProcurementInput): Promise<{ request: BomProcurementSummary; bom: Bom }> =>
        (await apiClient.post(`/production/bom/boms/${enc(bomId)}/procurement-requests`, input)).data,
    /** … und zieht einen unberührten zurück. */
    withdrawProcurementRequest: async (requestId: string): Promise<{ bom: Bom }> =>
        (await apiClient.post(`/production/bom/procurement/requests/${enc(requestId)}/withdraw`, {})).data,
    /* «Satın alma» selbst liest und handelt über `purchasingApi` (lib/api/purchasing.ts). */
    /** «Kalkülasyon»: Projekte mit geplanten und tatsächlichen Materialkosten. */
    costingProjects: async (): Promise<{ projects: CostingProjectSummary[] }> =>
        (await apiClient.get('/production/bom/costing')).data,
    costingProject: async (projectId: string): Promise<CostingProject> =>
        (await apiClient.get(`/production/bom/costing/${enc(projectId)}`)).data,

    setQuoteNumber: async (purchaseOrderId: string, quoteNumber: string): Promise<{ bom: Bom | null }> =>
        (await apiClient.put(`/production/bom/purchases/${enc(purchaseOrderId)}/quote-number`, { quoteNumber })).data,
    uploadQuote: async (purchaseOrderId: string, file: File): Promise<{ bom: Bom | null }> => {
        const form = new FormData();
        form.append('file', file, file.name);
        return (await apiClient.post(`/production/bom/purchases/${enc(purchaseOrderId)}/quote-file`, form)).data;
    },
    quoteFile: async (purchaseOrderId: string): Promise<Blob> =>
        (await apiClient.get(`/production/bom/purchases/${enc(purchaseOrderId)}/quote-file`, { responseType: 'blob' })).data,
    removeQuote: async (purchaseOrderId: string): Promise<{ bom: Bom | null }> =>
        (await apiClient.delete(`/production/bom/purchases/${enc(purchaseOrderId)}/quote-file`)).data,
    receive: async (
        purchaseOrderId: string,
        lines: Array<{ index: number; quantity: number; serials: string[] }>,
    ): Promise<{ bom: Bom | null; status: string; allocations?: BomReceiptAllocation[] }> =>
        (await apiClient.post(`/production/bom/purchases/${enc(purchaseOrderId)}/receive`, { lines })).data,
    /** Die leeren Zellen der Vorlagenspalten per KI füllen — Zeilen und Spalten bleiben, wie sie sind. */
    fillTable: async (
        purchaseOrderId: string,
        input: {
            columns: Array<{ key: string; name: string; type: 'text' | 'number'; label: string | null }>;
            /** Eingetippte oder eingefügte Zeilen mit Preisen. */
            prompt?: string;
            images?: Array<{ data: string; mimeType: string }>;
            /** Excel/CSV als Tabulatortext. */
            text?: string;
            /** Ein PDF (Base64). */
            data?: string;
            fileName?: string;
            mimeType?: string;
            language: string;
            /** Auch Angebotsnummer und Datum lesen (Satın alma, 28.09.2026). */
            header?: boolean;
        },
    ): Promise<BomTableAiResult> =>
        (await apiClient.post(`/production/bom/purchases/${enc(purchaseOrderId)}/ai-fill`, input, { timeout: 290_000 })).data,
};

/* ── Lesen mit Speicher ───────────────────────────────────────────────────── */

const templatesKey = 'production:bom-templates';

export const readBomTemplates = (
    onValue: (value: { items: BomTemplateSummary[]; canEdit: boolean }, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(templatesKey, productionBomApi.templates, PAGE_CACHE, onValue, onError);

export const refreshBomTemplates = () => refreshQuery(templatesKey, productionBomApi.templates, PAGE_CACHE);

export const readBomTemplate = (
    id: string,
    onValue: (value: BomTemplate, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery(`production:bom-template:${id}`, () => productionBomApi.template(id), PAGE_CACHE, onValue, onError);

export const primeBomTemplate = (template: BomTemplate) =>
    refreshQuery(`production:bom-template:${template.id}`, async () => template, PAGE_CACHE);

export const readBomSettings = (
    onValue: (value: BomSettings, fresh: boolean) => void,
    onError?: (error: unknown) => void,
) => readQuery('production:bom-settings', productionBomApi.settings, PAGE_CACHE, onValue, onError);

/* ── Fehler ──────────────────────────────────────────────────────────────── */

export const productionBomErrorOf = (error: unknown): {
    code: string | null;
    params: Record<string, string | number> | null;
    details: unknown;
    status: number | null;
} => {
    const response = (error as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
    const data = response?.data;
    return {
        code: typeof data?.code === 'string' ? data.code : null,
        params: (data?.params as Record<string, string | number>) ?? null,
        details: data?.details,
        status: typeof response?.status === 'number' ? response.status : null,
    };
};

/**
 * Die Meldung zu einer Antwort (productionBom.err.*) — den deutschen Text des
 * Servers zeigen wir nie (eine Sprache auf dem Schirm).
 */
export const productionBomErrorText = (error: unknown, fallbackKey = 'productionBom.err.generic'): string => {
    const failure = productionBomErrorOf(error);
    const key = failure.code ? `productionBom.err.${failure.code}` : '';
    if (key && i18n.exists(key)) return t(key, failure.params ?? undefined);
    if (failure.status === 403) return t('productionBom.err.FORBIDDEN');
    return t(fallbackKey);
};
