import { apiClient, MAIL_REQUEST_TIMEOUT_MS } from '../axios';

/* FIRMENPOSTFACH (18.08.2026) — ausgehende Mail über den eigenen SMTP-Server,
   eingehende per IMAP von demselben Server. Kein Microsoft/Outlook Online.
   Backend: presentation/routes/mailbox.routes.ts (unter /mail). */

export interface MailParty { name: string | null; address: string; }

export interface InboxStatusDto {
    /** Versand */
    smtpConfigured: boolean;
    smtpHost: string | null;
    smtpPort: number | null;
    fromEmail: string | null;
    /** Abruf */
    imapConfigured: boolean;
    imapHost: string | null;
    imapPort: number | null;
    mailbox: string | null;
    folder: string;
    captureEnabled: boolean;
    repliesOnly: boolean;
    /** Wie weit das Postfach zurückreicht, in Monaten (1 oder 2). */
    windowMonths?: number;
    hasCredentials: boolean;
    lastSyncAt: string | null;
    lastSummary: string | null;
    lastError: string | null;
    running: boolean;
    summary?: CaptureSummaryDto | null;
}

export interface CaptureSummaryDto {
    tenantId: string;
    examined: number;
    stored: number;
    replies: number;
    byAddress: number;
    skipped: number;
    /** Davon nur am Schalter «nur Antworten übernehmen» gescheitert. */
    skippedRepliesOnly?: number;
    calendar?: number;
    /** Nur im Probelauf: was übernommen würde. */
    preview?: Array<{ subject: string; from: string; reason: string; customerId: string | null }>;
    /** Nur im Probelauf: Absender, deren Adresse nicht im System steht. */
    unknownSenders?: Array<{ address: string; count: number }>;
    error?: string;
    durationMs: number;
}

export type MailDirection = 'IN' | 'OUT';
export type MailFolder = 'inbox' | 'sent' | 'bin' | 'all';

export interface MailPersonLite { id: string; firstName: string; lastName: string; }
export interface MailCustomerLite { id: string; companyName: string; }
export interface MailEntityRef { type: string; id: string | null; label: string | null; }
export interface MailCategoryLite { id: string; name: string; color: string; }

/* ── Kategorien (08.09.2026): die persönliche Ordnung des Postfachs ─────────
   Eine Kategorie hängt an einem Datensatz des Hauses (Person, Kunde, Angebot,
   Auftrag, Projekt, Rechnung) oder ist die eingebaute Sammelkategorie
   «Anfragen» (REQUESTS — nicht löschbar). */
export type MailCategoryKind = 'STAFF' | 'CUSTOMER' | 'TENDER' | 'ORDER' | 'PROJECT' | 'INVOICE' | 'REQUESTS';

export interface MailCategoryDto {
    id: string;
    kind: MailCategoryKind;
    entityId: string | null;
    name: string;
    color: string;
    displayOrder: number;
    count: number;
}

/** Eine Zeile des Anlegen-Fensters — der Datensatz hinter der Kategorie. */
export interface MailCategoryOption { id: string; label: string; sublabel: string | null; }

/* ── Filter über der Liste (13.09.2026) ────────────────────────────────────
   Kunde, Personal, Projekt — neben der Suche. Sie ordnen nichts ein, sie
   engen die Liste ein; zur Auswahl steht ALLES aus dem Firmenbaum. */
export type MailFilterKind = 'CUSTOMER' | 'STAFF' | 'PROJECT';

export interface MailFilterOption {
    id: string;
    /** Der Name im Klartext — Firma, Person, Projektname. */
    label: string;
    /** Die Nummer des Datensatzes (Projektnummer, Personalnummer); Kunden haben keine. */
    number: string | null;
    /** Ort, E-Mail oder Kunde — was die Zeile unterscheidbar macht. */
    sublabel: string | null;
}

export interface MailMessageRow {
    id: string;
    direction: MailDirection;
    origin: 'IMAP' | 'ERP' | 'OUTLOOK';
    subject: string | null;
    fromName: string | null;
    fromAddress: string | null;
    toRecipients: MailParty[];
    bodyPreview: string | null;
    sentAt: string;
    hasAttachments: boolean;
    isRead: boolean;
    customer: MailCustomerLite | null;
    contact: MailPersonLite | null;
    matchSource: 'AUTO_ADDRESS' | 'AUTO_DOMAIN' | 'MANUAL' | 'ERP' | 'REPLY' | 'AUTO_EMPLOYEE' | 'CALENDAR' | null;
    entity: MailEntityRef | null;
    owner: MailPersonLite | null;
    mine: boolean;
    category: MailCategoryLite | null;
    hasWebLink: boolean;
}

export interface MailAttachmentMeta { id?: string; name: string; size: number | null; contentType: string | null; }

export interface MailMessageDetail extends Omit<MailMessageRow, 'hasWebLink'> {
    ccRecipients: MailParty[];
    bodyText: string | null;
    /** Bereinigtes HTML (nur Formatierung) — der Lesebereich zeigt es, wenn
        vorhanden; `bodyText` bleibt der Rückfall für ältere Nachrichten. */
    bodyHtml: string | null;
    attachments: MailAttachmentMeta[] | null;
    webLink: string | null;
    conversationId: string | null;
    /** Liegt im Papierkorb. */
    deleted: boolean;
    canFetchAttachments: boolean;
    alsoLinked?: number;
}

export interface MailStatsDto { unreadInbox: number; inbox: number; sent: number; bin: number; }

export interface MailListQuery {
    folder?: MailFolder;
    /** Nachrichten EINER Kategorie (beide Richtungen). */
    categoryId?: string;
    /** Filter: die Post eines Kunden (Zuordnung oder seine Kategorie). */
    customerId?: string;
    /** Filter: die Post einer Person (Besitz, ihre Adresse in Von/An/CC, ihre Kategorie). */
    employeeId?: string;
    /** Filter: die Post eines Projekts (Belegbezug oder seine Kategorie). */
    projectId?: string;
    unread?: boolean;
    search?: string;
    entityType?: string;
    entityId?: string;
    page?: number;
    pageSize?: number;
}

export interface MailSendInput {
    to: string;
    cc?: string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
    customerId?: string | null;
    contactId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    entityLabel?: string | null;
}

export interface MailSendResult {
    ok: boolean;
    transport: 'SMTP';
    accepted: string[];
    mailMessageId?: string;
    fromEmail: string;
}

/** Eine Zeile des Adressbuchs — Kunde, Ansprechpartner oder registrierte Person. */
export interface AddressBookEntry {
    kind: 'CUSTOMER' | 'CONTACT' | 'EMPLOYEE';
    id: string;
    name: string;
    email: string;
    subtitle: string | null;
    customerId: string | null;
}

export interface MailRecipientsDto {
    customer: { id: string; companyName: string; mainEmail: string | null };
    contacts: Array<{ id: string; firstName: string; lastName: string; email: string | null; isPrimaryContact: boolean }>;
}

/** Fehlertext/-code einer Axios-Antwort ohne `any`. */
export const mailApiError = (error: unknown): { message: string | undefined; code: string | undefined } => {
    const data = (error as { response?: { data?: { error?: unknown; code?: unknown } } } | null)?.response?.data;
    return {
        message: typeof data?.error === 'string' ? data.error : undefined,
        code: typeof data?.code === 'string' ? data.code : undefined,
    };
};

const query = (params: Record<string, unknown>) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || value === false) return;
        search.set(key, value === true ? '1' : String(value));
    });
    const text = search.toString();
    return text ? `?${text}` : '';
};

export const inboxApi = {
    status: async (): Promise<InboxStatusDto> => (await apiClient.get('/mail/inbox/status')).data,
    /**
     * Abruf jetzt ausführen (der Server wartet bis ~25 s auf das Ergebnis).
     *   `dryRun` liest und entscheidet wie sonst, speichert aber NICHTS — und
     *          nennt die Absender, die an der Schranke scheitern.
     *   `reset` verwirft den Lesestand und liest den Ordner erneut vom Anfang
     *          des Fensters. NÖTIG, nachdem eine Einstellung geändert wurde:
     *          bereits gelesene Nachrichten kommen sonst nie wieder vorbei.
     */
    capture: async (options: { dryRun?: boolean; reset?: boolean } = {}): Promise<InboxStatusDto> =>
        (await apiClient.post(`/mail/inbox/capture${query({ dryRun: options.dryRun, reset: options.reset })}`, {}, { timeout: MAIL_REQUEST_TIMEOUT_MS })).data,
    update: async (input: { captureEnabled?: boolean; repliesOnly?: boolean }): Promise<InboxStatusDto> =>
        (await apiClient.patch('/mail/inbox/settings', input)).data,
};

export const mailMessagesApi = {
    list: async (params: MailListQuery): Promise<{ data: MailMessageRow[]; total: number; page: number; pageSize: number }> =>
        (await apiClient.get(`/mail/messages${query(params as Record<string, unknown>)}`)).data,
    stats: async (): Promise<MailStatsDto> => (await apiClient.get('/mail/messages/stats')).data,
    get: async (id: string): Promise<MailMessageDetail> => (await apiClient.get(`/mail/messages/${id}`)).data,
    attachments: async (id: string): Promise<{ attachments: MailAttachmentMeta[]; source: string }> =>
        (await apiClient.get(`/mail/messages/${id}/attachments`)).data,
    /** Anhang-Inhalt direkt aus Outlook (nichts wird gespeichert). */
    /** Anhang live vom Mailserver — im ERP ist er nicht gespeichert. */
    downloadAttachment: async (id: string, part: string): Promise<Blob> =>
        (await apiClient.get(`/mail/messages/${id}/attachments/${encodeURIComponent(part)}`, { responseType: 'blob', timeout: MAIL_REQUEST_TIMEOUT_MS })).data,
    suggestions: async (id: string): Promise<{ customers: Array<{ id: string; companyName: string; mainEmail: string | null; city: string | null }> }> =>
        (await apiClient.get(`/mail/messages/${id}/suggestions`)).data,
    link: async (id: string, input: { customerId: string | null; contactId?: string | null; applyToSender?: boolean }): Promise<MailMessageDetail> =>
        (await apiClient.patch(`/mail/messages/${id}`, input)).data,
    markRead: async (id: string, isRead: boolean): Promise<MailMessageDetail> =>
        (await apiClient.patch(`/mail/messages/${id}`, { isRead })).data,
    /** In den Papierkorb; aus dem Papierkorb heraus: endgültig. */
    remove: async (id: string): Promise<void> => { await apiClient.delete(`/mail/messages/${id}`); },
    restore: async (id: string): Promise<MailMessageDetail> =>
        (await apiClient.post(`/mail/messages/${id}/restore`)).data,
    /** Nachrichten einer Kategorie zuordnen (categoryId null = herausnehmen). */
    assign: async (ids: string[], categoryId: string | null): Promise<{ assigned: number }> =>
        (await apiClient.post('/mail/messages/assign', { ids, categoryId })).data,
    send: async (input: MailSendInput): Promise<MailSendResult> =>
        (await apiClient.post('/mail/messages/send', input, { timeout: MAIL_REQUEST_TIMEOUT_MS })).data,
    recipients: async (customerId: string): Promise<MailRecipientsDto> =>
        (await apiClient.get(`/mail/recipients?customerId=${encodeURIComponent(customerId)}`)).data,
    /** Vorschläge fürs Empfängerfeld — NUR Adressen, die im System stehen. */
    addressBook: async (search: string, limit = 8): Promise<{ entries: AddressBookEntry[] }> =>
        (await apiClient.get(`/mail/address-book${query({ search, limit })}`)).data,
};

export const mailFiltersApi = {
    /** Die Auswahlliste eines Filters — vollständig, serverseitig durchsucht. */
    options: async (kind: MailFilterKind, search?: string, limit = 200): Promise<{ options: MailFilterOption[] }> =>
        (await apiClient.get(`/mail/filter-options${query({ kind, search, limit })}`)).data,
};

export const mailCategoriesApi = {
    list: async (): Promise<{ categories: MailCategoryDto[] }> => (await apiClient.get('/mail/categories')).data,
    options: async (kind: MailCategoryKind, search?: string): Promise<{ options: MailCategoryOption[] }> =>
        (await apiClient.get(`/mail/categories/options${query({ kind, search })}`)).data,
    create: async (kind: MailCategoryKind, entityId: string): Promise<MailCategoryDto> =>
        (await apiClient.post('/mail/categories', { kind, entityId })).data,
    reorder: async (ids: string[]): Promise<void> => { await apiClient.patch('/mail/categories/order', { ids }); },
    remove: async (id: string): Promise<void> => { await apiClient.delete(`/mail/categories/${id}`); },
};
