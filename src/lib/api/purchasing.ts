import { apiClient } from '../axios';
import { cachedQuery, readQuery } from './queryCache';
import { productionBomApi } from './productionBom';
import type { BomProposalLine } from '../../types/productionBom';
import type {
    ComparisonOrder,
    ComparisonSkip,
    DispatchResult,
    DispatchState,
    MailboxTestResult,
    PriceComparison,
    PriceComparisonSummary,
    ProcurementDetail,
    ProcurementFeed,
    ProductionMailbox,
    ProductionMailboxes,
} from '../../types/purchasing';

/**
 * ── ÜRETİM › SATIN ALMA (28.09.2026, 29.09.2026) ─────────────────────────────
 * Die Liste seitenweise vom Server, ein Talep mit Stand und Belegen, seine
 * Fiyat karşılaştırmaları. Bestellungen, Anfragen und Angebots-PDFs laufen
 * weiter über `productionBomApi`, Mail und Status über die Bestellseite.
 */
const enc = encodeURIComponent;
const BASE = '/production/bom/procurement';

const cacheOptions = { freshMs: 10_000, staleMs: 0, tags: ['production', 'catalog', 'warehouse'] };
const loadDetail = (requestId: string) => cachedQuery(`procurement:detail:${requestId}`, () => purchasingApi.detail(requestId), cacheOptions);

export const readPurchasingDetail = (requestId: string, onValue: (value: ProcurementDetail) => void, onError: (error: unknown) => void) => {
    let active = true;
    void loadDetail(requestId).then((value) => { if (active) onValue(value); }, (error) => { if (active) onError(error); });
    return () => { active = false; };
};

export interface PurchasingWorkspace {
    detail: ProcurementDetail;
    /** «Sipariş oluştur»: was einem Satın alma talebi noch fehlt. */
    orderLines: BomProposalLine[];
    /** Die gespeicherten Vergleiche eines Fiyat talebi, neueste zuerst. */
    comparisons: PriceComparisonSummary[];
}

/** Ein vollständiger Stand: Talep, was zu bestellen ist, und die Vergleiche. */
const loadWorkspace = async (requestId: string): Promise<PurchasingWorkspace> => {
    const [detail, comparisons] = await Promise.all([
        loadDetail(requestId),
        purchasingApi.comparisons(requestId).then((value) => value.items, () => [] as PriceComparisonSummary[]),
    ]);
    const { request, bom } = detail;
    const open = detail.canProcure && !bom.consumedAt && (request.status === 'OPEN' || request.status === 'IN_PROGRESS');
    const wanted = new Set(request.lines.filter((line) => !line.covered).map((line) => line.bomLineId));
    const order = open && request.kind === 'ORDER' && wanted.size > 0 && bom.status === 'APPROVED'
        ? await productionBomApi.proposal(bom.id)
        : null;
    return {
        detail,
        orderLines: order?.lines.filter((line) => wanted.has(line.lineId)) ?? [],
        comparisons: request.kind === 'PRICE' ? comparisons : [],
    };
};

export const readPurchasingWorkspace = (requestId: string, onValue: (value: PurchasingWorkspace) => void, onError: (error: unknown) => void) =>
    readQuery(`procurement:workspace:${requestId}`, () => loadWorkspace(requestId), { ...cacheOptions, staleMs: 10_000 },
        (value, fresh) => { if (fresh) onValue(value); }, onError);

export const purchasingApi = {
    feed: async (query: { page: number; search: string; kind: 'PRICE' | 'ORDER' | null }): Promise<ProcurementFeed> =>
        (await apiClient.get(`${BASE}/feed`, {
            params: { page: query.page, ...(query.search ? { search: query.search } : {}), ...(query.kind ? { kind: query.kind } : {}) },
        })).data,
    detail: async (requestId: string): Promise<ProcurementDetail> =>
        (await apiClient.get(`${BASE}/requests/${enc(requestId)}`)).data,
    action: async (requestId: string, action: 'close' | 'reopen' | 'cancel'): Promise<void> => {
        await apiClient.post(`${BASE}/requests/${enc(requestId)}/${action}`, {});
    },
    /** Die gespeicherten Fiyat karşılaştırmaları eines Talep. */
    comparisons: async (requestId: string): Promise<{ items: PriceComparisonSummary[] }> =>
        (await apiClient.get(`${BASE}/requests/${enc(requestId)}/comparisons`)).data,
    /** Bis zu vier Angebots-PDFs per KI vergleichen — der Vergleich wird gespeichert. */
    compare: async (requestId: string, purchaseOrderIds: string[], language: string): Promise<Omit<PriceComparison, 'others'>> =>
        (await apiClient.post(`${BASE}/requests/${enc(requestId)}/comparisons`, { purchaseOrderIds, language }, { timeout: 290_000 })).data,
    comparison: async (comparisonId: string): Promise<PriceComparison> =>
        (await apiClient.get(`${BASE}/comparisons/${enc(comparisonId)}`)).data,

    /* ── Die Automatik (30.09.2026) ─────────────────────────────────────── */

    /** Ein Beleg als PDF per Mail an den Lieferanten — «Onayla ve gönder», «Tekrar gönder», «Gönder». */
    dispatch: async (purchaseOrderId: string, body: { trigger?: 'MANUAL' | 'RESEND'; lang?: 'de' | 'tr' | 'en' | null; to?: string | null } = {}): Promise<DispatchResult> =>
        (await apiClient.post(`/production/bom/purchases/${enc(purchaseOrderId)}/dispatch`, body, { timeout: 150_000 })).data,
    /**
     * Die Preisanfragen eines Talep anlegen (Lieferanten der Karten). `send: false`
     * nennt nur, was noch hinaus muss — die Seite sendet dann Beleg für Beleg.
     */
    dispatchRequest: async (requestId: string, send = true): Promise<{
        results: DispatchResult[];
        pending: Array<{ purchaseOrderId: string; code: string; supplierName: string; email: string | null; lineCount: number }>;
    }> => (await apiClient.post(`${BASE}/requests/${enc(requestId)}/dispatch`, { send }, { timeout: 290_000 })).data,
    /** Sendungen und Antworten der Belege. */
    dispatchStatus: async (purchaseOrderIds: string[]): Promise<Record<string, DispatchState>> => {
        if (!purchaseOrderIds.length) return {};
        return (await apiClient.get('/production/bom/purchases/dispatch-status', { params: { ids: purchaseOrderIds.join(',') } })).data.items;
    },
    /** Das verschickte PDF (`mail`) oder die Datei einer Antwort (`reply`). */
    /** Das PDF eines Belegs, wie es jetzt hinausginge (nichts wird gesendet). */
    documentPdf: async (purchaseOrderId: string): Promise<Blob> =>
        (await apiClient.get(`/production/bom/purchases/${enc(purchaseOrderId)}/document-pdf`, { responseType: 'blob', timeout: 90_000 })).data,
    file: async (source: 'mail' | 'reply', id: string): Promise<Blob> =>
        (await apiClient.get(`${BASE}/files/${source}/${enc(id)}`, { responseType: 'blob' })).data,
    /** Aus der Auswahl des Vergleichs je Lieferant eine Bestellung. */
    /** `quoteNumbers` = die eingetippten Angebotsnummern je Lieferant (Stelle im Vergleich). */
    ordersFromComparison: async (
        comparisonId: string,
        lines: Array<{ bomLineId: string; supplier: number }>,
        quoteNumbers: Record<number, string> = {},
    ): Promise<{ orders: ComparisonOrder[]; skipped: ComparisonSkip[] }> =>
        (await apiClient.post(`${BASE}/comparisons/${enc(comparisonId)}/orders`, { lines, quoteNumbers }, { timeout: 120_000 })).data,
};

/* ── Die Postfächer der Produktion (Üretim ayarları › E-posta) ─────────── */
export const productionMailboxApi = {
    list: async (): Promise<ProductionMailboxes> => (await apiClient.get('/production/bom/mailboxes')).data,
    save: async (purpose: 'RFQ' | 'ORDER', body: Record<string, unknown>): Promise<ProductionMailbox> =>
        (await apiClient.put(`/production/bom/mailboxes/${purpose}`, body)).data,
    remove: async (purpose: 'RFQ' | 'ORDER'): Promise<{ removed: boolean }> =>
        (await apiClient.delete(`/production/bom/mailboxes/${purpose}`)).data,
    test: async (purpose: 'RFQ' | 'ORDER', body: Record<string, unknown> = {}): Promise<MailboxTestResult> =>
        (await apiClient.post(`/production/bom/mailboxes/${purpose}/test`, body, { timeout: 60_000 })).data,
    check: async (): Promise<{ runs: Array<{ mailboxId: string; examined: number; matched: number; attached: number; error: string | null }> }> =>
        (await apiClient.post('/production/bom/mailboxes/check', {}, { timeout: 120_000 })).data,
};
