import type { Bom, BomProcurementKind, BomProcurementStatus, ProcurementRequest } from './productionBom';

/* ── Üretim › Satın alma (28.09.2026) — Gegenstück zu domain/services/procurementFlow.ts ── */

export type ProcurementDocState = 'DRAFT' | 'SENT' | 'REVISED' | 'CONFIRMED' | 'RECEIVED' | 'REPLIED' | 'CANCELLED';

export type ProcurementStageKey =
    | 'ORDER_NEEDED'
    | 'QUOTE_NEEDED'
    /** Beim Lieferanten, seine Bestätigung fehlt («Onay bekliyor», 30.09.2026). */
    | 'CONFIRMATION_EXPECTED'
    | 'GOODS_EXPECTED'
    | 'PRICE_NEEDED'
    | 'REPLIES_EXPECTED'
    | 'COMPARE'
    | 'DONE'
    | 'CANCELLED';

/** Der eine Knopf einer Zeile: was jetzt zu tun ist. `SEND` = «Onayla ve gönder», `AWAIT` = «Onay bekliyor». */
export type ProcurementNextAction = 'ORDER' | 'QUOTE' | 'CONFIRM' | 'RESEND' | 'RECEIVE' | 'ASK' | 'REPLY' | 'COMPARE' | 'SEND' | 'AWAIT';

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
    /** Ein Fiyat talebi, aus dem schon bestellt wurde — die Liste zeigt ihn als Bestellung (30.09.2026). */
    ordered?: boolean;
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
    supplierId: string | null;
    supplierName: string;
    currency: string;
    totalNet: number;
    lineCount: number;
    quoteNumber: string | null;
    hasQuoteFile: boolean;
    /** Das Angebot des Lieferanten — für den Vergleich zählt nur ein PDF. */
    quoteFile: { name: string; type: string | null } | null;
    /** Wann der Beleg zuletzt hinausging (die Automatik sendet selbst). */
    sentAt?: string | null;
    /** Die Preisanfrage, aus deren Angebot diese Bestellung entstand. */
    sourcePurchaseOrderId?: string | null;
    /** An wen der Beleg ginge: seine Adresse, sonst die der Karten, sonst die der Lieferantenliste (null = keine). */
    supplierEmail?: string | null;
    /** Wie oft eine BOM-Revision die Bestellung geändert hat (0 = nie). */
    orderRevision?: number;
}

/* ── Die Automatik (30.09.2026) — Gegenstück zu ProcurementDispatchUseCase ── */

export type DispatchStatus = 'SENT' | 'PREVIEW' | 'FAILED' | 'SKIPPED';
export type DispatchProblem = 'NO_EMAIL' | 'NO_MAILBOX' | 'QUOTE_NUMBER_REQUIRED' | 'PDF_FAILED' | 'MAIL_FAILED' | 'NOT_SENDABLE';

export interface DispatchResult {
    purchaseOrderId: string;
    code: string;
    supplierName: string;
    kind: 'RFQ' | 'ORDER' | 'REVISION';
    status: DispatchStatus;
    problem: DispatchProblem | null;
    error: string | null;
    to: string[];
    lang: 'de' | 'tr' | 'en';
    fileName: string | null;
    fileSize: number | null;
    mailId: string | null;
    sentAt: string | null;
}

export interface DispatchMail {
    id: string;
    kind: 'RFQ' | 'ORDER' | 'REVISION';
    status: 'SENT' | 'PREVIEW' | 'FAILED';
    trigger: 'AUTO' | 'MANUAL' | 'RESEND' | 'REVISION' | null;
    to: string[];
    at: string;
    error: string | null;
    fileName: string | null;
    hasFile: boolean;
    byName: string | null;
    lang: string | null;
}

export interface DispatchReply {
    id: string;
    status: 'ATTACHED' | 'NO_PDF' | 'UNMATCHED' | 'FAILED';
    at: string;
    fromEmail: string | null;
    fromName: string | null;
    subject: string | null;
    fileName: string | null;
    hasFile: boolean;
    kind: 'RFQ' | 'ORDER' | null;
}

export interface DispatchState {
    mails: DispatchMail[];
    replies: DispatchReply[];
}

/** Eine Bestellung, die aus der Auswahl des Vergleichs entstand. */
export interface ComparisonOrder {
    purchaseOrderId: string;
    code: string;
    supplierName: string;
    lineCount: number;
    total: number;
    currency: string;
    needsQuoteNumber: boolean;
    email: string | null;
}

export interface ComparisonSkip {
    bomLineId: string;
    name: string;
    reason: 'IN_STOCK' | 'OPEN_ORDER' | 'NO_PRODUCT' | 'NO_ERP_CODE' | 'NO_PRICE';
}

/** Ein Postfach der Produktion (Üretim ayarları › E-posta). */
export interface ProductionMailbox {
    purpose: 'RFQ' | 'ORDER';
    isActive: boolean;
    fromName: string | null;
    fromEmail: string;
    smtpHost: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string | null;
    hasPassword: boolean;
    imapHost: string | null;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string | null;
    hasImapPassword: boolean;
    imapFolder: string | null;
    lastCheckAt: string | null;
    lastError: string | null;
    lastSummary: string | null;
    updatedAt: string;
}

export interface ProductionMailboxes {
    rfq: ProductionMailbox | null;
    order: ProductionMailbox | null;
    defaults: { host: string; smtpPort: number; imapPort: number };
    canEdit: boolean;
}

export interface MailboxTestResult {
    smtp: { ok: boolean; error?: string } | null;
    imap: { ok: boolean; error?: string; messages?: number } | null;
}

export interface ProcurementDetail {
    request: ProcurementRequest;
    bom: Bom;
    canProcure: boolean;
    stage: ProcurementStage;
    docs: ProcurementDocView[];
    history: ProcurementEvent[];
}

/** Die offene Seitenfläche — seit dem 29.09.2026 nur noch der Wareneingang. */
export interface PurchasingPanel {
    kind: 'receive';
    requestId: string;
    purchaseOrderId: string;
}

/* ── Fiyat karşılaştırması (29.09.2026) — Gegenstück zu domain/services/priceComparison.ts ── */

export interface ComparisonOffer {
    unitPrice: number | null;
    total: number | null;
    /** Betrag bzw. Stückpreis aus dem anderen gerechnet. */
    computed: boolean;
    deliveryTime: string;
    note: string;
    evidence: string;
    /** Wurde der Lieferant nach der Zeile gefragt? (false = «sorulmadı») */
    asked?: boolean;
    listPrice?: number | null;
    discount?: number | null;
}

export interface ComparisonSupplier {
    purchaseOrderId: string;
    code: string;
    supplierName: string;
    fileName: string;
    currency: string;
    offerNumber: string;
    offerDate: string;
    deliveryTime: string;
    paymentTerms: string;
    validity: string;
    notes: string;
    total: number;
    pricedLines: number;
    complete: boolean;
    contactName?: string;
    contactEmail?: string;
    language?: string;
    /** So viele Zeilen wurden bei ihm angefragt. */
    askedLines?: number;
}

export interface ComparisonLine {
    bomLineId: string;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    unit: string | null;
    quantity: number;
    offers: ComparisonOffer[];
    best: number | null;
    bestBy: 'price' | 'ai' | null;
    reason: string;
}

export interface ComparisonResult {
    suppliers: ComparisonSupplier[];
    lines: ComparisonLine[];
    bestSupplier: number | null;
    bestSupplierBy: 'price' | 'ai' | null;
    bestMix: { total: number; currency: string } | null;
    currency: string | null;
    summary: string;
}

export interface PriceComparisonSummary {
    id: string;
    createdAt: string;
    createdByName: string | null;
    suppliers: Array<{ supplierName: string; code: string; total: number; currency: string; complete: boolean }>;
    bestSupplier: number | null;
    lineCount: number;
}

/** Warum eine Zeile des Vergleichs nicht bestellt würde: am Lager, schon bestellt, keine Depo-Karte. */
export type ComparisonOrderableReason = 'IN_STOCK' | 'OPEN_ORDER' | 'NO_PRODUCT';

export interface PriceComparison {
    id: string;
    createdAt: string;
    createdByName: string | null;
    model: string;
    request: {
        id: string;
        requestNumber: string;
        status: string;
        project: { number: string; name: string } | null;
        device: { name: string; position: string | null } | null;
    };
    /** Die BOM des Talep — bestellt wird erst aus einer freigegebenen (30.09.2026). */
    bom?: {
        id: string;
        number: string | null;
        status: string;
        approved: boolean;
        consumed: boolean;
        area: string | null;
        productionProjectId: string;
        productionItemId: string;
    } | null;
    /** Je Zeile: was «Oluştur ve gönder» bestellen würde — oder warum nicht (nur bei freigegebener BOM). */
    orderable?: Record<string, { quantity: number; reason: ComparisonOrderableReason | null }> | null;
    result: ComparisonResult;
    /** Alle Vergleiche desselben Talep (für die Auswahl oben). */
    others: PriceComparisonSummary[];
}
