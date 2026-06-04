export type ShipmentStatus = 'UNPAID' | 'PAID' | 'DELAYED' | 'CANCELLED';

export interface ShipmentDto {
    id: string;
    tenantId: string;
    customerId: string;
    projectId?: string | null;
    foNumber?: string | null;
    cmrNumber?: string | null;
    awNumber?: string | null;
    carrierCompany?: string | null;
    productDescription?: string | null;
    quantity?: number | null;
    unit?: string | null;
    grossWeight?: number | null;
    netWeight?: number | null;
    dimensions?: string | null;
    extraNotes?: string | null;
    shipmentDate?: string | null;
    eta?: string | null;
    status: ShipmentStatus;
    invoiceUrl?: string | null;
    autoMarkDelayed: boolean;
    requireInvoiceForPaid: boolean;
    etaWarning?: boolean;
    createdAt?: string;
    updatedAt?: string;
    customer?: { companyName: string; mainEmail?: string | null } | null;
    project?: { projectName: string } | null;
}

export type ShipmentInput = Omit<
    ShipmentDto,
    'id' | 'tenantId' | 'customer' | 'project' | 'etaWarning' | 'createdAt' | 'updatedAt'
>;
