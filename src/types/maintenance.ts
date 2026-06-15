export type MaintenancePeriod = 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'YEARLY';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type MaintenanceAppointmentOptionStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED';

export interface PersonLite {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    roleName?: string | null;
}

export interface CustomerLite {
    id: string;
    companyName: string;
    address?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
}

export interface ArticleLite {
    id: string;
    articleCode?: string;
    name: string;
    unit?: string;
    baseCost?: number;
    imageUrl?: string | null;
}

export interface MaintenanceMaterialDto {
    id: string;
    reportId: string;
    articleId: string;
    quantity: number;
    unitCost: number;
    sourceLocationId?: string | null;
    article?: ArticleLite;
}

export interface MaintenanceReportDto {
    id: string;
    taskId: string;
    techId: string;
    checklistJson?: unknown;
    operationsDone: string;
    observations?: string | null;
    recommendations?: string | null;
    riskNotes?: string | null;
    beforePhotoUrls?: unknown;
    afterPhotoUrls?: unknown;
    fileUrls?: unknown;
    isSigned: boolean;
    customerSignature?: string | null;
    signedAt?: string | null;
    lockedAt?: string | null;
    pdfUrl?: string | null;
    emailSentAt?: string | null;
    emailLogJson?: unknown;
    createdAt: string;
    technician?: PersonLite;
    usedMaterials?: MaintenanceMaterialDto[];
    expenses?: MaintenanceExpenseDto[];
    task?: MaintenanceTaskDto;
}

export interface MaintenanceTaskAssignmentDto {
    id: string;
    taskId: string;
    technicianId: string;
    assignedAt?: string;
    createdById?: string | null;
    technician?: PersonLite;
}

export interface MaintenanceAppointmentOptionDto {
    id: string;
    taskId: string;
    token: string;
    startTime: string;
    endTime: string;
    status: MaintenanceAppointmentOptionStatus;
    sentAt?: string | null;
    respondedAt?: string | null;
    emailLogJson?: unknown;
    createdAt?: string;
    isAvailable?: boolean;
    unavailableReason?: string | null;
}

export interface MaintenanceExpenseDto {
    id: string;
    taskId: string;
    reportId?: string | null;
    expenseType: string;
    amount: number;
    description?: string | null;
    createdAt: string;
}

export interface MaintenanceTaskDto {
    id: string;
    contractId: string;
    assignedTechId?: string | null;
    alternativeTechId?: string | null;
    siteName?: string | null;
    plannedDate: string;
    scheduledStartTime?: string | null;
    scheduledEndTime?: string | null;
    bookingToken?: string | null;
    reminderSentAt?: string | null;
    managerApprovedAt?: string | null;
    managerApprovedById?: string | null;
    status: TaskStatus;
    assignmentHistoryJson?: unknown;
    createdAt?: string;
    updatedAt?: string;
    technician?: PersonLite | null;
    alternativeTechnician?: PersonLite | null;
    assignments?: MaintenanceTaskAssignmentDto[];
    appointmentOptions?: MaintenanceAppointmentOptionDto[];
    expenses?: MaintenanceExpenseDto[];
    report?: MaintenanceReportDto | null;
    contract?: MaintenanceContractDto;
}

export interface MaintenanceContractDto {
    id: string;
    tenantId: string;
    customerId: string;
    contractCode?: string | null;
    title: string;
    period: MaintenancePeriod;
    startDate: string;
    endDate: string;
    equipmentInfo?: string | null;
    serviceScope?: string | null;
    siteName?: string | null;
    reminderDaysBefore: number;
    notificationChannels?: unknown;
    overtimeHourlyRate?: number;
    isActive: boolean;
    deletedAt?: string | null;
    createdAt: string;
    updatedAt?: string;
    customer?: CustomerLite;
    tasks?: MaintenanceTaskDto[];
}

export interface ServiceMaterialDto {
    id: string;
    reportId: string;
    articleId: string;
    quantity: number;
    unitCost: number;
    sourceLocationId?: string | null;
    article?: ArticleLite;
}

export interface ServiceReportDto {
    id: string;
    callId: string;
    techId: string;
    workDone: string;
    workingMinutes: number;
    gasAmount: number;
    observations?: string | null;
    recommendations?: string | null;
    beforePhotoUrls?: unknown;
    afterPhotoUrls?: unknown;
    fileUrls?: unknown;
    isWarranty: boolean;
    isSigned: boolean;
    customerSignature?: string | null;
    signedAt?: string | null;
    lockedAt?: string | null;
    linkedOrderId?: string | null;
    createdAt: string;
    technician?: PersonLite;
    usedMaterials?: ServiceMaterialDto[];
    order?: { id: string; orderNumber: string; totalAmount: number; isBilled: boolean } | null;
    call?: ServiceCallDto;
}

export interface ServiceCallDto {
    id: string;
    tenantId: string;
    customerId: string;
    assignedTechId?: string | null;
    alternativeTechId?: string | null;
    siteName?: string | null;
    priority?: string | null;
    reportedIssue: string;
    status: TaskStatus;
    callDate: string;
    assignmentHistoryJson?: unknown;
    updatedAt?: string;
    customer?: CustomerLite;
    technician?: PersonLite | null;
    alternativeTechnician?: PersonLite | null;
    report?: ServiceReportDto | null;
}

export interface MaterialInput {
    articleId: string;
    quantity: number;
    unitCost: number;
    sourceLocationId: string;
}
