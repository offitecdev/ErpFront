export type ProjectStatus = 'AWAITING_APPROVAL' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type AppointmentStatus = 'AVAILABLE' | 'BOOKED' | 'COMPLETED' | 'CANCELLED';

export interface ProjectCustomer {
    id: string;
    companyName: string;
    mainEmail?: string | null;
    mainPhone?: string | null;
    address?: string | null;
}

export interface ProjectMaterial {
    id: string;
    tenantId: string;
    serialId: string;
    name: string;
    stockQuantity: number;
    unitCost: number;
    isActive: boolean;
}

export interface AppointmentDto {
    id: string;
    tenantId: string;
    projectId?: string | null;
    customerId?: string | null;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    notes?: string | null;
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
    reports?: any[];
    expenses?: any[];
    projectVariations?: any[];
    extraMaterials?: any[];
    _count?: { reports: number; expenses: number; projectVariations: number };
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
