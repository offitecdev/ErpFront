import { apiClient } from '../axios';
import type { AppointmentDto, MailSettingDto, MontageOrdersPageDto, MontageReportOrderDetailDto, MontageReportOrdersPageDto, MontageReportResourcesDto, ProjectAddonRequestDto, ProjectDto, ProjectMaterial, ProjectStatus } from '../../types/project';
import type { PersonLite } from '../../types/maintenance';

export type SalesOrderMode = 'PROJECT_NEW' | 'PROJECT_EXISTING' | 'PROJECT_ADDON' | 'INVOICE';
export type ProjectDetailScope =
    | 'overview'
    | 'details'
    | 'planning'
    | 'fieldReports'
    | 'generalReport'
    | 'delivery'
    | 'signatures'
    | 'expenses'
    | 'materials'
    | 'overtime'
    | 'billing'
    | 'addons';

export interface SalesOrderDto {
    id: string;
    tenantId: string;
    customerId?: string | null;
    tenderId?: string | null;
    projectId?: string | null;
    parentSalesOrderId?: string | null;
    revisionNumber?: number | null;
    orderNumber: string;
    orderType: SalesOrderMode;
    status: string;
    totalAmount: number;
    createdByEmployeeId: string;
    createdAt: string;
    updatedAt: string;
    customer?: { id: string; companyName: string; mainEmail?: string | null; mainPhone?: string | null } | null;
    tender?: { id: string; tenderNumber: string; status: string; projectId?: string | null } | null;
    project?: { id: string; projectName: string; status: ProjectStatus } | null;
    createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
}

// One row of the global field-report registry (Services > Reports).
export interface ServiceReportDto {
    id: string;
    projectId: string;
    salesOrderId?: string | null;
    appointmentId?: string | null;
    reportDate: string;
    workDate: string;
    startedAt?: string | null;
    endedAt?: string | null;
    workedMinutes: number;
    plannedMinutesForDay: number;
    overtimeMinutes: number;
    overtimeHourlyRate: number;
    overtimeCost: number;
    operationsDone: string;
    technicalNotes?: string | null;
    customerSignature?: string | null;
    isSigned: boolean;
    hoursApprovedAt?: string | null;
    autoApproved?: boolean;
    project?: { id: string; projectName: string; customer?: { id: string; companyName: string } | null } | null;
    salesOrder?: { id: string; orderNumber: string } | null;
    appointment?: { id: string; startTime: string; endTime: string } | null;
    employee?: { id: string; firstName: string; lastName: string; email: string } | null;
    images?: { id: string }[];
}

export type CompleteInstallationInput = {
    operationsDoneItems?: string[];
    technicalNotes?: string;
    startedAt?: string;
    endedAt?: string;
    signatureBase64?: string;
    expenses?: { expenseType: string; amount: number; description?: string }[];
    materials?: { materialId: string; quantity: number; description?: string }[];
    usedMaterials?: { materialId: string; quantity: number; description?: string }[];
    // Optional field-report photos as base64 data URLs.
    images?: string[];
};

export const projectApi = {
    list: async (filter: { status?: ProjectStatus | ''; search?: string } = {}): Promise<ProjectDto[]> => {
        const params = new URLSearchParams();
        if (filter.status) params.set('status', filter.status);
        if (filter.search) params.set('search', filter.search);
        const res = await apiClient.get(`/projects${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    getById: async (id: string, view?: ProjectDetailScope): Promise<ProjectDto> => {
        const res = await apiClient.get(`/projects/${id}`, {
            params: view ? { view } : undefined,
        });
        return res.data;
    },

    createFromTender: async (tenderId: string, managerId?: string | null, overtimeHourlyRate?: number): Promise<{ project: ProjectDto; bookingLink: string; message: string }> => {
        const res = await apiClient.post('/projects/from-tender', { tenderId, managerId: managerId || undefined, overtimeHourlyRate });
        return res.data;
    },

    createSalesOrderFromTender: async (input: {
        tenderId: string;
        mode: SalesOrderMode;
        projectName?: string;
        projectId?: string;
        overtimeHourlyRate?: number;
    }): Promise<{ message: string; salesOrder: SalesOrderDto; project?: ProjectDto | null }> => {
        const res = await apiClient.post('/sales-orders/from-tender', input);
        return res.data;
    },

    listSalesOrders: async (filter: { search?: string } = {}): Promise<SalesOrderDto[]> => {
        const params = new URLSearchParams();
        if (filter.search) params.set('search', filter.search);
        const res = await apiClient.get(`/sales-orders${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    // Admin/manager-facing: delete a project sales order. The backend guards this —
    // main orders with addons or any invoiced order are rejected.
    deleteSalesOrder: async (projectId: string, salesOrderId: string): Promise<void> => {
        await apiClient.delete(`/projects/${projectId}/sales-orders/${salesOrderId}`);
    },

    createAddonOrder: async (id: string, input: { parentSalesOrderId: string }) => {
        const res = await apiClient.post(`/projects/${id}/addon-orders`, input);
        return res.data as {
            message: string;
            salesOrder: SalesOrderDto;
            totals: { expenses: number; extraMaterials: number; overtime: number; total: number };
        };
    },

    // Technician-facing: request that the manager create an addon order from the
    // extra work accrued on a parent order (technicians cannot create it directly).
    requestAddonOrder: async (id: string, input: { salesOrderId?: string | null; appointmentId?: string | null; note?: string } = {}) => {
        const res = await apiClient.post(`/projects/${id}/addon-order-requests`, input);
        return res.data as {
            message: string;
            addonRequest: ProjectAddonRequestDto;
            totals: { expenseTotal: number; materialTotal: number; overtimeTotal: number; total: number };
        };
    },

    // Manager-facing: mark a technician addon request as HANDLED or DISMISSED.
    resolveAddonRequest: async (requestId: string, status: 'HANDLED' | 'DISMISSED' | 'PENDING') => {
        const res = await apiClient.patch(`/projects/addon-order-requests/${requestId}`, { status });
        return res.data as { message: string; addonRequest: ProjectAddonRequestDto };
    },

    update: async (id: string, patch: Partial<ProjectDto>): Promise<ProjectDto> => {
        const res = await apiClient.patch(`/projects/${id}`, patch);
        return res.data;
    },

    activate: async (id: string, startDate?: string): Promise<{ message: string; project: ProjectDto }> => {
        const res = await apiClient.patch(`/projects/${id}/activate`, { startDate });
        return res.data;
    },

    addReport: async (id: string, input: { salesOrderId?: string | null; appointmentId?: string | null; workDate: string; startedAt: string; endedAt: string; operationsDone: string; technicalNotes?: string; images?: string[] }) => {
        const res = await apiClient.post(`/projects/${id}/reports`, input);
        return res.data;
    },

    updateReport: async (reportId: string, input: { salesOrderId?: string | null; appointmentId?: string | null; workDate: string; startedAt: string; endedAt: string; operationsDone: string; technicalNotes?: string; images?: string[] }) => {
        const res = await apiClient.patch(`/projects/reports/${reportId}`, input);
        return res.data;
    },

    signReport: async (reportId: string, signatureBase64: string) => {
        const res = await apiClient.patch(`/projects/reports/${reportId}/sign`, { signatureBase64 });
        return res.data;
    },

    addReportMaterials: async (reportId: string, materials: Array<{ materialId: string; quantity: number }>) => {
        const res = await apiClient.post(`/projects/reports/${reportId}/materials`, { materials });
        return res.data;
    },

    requestReportSignature: async (reportId: string, input: { channel: 'technician' | 'mail' | 'both'; to?: string; subject?: string; message?: string; fromEmail?: string; fromName?: string }) => {
        const res = await apiClient.post(`/projects/reports/${reportId}/signature-request`, input);
        return res.data;
    },

    // Flat list of every field report in the tenant (Services > Reports module).
    listAllReports: async (filter: { search?: string; start?: string; end?: string } = {}): Promise<ServiceReportDto[]> => {
        const params = new URLSearchParams();
        if (filter.search) params.set('search', filter.search);
        if (filter.start) params.set('start', filter.start);
        if (filter.end) params.set('end', filter.end);
        const res = await apiClient.get(`/projects/reports${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    listTechnicians: async (): Promise<PersonLite[]> => {
        const res = await apiClient.get('/projects/options/technicians');
        return res.data;
    },

    // `calendar: true` asks the backend for the trimmed grid payload (no report /
    // material / tender trees); the popup then fetches full detail on click via
    // getMyInstallationDetail. Other callers omit it and keep the rich payload.
    // Sayfalı montaj listesi: yalnızca tablo kolonları (düz satır DTO'ları) —
    // pop-up/iş ekranı verileri açıldıklarında kendi uçlarından yüklenir.
    listMontageOrdersPage: async (
        mode: 'active' | 'completed',
        page: number,
        start: string,
        end: string,
        pageSize = 10,
    ): Promise<MontageOrdersPageDto> => {
        const res = await apiClient.get('/projects/technician/installations', {
            params: { start, end, view: 'montage-page', mode, page, pageSize },
        });
        return res.data;
    },

    listMontageReportOrdersPage: async (filter: {
        page: number;
        search?: string;
    }): Promise<MontageReportOrdersPageDto> => {
        const res = await apiClient.get('/projects/technician/reports', {
            params: { ...filter, pageSize: 10 },
        });
        return res.data;
    },

    getMyMontageReportOrder: async (salesOrderId: string): Promise<MontageReportOrderDetailDto> => {
        const res = await apiClient.get(`/projects/technician/report-orders/${salesOrderId}`);
        return res.data;
    },

    getMyMontageReport: async (reportId: string): Promise<any> => {
        const res = await apiClient.get(`/projects/technician/reports/${reportId}`);
        return res.data;
    },

    getMyMontageReportResources: async (reportId: string): Promise<MontageReportResourcesDto> => {
        const res = await apiClient.get(`/projects/technician/reports/${reportId}/resources`);
        return res.data;
    },

    listMyInstallations: async (start: string, end: string, opts: { calendar?: boolean; montage?: boolean } = {}): Promise<AppointmentDto[]> => {
        // 'montage': satır + durum alanlarından ibaret hafif liste (rapor
        // görselleri/imza blobları yok) — montaj tabloları bununla açılır.
        const view = opts.calendar ? 'calendar' : opts.montage ? 'montage' : undefined;
        const res = await apiClient.get('/projects/technician/installations', { params: { start, end, ...(view ? { view } : {}) } });
        return res.data;
    },

    // Manager-facing: every order appointment in the tenant for the range.
    listAppointments: async (start: string, end: string, opts: { calendar?: boolean } = {}): Promise<AppointmentDto[]> => {
        const res = await apiClient.get('/projects/appointments', { params: { start, end, ...(opts.calendar ? { view: 'calendar' } : {}) } });
        return res.data;
    },

    // Lazy calendar-popup detail for a single order appointment (manager scope).
    getAppointmentDetail: async (appointmentId: string): Promise<AppointmentDto> => {
        const res = await apiClient.get(`/projects/appointments/${appointmentId}/detail`);
        return res.data;
    },

    // Lazy calendar-popup detail for a single order appointment (technician scope).
    getMyInstallationDetail: async (appointmentId: string): Promise<AppointmentDto> => {
        const res = await apiClient.get(`/projects/technician/installations/${appointmentId}/detail`);
        return res.data;
    },

    getMyInstallation: async (
        appointmentId: string,
        section: 'work' | 'expenses' | 'materials' | 'general' = 'work',
    ): Promise<AppointmentDto> => {
        const res = await apiClient.get(`/projects/technician/installations/${appointmentId}`, {
            params: { section },
        });
        return res.data;
    },

    completeInstallation: async (appointmentId: string, input: CompleteInstallationInput) => {
        const res = await apiClient.post(`/projects/technician/installations/${appointmentId}/complete`, input);
        return res.data;
    },

    completeAppointmentAsManager: async (appointmentId: string, input: CompleteInstallationInput) => {
        const res = await apiClient.post(`/projects/appointments/${appointmentId}/complete`, input);
        return res.data;
    },

    createAppointment: async (id: string, input: { salesOrderId?: string | null; assignedTechId?: string | null; technicianIds?: string[]; startTime: string; endTime: string; notes?: string }) => {
        const res = await apiClient.post(`/projects/${id}/appointments`, input);
        return res.data;
    },

    updateAppointment: async (appointmentId: string, input: { salesOrderId?: string | null; assignedTechId?: string | null; technicianIds?: string[]; startTime: string; endTime: string; notes?: string }) => {
        const res = await apiClient.patch(`/projects/appointments/${appointmentId}`, input);
        return res.data;
    },

    deleteAppointment: async (appointmentId: string): Promise<void> => {
        await apiClient.delete(`/projects/appointments/${appointmentId}`);
    },

    requestVariation: async (id: string, input: { salesOrderId?: string | null; appointmentId?: string | null; materialId: string; quantity: number; description?: string }) => {
        const res = await apiClient.post(`/projects/${id}/variations`, input);
        return res.data;
    },

    updateExtraMaterial: async (extraMaterialId: string, input: { salesOrderId?: string | null; materialId?: string; quantity?: number; unitPrice?: number; description?: string }) => {
        const res = await apiClient.patch(`/projects/extra-materials/${extraMaterialId}`, input);
        return res.data;
    },

    deleteExtraMaterial: async (extraMaterialId: string): Promise<void> => {
        await apiClient.delete(`/projects/extra-materials/${extraMaterialId}`);
    },

    approveVariation: async (variationId: string, isApproved: boolean) => {
        const res = await apiClient.patch(`/projects/variations/${variationId}/approve`, { isApproved });
        return res.data;
    },

    addExpense: async (id: string, input: { salesOrderId?: string | null; appointmentId?: string | null; expenseType: string; amount: number; description?: string }) => {
        const res = await apiClient.post(`/projects/${id}/expenses`, input);
        return res.data;
    },

    updateExpense: async (expenseId: string, input: { salesOrderId?: string | null; expenseType?: string; amount?: number; description?: string }) => {
        const res = await apiClient.patch(`/projects/expenses/${expenseId}`, input);
        return res.data;
    },

    deleteExpense: async (expenseId: string): Promise<void> => {
        await apiClient.delete(`/projects/expenses/${expenseId}`);
    },

    materials: async (options: { compact?: boolean } = {}): Promise<ProjectMaterial[]> => {
        try {
            const res = await apiClient.get('/projects/materials', {
                params: options.compact ? { view: 'picker' } : undefined,
            });
            return res.data;
        } catch {
            const res = await apiClient.get('/inventory/materials', {
                params: options.compact ? { view: 'picker' } : undefined,
            });
            return res.data;
        }
    },

    createMaterial: async (input: { name: string; serialId: string; unitCost: number; stockQuantity: number; minStockLevel?: number; criticalStockLevel?: number; imageUrl?: string | null }): Promise<ProjectMaterial> => {
        const res = await apiClient.post('/inventory/materials', input);
        return res.data;
    },

    updateMaterial: async (id: string, input: Partial<Pick<ProjectMaterial, 'name' | 'serialId' | 'unitCost' | 'stockQuantity' | 'minStockLevel' | 'criticalStockLevel' | 'imageUrl' | 'isActive'>>): Promise<ProjectMaterial> => {
        const res = await apiClient.patch(`/inventory/materials/${id}`, input);
        return res.data;
    },

    deleteMaterial: async (id: string): Promise<void> => {
        await apiClient.delete(`/inventory/materials/${id}`);
    },

    sendBookingMail: async (id: string, input: { salesOrderId?: string | null; fromEmail?: string; fromName?: string; to: string; subject: string; message: string }) => {
        const res = await apiClient.post(`/projects/${id}/send-booking-mail`, input);
        return res.data;
    },
};

export interface PublicBookingResponse {
    /** 'book' = customer still picks an available slot; 'scheduled' = installations already planned (read-only view). */
    mode: 'book' | 'scheduled';
    projectName: string;
    availableSlots: AppointmentDto[];
    scheduledAppointments: AppointmentDto[];
}

export const bookingApi = {
    getSlots: async (token: string, startDate: string, endDate: string): Promise<PublicBookingResponse> => {
        const res = await apiClient.get(`/booking/slots?token=${encodeURIComponent(token)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
        return res.data;
    },

    book: async (token: string, appointmentId: string) => {
        const res = await apiClient.post('/booking/book', { token, appointmentId });
        return res.data;
    },

    createSlots: async (slots: Array<{ startTime: string; endTime: string }>) => {
        const res = await apiClient.post('/booking/slots', { slots });
        return res.data;
    },
};

export const mailApi = {
    getSettings: async (): Promise<MailSettingDto> => {
        const res = await apiClient.get('/mail/settings');
        return res.data;
    },

    // smtpPassword: undefined/atlanmış = kayıtlı şifreye dokunma, null = sil.
    saveSettings: async (input: Partial<MailSettingDto> & { smtpPassword?: string | null }): Promise<MailSettingDto> => {
        const res = await apiClient.put('/mail/settings', input);
        return res.data;
    },

    send: async (input: { fromEmail?: string; fromName?: string; to: string; subject: string; text?: string; html?: string; attachments?: Array<{ filename: string; contentType: string; contentBase64: string }> }) => {
        const res = await apiClient.post('/mail/send', input);
        return res.data;
    },
};

export interface ChecklistItemDto {
    id: string;
    category: string;
    label: string;
    measurement: boolean;
}

export interface ChecklistTemplateDto {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    items: ChecklistItemDto[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export type ChecklistTemplateInput = {
    name: string;
    description?: string | null;
    items: Array<Partial<ChecklistItemDto> & { label: string }>;
    isActive?: boolean;
};

export const checklistApi = {
    list: async (): Promise<ChecklistTemplateDto[]> => {
        const res = await apiClient.get('/settings/checklists');
        return res.data;
    },
    getOne: async (id: string): Promise<ChecklistTemplateDto> => {
        const res = await apiClient.get(`/settings/checklists/${id}`);
        return res.data;
    },
    create: async (input: ChecklistTemplateInput): Promise<ChecklistTemplateDto> => {
        const res = await apiClient.post('/settings/checklists', input);
        return res.data;
    },
    update: async (id: string, input: Partial<ChecklistTemplateInput>): Promise<ChecklistTemplateDto> => {
        const res = await apiClient.put(`/settings/checklists/${id}`, input);
        return res.data;
    },
    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/settings/checklists/${id}`);
    },
};

export type DeliveryStatus = 'YES' | 'NO' | 'NA' | null;

export interface DeliveryResponseItem {
    id: string;
    category: string;
    label: string;
    status: DeliveryStatus;
    measurement: string;
    measurementEnabled: boolean;
}

export interface DeliveryReportDto {
    id: string;
    tenantId: string;
    projectId: string | null;
    salesOrderId: string | null;
    appointmentId: string | null;
    employeeId: string | null;
    checklistTemplateId: string | null;
    checklistName: string | null;
    responses: DeliveryResponseItem[];
    notes: string | null;
    customerSignature: string | null;
    isSigned: boolean;
    signedAt: string | null;
    sentAt: string | null;
    createdAt: string;
    updatedAt: string;
    // Optional enriched labels added by the list endpoint.
    projectName?: string | null;
    customerName?: string | null;
    orderNumber?: string | null;
}

export type DeliveryReportInput = {
    projectId?: string | null;
    salesOrderId?: string | null;
    appointmentId?: string | null;
    checklistTemplateId?: string | null;
    checklistName?: string | null;
    responses: Array<Partial<DeliveryResponseItem> & { label: string }>;
    notes?: string | null;
    signatureBase64?: string | null;
};

export const deliveryReportApi = {
    list: async (params?: { appointmentId?: string; projectId?: string; salesOrderId?: string }): Promise<DeliveryReportDto[]> => {
        const res = await apiClient.get('/delivery-reports', { params });
        return res.data;
    },
    getOne: async (id: string): Promise<DeliveryReportDto> => {
        const res = await apiClient.get(`/delivery-reports/${id}`);
        return res.data;
    },
    getByAppointment: async (appointmentId: string): Promise<DeliveryReportDto | null> => {
        const res = await apiClient.get(`/delivery-reports/by-appointment/${appointmentId}`);
        return res.data;
    },
    create: async (input: DeliveryReportInput): Promise<DeliveryReportDto> => {
        const res = await apiClient.post('/delivery-reports', input);
        return res.data;
    },
    sign: async (id: string, signatureBase64: string): Promise<DeliveryReportDto> => {
        const res = await apiClient.patch(`/delivery-reports/${id}/sign`, { signatureBase64 });
        return res.data;
    },
    update: async (id: string, input: { responses?: DeliveryReportInput['responses']; notes?: string | null; checklistName?: string | null }): Promise<DeliveryReportDto> => {
        const res = await apiClient.patch(`/delivery-reports/${id}`, input);
        return res.data;
    },
};

export type SignatureReportType = 'FIELD' | 'DELIVERY' | 'GENERAL';

export interface SignatureSnapshotRow {
    label: string;
    status?: 'YES' | 'NO' | 'NA' | null;
    value?: string;
}
export interface SignatureSnapshotSection {
    heading?: string;
    rows: SignatureSnapshotRow[];
}
export interface SignatureSnapshot {
    title?: string;
    customerName?: string;
    projectName?: string;
    meta?: Array<{ label: string; value: string }>;
    sections?: SignatureSnapshotSection[];
    images?: string[];
    notes?: string;
}

export interface SignatureRequestDto {
    id: string;
    reportType: SignatureReportType;
    reportId: string | null;
    projectId: string | null;
    token: string;
    customerEmail: string | null;
    title: string | null;
    status: 'PENDING' | 'SIGNED' | 'SUBMITTED';
    signedAt: string | null;
    createdAt: string;
    link: string;
}

export interface SignatureRequestDetailDto extends SignatureRequestDto {
    snapshot: SignatureSnapshot;
    signatureBase64: string | null;
    updatedAt: string;
}

export type SignatureRequestInput = {
    reportType: SignatureReportType;
    reportId?: string | null;
    projectId?: string | null;
    title?: string;
    customerEmail?: string | null;
    snapshot: SignatureSnapshot;
    sendEmail?: boolean;
    notifyTechnician?: boolean;
    subject?: string;
    message?: string;
    /** When present, the request is stored as already SIGNED (in-app signing). */
    signatureBase64?: string | null;
};

export interface PublicSignatureView {
    reportType: SignatureReportType;
    title: string | null;
    snapshot: SignatureSnapshot;
    status: 'PENDING' | 'SIGNED' | 'SUBMITTED';
    signedAt: string | null;
}

export const signatureApi = {
    list: async (reportType?: SignatureReportType): Promise<SignatureRequestDto[]> => {
        const res = await apiClient.get('/signature-requests', { params: reportType ? { reportType } : undefined });
        return res.data;
    },
    create: async (input: SignatureRequestInput): Promise<SignatureRequestDto & { emailed: boolean; notified: boolean }> => {
        const res = await apiClient.post('/signature-requests', input);
        return res.data;
    },
    getOne: async (id: string): Promise<SignatureRequestDetailDto> => {
        const res = await apiClient.get(`/signature-requests/${id}`);
        return res.data;
    },
    sign: async (id: string, signatureBase64: string): Promise<SignatureRequestDetailDto> => {
        const res = await apiClient.patch(`/signature-requests/${id}/sign`, { signatureBase64 });
        return res.data;
    },
    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/signature-requests/${id}`);
    },
    publicGet: async (token: string): Promise<PublicSignatureView> => {
        const res = await apiClient.get(`/signature-requests/public/${token}`);
        return res.data;
    },
    publicSign: async (token: string, signatureBase64?: string | null): Promise<{ message: string; signed: boolean }> => {
        const res = await apiClient.post(`/signature-requests/public/${token}/sign`, { signatureBase64: signatureBase64 || null });
        return res.data;
    },
};
