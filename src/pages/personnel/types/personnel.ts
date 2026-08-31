/**
 * ── PERSONALMODUL: TYPEN ─────────────────────────────────────────────────────
 * Die Formen, die `lib/api/personnel.ts` vom Server bekommt. Datums-Felder
 * kommen als ISO-Zeichenkette an und werden erst zum Anzeigen umgewandelt —
 * so bleibt der Zustand serialisierbar und Vergleiche billig.
 */

export type StaffRole = 'STAFF' | 'ADMIN' | 'ACCOUNTANT';
export type WorkLocation = 'OFFICE' | 'REMOTE';
export type LeaveKind = 'LEAVE' | 'REMOTE';
/** 'ANNUAL_PAID' steht nur noch in Altanträgen — der Jahresurlaub wird seit
    dem 16.08.2026 als 'OTHER' mit Freitext erfasst. */
export type LeaveTypeKey = 'OTHER' | 'EXCUSE' | 'SICK_SHORT' | 'SICK_LONG' | 'REMOTE_WORK' | 'ANNUAL_PAID';
export type LeaveStatus = 'PENDING_MANAGER' | 'PENDING_ACCOUNTING' | 'APPROVED' | 'REJECTED';
export type TimeEntrySource = 'QR' | 'MANUAL' | 'REMOTE';

export interface StaffRow {
    id: string;
    staffNumber: number | null;
    firstName: string;
    lastName: string;
    email: string;
    createdAt: string;
    isActive: boolean;
    /** Der QR-Text des Ausdrucks; null, solange keiner ausgegeben wurde. */
    qrToken: string | null;
    staffRole: StaffRole;
    workLocation: WorkLocation;
}

export interface StaffPage {
    data: StaffRow[];
    total: number;
    page: number;
    pageSize: number;
}

/** Eine Zeile der Sammelanlage (Tabelle im Untenfenster). */
export interface StaffDraftRow {
    /** Stabiler Schlüssel für React — NICHT der Index (Zeilen werden gelöscht). */
    key: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    staffRole: StaffRole;
    workLocation: WorkLocation;
}

export interface ShiftPlan {
    workdays: number[];
    startTime: string;
    endTime: string;
    breakMinutes: number;
}

/** Die vier Ereignisse eines Arbeitstages (siehe `scanTagFor`). */
export type ScanTag = 'IN' | 'BREAK_START' | 'BREAK_END' | 'OUT';

export interface ClockScanResult {
    action: ScanTag;
    at: string;
    employee: { id: string; firstName: string; lastName: string; staffNumber: number | null };
    todaySeconds: number;
}

export interface WeekEntry {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    staffNumber: number | null;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    source: TimeEntrySource;
}

export interface WeekDay {
    date: string;
    isoWeekday: number;
    entries: WeekEntry[];
    totalSeconds: number;
    presentCount: number;
}

export interface WeekOverview {
    weekStart: string | null;
    days: WeekDay[];
}

/** Ein einzelnes Arbeitsfenster innerhalb eines Tages. */
export interface ReportSegment {
    /** Abgeleitete Homeoffice-Fenster haben keine Zeile — nicht editierbar. */
    id: string | null;
    startedAt: string | null;
    endedAt: string | null;
    durationSeconds: number;
    source: TimeEntrySource;
    note: string | null;
    synthetic: boolean;
}

/** EINE Zeile je Person und Tag; die Fenster hängen als `segments` daran. */
export interface ReportDay {
    key: string;
    employeeId: string;
    staffNumber: number | null;
    firstName: string;
    lastName: string;
    workLocation: WorkLocation;
    employeeCreatedAt: string;
    workDate: string;
    startedAt: string | null;
    endedAt: string | null;
    /** Schichtdauer: erstes Kommen bis letztes Gehen. */
    grossSeconds: number;
    /** Tatsächliche Arbeitszeit: die Summe der Fenster. */
    actualWorkSeconds: number;
    /** Pausenzeit: die Lücken dazwischen. */
    breakSeconds: number;
    open: boolean;
    synthetic: boolean;
    segments: ReportSegment[];
}

export interface LeaveFlag {
    id: string;
    employeeId: string;
    kind: LeaveKind;
    leaveType: LeaveTypeKey;
    /** Freitext zu 'OTHER' — die selbst benannte Urlaubsart. */
    leaveTypeLabel: string | null;
    status: LeaveStatus;
    startDate: string;
    endDate: string;
    totalDays: number;
    note: string | null;
}

export interface DetailedReport {
    days: ReportDay[];
    flags: LeaveFlag[];
    plan: ShiftPlan;
}

/** Ein Ereignis der Tagesübersicht am Tablet. */
export interface ClockActivityEvent {
    at: string;
    tag: ScanTag;
    employeeId: string;
    firstName: string;
    lastName: string;
    staffNumber: number | null;
    actualWorkSeconds: number;
    breakSeconds: number;
}

export interface ClockActivity {
    date: string | null;
    events: ClockActivityEvent[];
}

export interface AccountingBasis {
    totalDays: number;
    workdays: number;
    publicHolidays: number;
    actualWorkdays: number;
    dailyNetHours: number;
    targetHours: number;
}

export interface AccountingPersonRow {
    employeeId: string;
    staffNumber: number | null;
    firstName: string;
    lastName: string;
    workLocation: WorkLocation;
    totalSeconds: number;
    totalHours: number;
    daysShort: number;
    extraDays: number;
    presentDays: number;
    flags: LeaveFlag[];
}

export interface AccountingReport {
    basis: AccountingBasis;
    plan: ShiftPlan;
    rows: AccountingPersonRow[];
}

export interface AccountingDetailDay {
    date: string;
    isWorkday: boolean;
    seconds: number;
    targetSeconds: number;
    entries: Array<{
        id: string | null;
        startedAt: string | null;
        endedAt: string | null;
        durationSeconds: number;
        source: TimeEntrySource;
        synthetic: boolean;
    }>;
    leave: LeaveFlag | null;
}

export interface AccountingDetail {
    person: {
        id: string;
        staffNumber: number | null;
        firstName: string;
        lastName: string;
        createdAt: string;
        workLocation: WorkLocation;
    } | null;
    basis: AccountingBasis;
    days: AccountingDetailDay[];
    totalSeconds: number;
    plan: ShiftPlan;
}

export interface PersonRef {
    id: string;
    firstName: string;
    lastName: string;
    staffNumber?: number | null;
    email?: string;
}

export interface LeaveRequestRow {
    id: string;
    kind: LeaveKind;
    leaveType: LeaveTypeKey;
    /** Freitext zu 'OTHER' — die selbst benannte Urlaubsart. */
    leaveTypeLabel: string | null;
    startDate: string;
    endDate: string;
    totalDays: number;
    note: string | null;
    status: LeaveStatus;
    approverId: string;
    managerDecisionAt: string | null;
    managerNote: string | null;
    accountantId: string | null;
    accountingDecisionAt: string | null;
    accountingNote: string | null;
    createdAt: string;
    employee: PersonRef;
    approver: PersonRef | null;
    accountant: PersonRef | null;
}

export interface LeaveCounts {
    approver: number;
    accounting: number;
}

export interface PersonnelMe {
    id: string;
    firstName: string;
    lastName: string;
    staffRole: StaffRole;
    workLocation: WorkLocation;
    staffNumber: number | null;
    qrToken: string | null;
}

export interface ReportQuery {
    startDate: string;
    endDate: string;
    firstName?: string;
    lastName?: string;
}

/* ── PERSONENSEITE (/personnel/:id, 17.08.2026) ───────────────────────────────
   Ein Sammelaufruf füllt alle Reiter auf einmal (die Datenbank steht in der
   Ferne — fünf Einzelaufrufe hiessen fünf Wartezeiten beim Umschalten). */

export interface PersonHeader {
    id: string;
    staffNumber: number | null;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    title: string | null;
    isActive: boolean;
    staffRole: StaffRole;
    workLocation: WorkLocation;
    hireDate: string | null;
    createdAt: string;
    qrToken: string | null;
    profilePictureUrl: string | null;
    /** Die zugewiesene Rollenvorlage (Einstellungen → Berechtigungen). */
    roleId: string | null;
    roleName: string | null;
    isSystemAdminRole: boolean;
}

export interface PersonTask {
    id: string;
    kind: string;
    title: string;
    status: string;
    dueDate: string | null;
    completedAt: string | null;
    createdAt: string;
    customerName: string | null;
}

export interface PersonMeeting {
    id: string;
    kind: string;
    title: string;
    startTime: string;
    endTime: string;
    notes: string | null;
    customerId: string | null;
    customerName: string | null;
    /** true = diese Person hat die Besprechung angelegt (sonst: sie nimmt teil). */
    isOwner: boolean;
}

/** Ein Montagetermin, auf den die Person besetzt ist. */
export interface PersonAppointment {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    notes: string | null;
    projectId: string | null;
    projectNumber: string | null;
    projectName: string | null;
    salesOrderId: string | null;
    customerId: string | null;
    customerName: string | null;
    /** true = die Person führt den Termin; sonst ist sie mitbesetzt. */
    isLead: boolean;
}

export interface PersonLeave {
    id: string;
    kind: LeaveKind;
    leaveType: string;
    leaveTypeLabel: string | null;
    startDate: string;
    endDate: string;
    totalDays: number;
    note: string | null;
    status: string;
    createdAt: string;
    managerDecisionAt: string | null;
    managerNote: string | null;
    accountingDecisionAt: string | null;
    accountingNote: string | null;
    approverName: string | null;
}

/** Ein Antrag, der auf DIESE Person wartet (sie gibt frei bzw. bucht). */
export interface PersonApproval {
    id: string;
    kind: LeaveKind;
    leaveType: string;
    leaveTypeLabel: string | null;
    startDate: string;
    endDate: string;
    totalDays: number;
    status: string;
    createdAt: string;
    employeeName: string | null;
    employeeStaffNumber: number | null;
}

export interface PersonOverview {
    person: PersonHeader;
    tasks: PersonTask[];
    meetings: PersonMeeting[];
    appointments: PersonAppointment[];
    leaves: PersonLeave[];
    approvals: PersonApproval[];
    pendingPasswordRequest: { id: string; createdAt: string; note: string | null } | null;
}
