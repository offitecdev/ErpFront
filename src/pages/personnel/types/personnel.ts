/**
 * ── PERSONALMODUL: TYPEN ─────────────────────────────────────────────────────
 * Die Formen, die `lib/api/personnel.ts` vom Server bekommt. Datums-Felder
 * kommen als ISO-Zeichenkette an und werden erst zum Anzeigen umgewandelt —
 * so bleibt der Zustand serialisierbar und Vergleiche billig.
 */

export type StaffRole = 'STAFF' | 'ADMIN' | 'ACCOUNTANT';
export type WorkLocation = 'OFFICE' | 'REMOTE';
export type LeaveKind = 'LEAVE' | 'REMOTE';
/** 'ANNUAL_PAID' ist seit dem 26.08.2026 wieder die tragende Art: nur ein als
    Jahresurlaub erkennbarer Antrag lässt sich gegen den Anspruch verrechnen. */
export type LeaveTypeKey = 'ANNUAL_PAID' | 'OTHER' | 'EXCUSE' | 'SICK_SHORT' | 'SICK_LONG' | 'REMOTE_WORK';
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
    /** Die Rolle aus den Einstellungen — sie steht in der Liste anstelle der
        abgelösten Personalrolle (Vorgabe 27.08.2026). */
    roleName: string | null;
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
    /** Was auf mich als freigebende Person wartet. */
    approver: number;
    /** Was in der Buchhaltungsstufe liegt (nur für die Buchhaltung besetzt). */
    accounting: number;
    /** Eigene Anträge ohne Entscheid — die Plakette am Reiter «Meine Anträge». */
    mine: number;
    /** approver + accounting: der farbige Punkt am Anträge-Zeichen im Kopf. */
    incoming: number;
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

/* ── PERSONALAKTE, FEIERTAGE, ARBEITSZEITERFASSUNG (26.08.2026) ───────────────
   Die Formen des zweiten Personal-Routers (`personnelHr.routes.ts`). */

/** Urlaub · Homeoffice · Krankheit · Sonstiges — die Filterarten der Anträge. */
export type RequestTypeKey = 'VACATION' | 'REMOTE' | 'SICK' | 'OTHER';

export interface StaffDocumentRow {
    id: string;
    /** CONTRACT = Arbeitsvertrag (genau einer) | DOCUMENT = alles Weitere. */
    kind: 'CONTRACT' | 'DOCUMENT';
    title: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    createdAt: string;
}

/** Der Inhalt einer Unterlage — erst beim Öffnen geholt. */
export interface StaffDocumentContent extends StaffDocumentRow {
    /** Daten-URL. */
    data: string;
}

export interface PersonProfile {
    person: {
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
        terminationDate: string | null;
        createdAt: string;
        profilePictureUrl: string | null;
        roleId: string | null;
        roleName: string | null;
        isSystemAdminRole: boolean;
    };
    /** true = die Verwaltung sieht die Seite; sonst stehen die Felder gesperrt. */
    canEdit: boolean;
    isSelf: boolean;
    roles: Array<{ id: string; name: string }>;
    contract: StaffDocumentRow | null;
    documents: StaffDocumentRow[];
}

export interface PersonProfilePatch {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
    title?: string | null;
    hireDate?: string | null;
    staffRole?: StaffRole;
    workLocation?: WorkLocation;
}

// ── Feiertage ────────────────────────────────────────────────────────────────

export interface HolidayRow {
    id: string;
    /** YYYY-MM-DD */
    date: string;
    name: string;
    catalogKey: string | null;
    countryCode: string;
    religious: boolean;
    halfDay: boolean;
}

export interface HolidayCatalogEntry {
    key: string;
    date: string;
    names: { tr: string; de: string; en: string };
    religious: boolean;
    halfDay: boolean;
}

export interface HolidayYear {
    year: number;
    country: string;
    holidays: HolidayRow[];
    catalog: HolidayCatalogEntry[];
    /** Jahre, für die der Katalog auch die religiösen Feste kennt. */
    catalogYears: number[];
}

// ── Urlaubsanspruch ──────────────────────────────────────────────────────────

export interface LeavePolicy {
    annualWorkdays: number;
    annualLeaveDays: number;
    accrueByWorkdays: boolean;
    carryOverDays: number;
}

export interface LeaveEntitlement {
    year: number;
    workedDays: number;
    referenceWorkdays: number;
    earnedDays: number;
    usedDays: number;
    pendingDays: number;
    remainingDays: number;
    fullYearDays: number;
    carryOverDays: number;
}

/** Wofür ein Fehltag steht. ABSENT = unerklärt. */
export type AbsenceKind = 'ABSENT' | 'VACATION' | 'SICK' | 'REMOTE' | 'OTHER';

export interface AbsenceDay {
    /** YYYY-MM-DD */
    date: string;
    kind: AbsenceKind;
    requestId: string | null;
    label: string | null;
    /** true = der erklärende Antrag ist noch nicht bewilligt. */
    pending: boolean;
}

/** Eine Abwesenheit in der Gesamtliste — mit der Person daran. */
export interface AbsenceRow extends AbsenceDay {
    employeeId: string;
    staffNumber: number | null;
    firstName: string;
    lastName: string;
}

export interface LeaveYear {
    year: number;
    policy: LeavePolicy;
    entitlement: LeaveEntitlement;
    holidays: HolidayRow[];
    absences: AbsenceDay[];
    workedDays: number;
    referenceWorkdays: number;
    plan: ShiftPlan;
}

// ── Arbeitszeiterfassung ─────────────────────────────────────────────────────

export interface TimeRecordBasis {
    /** Arbeitstage im Zeitraum, Feiertage bereits abgezogen. */
    workdays: number;
    publicHolidays: number;
    dailyNetHours: number;
    targetHours: number;
    totalPeople?: number;
}

export interface TimeRecordPerson {
    employeeId: string;
    staffNumber: number | null;
    firstName: string;
    lastName: string;
    email: string;
    workLocation: WorkLocation;
    totalSeconds: number;
    totalHours: number;
    grossSeconds: number;
    breakSeconds: number;
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    sickDays: number;
    targetHours: number;
    daysShort: number;
    extraDays: number;
}

export interface TimeRecordResult {
    plan: ShiftPlan;
    basis: TimeRecordBasis | null;
    people: TimeRecordPerson[];
    days: ReportDay[];
    holidays: HolidayRow[];
}

/** Der Arbeitszeitnachweis EINER Person (Reiter «Arbeitszeiten»). */
export interface PersonTimeLog {
    person: { id: string; staffNumber: number | null; firstName: string; lastName: string; email: string };
    plan: ShiftPlan;
    basis: TimeRecordBasis;
    days: ReportDay[];
    holidays: HolidayRow[];
    absences: AbsenceDay[];
    totals: {
        actualSeconds: number;
        grossSeconds: number;
        breakSeconds: number;
        totalHours: number;
        presentDays: number;
        absentDays: number;
        daysShort: number;
        extraDays: number;
    };
}

/** Die Filter der einen Antragsseite. */
export interface LeaveQuery {
    scope: 'mine' | 'incoming' | 'approver' | 'accounting' | 'all';
    requestType?: RequestTypeKey | '';
    status?: LeaveStatus | '';
    from?: string;
    to?: string;
    search?: string;
}
