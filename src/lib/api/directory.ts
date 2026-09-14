import { apiClient } from '../axios';
import { cachedQuery, peekQuery } from './queryCache';

/* Company staff directory — the people source of every picker that is not the
   HR module itself (meeting participants, appointment technicians, CC lists).

   It answers for the SELECTED company only (31.08.2026). Staff of a sister
   company in the same group are a different company's people and never appear
   in these pickers.

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

/* Every picker used to fetch this list on open — one 150–200 ms round trip
   each time on production. It changes rarely, so it is kept for 5 minutes and
   served at once (stale-while-revalidate, up to 30 minutes old) after that; a
   write to employees/personnel/roles marks it stale (queryCache tag `staff`). */
const STAFF_DIRECTORY_KEY = 'staff-directory';
const STAFF_DIRECTORY_QUERY = { freshMs: 5 * 60_000, staleMs: 30 * 60_000, tags: ['staff'] };

/** The directory if it is already known — lets a picker open with its rows. */
export const peekStaffDirectory = (): StaffDirectoryRow[] | undefined =>
    peekQuery<StaffDirectoryRow[]>(STAFF_DIRECTORY_KEY, STAFF_DIRECTORY_QUERY);

export const fetchStaffDirectory = (): Promise<StaffDirectoryRow[]> =>
    cachedQuery(STAFF_DIRECTORY_KEY, loadStaffDirectory, STAFF_DIRECTORY_QUERY);

const loadStaffDirectory = async (): Promise<StaffDirectoryRow[]> => {
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
