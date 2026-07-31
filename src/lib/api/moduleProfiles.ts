import { apiClient } from '../axios';

/** Company category ("Numara" profile): a bundle of enabled module keys. */
export interface ModuleProfileDto {
    id: string;
    profileNumber: number;
    name: string;
    moduleKeys: string[];
    tenantIds: string[];
}

export const moduleProfileApi = {
    list: async (): Promise<ModuleProfileDto[]> => {
        const res = await apiClient.get('/module-profiles');
        return res.data;
    },

    create: async (input: { profileNumber: number; name: string; moduleKeys: string[] }): Promise<ModuleProfileDto> => {
        const res = await apiClient.post('/module-profiles', input);
        return res.data;
    },

    update: async (id: string, input: Partial<{ profileNumber: number; name: string; moduleKeys: string[] }>): Promise<ModuleProfileDto> => {
        const res = await apiClient.patch(`/module-profiles/${id}`, input);
        return res.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/module-profiles/${id}`);
    },

    /** Map one company to a category; profileId null clears the mapping. */
    assignTenant: async (tenantId: string, profileId: string | null): Promise<void> => {
        await apiClient.patch('/module-profiles/assign/tenant', { tenantId, profileId });
    },
};
