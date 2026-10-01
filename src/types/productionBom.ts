/**
 * ── BOM DER PRODUKTION (27.09.2026) — die Antworten von /production/bom ──────
 * Spiegel von Erp_Backend `application/use-cases/production/bom/bomReadModel.ts`
 * und `DeviceBomsUseCase.ts`.
 */
import type { BuiltInArea } from './productionTasks';

export type BomCategory = 'MACHINE' | 'ELECTRICAL';
export type BomStatus = 'DRAFT' | 'APPROVED' | 'COMPLETED';
/** MAIN = Haupt-BOM des Geräts im Bereich (BOM-MEK-00001) · SUB = Alt-BOM darunter. */
export type BomKind = 'MAIN' | 'SUB';
export type BomUnit = 'PCS' | 'M' | 'KG' | 'SET' | 'PACK';
export const BOM_UNITS: BomUnit[] = ['PCS', 'M', 'KG', 'SET', 'PACK'];

/** Makine ↔ Mekanik, Elektrik ↔ Elektrik. */
export const CATEGORY_OF_AREA: Record<BuiltInArea, BomCategory> = { MECHANICAL: 'MACHINE', ELECTRICAL: 'ELECTRICAL' };

/** Ein Alt-BOM-Kod der Einstellungen (MAK-COOL · Soğutma devresi). */
export interface BomCode {
    prefix: string;
    name: string;
}

export interface BomSettings {
    /** Höchstzahl der Alt-BOMs unter einer Haupt-BOM. */
    maxPerArea: number;
    codes: Record<BuiltInArea, BomCode[]>;
    canEdit: boolean;
}

/** Eine Depo-Karte, wie Suche und Zeilen sie zeigen — «depodaki satırın aynısı». */
export interface BomProduct {
    id: string;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    description: string | null;
    supplierName: string | null;
    suppliers: Array<{ id: string | null; name: string }>;
    quantity: number;
    free: number;
    serialRequired: boolean;
    minimumOrderQuantity: number | null;
    hasErpCode: boolean;
}

export interface BomTemplateSummary {
    id: string;
    name: string;
    category: BomCategory;
    mainCard: string;
    codePrefix: string;
    lineCount: number;
    usedBy: number;
    isExample: boolean;
    updatedAt: string;
}

export interface BomTemplateLine {
    id: string;
    productId: string;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    quantity: number;
    unit: BomUnit;
    note: string | null;
    product: BomProduct | null;
}

export interface BomTemplate {
    id: string;
    name: string;
    category: BomCategory;
    mainCard: string;
    codePrefix: string;
    description: string | null;
    isExample: boolean;
    usedBy: number;
    updatedAt: string;
    lines: BomTemplateLine[];
}

export interface BomLineInput {
    productId: string;
    quantity: number;
    unit: BomUnit;
    note: string | null;
}

export interface BomTemplateInput {
    name: string;
    category: BomCategory;
    mainCard: string;
    codePrefix: string;
    description: string | null;
    lines: BomLineInput[];
}

export interface BomLineOrder {
    purchaseOrderId: string;
    referenceNumber: string;
    kind: 'ORDER' | 'REQUEST';
    status: string;
    quantity: number;
    received: number;
}

export interface BomLineCoverage {
    open: number;
    reserved: number;
    incoming: number;
    incomingConfirmed: number;
    missing: number;
    serials: string[];
}

export interface BomLine {
    id: string;
    productId: string;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    unit: BomUnit;
    quantity: number;
    consumedQuantity: number;
    note: string | null;
    product: BomProduct | null;
    coverage: BomLineCoverage;
    orders: BomLineOrder[];
}

export interface BomPurchaseLine {
    index: number;
    bomLineId: string | null;
    code: string | null;
    name: string;
    /** Das Modell einer Preisanfrage (eigene Spalte `stdModel`). */
    model: string | null;
    unit: string | null;
    quantity: number;
    received: number;
    grossPrice: number;
    netPrice: number;
    lineTotal: number;
}

export interface BomPurchase {
    purchaseOrderId: string;
    referenceNumber: string;
    kind: 'ORDER' | 'REQUEST';
    status: string;
    supplierName: string;
    quoteNumber: string | null;
    currency: string;
    totalNet: number;
    lineCount: number;
    createdAt: string;
    emailSentAt: string | null;
    sourcePurchaseOrderId: string | null;
    quoteFile: { name: string; type: string | null; size: number | null; uploadedAt: string | null } | null;
    checks: { quoteNumber: boolean; quoteFile: boolean; prices: boolean; confirmed: boolean; received: boolean };
    receivedLines: number;
    /** Die BOM-Revision, für die der Beleg gilt. */
    bomRevision: number;
    /** Wie oft eine BOM-Revision die Bestellung beim Lieferanten geändert hat. */
    orderRevision: number;
    /** Eine Preisanfrage einer älteren Revision («eski revizyona ait»). */
    stale: boolean;
    /** Die alten Fassungen (älteste zuerst): altes PDF, alte Bestätigung. */
    revisions: BomPurchaseRevision[];
    lines: BomPurchaseLine[];
}

/* ── Revisionen (27.09.2026: «bom onaylanırsa geri dönüş yok, revize olması lazım») ── */

export type BomChangeKind = 'ADDED' | 'REMOVED' | 'INCREASED' | 'DECREASED' | 'EDITED';

export interface BomLineChange {
    kind: BomChangeKind;
    lineId: string;
    productId: string;
    erpCode: string | null;
    name: string;
    unitBefore: BomUnit | null;
    unitAfter: BomUnit | null;
    before: number;
    after: number;
    noteBefore: string | null;
    noteAfter: string | null;
}

/** UPDATE Entwurf direkt · REVISE beim Lieferanten (Rev.+1) · DELETE Entwurf ohne Zeilen · CANCEL beim Lieferanten, alle Zeilen weg · KEEP bleibt. */
export type BomOrderActionKind = 'UPDATE' | 'REVISE' | 'DELETE' | 'CANCEL' | 'KEEP';

export interface BomOrderActionLine {
    index: number;
    bomLineId: string;
    code: string | null;
    name: string;
    unitBefore: string | null;
    unitAfter: string | null;
    before: number;
    after: number;
    received: number;
}

export interface BomOrderAction {
    purchaseOrderId: string;
    referenceNumber: string;
    supplierName: string;
    status: string;
    atSupplier: boolean;
    action: BomOrderActionKind;
    canKeep: boolean;
    orderRevision: number | null;
    statusAfter: string;
    lines: BomOrderActionLine[];
}

/** Eine alte Fassung einer BOM-Bestellung: `number` = die Revision, die dabei entstand. */
export interface BomPurchaseRevision {
    number: number;
    bomRevision: number;
    createdAt: string;
    previousStatus: string;
    changes: BomOrderActionLine[];
    quoteFile: { name: string; type: string | null; size: number | null; uploadedAt: string | null } | null;
}

export interface BomRevisionLine {
    id: string;
    productId: string;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    unit: BomUnit;
    quantity: number;
    note: string | null;
    product?: BomProduct | null;
}

/** Die Revision im Entwurf — die Arbeitskopie; die BOM gilt unverändert weiter. */
export interface BomRevisionDraft {
    id: string;
    revision: number;
    reason: string | null;
    createdAt: string;
    createdByName: string | null;
    updatedAt: string;
    lines: BomRevisionLine[];
}

export interface BomRevisionSummary {
    revision: number;
    reason: string | null;
    approvedAt: string | null;
    approvedByName: string | null;
    changes: BomLineChange[];
    orderActions: Array<Pick<BomOrderAction, 'purchaseOrderId' | 'referenceNumber' | 'supplierName' | 'action' | 'orderRevision'>>;
}

/** GET …/revision/preview — was die Freigabe schreibt. */
export interface BomRevisionPreview {
    bomId: string;
    bomNumber: string;
    fromRevision: number;
    toRevision: number;
    reason: string | null;
    changes: BomLineChange[];
    orders: BomOrderAction[];
    staleRequests: Array<{ purchaseOrderId: string; referenceNumber: string; supplierName: string }>;
    toOrder: Array<{ lineId: string; erpCode: string | null; name: string; unit: BomUnit; missing: number }>;
    reopens: { bom: boolean; main: string | null };
}

/** GET …/revisions/:number */
export interface BomRevisionDetail {
    bomId: string;
    bomNumber: string;
    revision: number;
    status: 'DRAFT' | 'APPROVED';
    reason: string | null;
    createdAt: string | null;
    createdByName: string | null;
    approvedAt: string | null;
    approvedByName: string | null;
    lines: BomRevisionLine[];
    changes: BomLineChange[];
    orderActions: BomOrderAction[];
}

/** GET /bom/purchases/:id/revisions/:number — die Bestellung VOR dieser Revision. */
export interface BomPurchaseRevisionDetail {
    purchaseOrderId: string;
    number: number;
    bomRevision: number;
    createdAt: string;
    previousStatus: string;
    changes: BomOrderActionLine[];
    order: Record<string, unknown>;
    pdfRevision: { number: number; createdAt: string | null; changes: BomOrderActionLine[] } | null;
    quoteFile: { name: string; type: string | null; size: number | null; uploadedAt: string | null } | null;
}

export interface BomCompletion {
    ordered: boolean;
    confirmed: boolean;
    reserved: boolean;
    /** Haupt-BOM: ihre Alt-BOMs (wie viele, wie viele abgeschlossen). */
    subs: { total: number; completed: number };
    ready: boolean;
}

export interface Bom {
    id: string;
    bomNumber: string;
    kind: BomKind;
    parentBomId: string | null;
    templateId: string | null;
    templateName: string;
    mainCard: string | null;
    area: BuiltInArea;
    status: BomStatus;
    approvedAt: string | null;
    completedAt: string | null;
    consumedAt: string | null;
    createdAt: string;
    updatedAt: string;
    lines: BomLine[];
    completion: BomCompletion;
    counts: { lines: number; missing: number; reserved: number; ordered: number };
    purchases: BomPurchase[];
    /** Die geltende Revision (0 = die erste Freigabe). */
    revision: number;
    /** Die Revision im Entwurf — oder keine. */
    revisionDraft: BomRevisionDraft | null;
    /** Die freigegebenen Revisionen, älteste zuerst. */
    revisions: BomRevisionSummary[];
    /** Talepler an den Einkauf (27.09.2026 abends) — ohne Lieferant, ohne Preis. */
    procurement: BomProcurementSummary[];
    /** Eingegangene Ware, die bei der Buchung an diese BOM ging (Gelen mallar). */
    goodsIn: BomGoodsIn[];
}

export interface BomAreaView {
    settings: { maxPerArea: number };
    area: BuiltInArea;
    device: { id: string; name: string; quantity: number; positionNumber: string | null; isActive: boolean };
    project: { id: string; projectNumber: string; projectName: string; customerName: string | null; deliveryDate: string | null };
    canEdit: boolean;
    counts: Record<BuiltInArea, number>;
    /** Die Haupt-BOM — `null` nur für Lesende, solange keine angelegt ist. */
    main: Bom | null;
    /** Die Alt-BOMs darunter. */
    subs: Bom[];
    /** Haupt- und Alt-BOMs zusammen. */
    boms: Bom[];
    /** Die Alt-BOM-Kodes des Bereichs (Einstellungen). */
    codes: BomCode[];
    /** Vorlagen des Bereichs — zum Einfügen ihrer Zeilen. */
    templates: BomTemplateSummary[];
}

export type BomOrderBlock = 'NO_PRODUCT' | 'NO_ERP_CODE' | 'OPEN_ORDER';

export interface BomProposalLine {
    lineId: string;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    unit: BomUnit;
    need: number;
    reserved: number;
    incoming: number;
    missing: number;
    minimum: number | null;
    floor: number;
    block: BomOrderBlock | null;
    serialRequired: boolean;
    suppliers: Array<{ id: string | null; name: string }>;
    product: BomProduct | null;
}

/** Eine offene Bestellung der BOM — «aynı tedarikçi → aynı sipariş» (27.09.2026). */
export interface BomSupplierOrder {
    purchaseOrderId: string;
    referenceNumber: string;
    supplierId: string | null;
    supplierName: string;
    status: string;
    lineCount: number;
    /** Ein Entwurf, der nie beim Lieferanten war: neue Zeilen dieses Lieferanten kommen hier hinein. */
    acceptsLines: boolean;
}

export interface BomProposal {
    bomId: string;
    bomNumber: string;
    nextOrderNumber: string | null;
    /** Die offenen Bestellungen dieser BOM, älteste zuerst (fehlt bei einem älteren Server). */
    supplierOrders?: BomSupplierOrder[];
    lines: BomProposalLine[];
}

export interface BomOrderLineInput {
    lineId: string;
    quantity: number;
    supplierId: string | null;
    supplierName: string;
    note: string | null;
}

export interface BomOrdersResult {
    /** `merged` = die Zeilen kamen in eine schon bestehende Bestellung (nur «Sipariş oluştur»). */
    created: Array<{ purchaseOrderId: string; referenceNumber: string; supplierName: string; lineCount: number; merged?: boolean }>;
    failed: Array<{ supplierName: string; error: string }>;
    bom: Bom;
}

/** «Fiyat talebi» einer BOM im Entwurf (GET …/request-proposal). */
export interface BomRequestProposalLine {
    lineId: string;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    unit: BomUnit;
    /** Die Menge der BOM-Zeile — der Vorschlag. */
    quantity: number;
    serialRequired: boolean;
    missingProduct: boolean;
    suppliers: Array<{ id: string | null; name: string }>;
    /** Preisanfragen dieser BOM, in denen die Zeile schon steht. */
    requests: Array<{ purchaseOrderId: string; referenceNumber: string; supplierName: string; quantity: number }>;
}

export interface BomRequestProposal {
    bomId: string;
    bomNumber: string;
    nextRequestNumber: string | null;
    lines: BomRequestProposalLine[];
}

/** Eine Zeile der Preisanfrage — bei einem oder mehreren Lieferanten. */
export interface BomRequestLineInput {
    lineId: string;
    quantity: number;
    suppliers: Array<{ supplierId: string | null; supplierName: string }>;
}

/** «Tabloyu yapay zekâ ile doldur»: je Zeile der gespeicherten Bestellung, was der Beleg zu den Vorlagenspalten sagt. */
export interface BomTableAiResult {
    rows: Array<{ index: number; evidence: string; values: Record<string, string> }>;
    matched: number;
    filled: number;
    model: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedUsd: number | null };
    sources: Array<'prompt' | 'sheet' | 'pdf' | 'image'>;
    /** Nur mit `header: true`: Angebotsnummer und Datum (ISO) des Lieferanten, '' = nicht gedruckt. */
    document?: { number: string; date: string } | null;
}

/** Die Herkunft eines Belegs aus einer BOM (GET /inventory/purchase-orders/:id → `bomOrigin`). */
export interface BomOrigin {
    kind: 'ORDER' | 'REQUEST';
    bomId: string;
    bomNumber: string | null;
    bomStatus: string | null;
    area: string | null;
    productionProjectId: string;
    productionItemId: string;
    projectNumber: string | null;
    projectName: string | null;
    deviceName: string | null;
    sourcePurchaseOrderId: string | null;
    quoteFile: { name: string; type: string | null; size: number | null; uploadedAt: string | null } | null;
    confirmProblems: Array<'QUOTE_NUMBER' | 'QUOTE_FILE'>;
    /** Die geltende Revision der BOM. */
    bomRevision?: number | null;
    /** Die BOM-Revision, für die der Beleg gilt. */
    linkBomRevision?: number;
    /** Wie oft eine BOM-Revision die Bestellung beim Lieferanten geändert hat. */
    orderRevision?: number;
    /** Die jüngste Revision der Bestellung — das PDF druckt sie («Revision n», geänderte Zeilen). */
    revision?: { number: number; createdAt: string | null; changes: BomOrderActionLine[] } | null;
    /** Revidiert und noch nicht wieder bestätigt. */
    revisionPending?: boolean;
}

/* ── Satın alma talebi & gelen mallar (27.09.2026 abends, Vorgabe Samet) ────
   «Bom'da sadece sipariş ve fiyat talep istekleri oluşsun … tedarikçi ve
    fiyatlar gözükmesin, başka bir sayfada talep olarak gelsin.» */

/** PRICE = Preise anfragen (Entwurf) · ORDER = bestellen, was fehlt (freigegeben). */
export type BomProcurementKind = 'PRICE' | 'ORDER';
export type BomProcurementStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface BomProcurementProgress {
    covered: number;
    total: number;
    requests: number;
    orders: number;
    confirmed: number;
}

/** Ein Talep, wie die BOM ihn sieht (ohne Lieferant, ohne Preis). */
export interface BomProcurementSummary {
    id: string;
    requestNumber: string;
    kind: BomProcurementKind;
    status: BomProcurementStatus;
    bomRevision: number;
    createdAt: string;
    createdByName: string | null;
    note: string | null;
    lines: Array<{ bomLineId: string; quantity: number }>;
    progress: BomProcurementProgress;
}

/** Eingegangene Ware an einer BOM. */
export interface BomGoodsIn {
    id: string;
    receiptId: string;
    /** ORDER = Wareneingang einer Bestellung · STOCK = im Depo dazugekommen. */
    source: 'ORDER' | 'STOCK';
    referenceNumber: string | null;
    lineId: string | null;
    productId: string;
    erpCode: string | null;
    name: string;
    quantity: number;
    serials: string[];
    receivedAt: string;
    receivedByName: string | null;
}

export interface BomProcurementInput {
    kind: BomProcurementKind;
    lines: Array<{ lineId: string; quantity: number; note: string | null }>;
    note: string | null;
}

/** Ein Beleg des Einkaufs (MIT Lieferant und Betrag — nur «Satın alma»). */
export interface ProcurementDocument {
    purchaseOrderId: string;
    referenceNumber: string;
    kind: 'ORDER' | 'REQUEST';
    status: string;
    supplierName: string;
    currency: string;
    totalNet: number;
    confirmed: boolean;
    received: number;
    createdAt: string;
    /** Letzte Änderung am Vorgang (28.09.2026). */
    updatedAt?: string;
}

export interface ProcurementRequest {
    id: string;
    requestNumber: string;
    kind: BomProcurementKind;
    status: BomProcurementStatus;
    note: string | null;
    bomRevision: number;
    createdAt: string;
    createdByName: string | null;
    closedAt: string | null;
    closedByName: string | null;
    /** Letzter Handgriff an Talep oder einem seiner Vorgänge — die Liste sortiert danach. */
    lastActivityAt?: string;
    bom: { id: string; bomNumber: string; kind: BomKind; status: BomStatus; area: BuiltInArea; revision: number; templateName: string; consumed: boolean } | null;
    project: { id: string; projectNumber: string; projectName: string; customerName: string | null; deliveryDate: string | null } | null;
    device: { id: string; name: string; positionNumber: string | null } | null;
    lines: Array<{
        bomLineId: string;
        productId: string;
        erpCode: string | null;
        name: string;
        brand: string | null;
        modelNumber: string | null;
        unit: BomUnit;
        quantity: number;
        note: string | null;
        covered: boolean;
        missingNow: number | null;
    }>;
    progress: BomProcurementProgress;
    documents: ProcurementDocument[];
}

/** Wohin ein Wareneingang Ware gab (Antwort von «receive»). */
export interface BomReceiptAllocation {
    productId: string;
    erpCode: string | null;
    name: string;
    quantity: number;
    serials: string[];
    /** null = kein wartender Bedarf: freier Bestand. */
    bomId: string | null;
    bomNumber: string | null;
    projectNumber: string | null;
    projectName: string | null;
    deviceName: string | null;
    deliveryDate: string | null;
}

/* ── Kalkülasyon (27.09.2026 abends) ─────────────────────────────────────── */

export interface CostingPrice {
    unit: number;
    currency: string;
}

export interface CostingLine {
    key: string;
    productId: string;
    erpCode: string | null;
    name: string;
    unit: BomUnit | string;
    quantity: number;
    /** Alışpreis: Depo-Karte (CARD) oder günstigste Preisanfrage (QUOTE). */
    plan: (CostingPrice & { source: 'CARD' | 'QUOTE' }) | null;
    /** Durchschnitt der bestätigten Bestellpositionen. */
    actual: (CostingPrice & { orderedQuantity: number }) | null;
    planTotal: number | null;
    actualTotal: number | null;
    forecastTotal: number | null;
    diff: number | null;
}

export interface CostingTotal {
    currency: string;
    plan: number;
    actual: number;
    forecast: number;
    comparablePlan: number;
    diff: number;
}

export interface CostingDevice {
    id: string;
    name: string;
    positionNumber: string | null;
    bomNumbers: string[];
    lines: CostingLine[];
    totals: CostingTotal[];
    missingPrice: number;
    actualLines: number;
}

export interface CostingProjectSummary {
    id: string;
    projectNumber: string;
    projectName: string;
    customerName: string | null;
    deliveryDate: string | null;
    devices: number;
    lines: number;
    missingPrice: number;
    actualLines: number;
    totals: CostingTotal[];
}

export interface CostingProject extends CostingProjectSummary {
    deviceList: CostingDevice[];
}
