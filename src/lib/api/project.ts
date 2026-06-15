import { apiClient } from '../axios';
import type { AppointmentDto, MailSettingDto, ProjectDto, ProjectMaterial, ProjectStatus } from '../../types/project';
import type { PersonLite } from '../../types/maintenance';

export type SalesOrderMode = 'PROJECT_NEW' | 'PROJECT_EXISTING' | 'PROJECT_ADDON' | 'INVOICE';

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

export type CompleteInstallationInput = {
    operationsDoneItems: string[];
    technicalNotes?: string;
    startedAt?: string;
    endedAt?: string;
    signatureBase64?: string;
    expenses?: { expenseType: string; amount: number; description?: string }[];
    materials?: { materialId: string; quantity: number; description?: string }[];
    usedMaterials?: { materialId: string; quantity: number; description?: string }[];
};

export const projectApi = {
    list: async (filter: { status?: ProjectStatus | ''; search?: string } = {}): Promise<ProjectDto[]> => {
        const params = new URLSearchParams();
        if (filter.status) params.set('status', filter.status);
        if (filter.search) params.set('search', filter.search);
        const res = await apiClient.get(`/projects${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    getById: async (id: string): Promise<ProjectDto> => {
        const res = await apiClient.get(`/projects/${id}`);
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

    createAddonOrder: async (id: string, input: { parentSalesOrderId: string }) => {
        const res = await apiClient.post(`/projects/${id}/addon-orders`, input);
        return res.data as {
            message: string;
            salesOrder: SalesOrderDto;
            totals: { expenses: number; extraMaterials: number; overtime: number; total: number };
        };
    },

    update: async (id: string, patch: Partial<ProjectDto>): Promise<ProjectDto> => {
        const res = await apiClient.patch(`/projects/${id}`, patch);
        return res.data;
    },

    activate: async (id: string, startDate?: string): Promise<{ message: string; project: ProjectDto }> => {
        const res = await apiClient.patch(`/projects/${id}/activate`, { startDate });
        return res.data;
    },

    addReport: async (id: string, input: { salesOrderId?: string | null; workDate: string; startedAt: string; endedAt: string; operationsDone: string; technicalNotes?: string }) => {
        const res = await apiClient.post(`/projects/${id}/reports`, input);
        return res.data;
    },

    updateReport: async (reportId: string, input: { salesOrderId?: string | null; workDate: string; startedAt: string; endedAt: string; operationsDone: string; technicalNotes?: string }) => {
        const res = await apiClient.patch(`/projects/reports/${reportId}`, input);
        return res.data;
    },

    signReport: async (reportId: string, signatureBase64: string) => {
        const res = await apiClient.patch(`/projects/reports/${reportId}/sign`, { signatureBase64 });
        return res.data;
    },

    requestReportSignature: async (reportId: string, input: { channel: 'technician' | 'mail' | 'both'; to?: string; subject?: string; message?: string; fromEmail?: string; fromName?: string }) => {
        const res = await apiClient.post(`/projects/reports/${reportId}/signature-request`, input);
        return res.data;
    },

    listTechnicians: async (): Promise<PersonLite[]> => {
        const res = await apiClient.get('/projects/options/technicians');
        return res.data;
    },

    listMyInstallations: async (start: string, end: string): Promise<AppointmentDto[]> => {
        const res = await apiClient.get('/projects/technician/installations', { params: { start, end } });
        return res.data;
    },

    getMyInstallation: async (appointmentId: string): Promise<AppointmentDto> => {
        const res = await apiClient.get(`/projects/technician/installations/${appointmentId}`);
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

    requestVariation: async (id: string, input: { salesOrderId?: string | null; materialId: string; quantity: number; description?: string }) => {
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

    addExpense: async (id: string, input: { salesOrderId?: string | null; expenseType: string; amount: number; description?: string }) => {
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

    materials: async (): Promise<ProjectMaterial[]> => {
        try {
            const res = await apiClient.get('/projects/materials');
            return res.data;
        } catch {
            const res = await apiClient.get('/inventory/materials');
            return res.data;
        }
    },

    createMaterial: async (input: { name: string; serialId: string; unitCost: number; stockQuantity: number; imageUrl?: string | null }): Promise<ProjectMaterial> => {
        const res = await apiClient.post('/inventory/materials', input);
        return res.data;
    },

    updateMaterial: async (id: string, input: Partial<Pick<ProjectMaterial, 'name' | 'serialId' | 'unitCost' | 'stockQuantity' | 'imageUrl' | 'isActive'>>): Promise<ProjectMaterial> => {
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

export const bookingApi = {
    getSlots: async (token: string, startDate: string, endDate: string): Promise<{ projectName: string; availableSlots: AppointmentDto[] }> => {
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

    saveSettings: async (input: Partial<MailSettingDto> & { smtpPassword?: string }) => {
        const res = await apiClient.put('/mail/settings', input);
        return res.data;
    },

    send: async (input: { fromEmail?: string; fromName?: string; to: string; subject: string; text?: string; html?: string; attachments?: Array<{ filename: string; contentType: string; contentBase64: string }> }) => {
        const res = await apiClient.post('/mail/send', input);
        return res.data;
    },
};
