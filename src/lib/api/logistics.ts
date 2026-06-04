import { apiClient } from '../axios';
import type { ShipmentDto, ShipmentInput, ShipmentStatus } from '../../types/logistics';

export const logisticsApi = {
    list: async (filter: { status?: ShipmentStatus | ''; search?: string; customerId?: string; projectId?: string } = {}): Promise<ShipmentDto[]> => {
        const params = new URLSearchParams();
        if (filter.status) params.set('status', filter.status);
        if (filter.search) params.set('search', filter.search);
        if (filter.customerId) params.set('customerId', filter.customerId);
        if (filter.projectId) params.set('projectId', filter.projectId);
        const res = await apiClient.get(`/logistics/shipments${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    create: async (input: Partial<ShipmentInput>): Promise<ShipmentDto> => {
        const res = await apiClient.post('/logistics/shipments', input);
        return res.data.data;
    },

    update: async (id: string, input: Partial<ShipmentInput>): Promise<ShipmentDto> => {
        const res = await apiClient.patch(`/logistics/shipments/${id}`, input);
        return res.data.data;
    },

    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/logistics/shipments/${id}`);
    },

    checkDelayed: async (): Promise<{ updatedCount: number; message: string; detail?: string }> => {
        const res = await apiClient.post('/logistics/shipments/trigger/check-delayed');
        return res.data;
    },
};
