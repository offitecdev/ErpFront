import { apiClient } from '../axios';
import type { AppointmentDto, MailSettingDto, ProjectDto, ProjectMaterial, ProjectStatus } from '../../types/project';

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

    update: async (id: string, patch: Partial<ProjectDto>): Promise<ProjectDto> => {
        const res = await apiClient.patch(`/projects/${id}`, patch);
        return res.data;
    },

    activate: async (id: string, startDate?: string): Promise<{ message: string; project: ProjectDto }> => {
        const res = await apiClient.patch(`/projects/${id}/activate`, { startDate });
        return res.data;
    },

    addReport: async (id: string, input: { workDate: string; startedAt: string; endedAt: string; operationsDone: string; technicalNotes?: string }) => {
        const res = await apiClient.post(`/projects/${id}/reports`, input);
        return res.data;
    },

    updateReport: async (reportId: string, input: { workDate: string; startedAt: string; endedAt: string; operationsDone: string; technicalNotes?: string }) => {
        const res = await apiClient.patch(`/projects/reports/${reportId}`, input);
        return res.data;
    },

    createAppointment: async (id: string, input: { startTime: string; endTime: string; notes?: string }) => {
        const res = await apiClient.post(`/projects/${id}/appointments`, input);
        return res.data;
    },

    updateAppointment: async (appointmentId: string, input: { startTime: string; endTime: string; notes?: string }) => {
        const res = await apiClient.patch(`/projects/appointments/${appointmentId}`, input);
        return res.data;
    },

    deleteAppointment: async (appointmentId: string): Promise<void> => {
        await apiClient.delete(`/projects/appointments/${appointmentId}`);
    },

    requestVariation: async (id: string, input: { materialId: string; quantity: number; description?: string }) => {
        const res = await apiClient.post(`/projects/${id}/variations`, input);
        return res.data;
    },

    approveVariation: async (variationId: string, isApproved: boolean) => {
        const res = await apiClient.patch(`/projects/variations/${variationId}/approve`, { isApproved });
        return res.data;
    },

    addExpense: async (id: string, input: { expenseType: string; amount: number; description?: string }) => {
        const res = await apiClient.post(`/projects/${id}/expenses`, input);
        return res.data;
    },

    materials: async (): Promise<ProjectMaterial[]> => {
        const res = await apiClient.get('/projects/materials');
        return res.data;
    },

    createMaterial: async (input: { name: string; serialId: string; unitCost: number; stockQuantity: number }): Promise<ProjectMaterial> => {
        const res = await apiClient.post('/projects/materials', input);
        return res.data;
    },

    updateMaterial: async (id: string, input: Partial<Pick<ProjectMaterial, 'name' | 'serialId' | 'unitCost' | 'stockQuantity' | 'isActive'>>): Promise<ProjectMaterial> => {
        const res = await apiClient.patch(`/projects/materials/${id}`, input);
        return res.data;
    },

    deleteMaterial: async (id: string): Promise<void> => {
        await apiClient.delete(`/projects/materials/${id}`);
    },

    sendBookingMail: async (id: string, input: { fromEmail?: string; fromName?: string; to: string; subject: string; message: string }) => {
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
