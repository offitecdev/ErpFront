import { apiClient } from '../axios';
import { cachedQuery, readQuery } from './queryCache';
import { productionBomApi } from './productionBom';
import type { BomProposalLine, BomRequestProposalLine } from '../../types/productionBom';
import type { ProcurementDetail, ProcurementFeed } from '../../types/purchasing';

/**
 * ── ÜRETİM › SATIN ALMA (28.09.2026) ────────────────────────────────────────
 * Die Liste seitenweise vom Server, ein Talep mit Stand und Verlauf, und die
 * Handgriffe der Seite. Bestellungen, Anfragen, Angebot und Wareneingang
 * laufen weiter über `productionBomApi`, Mail und Status über den Bestellweg.
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
    orderLines: BomProposalLine[];
    requestLines: BomRequestProposalLine[];
}

/** Publish one complete snapshot, including the editable lines and suppliers. */
const loadWorkspace = async (requestId: string): Promise<PurchasingWorkspace> => {
    const detail = await loadDetail(requestId);
    const { request, bom } = detail;
    const open = detail.canProcure && !bom.consumedAt && (request.status === 'OPEN' || request.status === 'IN_PROGRESS');
    const wanted = new Set(request.lines.filter((line) => !line.covered).map((line) => line.bomLineId));
    const allLines = new Set(request.lines.map((line) => line.bomLineId));
    const [order, price] = await Promise.all([
        open && request.kind === 'ORDER' && wanted.size > 0 && bom.status === 'APPROVED' ? productionBomApi.proposal(bom.id) : null,
        open && request.kind === 'PRICE' ? productionBomApi.requestProposal(bom.id, request.id) : null,
    ]);
    return { detail, orderLines: order?.lines.filter((line) => wanted.has(line.lineId)) ?? [], requestLines: price?.lines.filter((line) => allLines.has(line.lineId)) ?? [] };
};

export const readPurchasingWorkspace = (requestId: string, onValue: (value: PurchasingWorkspace) => void, onError: (error: unknown) => void) =>
    readQuery(`procurement:workspace:${requestId}`, () => loadWorkspace(requestId), { ...cacheOptions, staleMs: 10_000 },
        (value, fresh) => { if (fresh) onValue(value); }, onError);

export const purchasingApi = {
    feed: async (query: { page: number; search: string }): Promise<ProcurementFeed> =>
        (await apiClient.get(`${BASE}/feed`, { params: { page: query.page, ...(query.search ? { search: query.search } : {}) } })).data,
    detail: async (requestId: string): Promise<ProcurementDetail> =>
        (await apiClient.get(`${BASE}/requests/${enc(requestId)}`)).data,
    action: async (requestId: string, action: 'close' | 'reopen' | 'cancel'): Promise<void> => {
        await apiClient.post(`${BASE}/requests/${enc(requestId)}/${action}`, {});
    },
    /** Was die Seite selbst erledigt hat, für den Verlauf («son işlem»). */
    report: async (
        requestId: string,
        input: { action: 'ORDER_CONFIRMED' | 'PRICE_REQUESTS_SENT'; purchaseOrderIds: string[]; mailed?: boolean },
    ): Promise<void> => {
        await apiClient.post(`${BASE}/requests/${enc(requestId)}/report`, input);
    },
    saveSelection: async (requestId: string, lines: Array<{ bomLineId: string; purchaseOrderId: string }>): Promise<void> => {
        await apiClient.post(`${BASE}/requests/${enc(requestId)}/selection`, { lines });
    },
    /** Stückpreise aus dem Angebot / der Antwort des Lieferanten (`index` = Position im Beleg). */
    setPrices: async (purchaseOrderId: string, prices: Array<{ index: number; unitPrice: number }>): Promise<void> => {
        await apiClient.put(`/production/bom/purchases/${enc(purchaseOrderId)}/prices`, { prices });
    },
};
