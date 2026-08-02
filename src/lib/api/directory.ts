import { apiClient } from '../axios';

/* Company staff directory — the people source of every picker that is not the
   HR module itself (meeting participants, appointment technicians, CC lists).

   It deliberately hangs off /employees/directory and not the HR listing: that
   one is gated behind `employees.view`, so a colleague without HR rights got a
   403 and the pickers silently showed no staff at all — only customers. */

export interface StaffDirectoryRow {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    roleName?: string | null;
    title?: string | null;
}

const asRows = (payload: unknown): StaffDirectoryRow[] => {
    const rows = Array.isArray(payload) ? payload : (payload as { items?: unknown })?.items;
    return Array.isArray(rows) ? (rows as StaffDirectoryRow[]) : [];
};

export const fetchStaffDirectory = async (): Promise<StaffDirectoryRow[]> => {
    try {
        const res = await apiClient.get('/employees/directory', { params: { isActive: true } });
        return asRows(res.data);
    } catch (error) {
        // A backend still without the directory route: fall back to the HR
        // listing (which needs employees.view and may well answer 403 → []).
        if ((error as { response?: { status?: number } })?.response?.status !== 404) return [];
        const res = await apiClient.get('/employees', { params: { isActive: true, light: 1 } }).catch(() => null);
        return res ? asRows(res.data) : [];
    }
};
