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
    hasPassword?: boolean;
}
