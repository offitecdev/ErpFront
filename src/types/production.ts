/**
 * ── PRODUKTION (19.09.2026) — die Antworten von /production ─────────────────
 * Spiegel der DTOs in Erp_Backend/src/application/use-cases/production.
 */

export type ProductionSourceKind = 'PROJECT' | 'DELIVERY';
export type ProductionOrderKind = 'PROJECT' | 'DELIVERY' | 'ADDON';
export type ProductionItemKind = 'DEVICE' | 'SERVICE';

/** Verkauf gegen Einkauf — dieselben Zahlen auf jeder Ebene. */
export interface ProductionCostFigures {
    salesTotal: number;
    /** Preise, die noch nicht bestätigt sind (Preisanfrage mit Preisen, Bestellentwurf). */
    openTotal: number;
    orderedTotal: number;
    receivedTotal: number;
    /** Verkauf − Bestellt. */
    difference: number;
    marginPercent: number | null;
}

export interface ProductionProject {
    id: string;
    sourceKind: ProductionSourceKind;
    projectNumber: string;
    projectName: string;
    customerName: string | null;
    sourceStatus: string | null;
    sourceTenantId: string;
    salesTotal: number;
    isActive: boolean;
}

export interface ProductionOrder {
    id: string;
    sourceSalesOrderId: string;
    parentSalesOrderId: string | null;
    orderNumber: string;
    orderType: string;
    orderKind: ProductionOrderKind;
    orderDate: string | null;
    status: string;
    totalAmount: number;
    isActive: boolean;
}

export interface ProductionItem {
    id: string;
    productionProjectId: string;
    productionOrderId: string;
    sourceType: 'POSITION' | 'EXTRA_MATERIAL' | 'EXPENSE';
    kind: ProductionItemKind;
    positionNumber: string | null;
    name: string;
    description: string | null;
    articleCode: string | null;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    totalPrice: number;
    isActive: boolean;
}

export interface ProductionItemNode {
    item: ProductionItem;
    figures: ProductionCostFigures;
}

export interface ProductionOrderNode {
    order: ProductionOrder;
    figures: ProductionCostFigures;
    items: ProductionItemNode[];
    addons: ProductionOrderNode[];
}

export interface ProductionOverviewProject {
    project: ProductionProject;
    sourceTenantName: string | null;
    figures: ProductionCostFigures;
    orders: ProductionOrderNode[];
}

export interface ProductionOverview {
    lastSyncedAt: string | null;
    totals: ProductionCostFigures;
    projects: ProductionOverviewProject[];
}

export interface ProductionPriceRow {
    purchaseOrderId: string;
    referenceNumber: string;
    status: string;
    approved: boolean;
    supplierName: string | null;
    currency: string;
    createdAt: string;
    lineIndex: number;
    code: string | null;
    name: string;
    unit: string | null;
    quantity: number;
    grossPrice: number;
    discount: number;
    discount2: number;
    netPrice: number;
    lineTotal: number;
    productionItemId: string | null;
}

export interface ProductionConfirmedLine {
    id: string;
    purchaseOrderId: string;
    purchaseOrderNumber: string;
    purchaseStatus: string | null;
    supplierName: string | null;
    currency: string;
    productionProjectId: string;
    productionItemId: string | null;
    lineIndex: number;
    code: string | null;
    name: string;
    unit: string | null;
    quantity: number;
    grossPrice: number;
    discount: number;
    discount2: number;
    netPrice: number;
    lineTotal: number;
    receivedQuantity: number;
    approvedAt: string;
}

export interface ProductionProjectDetail {
    project: ProductionProject & { sourceTenantName: string | null };
    figures: ProductionCostFigures;
    orders: ProductionOrderNode[];
    priceRows: ProductionPriceRow[];
    confirmedGroups: Array<{ item: ProductionItem | null; figures: ProductionCostFigures; lines: ProductionConfirmedLine[] }>;
    comparison: Array<{ item: ProductionItem | null; figures: ProductionCostFigures }>;
    purchaseOrders: Array<{
        id: string;
        referenceNumber: string;
        status: string;
        supplierName: string | null;
        currency: string;
        createdAt: string;
        itemIds: string[];
    }>;
}

export interface ProductionProjectBrief {
    id: string;
    projectNumber: string;
    projectName: string;
    sourceKind: string;
}

export interface ProductionLineRow extends ProductionConfirmedLine {
    project: ProductionProjectBrief | null;
    item: ProductionItem | null;
}

export interface ProductionLinesPage {
    rows: ProductionLineRow[];
    totals: { orderedTotal: number; receivedTotal: number; lineCount: number };
    projects: ProductionProjectBrief[];
}

export interface ProductionItemDetail {
    item: ProductionItem;
    order: ProductionOrder | null;
    parentOrder: ProductionOrder | null;
    project: ProductionProject | null;
    figures: ProductionCostFigures;
    confirmedLines: ProductionConfirmedLine[];
    openRows: ProductionPriceRow[];
}

export interface ProductionPickerProject extends ProductionProject {
    deviceCount: number;
    serviceCount: number;
}

/** Projekt + Geräte einer Lieferantenbestellung. */
export interface ProductionSelection {
    /** `null` = kein Projekt (Wahl zurückgenommen) — freiwillig seit 21.09.2026. */
    productionProjectId: string | null;
    productionItemIds: string[];
}

export interface ProductionPurchaseAssignment {
    assignment: ProductionSelection | null;
    project: ProductionProject | null;
    items: ProductionItem[];
}

export interface ProductionTransferCompany {
    id: string;
    name: string;
    groupId: string;
    groupName: string;
    isRoot: boolean;
}

export interface ProductionSettings {
    enabled: boolean;
    sourceTenantIds: string[];
    effectiveSourceTenantIds: string[];
    lastSyncedAt: string | null;
    companies: ProductionTransferCompany[];
}

export interface ProductionSyncResult {
    synced: boolean;
    lastSyncedAt: string | null;
    projects?: number;
    orders?: number;
    items?: number;
}
