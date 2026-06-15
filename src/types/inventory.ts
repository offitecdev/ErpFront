export type LocationType = 'MAIN_WAREHOUSE' | 'SUB_WAREHOUSE' | 'STATION_BUFFER' | 'PROJECT_RESERVE';

export type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'RETURN' | 'ADJUSTMENT';

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'CONVERTED' | 'REJECTED';

export type ArticleStatus = 'ACTIVE' | 'INACTIVE' | 'IN_SUPPLY' | 'IN_PRODUCTION';

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
    sourceLocationId?: string | null;
    destinationLocationId?: string | null;
    transactionDate: string;
    employeeId: string;
    referenceId?: string | null;
    description?: string | null;
    employee?: { firstName: string; lastName: string };
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
