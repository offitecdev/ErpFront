export type LocationType = 'MAIN_WAREHOUSE' | 'SUB_WAREHOUSE' | 'STATION_BUFFER' | 'PROJECT_RESERVE';

export type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'RETURN' | 'ADJUSTMENT';

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'CONVERTED' | 'REJECTED';

export type ArticleStatus = 'ACTIVE' | 'INACTIVE' | 'IN_SUPPLY' | 'IN_PRODUCTION';

export type ItemType = 'PRODUCT' | 'MATERIAL';

export interface InventoryLocation {
    id: string;
    tenantId: string;
    locationName: string;
    locationType: LocationType;
    parentLocationId?: string | null;
    isActive: boolean;
}

export interface InventoryArticle {
    id: string;
    tenantId: string;
    articleCode: string;
    name: string;
    description?: string | null;
    baseCost: number;
    salePrice?: number;
    defaultSupplierId?: string | null;
    unit: string;
    systemBarcode?: string | null;
    supplierBarcode?: string | null;
    imageUrl?: string | null;
    category?: string | null;
    itemType?: ItemType;
    status: ArticleStatus;
    isActive: boolean;
    minStockLevel: number;
    criticalStockLevel: number;
    maxStockLevel?: number | null;
    lastPurchaseDate?: string | null;
    weightedAverageCost?: number;
    costBasisQuantity?: number;
    costBasisValue?: number;
    supplierCostQuantity?: number;
    supplierCostValue?: number;
    manualCostQuantity?: number;
    manualCostValue?: number;
    suppliers?: ArticleSupplierRow[];
}

export interface ArticleStockSummary extends InventoryArticle {
    totalQuantity: number;
    totalReserved: number;
    balances: {
        locationId: string;
        locationName?: string;
        locationType?: LocationType;
        currentQuantity: number;
        reservedQuantity: number;
    }[];
}

// Lean row for the products list and tender picker. Description is optional for
// consumers that can stage a row directly; images, suppliers and movements stay out.
export interface ArticleListItem {
    id: string;
    articleCode: string;
    name: string;
    description?: string | null;
    category?: string | null;
    itemType?: ItemType;
    systemBarcode?: string | null;
    supplierBarcode?: string | null;
    unit: string;
    salePrice?: number;
    baseCost: number;
    status: ArticleStatus;
    minStockLevel: number;
    criticalStockLevel: number;
    totalQuantity: number;
    createdAt: string;
}

// Stok hareketi ekranı için tek ürünün yalın canlı stok bilgisi. Depo/lokasyon
// verisi taşımaz — yalnızca sayaç (totalQuantity) ve ortalama maliyet dökümü.
export interface ArticleStockInfo {
    id: string;
    totalQuantity: number;
    minStockLevel: number;
    criticalStockLevel: number;
    maxStockLevel?: number | null;
    weightedAverageCost: number;
    costBasisQuantity: number;
    costBasisValue: number;
    supplierCostQuantity: number;
    supplierCostValue: number;
    manualCostQuantity: number;
    manualCostValue: number;
}

export interface ArticleListPage {
    items: ArticleListItem[];
    total: number;
    page: number;
    pageSize: number;
}

export interface StockBalanceRow {
    id: string;
    tenantId: string;
    articleId: string;
    locationId: string;
    currentQuantity: number;
    reservedQuantity: number;
    updatedAt: string;
    article?: {
        id: string;
        articleCode: string;
        name: string;
        unit: string;
        baseCost: number;
        minStockLevel: number;
        criticalStockLevel: number;
        imageUrl?: string | null;
        systemBarcode?: string | null;
    };
    location?: {
        locationName: string;
        locationType: LocationType;
    };
}

export interface StockMovementRow {
    id: string;
    tenantId: string;
    articleId: string;
    movementType: MovementType;
    quantity: number;
    unitCost?: number | null;
    supplierId?: string | null;
    sourceLocationId?: string | null;
    destinationLocationId?: string | null;
    transactionDate: string;
    employeeId: string;
    referenceId?: string | null;
    description?: string | null;
    employee?: { firstName: string; lastName: string };
    supplier?: { companyName: string } | null;
}

// Stok hareketi seçiminde kullanılan birleşik ürün + malzeme arama sonucu.
export interface SearchItem {
    kind: 'PRODUCT' | 'MATERIAL';
    id: string;
    code: string;
    name: string;
    barcode?: string | null;
    unit?: string;
    salePrice: number;
    baseCost?: number;
    imageUrl?: string | null;
    itemType?: ItemType;
    minStockLevel?: number;
    criticalStockLevel?: number;
    maxStockLevel?: number | null;
    stockQuantity?: number;
}

export interface PurchaseProposalRow {
    id: string;
    tenantId: string;
    articleId: string;
    proposedQuantity: number;
    supplierId?: string | null;
    status: ProposalStatus;
    createdAt: string;
    resolvedAt?: string | null;
    resolvedByEmpId?: string | null;
    article?: { articleCode: string; name: string; imageUrl?: string | null };
}

export interface SupplierRow {
    id: string;
    tenantId: string;
    companyName: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    articleSuppliers?: ArticleSupplierRow[];
    articleCount?: number;
    purchaseCount?: number;
    totalPurchaseQuantity?: number;
    totalPurchaseAmount?: number;
    latestPurchaseDate?: string | null;
}

export interface ArticleSupplierRow {
    id: string;
    tenantId: string;
    articleId: string;
    supplierId: string;
    locationId?: string | null;
    supplierSku?: string | null;
    purchasePrice: number;
    quantity: number;
    remainingQuantity: number;
    currency: string;
    lastPurchaseDate?: string | null;
    stockMovementId?: string | null;
    notes?: string | null;
    isPreferred: boolean;
    createdAt: string;
    updatedAt: string;
    supplier?: SupplierRow;
    location?: Pick<InventoryLocation, 'id' | 'locationName' | 'locationType'>;
    article?: Pick<InventoryArticle, 'id' | 'articleCode' | 'name' | 'unit' | 'baseCost' | 'imageUrl'>;
}

// --- TEDARİK TALEPLERİ (Supply Requests) ---

// Minimum/kritik seviyeye düşmüş tek bir ürün/malzeme (yalın liste satırı).
export interface LowStockItem {
    kind: ItemType;
    id: string;
    code: string;
    name: string;
    unit: string;
    totalQuantity: number;
    minStockLevel: number;
    criticalStockLevel: number;
    isCritical: boolean;
    isBelowMin: boolean;
}

export interface LowStockResponse {
    minimum: LowStockItem[];
    critical: LowStockItem[];
}

// Bir kalemin daha önce alım yaptığı tedarikçi + son alım özeti.
export interface ItemSupplier {
    supplierId: string;
    companyName: string;
    email?: string | null;
    phone?: string | null;
    lastPurchaseDate?: string | null;
    lastPurchasePrice?: number | null;
    lastPurchaseQuantity?: number | null;
    currency?: string | null;
    purchaseCount: number;
}

export interface ItemSuppliersResponse {
    item: { kind: ItemType; id: string; code: string; name: string; unit: string };
    suppliers: ItemSupplier[];
}

export type SupplyRequestStatus = 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface SupplyRequestRow {
    id: string;
    tenantId: string;
    itemType: ItemType;
    articleId?: string | null;
    materialId?: string | null;
    itemName: string;
    itemCode?: string | null;
    unit?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    supplierEmail?: string | null;
    requestedQuantity: number;
    emailSubject?: string | null;
    emailBody?: string | null;
    emailSent: boolean;
    status: SupplyRequestStatus;
    createdByEmpId?: string | null;
    createdAt: string;
    receivedAt?: string | null;
    receivedByEmpId?: string | null;
}

export interface CreateSupplyRequestInput {
    itemType: ItemType;
    articleId?: string | null;
    materialId?: string | null;
    itemName: string;
    itemCode?: string | null;
    unit?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    supplierEmail?: string | null;
    requestedQuantity: number;
    emailSubject?: string;
    emailBody?: string;
    sendEmail?: boolean;
}

export interface InventoryDashboard {
    kpis: {
        totalArticles: number;
        activeArticles: number;
        totalLocations: number;
        pendingProposals: number;
        criticalCount: number;
        belowMinCount: number;
        inventoryValue: number;
    };
    criticalArticles: ArticleStockSummary[];
    proposals: PurchaseProposalRow[];
    locations: InventoryLocation[];
}
