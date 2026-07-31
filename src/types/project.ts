export type ProjectStatus = 'AWAITING_APPROVAL' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'SPECIALLY_CLOSED' | 'CANCELLED';
export type AppointmentStatus = 'AVAILABLE' | 'BOOKED' | 'COMPLETED' | 'CANCELLED';

export interface ProjectCustomer {
    id: string;
    companyName: string;
    mainEmail?: string | null;
    mainPhone?: string | null;
    address?: string | null;
    // Preferred correspondence language (TR/EN/DE); field & delivery report PDFs
    // are rendered in this language regardless of the active UI language.
    language?: string | null;
}

export interface ProjectMaterial {
    id: string;
    tenantId: string;
    serialId: string;
    name: string;
    stockQuantity: number;
    unitCost: number;
    minStockLevel?: number;
    criticalStockLevel?: number;
    imageUrl?: string | null;
    isActive: boolean;
    createdAt?: string;
}

/** Sayfalı montaj listesinin düz satırı — yalnızca tablo kolonları. */
export interface MontageOrderListItem {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    projectId: string | null;
    salesOrderId: string | null;
    orderNumber: string;
    projectName: string;
    customerName: string;
    fieldReportId: string | null;
    signed: boolean;
}

export interface MontageOrdersPageDto {
    items: MontageOrderListItem[];
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
}

export interface MontageReportOrderListItem {
    salesOrderId: string;
    orderNumber: string;
    projectId: string | null;
    projectName: string;
    customerName: string;
    fieldReportCount: number;
    latestReportDate: string | null;
}

export interface MontageReportOrdersPageDto {
    items: MontageReportOrderListItem[];
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
}

export interface MontageReportOrderDetailDto {
    order: Pick<MontageReportOrderListItem, 'salesOrderId' | 'orderNumber' | 'projectId' | 'projectName' | 'customerName'>;
    fieldReports: Array<{
        id: string;
        appointmentId: string | null;
        reportDate: string;
        workDate: string;
        isSigned: boolean;
        appointment: { id: string; startTime: string; endTime: string } | null;
        employee: { firstName: string; lastName: string } | null;
    }>;
    deliveryReport: { id: string; isSigned: boolean; createdAt: string; checklistName: string | null } | null;
    generalReport: { id: string; status: string; createdAt: string } | null;
    createAppointmentId: string | null;
}

export interface MontageReportResourcesDto {
    usedMaterials: Array<{
        id: string;
        quantity: number;
        costAtTime: number;
        article: { articleCode: string; name: string; unit: string } | null;
        material: { name: string } | null;
    }>;
    extraMaterials: Array<{
        id: string;
        quantity: number;
        unitPrice: number;
        description: string | null;
        material: { name: string } | null;
    }>;
    expenses: Array<{
        id: string;
        expenseType: string;
        amount: number;
        description: string | null;
        expenseDate: string;
    }>;
}

export interface AppointmentDto {
    id: string;
    tenantId: string;
    projectId?: string | null;
    salesOrderId?: string | null;
    assignedTechId?: string | null;
    customerId?: string | null;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    notes?: string | null;
    installationReminderSentAt?: string | null;
    assignedTechnician?: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; roleName?: string | null } | null;
    technicianAssignments?: Array<{
        id: string;
        appointmentId: string;
        technicianId: string;
        assignedAt?: string;
        technician?: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; roleName?: string | null } | null;
    }>;
}

export interface ProjectSalesOrder {
    id: string;
    tenantId: string;
    customerId?: string | null;
    tenderId?: string | null;
    projectId?: string | null;
    parentSalesOrderId?: string | null;
    revisionNumber?: number | null;
    orderNumber: string;
    orderType: string;
    status: string;
    totalAmount: number;
    createdByEmployeeId?: string;
    createdAt: string;
    // Business date shown to the user; for addon orders this is the original
    // appointment date the extra work belongs to. Falls back to createdAt when null.
    orderDate?: string | null;
    updatedAt?: string;
    customer?: ProjectCustomer | null;
    tender?: ProjectDto['tender'];
    parentSalesOrder?: { id: string; orderNumber: string } | null;
    addonSalesOrders?: Array<{ id: string; orderNumber: string; revisionNumber?: number | null; totalAmount: number; createdAt: string; orderDate?: string | null }>;
    createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface ProjectDto {
    id: string;
    tenantId: string;
    customerId: string;
    tenderId?: string | null;
    managerId?: string | null;
    projectName: string;
    status: ProjectStatus;
    plannedBudget: number;
    actualCost: number;
    overtimeHourlyRate?: number;
    overtimeTolerancePercent?: number;
    startDate?: string | null;
    endDate?: string | null;
    bookingToken?: string | null;
    createdAt: string;
    updatedAt: string;
    customer?: ProjectCustomer | null;
    manager?: { id: string; firstName: string; lastName: string; email: string } | null;
    tender?: {
        id: string;
        tenderNumber: string;
        status: string;
        projectId?: string | null;
        usedMaterials?: Array<{
            id: string;
            materialId: string;
            quantity: number;
            unitCost: number;
            description?: string | null;
            material?: { id: string; serialId: string; name: string; stockQuantity: number; unitCost: number } | null;
        }>;
        positions?: Array<{
            id: string;
            positionNumber: string;
            shortDescription: string;
            materialMappings?: Array<{
                id: string;
                quantityMultiplier: number;
                discount?: number | null;
                materialId?: string;
                material?: { id: string; serialId: string; name: string; stockQuantity: number; unitCost: number } | null;
            }>;
        }>;
    } | null;
    appointments?: AppointmentDto[];
    salesOrders?: ProjectSalesOrder[];
    reports?: any[];
    expenses?: any[];
    projectVariations?: any[];
    extraMaterials?: any[];
    addonRequests?: ProjectAddonRequestDto[];
    _count?: { reports: number; expenses: number; projectVariations: number; salesOrders?: number };
}

export interface ProjectAddonRequestDto {
    id: string;
    tenantId: string;
    projectId: string;
    salesOrderId?: string | null;
    appointmentId?: string | null;
    requestedById: string;
    requestedByName?: string | null;
    status: 'PENDING' | 'HANDLED' | 'DISMISSED';
    note?: string | null;
    expenseTotal: number;
    materialTotal: number;
    overtimeTotal: number;
    total: number;
    createdAt: string;
    resolvedById?: string | null;
    resolvedAt?: string | null;
}

export interface MailSettingDto {
    tenantId: string;
    fromName?: string | null;
    fromEmail?: string | null;
    replyTo?: string | null;
    smtpHost?: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser?: string | null;
    /** Tenant e-posta imzası — sınırlı HTML; gönderilen maillerin sonuna eklenir. */
    signatureHtml?: string | null;
    /** İmza görseli (PNG/JPG data URI, ≤ 2 MB); mailde CID'li inline ek olarak gider. */
    signatureImage?: string | null;
    hasPassword?: boolean;
}
