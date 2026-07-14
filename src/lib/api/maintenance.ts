import { apiClient } from '../axios';
import type {
    MaintenanceContractDto,
    MaintenanceAppointmentOptionDto,
    MaintenancePeriod,
    MaintenanceReportDto,
    MaintenanceTaskDto,
    MaterialInput,
    CustomerLite,
    PersonLite,
    ServiceCallDto,
    ServiceReportDto,
    TaskStatus,
} from '../../types/maintenance';

const normalizeRows = <T>(value: any): T[] => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.customers)) return value.customers;
    if (Array.isArray(value?.employees)) return value.employees;
    if (Array.isArray(value?.data?.items)) return value.data.items;
    if (Array.isArray(value?.data?.customers)) return value.data.customers;
    if (Array.isArray(value?.data?.employees)) return value.data.employees;
    return [];
};

const hasTechnicianRole = (employee: PersonLite & { title?: string | null }) => {
    const role = `${employee.roleName || ''} ${employee.title || ''}`.toLocaleLowerCase('tr-TR');
    return role.includes('teknisyen');
};

export const maintenanceApi = {
    listOptionCustomers: async (): Promise<CustomerLite[]> => {
        try {
            const res = await apiClient.get('/maintenance/options/customers');
            const rows = normalizeRows<CustomerLite>(res.data);
            if (rows.length) return rows;
        } catch {
            // Older API deployments may not have maintenance option endpoints yet.
        }

        try {
            const fallback = await apiClient.get('/customers', { params: { isActive: true, pageSize: 100 } });
            return normalizeRows<CustomerLite>(fallback.data);
        } catch {
            return [];
        }
    },

    listTechnicians: async (): Promise<PersonLite[]> => {
        try {
            const res = await apiClient.get('/maintenance/options/technicians');
            const rows = normalizeRows<PersonLite>(res.data);
            if (rows.length) return rows;
        } catch {
            // Fall through to the existing employee API when maintenance options are absent.
        }

        try {
            const exact = await apiClient.get('/employees', { params: { isActive: true, roleName: 'Teknisyen' } });
            const exactRows = normalizeRows<PersonLite>(exact.data);
            if (exactRows.length) return exactRows;
        } catch {
            // Some roles are stored as title/legacy roleName, so try active employees below.
        }

        try {
            const fallback = await apiClient.get('/employees', { params: { isActive: true } });
            return normalizeRows<PersonLite & { title?: string | null }>(fallback.data).filter(hasTechnicianRole);
        } catch {
            return [];
        }
    },

    listContracts: async (customerId?: string): Promise<MaintenanceContractDto[]> => {
        const res = await apiClient.get('/maintenance/contracts', { params: customerId ? { customerId } : undefined });
        return res.data;
    },

    createContract: async (input: {
        customerId: string;
        title: string;
        period: MaintenancePeriod;
        startDate: string;
        endDate: string;
        equipmentInfo?: string;
        serviceScope?: string;
        siteName?: string;
        technicianIds?: string[];
        assignedTechId?: string | null;
        alternativeTechId?: string | null;
        reminderDaysBefore?: number;
        overtimeHourlyRate?: number;
        notificationChannels?: { inApp?: boolean; email?: boolean; sms?: boolean; push?: boolean };
    }): Promise<{ message: string; contract: MaintenanceContractDto }> => {
        const res = await apiClient.post('/maintenance/contracts', input);
        return res.data;
    },

    updateContract: async (contractId: string, input: {
        title?: string;
        period?: MaintenancePeriod;
        startDate?: string;
        endDate?: string;
        equipmentInfo?: string | null;
        serviceScope?: string | null;
        siteName?: string | null;
        technicianIds?: string[];
        reminderDaysBefore?: number;
        overtimeHourlyRate?: number;
        notificationChannels?: { inApp?: boolean; email?: boolean; sms?: boolean; push?: boolean };
    }): Promise<MaintenanceContractDto> => {
        const res = await apiClient.patch(`/maintenance/contracts/${contractId}`, input);
        return res.data;
    },

    archiveContract: async (contractId: string): Promise<{ message: string; contract: MaintenanceContractDto }> => {
        const res = await apiClient.delete(`/maintenance/contracts/${contractId}`);
        return res.data;
    },

    // `calendar: true` requests the trimmed grid payload (no report / material
    // trees); the popup fetches full detail on click via getTaskDetail.
    listTasks: async (start: string, end: string, opts: { calendar?: boolean } = {}): Promise<MaintenanceTaskDto[]> => {
        const res = await apiClient.get('/maintenance/tasks', { params: { start, end, ...(opts.calendar ? { view: 'calendar' } : {}) } });
        return res.data;
    },

    getTask: async (taskId: string): Promise<MaintenanceTaskDto> => {
        const res = await apiClient.get(`/maintenance/tasks/${taskId}`);
        return res.data;
    },

    // Lazy calendar-popup detail for a single task (manager scope).
    getTaskDetail: async (taskId: string): Promise<MaintenanceTaskDto> => {
        const res = await apiClient.get(`/maintenance/tasks/${taskId}/detail`);
        return res.data;
    },

    listMyTasks: async (start: string, end: string, opts: { calendar?: boolean } = {}): Promise<MaintenanceTaskDto[]> => {
        const res = await apiClient.get('/maintenance/technician/tasks', { params: { start, end, ...(opts.calendar ? { view: 'calendar' } : {}) } });
        return res.data;
    },

    getMyTask: async (taskId: string): Promise<MaintenanceTaskDto> => {
        const res = await apiClient.get(`/maintenance/technician/tasks/${taskId}`);
        return res.data;
    },

    // Lazy calendar-popup detail for a single task (technician scope).
    getMyTaskDetail: async (taskId: string): Promise<MaintenanceTaskDto> => {
        const res = await apiClient.get(`/maintenance/technician/tasks/${taskId}/detail`);
        return res.data;
    },

    updateTask: async (taskId: string, input: {
        plannedDate?: string;
        startTime?: string | null;
        endTime?: string | null;
        technicianIds?: string[];
        assignedTechId?: string | null;
        alternativeTechId?: string | null;
        siteName?: string | null;
        status?: TaskStatus;
    }): Promise<MaintenanceTaskDto> => {
        const res = await apiClient.patch(`/maintenance/tasks/${taskId}`, input);
        return res.data;
    },

    saveAppointmentOptionsDraft: async (taskId: string, options: { startTime: string; endTime: string }[]): Promise<{ message: string; options: MaintenanceAppointmentOptionDto[] }> => {
        const res = await apiClient.put(`/maintenance/tasks/${taskId}/appointment-options/draft`, { options });
        return res.data;
    },

    sendAppointmentOptions: async (taskId: string, input: {
        options: { startTime: string; endTime: string }[];
        fromEmail?: string;
        fromName?: string;
        to: string;
        subject: string;
        message: string;
    }): Promise<{ message: string; bookingLink: string; options: MaintenanceAppointmentOptionDto[]; preview?: boolean }> => {
        const res = await apiClient.post(`/maintenance/tasks/${taskId}/appointment-options`, input);
        return res.data;
    },

    approveAppointmentOption: async (taskId: string, optionId: string): Promise<{ message: string; task: MaintenanceTaskDto }> => {
        const res = await apiClient.post(`/maintenance/tasks/${taskId}/appointment-options/${optionId}/approve`);
        return res.data;
    },

    listReports: async (): Promise<MaintenanceReportDto[]> => {
        const res = await apiClient.get('/maintenance/reports');
        return res.data;
    },

    submitReport: async (input: {
        taskId: string;
        operationsDone: string;
        observations?: string;
        recommendations?: string;
        riskNotes?: string;
        checklistJson?: unknown;
        beforePhotoUrls?: string[];
        afterPhotoUrls?: string[];
        fileUrls?: string[];
        extraMaterials?: MaterialInput[];
        expenses?: { expenseType: string; amount: number; description?: string }[];
    }): Promise<{ message: string; report: MaintenanceReportDto }> => {
        const res = await apiClient.post('/maintenance/reports', input);
        return res.data;
    },

    updateReport: async (reportId: string, input: {
        operationsDone?: string;
        observations?: string | null;
        recommendations?: string | null;
        riskNotes?: string | null;
    }): Promise<{ message: string; report: MaintenanceReportDto }> => {
        const res = await apiClient.patch(`/maintenance/reports/${reportId}`, input);
        return res.data;
    },

    signReport: async (reportId: string, signatureBase64: string): Promise<{ message: string; report: MaintenanceReportDto }> => {
        const res = await apiClient.post(`/maintenance/reports/${reportId}/sign`, { signatureBase64 });
        return res.data;
    },

    requestReportSignature: async (reportId: string, input: {
        channel: 'technician' | 'mail' | 'both';
        to?: string;
        subject?: string;
        message?: string;
        fromEmail?: string;
        fromName?: string;
    }): Promise<{ message: string; sent: string[] }> => {
        const res = await apiClient.post(`/maintenance/reports/${reportId}/signature-request`, input);
        return res.data;
    },

    sendReportToManager: async (reportId: string, signatureBase64?: string): Promise<{ message: string; report: MaintenanceReportDto }> => {
        const res = await apiClient.post(`/maintenance/reports/${reportId}/send-to-manager`, signatureBase64 ? { signatureBase64 } : {});
        return res.data;
    },

    publicBookingOptions: async (token: string): Promise<{
        contractCode?: string;
        title?: string;
        customerName?: string;
        plannedDate?: string;
        options: MaintenanceAppointmentOptionDto[];
    }> => {
        const res = await apiClient.get(`/maintenance/public/booking/${encodeURIComponent(token)}`);
        return res.data;
    },

    confirmPublicBooking: async (token: string, optionId: string): Promise<{ message: string; task: MaintenanceTaskDto }> => {
        const res = await apiClient.post(`/maintenance/public/booking/${encodeURIComponent(token)}/confirm`, { optionId });
        return res.data;
    },

    disapprovePublicBooking: async (token: string, reason?: string): Promise<{ message: string; task: MaintenanceTaskDto }> => {
        const res = await apiClient.post(`/maintenance/public/booking/${encodeURIComponent(token)}/disapprove`, { reason });
        return res.data;
    },
};

export const regieApi = {
    listCalls: async (status?: TaskStatus | ''): Promise<ServiceCallDto[]> => {
        const res = await apiClient.get('/regie/calls', { params: status ? { status } : undefined });
        return res.data;
    },

    createCall: async (input: {
        customerId: string;
        reportedIssue: string;
        assignedTechId?: string | null;
        alternativeTechId?: string | null;
        siteName?: string | null;
        priority?: string | null;
    }): Promise<{ message: string; call: ServiceCallDto }> => {
        const res = await apiClient.post('/regie/calls', input);
        return res.data;
    },

    updateCall: async (callId: string, input: {
        assignedTechId?: string | null;
        alternativeTechId?: string | null;
        siteName?: string | null;
        priority?: string | null;
        status?: TaskStatus;
    }): Promise<ServiceCallDto> => {
        const res = await apiClient.patch(`/regie/calls/${callId}`, input);
        return res.data;
    },

    listReports: async (): Promise<ServiceReportDto[]> => {
        const res = await apiClient.get('/regie/reports');
        return res.data;
    },

    submitReport: async (input: {
        callId: string;
        workDone: string;
        workingMinutes: number;
        gasAmount: number;
        isWarranty: boolean;
        observations?: string;
        recommendations?: string;
        beforePhotoUrls?: string[];
        afterPhotoUrls?: string[];
        fileUrls?: string[];
        materials?: MaterialInput[];
    }): Promise<{ message: string; report: ServiceReportDto }> => {
        const res = await apiClient.post('/regie/reports', input);
        return res.data;
    },

    signReport: async (reportId: string, signatureBase64: string): Promise<{
        report: ServiceReportDto;
        promptForBilling: boolean;
        message: string;
    }> => {
        const res = await apiClient.post(`/regie/reports/${reportId}/sign`, { signatureBase64 });
        return res.data;
    },

    createBill: async (reportId: string): Promise<{ message: string; workOrder: { id: string; orderNumber: string; totalAmount: number } }> => {
        const res = await apiClient.post(`/regie/reports/${reportId}/bill`);
        return res.data;
    },
};
