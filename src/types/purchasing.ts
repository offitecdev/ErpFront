import type { Bom, BomProcurementKind, BomProcurementStatus, ProcurementRequest } from './productionBom';

/* ── Üretim › Satın alma (28.09.2026) — Gegenstück zu domain/services/procurementFlow.ts ── */

export type ProcurementDocState = 'DRAFT' | 'SENT' | 'REVISED' | 'CONFIRMED' | 'RECEIVED' | 'REPLIED' | 'CANCELLED';

export type ProcurementStageKey =
    | 'ORDER_NEEDED'
    | 'QUOTE_NEEDED'
    | 'GOODS_EXPECTED'
    | 'PRICE_NEEDED'
    | 'REPLIES_EXPECTED'
    | 'COMPARE'
    | 'DONE'
    | 'CANCELLED';

/** Der eine Knopf einer Zeile: was jetzt zu tun ist. */
export type ProcurementNextAction = 'ORDER' | 'QUOTE' | 'CONFIRM' | 'RESEND' | 'RECEIVE' | 'ASK' | 'REPLY' | 'COMPARE';

export interface ProcurementStage {
    key: ProcurementStageKey;
    done: number;
    total: number;
    next: { action: ProcurementNextAction; purchaseOrderId: string | null } | null;
}

/** Ein Eintrag des Verlaufs — `data` trägt Belegnummern (`codes`/`code`), Lieferant, Anzahl. */
export interface ProcurementEvent {
    action: string;
    at: string;
    actorName: string | null;
    data: Record<string, unknown>;
}

export interface ProcurementFeedDoc {
    purchaseOrderId: string;
    code: string;
    kind: 'ORDER' | 'REQUEST';
    state: ProcurementDocState;
    supplierName: string;
}

export interface ProcurementFeedRow {
    id: string;
    requestNumber: string;
    kind: BomProcurementKind;
    status: BomProcurementStatus;
    project: { number: string; name: string } | null;
    device: { name: string; position: string | null } | null;
    bomNumber: string | null;
    deliveryDate: string | null;
    docs: ProcurementFeedDoc[];
    stage: ProcurementStage;
    last: ProcurementEvent;
}

export interface ProcurementFeed {
    items: ProcurementFeedRow[];
    total: number;
    page: number;
    pageSize: number;
    canProcure: boolean;
}

export interface ProcurementDocView {
    purchaseOrderId: string;
    code: string;
    kind: 'ORDER' | 'REQUEST';
    state: ProcurementDocState;
    supplierName: string;
    currency: string;
    totalNet: number;
    lineCount: number;
    quoteNumber: string | null;
    hasQuoteFile: boolean;
}

export interface ProcurementDetail {
    request: ProcurementRequest;
    bom: Bom;
    canProcure: boolean;
    stage: ProcurementStage;
    docs: ProcurementDocView[];
    history: ProcurementEvent[];
}

/** Die offene Seitenfläche — sie arbeitet an EINEM Beleg eines Talep. */
export interface PurchasingPanel {
    kind: 'quote' | 'receive' | 'reply';
    requestId: string;
    purchaseOrderId: string;
}
