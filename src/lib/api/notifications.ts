import { apiClient, getShared } from '../axios';

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
        const res = await getShared<NotificationDto[]>('/notifications', { params });
        return res.data;
    },

    /** Personal notification for the current user (e.g. an archived alert card). */
    create: async (input: { title: string; message?: string; type?: string; linkUrl?: string | null; isRead?: boolean }): Promise<NotificationDto> => {
        const res = await apiClient.post('/notifications', input);
        return res.data;
    },

    /** Server-side unread count for the active company (badge figure). */
    unreadCount: async (): Promise<number> => {
        const res = await getShared<{ count?: number }>('/notifications/unread-count');
        return Number(res.data?.count) || 0;
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
