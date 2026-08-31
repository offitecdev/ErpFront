/**
 * ── PERSONALMODUL: SERVERZUGRIFF ─────────────────────────────────────────────
 * Ein Objekt je Fläche des Moduls (Liste, Uhr, Plan, Berichte, Anträge). Die
 * Hooks rufen NUR hier hinein — keine Seite spricht direkt mit `apiClient`.
 */
import { apiClient } from '../axios';
import type {
    AccountingDetail,
    ClockActivity,
    AccountingReport,
    ClockScanResult,
    DetailedReport,
    LeaveCounts,
    LeaveKind,
    LeaveRequestRow,
    LeaveTypeKey,
    PersonOverview,
    PersonRef,
    PersonnelMe,
    ReportQuery,
    ShiftPlan,
    StaffPage,
    StaffRole,
    StaffRow,
    WeekOverview,
    WorkLocation,
} from '../../pages/personnel/types/personnel';

export interface StaffBulkRow {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    staffRole: StaffRole;
    workLocation: WorkLocation;
}

/** Der Server meldet bei einer abgelehnten Zeile ihren Index mit zurück. */
export interface StaffBulkError {
    message: string;
    index: number | null;
}

const reportParams = (query: ReportQuery & { publicHolidays?: number }) => {
    const params: Record<string, string> = {
        startDate: query.startDate,
        endDate: query.endDate,
    };
    if (query.firstName?.trim()) params.firstName = query.firstName.trim();
    if (query.lastName?.trim()) params.lastName = query.lastName.trim();
    if (query.publicHolidays != null) params.publicHolidays = String(query.publicHolidays);
    return params;
};

export const personnelApi = {
    // ── Personalliste ────────────────────────────────────────────────────────
    listStaff: async (params: { page: number; pageSize: number; search?: string }): Promise<StaffPage> => {
        const res = await apiClient.get('/personnel/staff', {
            params: {
                page: params.page,
                pageSize: params.pageSize,
                ...(params.search?.trim() ? { search: params.search.trim() } : {}),
            },
        });
        return res.data;
    },

    createStaffBulk: async (rows: StaffBulkRow[]): Promise<{ created: StaffRow[] }> => {
        const res = await apiClient.post('/personnel/staff/bulk', { rows });
        return res.data;
    },

    rotateQr: async (employeeId: string): Promise<{ qrToken: string }> => {
        const res = await apiClient.post(`/personnel/staff/${employeeId}/qr`);
        return res.data;
    },

    setStaffRole: async (
        employeeId: string,
        patch: { staffRole?: StaffRole; workLocation?: WorkLocation },
    ): Promise<{ id: string; staffRole: StaffRole; workLocation: WorkLocation }> => {
        const res = await apiClient.patch(`/personnel/staff/${employeeId}/role`, patch);
        return res.data;
    },

    me: async (): Promise<PersonnelMe> => {
        const res = await apiClient.get('/personnel/me');
        return res.data;
    },

    /**
     * Die Personenseite (/personnel/:id) in EINEM Aufruf: Stammdaten, Rolle,
     * Aufgaben, Termine, Urlaube, offene Freigaben und ein offener
     * Kennwortwunsch. Die eigene Seite steht jeder Person offen; fremde
     * brauchen `employees.view`.
     */
    staffOverview: async (employeeId: string): Promise<PersonOverview> => {
        const res = await apiClient.get(`/personnel/staff/${employeeId}/overview`);
        return res.data;
    },

    /**
     * Profilbild setzen (`photo` = Daten-URL) oder entfernen (`null`). Die
     * eigene Seite darf jede Person, fremde brauchen `employees.update`.
     */
    setStaffPhoto: async (
        employeeId: string,
        photo: string | null,
        // Der Daumennagel für die Namensplätze der ganzen Anwendung; ohne ihn
        // müsste jede Liste das grosse Bild laden.
        thumb: string | null = null,
    ): Promise<{ profilePictureUrl: string | null; profilePictureThumb: string | null }> => {
        const res = await apiClient.put(`/personnel/staff/${employeeId}/photo`, { photo, thumb });
        return res.data;
    },

    approvers: async (): Promise<PersonRef[]> => {
        const res = await apiClient.get('/personnel/approvers');
        return res.data;
    },

    // ── Stempeluhr ───────────────────────────────────────────────────────────
    scan: async (token: string): Promise<ClockScanResult> => {
        const res = await apiClient.post('/personnel/clock/scan', { token });
        return res.data;
    },

    activity: async (date?: string): Promise<ClockActivity> => {
        const res = await apiClient.get('/personnel/clock/activity', {
            params: date ? { date } : undefined,
        });
        return res.data;
    },

    week: async (weekStart?: string): Promise<WeekOverview> => {
        const res = await apiClient.get('/personnel/clock/week', {
            params: weekStart ? { weekStart } : undefined,
        });
        return res.data;
    },

    // ── Schichtplan ──────────────────────────────────────────────────────────
    shiftPlan: async (): Promise<ShiftPlan> => {
        const res = await apiClient.get('/personnel/shift-plan');
        return res.data.plan;
    },

    saveShiftPlan: async (plan: ShiftPlan): Promise<ShiftPlan> => {
        const res = await apiClient.put('/personnel/shift-plan', plan);
        return res.data.plan;
    },

    // ── Berichte ─────────────────────────────────────────────────────────────
    detailedReport: async (query: ReportQuery): Promise<DetailedReport> => {
        const res = await apiClient.get('/personnel/reports/detailed', { params: reportParams(query) });
        return res.data;
    },

    accountingReport: async (query: ReportQuery & { publicHolidays: number }): Promise<AccountingReport> => {
        const res = await apiClient.get('/personnel/reports/accounting', { params: reportParams(query) });
        return res.data;
    },

    accountingDetail: async (
        employeeId: string,
        query: ReportQuery & { publicHolidays: number },
    ): Promise<AccountingDetail> => {
        const res = await apiClient.get(`/personnel/reports/accounting/${employeeId}`, { params: reportParams(query) });
        return res.data;
    },

    updateTimeEntry: async (
        id: string,
        patch: { startedAt?: string; endedAt?: string | null; note?: string | null },
    ): Promise<void> => {
        await apiClient.patch(`/personnel/time-entries/${id}`, patch);
    },

    deleteTimeEntry: async (id: string): Promise<void> => {
        await apiClient.delete(`/personnel/time-entries/${id}`);
    },

    // ── Anträge ──────────────────────────────────────────────────────────────
    listLeaves: async (scope: 'mine' | 'approver' | 'accounting' | 'all', kind?: LeaveKind): Promise<LeaveRequestRow[]> => {
        const res = await apiClient.get('/personnel/leaves', { params: { scope, ...(kind ? { kind } : {}) } });
        return res.data;
    },

    leaveCounts: async (): Promise<LeaveCounts> => {
        const res = await apiClient.get('/personnel/leaves/counts');
        return res.data;
    },

    createLeave: async (input: {
        kind: LeaveKind;
        leaveType: LeaveTypeKey;
        /** Pflicht bei leaveType 'OTHER' — die selbst benannte Urlaubsart. */
        leaveTypeLabel?: string;
        startDate: string;
        endDate: string;
        approverId: string;
        note?: string;
    }): Promise<LeaveRequestRow> => {
        const res = await apiClient.post('/personnel/leaves', input);
        return res.data;
    },

    decideLeave: async (id: string, decision: 'APPROVE' | 'REJECT', note?: string): Promise<LeaveRequestRow> => {
        const res = await apiClient.patch(`/personnel/leaves/${id}/decision`, { decision, note });
        return res.data;
    },
};

/** Fehlermeldung + betroffene Zeile aus einer abgelehnten Sammelanlage lesen. */
export const readStaffBulkError = (error: unknown, fallback: string): StaffBulkError => {
    const data = (error as { response?: { data?: { error?: string; index?: number } } })?.response?.data;
    return {
        message: data?.error || fallback,
        index: typeof data?.index === 'number' ? data.index : null,
    };
};
