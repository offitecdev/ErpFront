import { apiClient, getShared } from '../axios';

/* ANFRAGEN (10.09.2026) — der Kontakt VOR dem Kunden.
   Siehe Erp_Backend/src/presentation/routes/enquiry.routes.ts. */

export type EnquirySource = 'FORM' | 'MAIL' | 'MANUAL';
export type EnquiryStatus = 'NEW' | 'IN_PROGRESS' | 'ANSWERED' | 'CONVERTED' | 'CLOSED' | 'SPAM';
export type EnquiryPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface EnquiryPerson {
    id: string;
    firstName: string;
    lastName: string;
}

export interface EnquiryRow {
    id: string;
    source: EnquirySource;
    status: EnquiryStatus;
    priority: EnquiryPriority;
    companyName: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    addressSupplement: string | null;
    postalCode: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    subject: string;
    message: string | null;
    internalNote: string | null;
    /** Gesetzt, sobald die Anfrage einem Kunden zugeordnet ist — meistens null. */
    customer: { id: string; companyName: string | null } | null;
    mailMessageId: string | null;
    tenderId: string | null;
    assignee: EnquiryPerson | null;
    createdBy: EnquiryPerson | null;
    answeredAt: string | null;
    closedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface EnquiryStats {
    byStatus: Partial<Record<EnquiryStatus, number>>;
    total: number;
    /** NEW + IN_PROGRESS — was noch auf jemanden wartet. */
    open: number;
    /** Nur NEW — der Punkt am Menüeintrag. */
    unread: number;
}

/** Das öffentliche Formular des Mandanten: EIN Link, den man teilt. */
export interface EnquiryFormDto {
    token: string;
    /** `/anfrage/<token>` — die volle Adresse baut der Browser (window.origin). */
    path: string;
    active: boolean;
    title: string | null;
    intro: string | null;
    thanks: string | null;
    fieldRules: Record<string, string> | null;
    notifyEmails: string[];
}

export interface EnquiryPage {
    data: EnquiryRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface EnquiryListQuery {
    status?: EnquiryStatus | 'OPEN' | '';
    source?: EnquirySource | '';
    assignedEmployeeId?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
}

export type EnquiryWriteBody = Partial<{
    companyName: string | null;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    addressSupplement: string | null;
    postalCode: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    subject: string;
    message: string | null;
    internalNote: string | null;
    status: EnquiryStatus;
    priority: EnquiryPriority;
    assignedEmployeeId: string | null;
    customerId: string | null;
}>;

const toQuery = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const raw = search.toString();
    return raw ? `?${raw}` : '';
};

export const enquiriesApi = {
    list: (params: EnquiryListQuery) =>
        getShared<EnquiryPage>(`/enquiries${toQuery(params as Record<string, string | number | undefined>)}`).then((r) => r.data),

    stats: () => getShared<EnquiryStats>('/enquiries/stats').then((r) => r.data),

    get: (id: string) => apiClient.get<EnquiryRow>(`/enquiries/${id}`).then((r) => r.data),

    create: (body: EnquiryWriteBody) => apiClient.post<EnquiryRow>('/enquiries', body).then((r) => r.data),

    update: (id: string, body: EnquiryWriteBody) =>
        apiClient.patch<EnquiryRow>(`/enquiries/${id}`, body).then((r) => r.data),

    remove: (id: string) => apiClient.delete(`/enquiries/${id}`).then(() => undefined),

    /** Aus der Anfrage einen Kunden machen; die Anfrage bleibt als Beleg stehen. */
    convert: (id: string, body?: { companyName?: string; customerType?: string }) =>
        apiClient.post<{ customer: { id: string; companyName: string }; enquiry: EnquiryRow }>(
            `/enquiries/${id}/convert`, body || {},
        ).then((r) => r.data),

    form: () => apiClient.get<EnquiryFormDto>('/enquiries/form').then((r) => r.data),

    updateForm: (body: Partial<Pick<EnquiryFormDto, 'active' | 'title' | 'intro' | 'thanks' | 'notifyEmails'>>) =>
        apiClient.patch<EnquiryFormDto>('/enquiries/form', body).then((r) => r.data),

    /** Neuer Token — der alte Link ist danach tot. */
    rotateForm: () => apiClient.post<EnquiryFormDto>('/enquiries/form/rotate').then((r) => r.data),
};

/* ── Der öffentliche Weg (keine Anmeldung, kein Auth-Cookie nötig) ────────── */

export interface PublicEnquiryForm {
    companyName: string | null;
    title: string | null;
    intro: string | null;
    fieldRules: Record<string, string> | null;
}

export interface PublicEnquiryBody {
    companyName?: string;
    contactName?: string;
    email: string;
    phone?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    country?: string;
    subject: string;
    message: string;
    /** Honigtopf — bleibt leer; Menschen sehen das Feld nicht. */
    website?: string;
}

export const publicEnquiryApi = {
    describe: (token: string) =>
        apiClient.get<PublicEnquiryForm>(`/public/enquiry/${token}`).then((r) => r.data),
    submit: (token: string, body: PublicEnquiryBody) =>
        apiClient.post<{ ok: boolean; thanks: string | null }>(`/public/enquiry/${token}`, body).then((r) => r.data),
};

/* ── Aktivitäten: die Zeitleiste des Hauses (/crm/activities) ─────────────── */

export type ActivityKind = 'ENQUIRY' | 'QUOTE' | 'ORDER' | 'TASK' | 'MAIL' | 'CONTACT';

export interface ActivityRow {
    key: string;
    kind: ActivityKind;
    id: string;
    occurredAt: string;
    title: string;
    detail: string;
    /** Der Stand der Quelle (Angebotsstatus, Aufgabenstand, Mailrichtung …). */
    statusText: string | null;
    /** Feinunterscheidung innerhalb der Quelle (Quelle der Anfrage, Aufgabenart …). */
    variant: string | null;
    linkId: string | null;
    customer: { id: string; companyName: string | null } | null;
    employee: EnquiryPerson | null;
}

export interface ActivityPage {
    data: ActivityRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface ActivityStats {
    byKind: Record<ActivityKind, number>;
    /** Summe des heutigen Tages — die Zahl am Menüeintrag. */
    today: number;
}

export const activitiesApi = {
    list: (params: {
        kind?: ActivityKind | '';
        customerId?: string;
        employeeId?: string;
        search?: string;
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
    }) => getShared<ActivityPage>(`/crm/activities${toQuery(params as Record<string, string | number | undefined>)}`).then((r) => r.data),

    stats: () => getShared<ActivityStats>('/crm/activities/stats').then((r) => r.data),
};
