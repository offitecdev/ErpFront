/**
 * ── PERSONALMODUL: SERVERZUGRIFF ─────────────────────────────────────────────
 * Ein Objekt je Fläche des Moduls (Liste, Uhr, Plan, Berichte, Anträge). Die
 * Hooks rufen NUR hier hinein — keine Seite spricht direkt mit `apiClient`.
 */
import { apiClient } from '../axios';
import type {
    AbsenceRow,
    ClockActivity,
    ClockScanResult,
    HolidayRow,
    HolidayYear,
    LeaveCounts,
    LeaveKind,
    LeavePolicy,
    LeaveQuery,
    LeaveRequestRow,
    LeaveTypeKey,
    LeaveYear,
    PersonOverview,
    PersonProfile,
    PersonProfilePatch,
    PersonRef,
    PersonTimeLog,
    PersonnelMe,
    RequestTypeKey,
    ShiftPlan,
    StaffDocumentContent,
    StaffDocumentRow,
    StaffPage,
    StaffRole,
    StaffRow,
    TimeRecordResult,
    WeekOverview,
    WorkLocation,
} from '../../pages/personnel/types/personnel';

export interface StaffBulkRow {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    /** Abgelöst (27.08.2026) — der Server nimmt sie noch an, die Oberfläche
        schickt sie nicht mehr; Rechte vergibt die Rollenzuweisung. */
    staffRole?: StaffRole;
    workLocation: WorkLocation;
}

/** Der Server meldet bei einer abgelehnten Zeile ihren Index mit zurück. */
export interface StaffBulkError {
    message: string;
    index: number | null;
}

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

    /* ── Berichte ────────────────────────────────────────────────────────────
       Der Detail- und der Buchhaltungsrapport sind am 26.08.2026 in der
       Arbeitszeiterfassung aufgegangen (`personnelHrApi.timeRecords`); ihre
       Wege hier sind mit den Seiten weggefallen. Die Server-Wege selbst
       bestehen weiter — sie sind der Unterbau, aus dem die neue Seite rechnet. */

    updateTimeEntry: async (
        id: string,
        patch: { startedAt?: string; endedAt?: string | null; note?: string | null },
    ): Promise<void> => {
        await apiClient.patch(`/personnel/time-entries/${id}`, patch);
    },

    /**
     * Alte Anwesenheit nachtragen: je geplantem, noch leerem Arbeitstag des
     * Zeitraums entsteht eine manuelle Zeile mit den Planzeiten. Bereits
     * Erfasstes bleibt stehen — der Server meldet, wie viel er übersprang.
     */
    bulkCreateTimeEntries: async (input: {
        employeeId: string;
        startDate: string;
        endDate: string;
    }): Promise<{ created: number; skipped: number }> => {
        const res = await apiClient.post('/personnel/time-entries/bulk', input);
        return res.data;
    },

    deleteTimeEntry: async (id: string): Promise<void> => {
        await apiClient.delete(`/personnel/time-entries/${id}`);
    },

    // ── Anträge ──────────────────────────────────────────────────────────────
    /**
     * Die eine Antragsliste. `scope` ist der Reiter (Meine / Eingehende /
     * Alle), alles Weitere sind die Filter darunter — Art, Stand, Zeitraum und
     * die Namenssuche (Vorgabe 26.08.2026: «es muss alles filterbar sein»).
     * Sie werden serverseitig angewandt; die Liste ist bei 300 Zeilen gekappt,
     * und ein Filter, der erst im Browser greift, verlöre alles dahinter.
     */
    listLeaves: async (query: LeaveQuery | 'mine' | 'incoming' | 'approver' | 'accounting' | 'all', kind?: LeaveKind): Promise<LeaveRequestRow[]> => {
        const params: Record<string, string> = typeof query === 'string'
            ? { scope: query }
            : {
                scope: query.scope,
                ...(query.requestType ? { requestType: query.requestType } : {}),
                ...(query.status ? { status: query.status } : {}),
                ...(query.from ? { from: query.from } : {}),
                ...(query.to ? { to: query.to } : {}),
                ...(query.search?.trim() ? { search: query.search.trim() } : {}),
            };
        if (kind) params.kind = kind;
        const res = await apiClient.get('/personnel/leaves', { params });
        return res.data;
    },

    leaveCounts: async (): Promise<LeaveCounts> => {
        const res = await apiClient.get('/personnel/leaves/counts');
        return res.data;
    },

    leaveIncomingCount: async (): Promise<number> => {
        const res = await apiClient.get<{ incoming: number }>('/personnel/leaves/counts', { params: { view: 'incoming' } });
        return res.data.incoming;
    },

    createLeave: async (input: {
        /** Urlaub · Homeoffice · Krankheit · Sonstiges — die Wahl der Oberfläche. */
        requestType?: RequestTypeKey;
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

/**
 * ── PERSONALAKTE, FEIERTAGE, ARBEITSZEITERFASSUNG (26.08.2026) ───────────────
 * Der zweite Personal-Router (`personnelHr.routes.ts`). Eigenes Objekt, damit
 * beim Lesen sofort klar ist, welcher Router antwortet.
 */
export const personnelHrApi = {
    // ── Personalakte ─────────────────────────────────────────────────────────
    profile: async (employeeId: string): Promise<PersonProfile> => {
        const res = await apiClient.get(`/personnel/staff/${employeeId}/profile`);
        return res.data;
    },

    saveProfile: async (employeeId: string, patch: PersonProfilePatch): Promise<void> => {
        await apiClient.patch(`/personnel/staff/${employeeId}/profile`, patch);
    },

    /**
     * Eine Unterlage anhängen. Sie reist ROH (multipart) — derselbe Weg wie
     * Angebots- und Terminunterlagen, und der Grund, warum das Anhängen sofort
     * geht. `kind: 'CONTRACT'` ist der Arbeitsvertrag: es gibt genau einen,
     * ein neuer ersetzt den alten.
     */
    uploadDocument: async (
        employeeId: string,
        file: File,
        options: { kind?: 'CONTRACT' | 'DOCUMENT'; title?: string } = {},
    ): Promise<StaffDocumentRow> => {
        const body = new FormData();
        body.append('file', file);
        body.append('kind', options.kind ?? 'DOCUMENT');
        if (options.title) body.append('title', options.title);
        const res = await apiClient.post(`/personnel/staff/${employeeId}/documents`, body);
        return res.data;
    },

    /** Der Inhalt — erst beim Öffnen; die Liste selbst bleibt federleicht. */
    document: async (documentId: string): Promise<StaffDocumentContent> => {
        const res = await apiClient.get(`/personnel/documents/${documentId}`);
        return res.data;
    },

    deleteDocument: async (documentId: string): Promise<void> => {
        await apiClient.delete(`/personnel/documents/${documentId}`);
    },

    // ── Urlaubskonto und Abwesenheiten ───────────────────────────────────────
    leaveYear: async (employeeId: string, year: number): Promise<LeaveYear> => {
        const res = await apiClient.get(`/personnel/staff/${employeeId}/leave-year`, { params: { year } });
        return res.data;
    },

    /**
     * Eine Abwesenheit nachtragen (z. B. rund um den Eintritt): der Server
     * legt einen bereits bewilligten Antrag über den Zeitraum an — die Tage
     * erscheinen mit dem Grund in der Abwesenheitsrechnung, nie in der
     * Arbeitszeittabelle. Der Beginn darf nicht vor dem Eintritt liegen.
     */
    createManualAbsence: async (input: {
        employeeId: string;
        startDate: string;
        endDate: string;
        label?: string;
    }): Promise<{ id: string; totalDays: number }> => {
        const res = await apiClient.post('/personnel/absences/manual', input);
        return res.data;
    },

    absences: async (query: { startDate: string; endDate: string; search?: string }): Promise<{ rows: AbsenceRow[] }> => {
        const res = await apiClient.get('/personnel/absences', {
            params: {
                startDate: query.startDate,
                endDate: query.endDate,
                ...(query.search?.trim() ? { search: query.search.trim() } : {}),
            },
        });
        return res.data;
    },

    // ── Arbeitszeit ──────────────────────────────────────────────────────────
    timeLog: async (employeeId: string, query: { startDate: string; endDate: string }): Promise<PersonTimeLog> => {
        const res = await apiClient.get(`/personnel/staff/${employeeId}/time-log`, { params: query });
        return res.data;
    },

    timeRecords: async (query: {
        startDate: string;
        endDate: string;
        search?: string;
        employeeIds?: string[];
    }): Promise<TimeRecordResult> => {
        const res = await apiClient.get('/personnel/time-records', {
            params: {
                startDate: query.startDate,
                endDate: query.endDate,
                ...(query.search?.trim() ? { search: query.search.trim() } : {}),
                ...(query.employeeIds?.length ? { employeeIds: query.employeeIds.join(',') } : {}),
            },
        });
        return res.data;
    },

    // ── Feiertage ────────────────────────────────────────────────────────────
    holidays: async (year: number, country = 'TR'): Promise<HolidayYear> => {
        const res = await apiClient.get('/personnel/holidays', { params: { year, country } });
        return res.data;
    },

    addHoliday: async (input: {
        date: string;
        name: string;
        catalogKey?: string | null;
        countryCode?: string;
        religious?: boolean;
        halfDay?: boolean;
    }): Promise<HolidayRow> => {
        const res = await apiClient.post('/personnel/holidays', input);
        return res.data;
    },

    /** Mehrere Katalogtage auf einmal übernehmen («alle Tage des Jahres»). */
    addHolidays: async (rows: Array<{
        date: string;
        name: string;
        catalogKey?: string | null;
        countryCode?: string;
        religious?: boolean;
        halfDay?: boolean;
    }>): Promise<{ holidays: HolidayRow[] }> => {
        const res = await apiClient.post('/personnel/holidays/bulk', { rows });
        return res.data;
    },

    deleteHoliday: async (id: string): Promise<void> => {
        await apiClient.delete(`/personnel/holidays/${id}`);
    },

    // ── Urlaubsregel ─────────────────────────────────────────────────────────
    leavePolicy: async (): Promise<LeavePolicy> => {
        const res = await apiClient.get('/personnel/leave-policy');
        return res.data.policy;
    },

    saveLeavePolicy: async (policy: LeavePolicy): Promise<LeavePolicy> => {
        const res = await apiClient.put('/personnel/leave-policy', policy);
        return res.data.policy;
    },
};
