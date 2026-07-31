import type { PersonLite } from './maintenance';

export type TenderFormat = 'SIA451' | 'CRBX';
export type TenderStatus = 'Draft' | 'Approved' | 'Exported';
export type TenderRowType = 'SECTION' | 'TITLE' | 'DESCRIPTION' | 'PRODUCT' | 'CUSTOM';

export interface TenderListItem {
    id: string;
    tenantId: string;
    customerId?: string | null;
    customerName?: string | null;
    customerAddress?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerTaxNumber?: string | null;
    projectId?: string | null;
    tenderNumber: string;
    version: number;
    format: TenderFormat;
    status: TenderStatus;
    validUntil?: string | null;
    billingAddress?: string | null;
    // Projektadresse (installation/Montage); deliveryAddress is the Lieferadresse.
    installationAddress?: string | null;
    deliveryAddress?: string | null;
    billingSameAsInstallation?: boolean | null;
    internalDeliveryDate?: string | null;
    priceList?: string | null;
    paymentTerms?: string | null;
    commissionNumber?: string | null;
    // Currency the offer is denominated in (CHF/EUR/USD/GBP/TRY); symbol-only.
    currency?: string | null;
    // Document-level direct discount (%) applied to the net total.
    directDiscount?: number | null;
    // Optional custom display name for the direct discount (e.g. "Winteraktion").
    directDiscountLabel?: string | null;
    // Second document-level discount (%) applied sequentially after directDiscount.
    extraDiscount?: number | null;
    extraDiscountLabel?: string | null;
    /**
     * Document-level discounts as a JSON array of `{name, kind, value}`
     * (`kind`: PERCENT | AMOUNT), applied SEQUENTIALLY. This is the editable
     * source of truth; `directDiscount` mirrors the list's combined percentage
     * so older consumers keep working. See `tenderDiscounts.utils.ts`.
     */
    totalDiscounts?: string | null;
    // Payment schedule as a JSON percent array (e.g. "[30,20,10,40]"), stages sum to 100.
    paymentStages?: string | null;
    /**
     * Optional PDF content blocks. The two texts are rich HTML (bold / italic /
     * colour); the image is a data URI. Each is independent — an offer may carry
     * any combination, or none.
     */
    coverLetter?: string | null;
    closingNote?: string | null;
    /** JSON array of data URIs — several images may close the document. */
    closingImages?: string | null;
    sourceStatus?: string | null;
    offerMailSentAt?: string | null;
    offerAcceptedAt?: string | null;
    offerMailRecipient?: string | null;
    offerAcceptanceToken?: string | null;
    createdAt: string;
    createdByEmployeeId: string;
    createdByName?: string | null;
    createdByEmail?: string | null;
    positionCount?: number;
    grandTotal?: number;
}

export interface TenderActivity {
    id: string;
    customerId: string;
    employeeId: string;
    employeeName?: string | null;
    employeeEmail?: string | null;
    activityType: string;
    activityDate: string;
    description?: string | null;
    referenceId?: string | null;
}

export interface OfferScheduleSlotAssignmentDto {
    id: string;
    slotId: string;
    technicianId: string;
    assignedAt?: string;
    technician?: PersonLite | null;
}

export interface OfferScheduleSlotDto {
    id: string;
    tenantId: string;
    tenderId: string;
    customerId?: string | null;
    assignedTechId?: string | null;
    assignedTechnician?: PersonLite | null;
    technicianAssignments?: OfferScheduleSlotAssignmentDto[];
    startTime: string;
    endTime: string;
    notes?: string | null;
    createdAt: string;
}

export interface TenderChangeLog {
    id: string;
    tenantId: string;
    tenderId: string;
    positionId?: string | null;
    mappingId?: string | null;
    articleId?: string | null;
    employeeId: string;
    employeeName?: string | null;
    employeeEmail?: string | null;
    actionType: string;
    fieldName?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    description?: string | null;
    createdAt: string;
}

export interface TenderDocumentDto {
    id: string;
    tenantId: string;
    relatedEntityId: string;
    entityType: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
    uploadedByEmployeeId: string;
    category?: string | null;
}

export interface TenderChatterSummary {
    noteCount: number;
    documentCount: number;
    logCount: number;
}

// Tenant-wide reusable offer-mail draft (subject + message template),
// shared by the mail composer of every tender.
export interface TenderMailDraftDto {
    id: string;
    tenantId: string;
    subject: string;
    message: string | null;
    createdBy?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CalculationItemDto {
    id: string;
    positionId: string;
    materialCost: number;
    laborCost: number;
    overheadCost: number;
    riskAmount: number;
    additionalCost: number;
    profitMargin: number;
    totalCalculatedPrice: number;
}

export interface PositionArticleMappingDto {
    id: string;
    positionId: string;
    articleId: string;
    quantityMultiplier: number;
    discount?: number | null;
    article?: {
        id: string;
        articleCode: string;
        name: string;
        description?: string | null;
        baseCost: number;
        salePrice?: number | null;
        unit: string;
        imageUrl?: string | null;
    } | null;
}

export interface PositionMaterialMappingDto {
    id: string;
    positionId: string;
    materialId: string;
    quantityMultiplier: number;
    discount?: number | null;
    material?: {
        id: string;
        serialId: string;
        name: string;
        stockQuantity: number;
        unitCost: number;
        isActive: boolean;
    } | null;
}

export interface TenderMaterialUsageDto {
    id: string;
    tenderId: string;
    materialId: string;
    quantity: number;
    unitCost: number;
    description?: string | null;
    createdAt?: string;
    material?: {
        id: string;
        serialId: string;
        name: string;
        stockQuantity: number;
        unitCost: number;
        isActive?: boolean;
    } | null;
}

export interface PositionDto {
    id: string;
    tenantId: string;
    tenderId: string;
    parentPositionId?: string | null;
    rowType?: TenderRowType | string;
    sourceArticleId?: string | null;
    displayOrder?: number;
    npkCode?: string | null;
    positionNumber: string;
    shortDescription: string;
    longDescription?: string | null;
    quantity: number;
    unit?: string | null;
    hierarchyLevel: number;
    unitPrice?: number | null;
    /**
     * COMBINED effect of `discounts` as one percentage. Kept as the single
     * pricing input every other screen reads; the modal edits `discounts` and
     * this column is re-derived from it.
     */
    discount?: number | null;
    /**
     * Up to five stacked line discounts as a JSON array of `{name, kind, value}`
     * (`kind`: PERCENT | AMOUNT), applied sequentially on quantity × unit price.
     */
    discounts?: string | null;
    taxRate?: number | null;
    imageUrl?: string | null;
    calculation?: CalculationItemDto | null;
    articleMappings?: PositionArticleMappingDto[];
    materialMappings?: PositionMaterialMappingDto[];
}

export interface TenderDetailDto {
    tender: TenderListItem;
    positions: PositionDto[];
    activities?: TenderActivity[];
}

export interface FinancialSummary {
    totalMaterialCost: number;
    totalLaborCost: number;
    totalOverheadCost: number;
    totalRiskAmount: number;
    totalProfitMargin: number;
    grandTotal: number;
}

export interface TenderSummaryReport {
    tenderInfo: {
        tenderNumber: string;
        status: TenderStatus;
        version: number;
    };
    financialSummary: FinancialSummary;
    averageMarginPercentage: string;
    costByNpkGroup: Record<string, number>;
}

export interface CostInput {
    materialCost: number;
    laborCost: number;
    overheadCost: number;
    riskAmount: number;
    additionalCost: number;
    profitMargin: number;
}

export interface ArticleDto {
    id: string;
    tenantId: string;
    articleCode: string;
    name: string;
    description?: string | null;
    baseCost: number;
    salePrice?: number | null;
    unit: string;
}

export interface CustomerLite {
    id: string;
    companyName: string;
    segment?: string | null;
}
