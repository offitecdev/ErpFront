import { apiClient } from '../axios';

export interface NotificationDto {
    id: string;
    tenantId: string;
    recipientEmployeeId?: string | null;
    type: string;
    title: string;
    message: string;
    linkUrl?: string | null;
    metadata?: unknown;
    isRead: boolean;
    readAt?: string | null;
    createdAt: string;
}

export const notificationApi = {
    list: async (params?: { unreadOnly?: boolean; limit?: number }): Promise<NotificationDto[]> => {
        const res = await apiClient.get('/notifications', { params });
        return res.data;
    },

    markRead: async (id: string): Promise<NotificationDto> => {
        const res = await apiClient.patch(`/notifications/${id}/read`);
        return res.data;
    },

    markAllRead: async (): Promise<{ message: string }> => {
        const res = await apiClient.patch('/notifications/read-all');
        return res.data;
    },
};
