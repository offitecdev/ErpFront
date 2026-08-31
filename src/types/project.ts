export type ProjectStatus = 'AWAITING_APPROVAL' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'SPECIALLY_CLOSED' | 'CANCELLED';
export type AppointmentStatus = 'AVAILABLE' | 'BOOKED' | 'COMPLETED' | 'CANCELLED';

export interface ProjectCustomer {
    id: string;
    companyName: string;
    mainEmail?: string | null;
    mainPhone?: string | null;
    address?: string | null;
    // Preferred correspondence language (TR/EN/DE); field & delivery report PDFs
    // are rendered in this language regardless of the active UI language.
    language?: string | null;
}

/**
 * Saha ekranlarının "malzeme" katalog satırı. Malzeme/ürün birleşmesinden
 * (2026-08-14) beri sunucu ÜRÜN listesini bu eski biçimde döndürür:
 * id = ürün (Article) id'si, serialId = articleCode, unitCost = salePrice,
 * stockQuantity = bakiye toplamı.
 */
export interface ProjectMaterial {
    id: string;
    tenantId?: string;
    serialId: string;
    name: string;
    unit?: string;
    stockQuantity: number;
    unitCost: number;
    minStockLevel?: number;
    criticalStockLevel?: number;
    imageUrl?: string | null;
    isActive?: boolean;
    createdAt?: string;
}

/** Sayfalı montaj listesinin düz satırı — yalnızca tablo kolonları. */
export interface MontageOrderListItem {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    projectId: string | null;
    salesOrderId: string | null;
    orderNumber: string;
    projectName: string;
    customerName: string;
    fieldReportId: string | null;
    signed: boolean;
}

export interface MontageOrdersPageDto {
    items: MontageOrderListItem[];
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
}

export interface MontageReportOrderListItem {
    salesOrderId: string;
    orderNumber: string;
    projectId: string | null;
    projectName: string;
    customerName: string;
    fieldReportCount: number;
    latestReportDate: string | null;
}

export interface MontageReportOrdersPageDto {
    items: MontageReportOrderListItem[];
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
}

export interface MontageReportOrderDetailDto {
    order: Pick<MontageReportOrderListItem, 'salesOrderId' | 'orderNumber' | 'projectId' | 'projectName' | 'customerName'>;
    fieldReports: Array<{
        id: string;
        appointmentId: string | null;
        reportDate: string;
        workDate: string;
        isSigned: boolean;
        appointment: { id: string; startTime: string; endTime: string } | null;
        employee: { firstName: string; lastName: string } | null;
    }>;
    deliveryReport: { id: string; isSigned: boolean; createdAt: string; checklistName: string | null } | null;
    generalReport: { id: string; status: string; createdAt: string } | null;
    createAppointmentId: string | null;
}

export interface MontageReportResourcesDto {
    usedMaterials: Array<{
        id: string;
        quantity: number;
        costAtTime: number;
        article: { articleCode: string; name: string; unit: string } | null;
        material: { name: string } | null;
    }>;
    extraMaterials: Array<{
        id: string;
        quantity: number;
        unitPrice: number;
        description: string | null;
        /** Birleşme sonrası satırlar `article` taşır; eski yanıtlar `material`. */
        article?: { name: string } | null;
        material?: { name: string } | null;
    }>;
    expenses: Array<{
        id: string;
        expenseType: string;
        amount: number;
        description: string | null;
        expenseDate: string;
    }>;
}

export interface AppointmentDto {
    id: string;
    tenantId: string;
    projectId?: string | null;
    salesOrderId?: string | null;
    assignedTechId?: string | null;
    customerId?: string | null;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
    notes?: string | null;
    installationReminderSentAt?: string | null;
    /** Set once the calendar invitation was sent to the customer (never on save). */
    inviteSentAt?: string | null;
    ccEmails?: string[] | null;
    /** Kalender-Etikett (25.08.2026) — die Farbe der Karte im Kalender. */
    labelId?: string | null;
    /**
     * MEHRTÄGIGER EINSATZ (24.08.2026). Ein Einsatz über mehrere Tage ist EINE
     * ZEILE JE TAG — `seriesId` ist das Band dazwischen, `dayIndex` die Nummer
     * des Tages darin ("Tag 2 von 4"). Ein gewöhnlicher Termin ist ein Einsatz
     * mit einem Tag; alte Zeilen haben noch gar keine Serie (null).
     */
    seriesId?: string | null;
    dayIndex?: number | null;
    assignedTechnician?: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; roleName?: string | null } | null;
    technicianAssignments?: Array<{
        id: string;
        appointmentId: string;
        technicianId: string;
        assignedAt?: string;
        technician?: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; roleName?: string | null } | null;
    }>;
}

export interface ProjectSalesOrder {
    id: string;
    tenantId: string;
    customerId?: string | null;
    tenderId?: string | null;
    projectId?: string | null;
    parentSalesOrderId?: string | null;
    revisionNumber?: number | null;
    orderNumber: string;
    orderType: string;
    status: string;
    totalAmount: number;
    createdByEmployeeId?: string;
    createdAt: string;
    // Business date shown to the user; for addon orders this is the original
    // appointment date the extra work belongs to. Falls back to createdAt when null.
    orderDate?: string | null;
    updatedAt?: string;
    /**
     * Auftragsbestätigung: der Einleitungstext der Titelseite. NULL heisst
     * «noch nie bearbeitet» — gedruckt wird dann der Einleitungstext der
     * Offerte, von dem der Text startet.
     */
    confirmationNote?: string | null;
    /** «Gültig bis» der Bestätigung. NULL = Auftragsdatum + 1 Monat. */
    confirmationValidUntil?: string | null;
    customer?: ProjectCustomer | null;
    tender?: ProjectDto['tender'];
    parentSalesOrder?: { id: string; orderNumber: string } | null;
    addonSalesOrders?: Array<{ id: string; orderNumber: string; revisionNumber?: number | null; totalAmount: number; createdAt: string; orderDate?: string | null }>;
    createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface ProjectDto {
    id: string;
    tenantId: string;
    customerId: string;
    tenderId?: string | null;
    managerId?: string | null;
    /** Proje kodu — PR-2026-10001. Sunucuda üretilir, her dilde aynıdır. */
    projectNumber?: string;
    projectName: string;
    status: ProjectStatus;
    plannedBudget: number;
    actualCost: number;
    overtimeHourlyRate?: number;
    overtimeTolerancePercent?: number;
    startDate?: string | null;
    endDate?: string | null;
    bookingToken?: string | null;
    createdAt: string;
    updatedAt: string;
    customer?: ProjectCustomer | null;
    manager?: { id: string; firstName: string; lastName: string; email: string } | null;
    tender?: {
        id: string;
        tenderNumber: string;
        status: string;
        projectId?: string | null;
        /** Kommissionsnummer — listed per order on the project screen. */
        commissionNumber?: string | null;
        /** Verkäufer — the tender's salesperson, else its creator (billing tab prefill). */
        salespersonName?: string | null;
        createdBy?: { firstName: string; lastName: string } | null;
        /** Projektadresse (Montageadresse) — first line of the project overview. */
        installationAddress?: string | null;
        /**
         * Teklife dahil "malzeme" satırları. Malzeme/ürün birleşmesinden
         * (2026-08-14) beri satırlar Article'a bağlıdır (`articleId`/`article`);
         * eski alan adları yalnızca eski yanıtlar için opsiyonel kaldı.
         */
        usedMaterials?: Array<{
            id: string;
            articleId?: string;
            materialId?: string;
            quantity: number;
            unitCost: number;
            description?: string | null;
            article?: { id: string; articleCode: string; name: string; salePrice: number } | null;
            material?: { id: string; serialId: string; name: string; stockQuantity: number; unitCost: number } | null;
        }>;
        positions?: Array<{
            id: string;
            positionNumber: string;
            shortDescription: string;
        }>;
    } | null;
    appointments?: AppointmentDto[];
    salesOrders?: ProjectSalesOrder[];
    reports?: any[];
    expenses?: any[];
    projectVariations?: any[];
    extraMaterials?: any[];
    addonRequests?: ProjectAddonRequestDto[];
    _count?: { reports: number; expenses: number; projectVariations: number; salesOrders?: number };
}

export interface ProjectAddonRequestDto {
    id: string;
    tenantId: string;
    projectId: string;
    salesOrderId?: string | null;
    appointmentId?: string | null;
    requestedById: string;
    requestedByName?: string | null;
    status: 'PENDING' | 'HANDLED' | 'DISMISSED';
    note?: string | null;
    expenseTotal: number;
    materialTotal: number;
    overtimeTotal: number;
    total: number;
    createdAt: string;
    resolvedById?: string | null;
    resolvedAt?: string | null;
}

export interface MailSettingDto {
    tenantId: string;
    fromName?: string | null;
    fromEmail?: string | null;
    replyTo?: string | null;
    smtpHost?: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser?: string | null;
    /** GÖNDERİLENLER KOPYASI — SMTP mailin gönderenin kutusunda iz bırakmaz;
        kopyanın Outlook'ta görünmesi için gönderim sonrası IMAP APPEND yapılır.
        imapHost boşsa özellik kapalıdır. */
    imapHost?: string | null;
    imapPort?: number;
    imapSecure?: boolean;
    /** Boş = SMTP kullanıcı/şifresi kullanılır. */
    imapUser?: string | null;
    /** Boş = klasör sunucudan bulunur (RFC 6154 `\Sent`). */
    sentFolder?: string | null;
    /** Kopyayı sunucu tarafında dosyalayan Exchange kurulumlarında kapatılır. */
    saveToSent?: boolean;
    /** Tenant e-posta imzası — sınırlı HTML; gönderilen maillerin sonuna eklenir. */
    signatureHtml?: string | null;
    /** İmza görseli (PNG/JPG data URI, ≤ 2 MB); mailde CID'li inline ek olarak gider. */
    signatureImage?: string | null;
    hasPassword?: boolean;
    hasImapPassword?: boolean;
    /** POSTEINGANG DES EIGENEN SERVERS (18.08.2026): der IMAP-Abruf holt nur
        Kundenbezogenes (Antworten auf ERP-Mails + bekannte Kundenadressen). */
    imapCaptureEnabled?: boolean;
    /** Zu überwachender Ordner; leer = INBOX. */
    imapInboxFolder?: string | null;
    /** Streng: nur Antworten auf ERP-Mails aufnehmen. */
    imapCaptureRepliesOnly?: boolean;
    /** Wie weit das Postfach zurueckreicht, in Monaten (1 oder 2; Vorgabe 2). */
    imapWindowMonths?: number;
    /** Nur in der ANTWORT auf das Speichern: entfernte Nachrichten nach einem
        Postfachwechsel. */
    purgedMessages?: number;
    imapLastSyncAt?: string | null;
    imapLastSummary?: string | null;
    imapLastError?: string | null;
    /** DER KALENDER DESSELBEN KONTOS (CalDAV, 31.08.2026). Ohne das holt der
        Kalender nur, wozu jemand das Postfach EINGELADEN hat — was sich jemand
        selbst einträgt, erzeugt keine Mail und käme nie an. Benutzer, Passwort
        und Adresse dürfen leer bleiben: dann gelten die des IMAP-Kontos, und
        die Adresse wird über /.well-known/caldav gesucht. */
    caldavEnabled?: boolean;
    caldavUrl?: string | null;
    caldavUser?: string | null;
    hasCaldavPassword?: boolean;
    caldavCalendars?: Array<{ href: string; displayName: string }> | null;
    caldavLastSyncAt?: string | null;
    caldavLastSummary?: string | null;
    caldavLastError?: string | null;
    /** Nur in der ANTWORT auf das Speichern: entfernte Kalendertermine, die
        einem anderen Konto gehörten. */
    purgedMeetings?: number;
}

/** /mail/send yanıtındaki gönderilenler-kopyası sonucu. */
export interface SentCopyResultDto {
    status: 'saved' | 'skipped' | 'failed';
    folder?: string;
    reason?: string;
    error?: string;
}
