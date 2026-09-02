import { apiClient, getShared, MAIL_REQUEST_TIMEOUT_MS } from '../axios';
import type { AppointmentDto, MailSettingDto, MontageOrdersPageDto, MontageReportOrderDetailDto, MontageReportOrdersPageDto, MontageReportResourcesDto, ProjectAddonRequestDto, ProjectDto, ProjectMaterial, ProjectStatus } from '../../types/project';

/* ── Mehrtägige Einsätze (24.08.2026) ───────────────────────────────────────
   Ein Einsatz über mehrere Tage ist EINE ZEILE JE TAG, zusammengehalten von
   einer Serie. Der Tag trägt die Arbeit (Rapport, Überstunden), die Serie die
   Klammer (eine Mail, ein Satz Unterlagen, ein Begleitwort). */

/** Ein geplanter Tag. Mit `appointmentId`: ein bestehender Tag, der bleibt. */
export interface AppointmentDayInput {
    appointmentId?: string;
    startTime: string;
    endTime: string;
}

export interface AppointmentSeriesDay {
    id: string;
    dayIndex: number;
    startTime: string;
    endTime: string;
    status: string;
}

/** Eine Unterlage — ohne Inhalt; der kommt erst beim Öffnen. */
export interface AppointmentDocumentDto {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    /** Permanent Cloudflare R2 URL stored in the database. */
    url: string;
    createdAt: string;
    uploadedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface AppointmentSeriesDto {
    /** null = ein Termin von vor dem 24.08.2026; er bekommt seine Serie beim ersten Schreiben. */
    seriesId: string | null;
    coverNote: string | null;
    days: AppointmentSeriesDay[];
    documents: AppointmentDocumentDto[];
}

/** Eine Checkliste als PDF, im Browser gezeichnet und mitgeschickt. */
export interface InviteAttachmentInput {
    filename: string;
    contentType: 'application/pdf';
    contentBase64: string;
}

export interface InviteSendInput {
    to: string;
    cc?: string[];
    subject?: string | null;
    message?: string | null;
    /**
     * Die AUTOMATISCHE Teammail: eine zweite, nicht verfasste Nachricht an das
     * Montageteam, die CC-Liste und die Person, die den Termin angelegt hat.
     * Ohne Angabe laeuft sie mit (der Server nimmt alles ausser `false` als an).
     * Nur bei Terminen — Besprechungen kennen kein Team.
     */
    teamMail?: boolean;
    /** Checklisten des Projekts/Auftrags; haengen NUR an der Teammail. */
    attachments?: InviteAttachmentInput[];
}

/** Eine der beiden Nachrichten: verschickt, oder mit Grund nicht verschickt. */
export type InviteMailOutcome =
    | { sent: true; recipients: string[] }
    | { sent: false; reason: 'NO_SMTP' | 'NO_SENDER' | 'NO_RECIPIENT' };

export interface InviteSendResult {
    sentAt: string;
    /** Die von Hand verfasste Mail an den Kunden; null = keine Adresse. */
    customer?: InviteMailOutcome | null;
    /** Die automatische Teammail; null = abgeschaltet oder niemand zu melden. */
    team?: InviteMailOutcome | null;
    recipients: string[];
    teamRecipients?: string[];
}
import type { PersonLite } from '../../types/maintenance';

export type SalesOrderMode = 'PROJECT_NEW' | 'PROJECT_EXISTING' | 'PROJECT_ADDON' | 'INVOICE';
export type ProjectDetailScope =
    | 'overview'
    | 'details'
    | 'planning'
    | 'fieldReports'
    | 'generalReport'
    | 'delivery'
    | 'signatures'
    | 'expenses'
    | 'materials'
    | 'overtime'
    | 'billing'
    | 'addons';

export interface SalesOrderDto {
    id: string;
    tenantId: string;
    customerId?: string | null;
    tenderId?: string | null;
    projectId?: string | null;
    parentSalesOrderId?: string | null;
    revisionNumber?: number | null;
    orderNumber: string;
    orderType: SalesOrderMode;
    status: string;
    totalAmount: number;
    createdByEmployeeId: string;
    createdAt: string;
    updatedAt: string;
    /** Geschäftsdatum des Auftrags; leer = `createdAt`. */
    orderDate?: string | null;
    customer?: { id: string; companyName: string; mainEmail?: string | null; mainPhone?: string | null } | null;
    tender?: { id: string; tenderNumber: string; status: string; projectId?: string | null } | null;
    // Projesi OLMAYAN sipariş = teslimat siparişi (teklifin proje açmayan yolu);
    // listede "Teslimat siparişi" olarak işaretlenir.
    project?: { id: string; projectNumber?: string; projectName: string; status?: ProjectStatus } | null;
    createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
}

// One row of the global field-report registry (Services > Reports).
export interface ServiceReportDto {
    id: string;
    projectId: string;
    salesOrderId?: string | null;
    appointmentId?: string | null;
    reportDate: string;
    workDate: string;
    startedAt?: string | null;
    endedAt?: string | null;
    workedMinutes: number;
    plannedMinutesForDay: number;
    overtimeMinutes: number;
    overtimeHourlyRate: number;
    overtimeCost: number;
    isSigned: boolean;
    hoursApprovedAt?: string | null;
    autoApproved?: boolean;
    project?: { id: string; projectName: string; customer?: { id: string; companyName: string } | null } | null;
    salesOrder?: { id: string; orderNumber: string } | null;
    // BERICHTSINHALT — NICHT in der Listenantwort (`listAllReports`). Diese
    // Felder stehen nur am vollen Bericht, den `projectApi.getById(projectId)`
    // unter `project.reports` mitliefert; genau von dort holt sie die
    // PDF-Erzeugung. Die Listentabellen zeichnen keines davon.
    operationsDone?: string;
    technicalNotes?: string | null;
    customerSignature?: string | null;
    /** Unterschrift des Technikers — zweite Signatur neben der des Kunden. */
    technicianSignature?: string | null;
    technicianSignedAt?: string | null;
    appointment?: { id: string; startTime: string; endTime: string } | null;
    employee?: { id: string; firstName: string; lastName: string; email: string } | null;
    images?: { id: string }[];
}

export type CompleteInstallationInput = {
    operationsDoneItems?: string[];
    technicalNotes?: string;
    startedAt?: string;
    endedAt?: string;
    signatureBase64?: string;
    /** Unterschrift des Technikers — reist mit dem Abschluss mit. */
    technicianSignature?: string | null;
    expenses?: { id?: string; expenseType: string; amount: number; description?: string }[];
    materials?: { id?: string; materialId: string; quantity: number; description?: string }[];
    usedMaterials?: { id?: string; materialId: string; quantity: number; description?: string }[];
    // Optional field-report photos as base64 data URLs.
    images?: string[];
    /**
     * 'replace': die geschickten Listen sind der VOLLSTÄNDIGE Stand des Termins —
     * der Abschluss ersetzt statt anzuhängen (der letzte Speicherstand gilt).
     * Ohne Flagge bleibt das alte Anhängeverhalten (Alt-Clients).
     */
    resourceMode?: 'replace';
};

export interface ProjectPickerDto {
    id: string;
    projectName: string;
    status: string;
    customerId?: string | null;
    customer?: { id: string; companyName: string } | null;
    salesOrders: Array<{
        id: string;
        orderNumber: string;
        status: string;
        orderType?: string | null;
        parentSalesOrderId?: string | null;
        totalAmount?: number | null;
    }>;
}

const startupProjectPrefetches = new Map<string, Promise<ProjectDto>>();
const projectDetailKey = (id: string, view?: ProjectDetailScope) => `${id}:${view || 'full'}`;

const requestProjectDetail = async (id: string, view?: ProjectDetailScope): Promise<ProjectDto> => {
    const res = await getShared<ProjectDto>(`/projects/${id}`, {
        params: view ? { view } : undefined,
    });
    return res.data;
};

export const projectApi = {
    list: async (filter: { status?: ProjectStatus | ''; search?: string } = {}): Promise<ProjectDto[]> => {
        const params = new URLSearchParams();
        if (filter.status) params.set('status', filter.status);
        if (filter.search) params.set('search', filter.search);
        const res = await apiClient.get(`/projects${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    // Yalın seçim listesi (takvim sihirbazı): proje + sipariş başlıkları.
    // `take` seçim kutusu için ilk N satırı ister; "tümünü gör" take'siz çağırır.
    // Zaman aşımı: asılı bir istek sihirbazı sonsuz "yükleniyor"da bırakmasın.
    listPicker: async (customerId?: string, take?: number): Promise<ProjectPickerDto[]> => {
        const res = await apiClient.get('/projects', {
            params: { view: 'picker', ...(customerId ? { customerId } : {}), ...(take ? { take } : {}) },
            timeout: 15000,
        });
        return Array.isArray(res.data) ? res.data : [];
    },

    getById: async (id: string, view?: ProjectDetailScope): Promise<ProjectDto> => {
        const key = projectDetailKey(id, view);
        const prefetched = startupProjectPrefetches.get(key);
        if (prefetched) {
            startupProjectPrefetches.delete(key);
            return prefetched;
        }
        return requestProjectDetail(id, view);
    },

    // Direct project URLs can fetch their compact overview while auth/profile
    // validation is in flight. getById consumes this promise once the protected
    // route mounts, removing the profile -> route -> project API waterfall.
    prefetchById: (id: string, view?: ProjectDetailScope): Promise<ProjectDto> => {
        const key = projectDetailKey(id, view);
        const existing = startupProjectPrefetches.get(key);
        if (existing) return existing;

        const pending = requestProjectDetail(id, view);
        startupProjectPrefetches.set(key, pending);
        void pending.catch(() => {
            if (startupProjectPrefetches.get(key) === pending) {
                startupProjectPrefetches.delete(key);
            }
        });
        return pending;
    },

    createFromTender: async (tenderId: string, managerId?: string | null, overtimeHourlyRate?: number): Promise<{ project: ProjectDto; bookingLink: string; message: string }> => {
        const res = await apiClient.post('/projects/from-tender', { tenderId, managerId: managerId || undefined, overtimeHourlyRate });
        return res.data;
    },

    createSalesOrderFromTender: async (input: {
        tenderId: string;
        mode: SalesOrderMode;
        // Proje adi sunucuda uretilir (kod = ad); gonderilmez.
        projectId?: string;
        // Teslimat siparisinde (INVOICE) ZORUNLU teslim tarihi, YYYY-MM-DD.
        // Teklifin `internalDeliveryDate` alanina yazilir.
        deliveryDate?: string;
        overtimeHourlyRate?: number;
    }): Promise<{ message: string; salesOrder: SalesOrderDto; project?: ProjectDto | null; reused?: boolean }> => {
        const res = await apiClient.post('/sales-orders/from-tender', input);
        return res.data;
    },

    listSalesOrders: async (filter: { search?: string } = {}): Promise<SalesOrderDto[]> => {
        const params = new URLSearchParams();
        if (filter.search) params.set('search', filter.search);
        const res = await apiClient.get(`/sales-orders${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    // Admin/manager-facing: delete a project sales order. The backend guards this —
    // main orders with addons or any invoiced order are rejected.
    deleteSalesOrder: async (projectId: string, salesOrderId: string): Promise<void> => {
        await apiClient.delete(`/projects/${projectId}/sales-orders/${salesOrderId}`);
    },

    // Projeyi tüm operasyonel kayıtlarıyla siler; faturalanmış proje sunucuda
    // reddedilir. İstemci onay için "DELETE" yazdırır.
    deleteProject: async (projectId: string): Promise<void> => {
        await apiClient.delete(`/projects/${projectId}`);
    },

    createAddonOrder: async (id: string, input: { parentSalesOrderId: string }) => {
        const res = await apiClient.post(`/projects/${id}/addon-orders`, input);
        return res.data as {
            message: string;
            salesOrder: SalesOrderDto;
            totals: { expenses: number; extraMaterials: number; overtime: number; total: number };
        };
    },

    // Technician-facing: request that the manager create an addon order from the
    // extra work accrued on a parent order (technicians cannot create it directly).
    requestAddonOrder: async (id: string, input: { salesOrderId?: string | null; appointmentId?: string | null; note?: string } = {}) => {
        const res = await apiClient.post(`/projects/${id}/addon-order-requests`, input);
        return res.data as {
            message: string;
            addonRequest: ProjectAddonRequestDto;
            totals: { expenseTotal: number; materialTotal: number; overtimeTotal: number; total: number };
        };
    },

    // Manager-facing: mark a technician addon request as HANDLED or DISMISSED.
    resolveAddonRequest: async (requestId: string, status: 'HANDLED' | 'DISMISSED' | 'PENDING') => {
        const res = await apiClient.patch(`/projects/addon-order-requests/${requestId}`, { status });
        return res.data as { message: string; addonRequest: ProjectAddonRequestDto };
    },

    update: async (id: string, patch: Partial<ProjectDto>): Promise<ProjectDto> => {
        const res = await apiClient.patch(`/projects/${id}`, patch);
        return res.data;
    },

    activate: async (id: string, startDate?: string): Promise<{ message: string; project: ProjectDto }> => {
        const res = await apiClient.patch(`/projects/${id}/activate`, { startDate });
        return res.data;
    },

    addReport: async (id: string, input: { salesOrderId?: string | null; appointmentId?: string | null; workDate: string; startedAt: string; endedAt: string; operationsDone: string; technicalNotes?: string; images?: string[] }) => {
        const res = await apiClient.post(`/projects/${id}/reports`, input);
        return res.data;
    },

    updateReport: async (reportId: string, input: { salesOrderId?: string | null; appointmentId?: string | null; workDate: string; startedAt: string; endedAt: string; operationsDone: string; technicalNotes?: string; images?: string[] }) => {
        const res = await apiClient.patch(`/projects/reports/${reportId}`, input);
        return res.data;
    },

    /**
     * Kompletter Rapport-Speicherstand eines Termins in EINEM Aufruf: Körper
     * (upsert) + Spesen/Zusatzmaterial/verwendetes Material als vollständiger
     * Ersatz — der letzte Speicherstand gilt. Zeilen mit id bleiben erhalten
     * (Menge/Betrag wird angepasst), Zeilen ohne id werden neu angelegt,
     * fehlende gelöscht (Zusatzmaterial wird dabei restockt).
     */
    saveFieldReport: async (appointmentId: string, input: {
        salesOrderId?: string | null;
        startedAt?: string;
        endedAt?: string;
        operationsDoneItems: string[];
        technicalNotes?: string;
        images?: string[];
        expenses?: Array<{ id?: string; expenseType: string; amount: number }>;
        extraMaterials?: Array<{ id?: string; materialId: string; quantity: number; description?: string }>;
        usedMaterials?: Array<{ id?: string; materialId: string; quantity: number }>;
        /** Mitgeschickt = setzen/löschen, weggelassen = unverändert. */
        technicianSignature?: string | null;
        /** Direkte Kundenunterschrift aus dem gemeinsamen Rapport-Editor. */
        customerSignature?: string | null;
    }) => {
        const res = await apiClient.put(`/projects/appointments/${appointmentId}/field-report`, input);
        return res.data;
    },

    // Speicherprotokoll des Rapports (wer/wann/was, neueste zuerst).
    getReportLogs: async (reportId: string): Promise<{ logs: Array<{ id: string; action: string; createdAt: string; employee?: { id: string; firstName: string; lastName: string } | null }> }> => {
        const res = await apiClient.get(`/projects/reports/${reportId}/logs`);
        return res.data;
    },

    /** `role: 'TECHNICIAN'` legt die Technikersignatur ab; ohne Rolle unterschreibt der Kunde. */
    signReport: async (reportId: string, signatureBase64: string, role: 'CUSTOMER' | 'TECHNICIAN' = 'CUSTOMER') => {
        const res = await apiClient.patch(`/projects/reports/${reportId}/sign`, { signatureBase64, role });
        return res.data;
    },

    addReportMaterials: async (reportId: string, materials: Array<{ materialId: string; quantity: number }>) => {
        const res = await apiClient.post(`/projects/reports/${reportId}/materials`, { materials });
        return res.data;
    },

    requestReportSignature: async (reportId: string, input: { channel: 'technician' | 'mail' | 'both'; to?: string; subject?: string; message?: string; fromEmail?: string; fromName?: string }) => {
        const res = await apiClient.post(`/projects/reports/${reportId}/signature-request`, input, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    // Flat list of every field report in the tenant (Services > Reports module).
    listAllReports: async (filter: { search?: string; start?: string; end?: string } = {}): Promise<ServiceReportDto[]> => {
        const params = new URLSearchParams();
        if (filter.search) params.set('search', filter.search);
        if (filter.start) params.set('start', filter.start);
        if (filter.end) params.set('end', filter.end);
        const res = await apiClient.get(`/projects/reports${params.toString() ? '?' + params : ''}`);
        return res.data;
    },

    listTechnicians: async (): Promise<PersonLite[]> => {
        const res = await apiClient.get('/projects/options/technicians');
        return res.data;
    },

    // `calendar: true` asks the backend for the trimmed grid payload (no report /
    // material / tender trees); the popup then fetches full detail on click via
    // getMyInstallationDetail. Other callers omit it and keep the rich payload.
    // Sayfalı montaj listesi: yalnızca tablo kolonları (düz satır DTO'ları) —
    // pop-up/iş ekranı verileri açıldıklarında kendi uçlarından yüklenir.
    listMontageOrdersPage: async (
        mode: 'active' | 'completed',
        page: number,
        start: string,
        end: string,
        pageSize = 10,
    ): Promise<MontageOrdersPageDto> => {
        const res = await apiClient.get('/projects/technician/installations', {
            params: { start, end, view: 'montage-page', mode, page, pageSize },
        });
        return res.data;
    },

    listMontageReportOrdersPage: async (filter: {
        page: number;
        search?: string;
    }): Promise<MontageReportOrdersPageDto> => {
        const res = await apiClient.get('/projects/technician/reports', {
            params: { ...filter, pageSize: 10 },
        });
        return res.data;
    },

    getMyMontageReportOrder: async (salesOrderId: string): Promise<MontageReportOrderDetailDto> => {
        const res = await apiClient.get(`/projects/technician/report-orders/${salesOrderId}`);
        return res.data;
    },

    getMyMontageReport: async (reportId: string): Promise<any> => {
        const res = await apiClient.get(`/projects/technician/reports/${reportId}`);
        return res.data;
    },

    getMyMontageReportResources: async (reportId: string): Promise<MontageReportResourcesDto> => {
        const res = await apiClient.get(`/projects/technician/reports/${reportId}/resources`);
        return res.data;
    },

    listMyInstallations: async (start: string, end: string, opts: { calendar?: boolean; montage?: boolean } = {}): Promise<AppointmentDto[]> => {
        // 'montage': satır + durum alanlarından ibaret hafif liste (rapor
        // görselleri/imza blobları yok) — montaj tabloları bununla açılır.
        const view = opts.calendar ? 'calendar' : opts.montage ? 'montage' : undefined;
        const res = await apiClient.get('/projects/technician/installations', { params: { start, end, ...(view ? { view } : {}) } });
        return res.data;
    },

    // Manager-facing: every order appointment in the tenant for the range.
    listAppointments: async (start: string, end: string, opts: { calendar?: boolean } = {}): Promise<AppointmentDto[]> => {
        const res = await apiClient.get('/projects/appointments', { params: { start, end, ...(opts.calendar ? { view: 'calendar' } : {}) } });
        return res.data;
    },

    // Lazy calendar-popup detail for a single order appointment (manager scope).
    getAppointmentDetail: async (appointmentId: string): Promise<AppointmentDto> => {
        const res = await apiClient.get(`/projects/appointments/${appointmentId}/detail`);
        return res.data;
    },

    // Lazy calendar-popup detail for a single order appointment (technician scope).
    getMyInstallationDetail: async (appointmentId: string): Promise<AppointmentDto> => {
        const res = await apiClient.get(`/projects/technician/installations/${appointmentId}/detail`);
        return res.data;
    },

    getMyInstallation: async (
        appointmentId: string,
        section: 'work' | 'expenses' | 'materials' | 'general' = 'work',
    ): Promise<AppointmentDto> => {
        const res = await apiClient.get(`/projects/technician/installations/${appointmentId}`, {
            params: { section },
        });
        return res.data;
    },

    completeInstallation: async (appointmentId: string, input: CompleteInstallationInput) => {
        const res = await apiClient.post(`/projects/technician/installations/${appointmentId}/complete`, input);
        return res.data;
    },

    completeAppointmentAsManager: async (appointmentId: string, input: CompleteInstallationInput) => {
        const res = await apiClient.post(`/projects/appointments/${appointmentId}/complete`, input);
        return res.data;
    },

    /**
     * Ein Einsatz — EIN Tag oder MEHRERE (24.08.2026). Mit `days` entsteht je
     * Tag ein Termin, alle unter derselben Serie; ohne bleibt es beim einzelnen
     * Termin aus `startTime`/`endTime`. Die Antwort ist der erste Tag, ergänzt
     * um `seriesId` und die ganze Tagesliste.
     */
    createAppointment: async (id: string, input: {
        salesOrderId?: string | null;
        assignedTechId?: string | null;
        technicianIds?: string[];
        startTime?: string;
        endTime?: string;
        days?: AppointmentDayInput[];
        notes?: string;
        coverNote?: string;
        ccEmails?: string[];
        /** Kalender-Etikett; fehlt es, wird «Geplanter Termin» gesetzt. */
        labelId?: string | null;
        /**
         * Die Termine, die dem neuen Platz machen sollen. Sie stammen aus dem
         * `replaceable` einer vorigen Absage (409) — der Server räumt sie in
         * DERSELBEN Transaktion weg, in der er den neuen Einsatz anlegt.
         */
        replaceAppointmentIds?: string[];
    }) => {
        const res = await apiClient.post(`/projects/${id}/appointments`, input);
        return res.data as (AppointmentDto & { seriesId?: string | null; days?: AppointmentDto[]; replaced?: number });
    },

    /* ── Mehrtägige Einsätze und Terminunterlagen ─────────────────────── */

    /** Der ganze Einsatz eines Termins: Tage, Begleitwort, Unterlagen. */
    getAppointmentSeries: async (appointmentId: string, opts: { technician?: boolean } = {}): Promise<AppointmentSeriesDto> => {
        const path = opts.technician
            ? `/projects/technician/installations/${appointmentId}/series`
            : `/projects/appointments/${appointmentId}/series`;
        const res = await apiClient.get(path);
        return res.data;
    },

    /**
     * Der Einsatzplan, wie er sein SOLL. Tage mit `appointmentId` werden
     * fortgeschrieben, Tage ohne kommen dazu, fehlende fallen weg — anhängen
     * und ändern gehen denselben Weg.
     */
    saveAppointmentDays: async (appointmentId: string, input: { days: AppointmentDayInput[]; technicianIds?: string[] }) => {
        const res = await apiClient.put(`/projects/appointments/${appointmentId}/series/days`, input);
        return res.data as { seriesId: string; days: AppointmentSeriesDay[]; added: number; removed: number };
    },

    /** Das Begleitwort an die Monteurin — es geht nie an den Kunden. */
    saveAppointmentCoverNote: async (appointmentId: string, coverNote: string) => {
        const res = await apiClient.patch(`/projects/appointments/${appointmentId}/series`, { coverNote });
        return res.data as { seriesId: string; coverNote: string | null };
    },

    /**
     * DIE DATEI REIST ROH (24.08.2026, Vorgabe Samet: «so schnell wie beim
     * Angebot»): ein multipart-Formular mit der `File` selbst — kein FileReader,
     * kein Base64 (ein Drittel grösser und zweimal umkodiert), kein Umweg über
     * einen JSON-Körper. Genau derselbe Weg wie der Angebotsanhang.
     */
    addAppointmentDocument: async (appointmentId: string, file: File) => {
        const form = new FormData();
        form.append('file', file, file.name);
        const res = await apiClient.post(`/projects/appointments/${appointmentId}/documents`, form, {
            timeout: MAIL_REQUEST_TIMEOUT_MS,
        });
        return res.data as { seriesId: string; document: AppointmentDocumentDto };
    },

    /** Gemeinsam ausgewaehlte Unterlagen reisen als EIN Multipart-Paket. */
    addAppointmentDocuments: async (appointmentId: string, files: File[]) => {
        const form = new FormData();
        files.forEach((file) => form.append('files', file, file.name));
        const res = await apiClient.post(`/projects/appointments/${appointmentId}/documents/batch`, form, {
            timeout: MAIL_REQUEST_TIMEOUT_MS,
        });
        return res.data as { seriesId: string; documents: AppointmentDocumentDto[] };
    },

    /** Der Inhalt einer Unterlage kommt erst beim Oeffnen ueber die Leitung. */
    getAppointmentDocument: async (documentId: string, opts: { technician?: boolean } = {}): Promise<AppointmentDocumentDto> => {
        const path = opts.technician
            ? `/projects/technician/appointment-documents/${documentId}`
            : `/projects/appointment-documents/${documentId}`;
        const res = await apiClient.get(path, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    deleteAppointmentDocument: async (documentId: string): Promise<void> => {
        await apiClient.delete(`/projects/appointment-documents/${documentId}`);
    },

    updateAppointment: async (appointmentId: string, input: { salesOrderId?: string | null; assignedTechId?: string | null; technicianIds?: string[]; startTime: string; endTime: string; notes?: string; ccEmails?: string[]; labelId?: string | null }) => {
        const res = await apiClient.patch(`/projects/appointments/${appointmentId}`, input);
        return res.data;
    },

    /** `scope: 'series'` löscht den ganzen mehrtägigen Einsatz, sonst nur den Tag. */
    deleteAppointment: async (appointmentId: string, scope: 'day' | 'series' = 'day'): Promise<void> => {
        await apiClient.delete(`/projects/appointments/${appointmentId}`, {
            ...(scope === 'series' ? { params: { scope: 'series' } } : {}),
        });
    },

    // "Termin senden": the calendar invitation (card mail + .ics) leaves ONLY
    // through this call — saving an appointment never mails anyone. It produces
    // TWO messages: the written one to the customer (to/cc/subject/message) and,
    // unless `teamMail: false`, the automatic one to the technicians, the CC list
    // and the appointment's creator, carrying the checklist PDFs.
    // Same long timeout as every other mail call: attachments travel with it.
    sendAppointmentInvite: async (appointmentId: string, input: InviteSendInput): Promise<InviteSendResult> => {
        const res = await apiClient.post(`/projects/appointments/${appointmentId}/send-invite`, input, {
            timeout: MAIL_REQUEST_TIMEOUT_MS,
        });
        return res.data;
    },

    requestVariation: async (id: string, input: { salesOrderId?: string | null; appointmentId?: string | null; materialId: string; quantity: number; description?: string }) => {
        const res = await apiClient.post(`/projects/${id}/variations`, input);
        return res.data;
    },

    updateExtraMaterial: async (extraMaterialId: string, input: { salesOrderId?: string | null; materialId?: string; quantity?: number; unitPrice?: number; description?: string }) => {
        const res = await apiClient.patch(`/projects/extra-materials/${extraMaterialId}`, input);
        return res.data;
    },

    deleteExtraMaterial: async (extraMaterialId: string): Promise<void> => {
        await apiClient.delete(`/projects/extra-materials/${extraMaterialId}`);
    },

    approveVariation: async (variationId: string, isApproved: boolean) => {
        const res = await apiClient.patch(`/projects/variations/${variationId}/approve`, { isApproved });
        return res.data;
    },

    addExpense: async (id: string, input: { salesOrderId?: string | null; appointmentId?: string | null; expenseType: string; amount: number; description?: string }) => {
        const res = await apiClient.post(`/projects/${id}/expenses`, input);
        return res.data;
    },

    updateExpense: async (expenseId: string, input: { salesOrderId?: string | null; expenseType?: string; amount?: number; description?: string }) => {
        const res = await apiClient.patch(`/projects/expenses/${expenseId}`, input);
        return res.data;
    },

    deleteExpense: async (expenseId: string): Promise<void> => {
        await apiClient.delete(`/projects/expenses/${expenseId}`);
    },

    /**
     * Saha ekranlarının "malzeme" kataloğu. Malzeme/ürün birleşmesinden
     * (2026-08-14) beri sunucu ÜRÜN listesini eski ProjectMaterial biçiminde
     * döndürür (serialId=articleCode, unitCost=salePrice, stockQuantity=bakiye);
     * satır id'leri ürün (Article) id'leridir.
     */
    materials: async (options: { compact?: boolean } = {}): Promise<ProjectMaterial[]> => {
        const res = await apiClient.get('/projects/materials', {
            params: options.compact ? { view: 'picker' } : undefined,
        });
        return res.data;
    },

    sendBookingMail: async (id: string, input: { salesOrderId?: string | null; fromEmail?: string; fromName?: string; to: string; subject: string; message: string }) => {
        const res = await apiClient.post(`/projects/${id}/send-booking-mail`, input, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },
};

export interface PublicBookingResponse {
    /** 'book' = customer still picks an available slot; 'scheduled' = installations already planned (read-only view). */
    mode: 'book' | 'scheduled';
    projectName: string;
    availableSlots: AppointmentDto[];
    scheduledAppointments: AppointmentDto[];
}

export const bookingApi = {
    getSlots: async (token: string, startDate: string, endDate: string): Promise<PublicBookingResponse> => {
        const res = await apiClient.get(`/booking/slots?token=${encodeURIComponent(token)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
        return res.data;
    },

    book: async (token: string, appointmentId: string) => {
        const res = await apiClient.post('/booking/book', { token, appointmentId });
        return res.data;
    },

    createSlots: async (slots: Array<{ startTime: string; endTime: string }>) => {
        const res = await apiClient.post('/booking/slots', { slots });
        return res.data;
    },
};

export const mailApi = {
    getSettings: async (): Promise<MailSettingDto> => {
        const res = await apiClient.get('/mail/settings');
        return res.data;
    },

    // smtpPassword/imapPassword/caldavPassword: undefined/atlanmış = kayıtlı
    // şifreye dokunma, null = sil.
    saveSettings: async (
        input: Partial<MailSettingDto> & {
            smtpPassword?: string | null;
            imapPassword?: string | null;
            caldavPassword?: string | null;
        },
    ): Promise<MailSettingDto> => {
        const res = await apiClient.put('/mail/settings', input);
        return res.data;
    },

    /* KALENDER DES KONTOS (CalDAV). `testCaldav` sucht die Kalender des
       eingerichteten Postfachs und meldet, was es gefunden hat — die
       Einrichtung soll man prüfen können, ohne auf den nächsten Durchgang zu
       warten. Die Suche kostet mehrere Anfragen an den Server, darum eine
       eigene, längere Frist. */
    testCaldav: async (): Promise<{ ok: boolean; calendars: Array<{ href: string; displayName: string }>; error?: string }> => {
        const res = await apiClient.post('/mail/caldav/test', {}, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    syncCaldav: async (): Promise<{ calendars: number; created: number; updated: number; removed: number; error?: string }> => {
        const res = await apiClient.post('/mail/caldav/sync', {}, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    // Zaman aşımı: yanıtsız kalan bir gönderim ekranı sonsuz "gönderiliyor"da
    // bırakmasın (axios'un varsayılan zaman aşımı yoktur).
    send: async (input: { fromEmail?: string; fromName?: string; to: string; cc?: string[]; subject: string; text?: string; html?: string; attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>; customerId?: string | null }) => {
        const res = await apiClient.post('/mail/send', input, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },
};

export interface ChecklistItemDto {
    id: string;
    category: string;
    label: string;
    measurement: boolean;
}

export interface ChecklistTemplateDto {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    items: ChecklistItemDto[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export type ChecklistTemplateInput = {
    name: string;
    description?: string | null;
    items: Array<Partial<ChecklistItemDto> & { label: string }>;
    isActive?: boolean;
};

export const checklistApi = {
    list: async (): Promise<ChecklistTemplateDto[]> => {
        const res = await apiClient.get('/settings/checklists');
        return res.data;
    },
    getOne: async (id: string): Promise<ChecklistTemplateDto> => {
        const res = await apiClient.get(`/settings/checklists/${id}`);
        return res.data;
    },
    create: async (input: ChecklistTemplateInput): Promise<ChecklistTemplateDto> => {
        const res = await apiClient.post('/settings/checklists', input);
        return res.data;
    },
    update: async (id: string, input: Partial<ChecklistTemplateInput>): Promise<ChecklistTemplateDto> => {
        const res = await apiClient.put(`/settings/checklists/${id}`, input);
        return res.data;
    },
    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/settings/checklists/${id}`);
    },
};

export type DeliveryStatus = 'YES' | 'NO' | 'NA' | null;

export interface DeliveryResponseItem {
    id: string;
    category: string;
    label: string;
    status: DeliveryStatus;
    measurement: string;
    measurementEnabled: boolean;
}

export interface DeliveryReportDto {
    id: string;
    tenantId: string;
    projectId: string | null;
    salesOrderId: string | null;
    appointmentId: string | null;
    employeeId: string | null;
    checklistTemplateId: string | null;
    checklistName: string | null;
    // BERICHTSINHALT — nur im Detailsatz (`getOne`). Die Liste lässt diese drei
    // weg: `responses` ist die Checklisten-Tabelle des PDFs und
    // `customerSignature` ein base64-Bild, beides pro Zeile schnell sehr groß.
    // Wer sie braucht (PDF-Erzeugung), holt den Bericht einzeln nach.
    responses?: DeliveryResponseItem[];
    notes?: string | null;
    /** Report-own photo attachments (base64 data URLs) — detail fetch only. */
    images?: Array<{ imageData: string; caption?: string }> | null;
    customerSignature?: string | null;
    /** Unterschrift des ausführenden Technikers — detail fetch only. */
    technicianSignature?: string | null;
    technicianSignedAt?: string | null;
    isSigned: boolean;
    signedAt: string | null;
    sentAt: string | null;
    createdAt: string;
    updatedAt: string;
    // Optional enriched labels added by the list endpoint.
    projectName?: string | null;
    customerName?: string | null;
    orderNumber?: string | null;
}

export type ProjectListDeliveryReportDto = Pick<DeliveryReportDto, 'projectId' | 'salesOrderId' | 'isSigned'>;

export type DeliveryReportInput = {
    projectId?: string | null;
    salesOrderId?: string | null;
    appointmentId?: string | null;
    checklistTemplateId?: string | null;
    checklistName?: string | null;
    responses: Array<Partial<DeliveryResponseItem> & { label: string }>;
    notes?: string | null;
    images?: Array<{ imageData: string; caption?: string }>;
    signatureBase64?: string | null;
    /** Technikersignatur beim Anlegen (Tablet-Ansicht). */
    technicianSignatureBase64?: string | null;
};

export const deliveryReportApi = {
    list: async (params?: { appointmentId?: string; projectId?: string; salesOrderId?: string }): Promise<DeliveryReportDto[]> => {
        const res = await getShared<DeliveryReportDto[]>('/delivery-reports', { params });
        return res.data;
    },
    listProjectFlow: async (): Promise<ProjectListDeliveryReportDto[]> => {
        const res = await getShared<ProjectListDeliveryReportDto[]>('/delivery-reports', { params: { view: 'project-list' } });
        return res.data;
    },
    getOne: async (id: string): Promise<DeliveryReportDto> => {
        const res = await apiClient.get(`/delivery-reports/${id}`);
        return res.data;
    },
    getByAppointment: async (appointmentId: string): Promise<DeliveryReportDto | null> => {
        const res = await apiClient.get(`/delivery-reports/by-appointment/${appointmentId}`);
        return res.data;
    },
    create: async (input: DeliveryReportInput): Promise<DeliveryReportDto> => {
        const res = await apiClient.post('/delivery-reports', input);
        return res.data;
    },
    sign: async (id: string, signatureBase64: string, role: 'CUSTOMER' | 'TECHNICIAN' = 'CUSTOMER'): Promise<DeliveryReportDto> => {
        const res = await apiClient.patch(`/delivery-reports/${id}/sign`, { signatureBase64, role });
        return res.data;
    },
    update: async (id: string, input: {
        responses?: DeliveryReportInput['responses'];
        notes?: string | null;
        checklistName?: string | null;
        images?: Array<{ imageData: string; caption?: string }>;
        /** Mitgeschickt = gesetzt/gelöscht; weggelassen = unverändert. */
        technicianSignature?: string | null;
        customerSignature?: string | null;
    }): Promise<DeliveryReportDto> => {
        const res = await apiClient.patch(`/delivery-reports/${id}`, input);
        return res.data;
    },
};

export type SignatureReportType = 'FIELD' | 'DELIVERY' | 'GENERAL';

export interface SignatureSnapshotRow {
    label: string;
    status?: 'YES' | 'NO' | 'NA' | null;
    value?: string;
}
export interface SignatureSnapshotSection {
    heading?: string;
    rows: SignatureSnapshotRow[];
}
export interface SignatureSnapshot {
    title?: string;
    customerName?: string;
    projectName?: string;
    meta?: Array<{ label: string; value: string }>;
    sections?: SignatureSnapshotSection[];
    images?: string[];
    notes?: string;
}

export interface SignatureRequestDto {
    id: string;
    reportType: SignatureReportType;
    reportId: string | null;
    projectId: string | null;
    token: string;
    customerEmail: string | null;
    title: string | null;
    status: 'PENDING' | 'SIGNED' | 'SUBMITTED';
    signedAt: string | null;
    createdAt: string;
    link: string;
}

export interface SignatureRequestDetailDto extends SignatureRequestDto {
    snapshot: SignatureSnapshot;
    signatureBase64: string | null;
    updatedAt: string;
}

export type SignatureRequestInput = {
    reportType: SignatureReportType;
    reportId?: string | null;
    projectId?: string | null;
    title?: string;
    customerEmail?: string | null;
    snapshot: SignatureSnapshot;
    sendEmail?: boolean;
    notifyTechnician?: boolean;
    subject?: string;
    message?: string;
    /** When present, the request is stored as already SIGNED (in-app signing). */
    signatureBase64?: string | null;
};

export interface PublicSignatureView {
    reportType: SignatureReportType;
    title: string | null;
    snapshot: SignatureSnapshot;
    status: 'PENDING' | 'SIGNED' | 'SUBMITTED';
    signedAt: string | null;
}

export const signatureApi = {
    list: async (reportType?: SignatureReportType): Promise<SignatureRequestDto[]> => {
        const res = await apiClient.get('/signature-requests', { params: reportType ? { reportType } : undefined });
        return res.data;
    },
    create: async (input: SignatureRequestInput): Promise<SignatureRequestDto & { emailed: boolean; notified: boolean }> => {
        const res = await apiClient.post('/signature-requests', input, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },
    getOne: async (id: string): Promise<SignatureRequestDetailDto> => {
        const res = await apiClient.get(`/signature-requests/${id}`);
        return res.data;
    },
    sign: async (id: string, signatureBase64: string): Promise<SignatureRequestDetailDto> => {
        const res = await apiClient.patch(`/signature-requests/${id}/sign`, { signatureBase64 });
        return res.data;
    },
    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/signature-requests/${id}`);
    },
    publicGet: async (token: string): Promise<PublicSignatureView> => {
        const res = await apiClient.get(`/signature-requests/public/${token}`);
        return res.data;
    },
    publicSign: async (token: string, signatureBase64?: string | null): Promise<{ message: string; signed: boolean }> => {
        const res = await apiClient.post(`/signature-requests/public/${token}/sign`, { signatureBase64: signatureBase64 || null });
        return res.data;
    },
};
