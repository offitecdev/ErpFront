import { apiClient, getShared } from '../axios';
import { customerApi } from './customer';

/* CRM v2 API: tenant-weite Ansprechpartner-Liste, Interaktionsverlauf
   (Telefon/E-Mail/Besprechung/Notiz/Besuch aus allen Quellen), Aufgaben und
   Erinnerungen. Alle Listen sind serverseitig paginiert und geben
   `{ data, total, page, pageSize }` zurück — die Antwort ist die fertige
   Seite, kein Nachladen nötig. */

export type CommunicationChannel = 'PHONE' | 'EMAIL' | 'MEETING' | 'NOTE';
/** Typen des Interaktionsverlaufs — die vier Kanäle plus Besuch vor Ort (Kundenakte). */
export type InteractionType = CommunicationChannel | 'VISIT';
/** Woher eine Verlaufszeile stammt — entscheidet, wohin ein Löschen geht. */
export type InteractionSource = 'COMMUNICATION' | 'CUSTOMER_NOTE' | 'ACTIVITY' | 'MAIL';
/** OPEN | DONE | INCOMPLETE ("Nicht erledigt": per X oder nach verstrichenem
 *  Termin). Einen Freigabe-Zustand gibt es NICHT mehr — wer abhakt, erledigt
 *  (Vorgabe 19.08.2026). */
export type CrmTaskStatus = 'OPEN' | 'DONE' | 'INCOMPLETE';
export type CrmTaskKind = 'TASK' | 'REMINDER';

/**
 * Wessen Aufgaben — die beiden Sichten der Wochenansicht. Ein "alles" gibt es
 * an der Oberfläche nicht mehr (Vorgabe 19.08.2026); `mine` ist der Altwert
 * (beides zusammen) für die Personal- und Kundenakte.
 */
export type CrmTaskScope = 'me' | 'by' | 'mine';

export interface PagedResult<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
}

/**
 * Antwort der Massenanlagen — Teilerfolg ist erlaubt: `createdCount` Zeilen
 * sind geschrieben, `errors` nennt die abgelehnten. `index` zählt innerhalb
 * des GESCHICKTEN Feldes, damit der Aufrufer genau die Zeile wiederfindet
 * (gleicher Vertrag wie die Lager-Massenanlage).
 */
export interface BulkResult {
    createdCount: number;
    errors: Array<{ index: number; error: string }>;
}

export interface CrmContactRow {
    id: string;
    customerId: string;
    firstName: string;
    lastName: string;
    title?: string | null;
    phone?: string | null;
    mobilePhone?: string | null;
    email?: string | null;
    isPrimaryContact: boolean;
    customer: { id: string; companyName: string };
}

/** Person in der Kurzform der Listen (Ansprechpartner, Mitarbeiter). */
export interface CrmPersonLite {
    id: string;
    firstName: string;
    lastName: string;
}

/* Die Schreib-Endpunkte antworten mit der BLANKEN Zeile (ohne Kunde/
   Ansprechpartner/Mitarbeiter): jeder Aufrufer lädt die Liste danach ohnehin
   neu, und das Nachladen der drei Beziehungen kostete auf dem Server drei
   zusätzliche Runden zur entfernten Datenbank. */

export interface CrmCommunicationRecord {
    id: string;
    customerId: string;
    contactId?: string | null;
    channel: CommunicationChannel;
    note: string;
    occurredAt: string;
    createdByEmployeeId: string;
    createdAt: string;
}

export interface CrmCommunicationRow extends CrmCommunicationRecord {
    customer: { id: string; companyName: string };
    contact?: CrmPersonLite | null;
    createdBy: CrmPersonLite;
}

/**
 * Eine Zeile des Interaktionsverlaufs — vereinte Sicht über
 * CrmCommunication, CustomerNote und CustomerActivity. `key` ist über alle
 * Quellen eindeutig (`source:id`); `source` + `customerId` braucht das Löschen.
 */
export interface CrmInteractionRow {
    key: string;
    source: InteractionSource;
    id: string;
    customerId: string;
    type: InteractionType;
    note: string;
    occurredAt: string;
    /** Nur Notizen der Kundenakte: als "Wichtig" markiert. */
    isHighlight: boolean;
    /** Ursprüngliche Aktivitätsart der Kundenakte (z. B. OFFER_MAIL_SENT). */
    rawType: string | null;
    customer: { id: string; companyName: string };
    contact?: CrmPersonLite | null;
    createdBy?: CrmPersonLite | null;
    /** Nur Quelle MAIL (Outlook-Sync / ERP-Sendung): Betreff, Richtung, Absender. */
    mail?: { subject: string | null; direction: 'IN' | 'OUT' | null; from: string | null; hasWebLink: boolean; entityLabel: string | null } | null;
}

export interface CrmTaskRecord {
    id: string;
    kind: CrmTaskKind;
    title: string;
    /** Kalender-Etikett (25.08.2026) — die Farbe der Karte im Kalender. */
    labelId?: string | null;
    customerId?: string | null;
    contactId?: string | null;
    /** Erste Verantwortliche (Altspalte); die vollständige Liste steht in `assignees`. */
    assigneeEmployeeId?: string | null;
    /**
     * ANFANG der Aufgabe (11.09.2026). `dueDate` ist ihr ENDE — eine Aufgabe
     * darf sich über mehrere Tage ziehen. Fehlt `startAt`, ist sie eintägig
     * und beginnt mit ihrem Ende.
     */
    startAt?: string | null;
    /** Ganztägig: dann zeigt die Oberfläche keine Uhrzeiten. */
    allDay?: boolean;
    dueDate?: string | null;
    /** Verknüpfte Offerte — genauso freiwillig wie der Kunde. */
    tenderId?: string | null;
    status: CrmTaskStatus;
    completedAt?: string | null;
    createdByEmployeeId?: string;
    createdAt: string;
    /** Nur bei Erinnerungen aus dem Hintergrunddienst gesetzt. */
    linkUrl?: string | null;
    meta?: unknown;
    /** Beleg hinter einer Erinnerung des Hintergrunddienstes (QUOTE | ORDER). */
    entityType?: string | null;
    entityId?: string | null;
}

export interface CrmTaskRow extends CrmTaskRecord {
    customer?: { id: string; companyName: string } | null;
    contact?: CrmPersonLite | null;
    assignee?: CrmPersonLite | null;
    /** Alle Verantwortlichen (mehrere möglich, 18.08.2026). */
    assignees: CrmPersonLite[];
    /** Die ZUWEISENDE Person — ihr Name steht auf der Karte. */
    createdBy: CrmPersonLite;
    tender?: CrmTaskTenderLite | null;
    noteCount?: number;
    /** Anhänge und Anleitung als ZAHLEN — die Liste lädt ihren Inhalt nicht. */
    documentCount?: number;
    stepCount?: number;
    stepDoneCount?: number;
}

/** Die verknüpfte Offerte, so knapp wie die Karte sie braucht. */
export interface CrmTaskTenderLite {
    id: string;
    tenderNumber: string;
}

/** Ein Schritt der Anleitung (freiwillig, 11.09.2026). */
export interface CrmTaskStep {
    id: string;
    position: number;
    text: string;
    done: boolean;
}

/**
 * Ein Anhang der Aufgabe — Bild ODER PDF. Die Liste trägt Name, Art und
 * Grösse; der INHALT kommt erst beim Öffnen (`getTaskDocument`).
 */
export interface CrmTaskDocument {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    createdAt: string;
    uploadedBy?: CrmPersonLite | null;
}

/** Notiz an einer Aufgabe — Text und Bilder (Daten-URLs). */
export interface CrmTaskNote {
    id: string;
    text: string;
    images: string[];
    createdAt: string;
    author: CrmPersonLite | null;
}

/** Die Aufgabenseite (/crm/tasks/:id). */
export interface CrmTaskDetail {
    id: string;
    kind: CrmTaskKind;
    title: string;
    status: CrmTaskStatus;
    startAt?: string | null;
    allDay?: boolean;
    dueDate?: string | null;
    completedAt?: string | null;
    createdAt: string;
    createdByEmployeeId: string;
    customer?: { id: string; companyName: string } | null;
    contact?: CrmPersonLite | null;
    tenderId?: string | null;
    tender?: CrmTaskTenderLite | null;
    createdBy: CrmPersonLite;
    assignees: CrmPersonLite[];
    notes: CrmTaskNote[];
    /* Anleitung und Anhänge kommen MIT der Karte (11.09.2026) — sie werden im
       selben Fenster gezeigt, und drei Netzwege für ein Popup, das man im
       Tagesbetrieb ständig auf- und zuklappt, wären zwei zu viel. */
    steps: CrmTaskStep[];
    documents: CrmTaskDocument[];
}

/** Eine fällige Erinnerung, wie sie das Einblendfenster braucht. */
export interface DueReminder {
    id: string;
    title: string;
    dueDate: string;
    customerId: string | null;
    customerName: string | null;
    /** Sprungziel ("Öffnen") — der Beleg, um den es geht. */
    linkUrl: string | null;
    /** Sprachneutrale Bausteine des Titels (lib/notificationText.ts baut den Satz). */
    meta: unknown;
}

export interface TaskWriteBody {
    title: string;
    customerId?: string | null;
    contactId?: string | null;
    /** Alt (eine Person) — neue Aufrufer schicken `assigneeEmployeeIds`. */
    assigneeEmployeeId?: string | null;
    assigneeEmployeeIds?: string[];
    startAt?: string | null;
    allDay?: boolean;
    dueDate?: string | null;
    tenderId?: string | null;
    /** Die Anleitung reist MIT der Anlage; die Anhänge kommen als Dateien nach. */
    steps?: Array<{ text: string; done?: boolean }>;
    kind?: CrmTaskKind;
    /** Kalender-Etikett; fehlt es beim Anlegen, wird «Aufgabe» gesetzt. */
    labelId?: string | null;
}

const toQuery = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const raw = search.toString();
    return raw ? `?${raw}` : '';
};

export const crmApi = {
    listContacts: (params: { search?: string; customerId?: string; page?: number; pageSize?: number }) =>
        getShared<PagedResult<CrmContactRow>>(`/crm/contacts${toQuery(params)}`).then((r) => r.data),

    /** Der Interaktionsverlauf — alle Quellen, nach Typ beschriftet. */
    listInteractions: (params: {
        customerId?: string;
        type?: InteractionType | '';
        employeeId?: string;
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
    }) => getShared<PagedResult<CrmInteractionRow>>(`/crm/interactions${toQuery(params)}`).then((r) => r.data),

    /**
     * Löschen einer Verlaufszeile geht an die Quelle, aus der sie stammt — die
     * drei Tabellen behalten ihre eigenen Endpunkte und Rechte.
     */
    deleteInteraction: (row: Pick<CrmInteractionRow, 'source' | 'id' | 'customerId'>): Promise<void> => {
        if (row.source === 'CUSTOMER_NOTE') return customerApi.deleteNote(row.customerId, row.id).then(() => undefined);
        if (row.source === 'ACTIVITY') return customerApi.deleteActivity(row.customerId, row.id).then(() => undefined);
        // Mail-Zeilen: nur der ERP-Eintrag geht — Outlook bleibt unberührt.
        if (row.source === 'MAIL') return apiClient.delete(`/mail/messages/${row.id}`).then(() => undefined);
        return apiClient.delete(`/crm/communications/${row.id}`).then(() => undefined);
    },

    listCommunications: (params: {
        customerId?: string;
        channel?: CommunicationChannel | '';
        employeeId?: string;
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
    }) => getShared<PagedResult<CrmCommunicationRow>>(`/crm/communications${toQuery(params)}`).then((r) => r.data),

    createCommunication: (body: {
        customerId: string;
        contactId?: string | null;
        channel: CommunicationChannel;
        note: string;
        occurredAt?: string;
    }) => apiClient.post<CrmCommunicationRecord>('/crm/communications', body).then((r) => r.data),

    updateCommunication: (id: string, body: Partial<{ channel: CommunicationChannel; note: string; occurredAt: string; contactId: string | null }>) =>
        apiClient.patch<CrmCommunicationRecord>(`/crm/communications/${id}`, body).then((r) => r.data),

    /** Tabellen-Erfassung: alle Zeilen in EINER Anfrage. */
    bulkCreateCommunications: (entries: Array<{
        customerId: string;
        contactId?: string | null;
        channel: CommunicationChannel;
        note: string;
        occurredAt?: string;
    }>) => apiClient.post<BulkResult>('/crm/communications/bulk', { entries }).then((r) => r.data),

    deleteCommunication: (id: string) => apiClient.delete(`/crm/communications/${id}`).then(() => undefined),

    listTasks: (params: {
        status?: CrmTaskStatus | '';
        kind?: CrmTaskKind | '';
        customerId?: string;
        assigneeId?: string;
        /* MEHRERE Personen bzw. Kunden als Komma-Liste (11.09.2026). Leer
           heisst alle — ein Filter, dessen Grundzustand «alle» ist, schickt
           gar nichts. Die Einzahl-Felder darüber bleiben für Aufrufer, die
           genau einen meinen (Kundenakte, Personalakte). */
        assigneeIds?: string;
        customerIds?: string;
        /** Wessen Aufgaben — jede der drei Sichten ist auth-only. */
        scope?: CrmTaskScope | '';
        /** Terminfenster [from, to) als ISO-Zeitpunkte (die Woche der Ansicht).
            Aufgaben OHNE Termin kommen in jedem Fenster mit. */
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
    }) => getShared<PagedResult<CrmTaskRow>>(`/crm/tasks${toQuery(params)}`).then((r) => r.data),

    getTask: (id: string) => apiClient.get<CrmTaskDetail>(`/crm/tasks/${id}`).then((r) => r.data),

    addTaskNote: (id: string, body: { text: string; images?: string[] }) =>
        apiClient.post<CrmTaskNote>(`/crm/tasks/${id}/notes`, body).then((r) => r.data),
    deleteTaskNote: (id: string, noteId: string) => apiClient.delete(`/crm/tasks/${id}/notes/${noteId}`).then(() => undefined),

    /** Die ganze Anleitung auf einmal — die Liste ist kurz und wird als Block bearbeitet. */
    saveTaskSteps: (id: string, steps: Array<{ text: string; done?: boolean }>) =>
        apiClient.put<CrmTaskStep[]>(`/crm/tasks/${id}/steps`, { steps }).then((r) => r.data),

    /** EIN Häkchen — der Griff des Alltags bekommt seinen eigenen Weg. */
    setTaskStepDone: (id: string, stepId: string, done: boolean) =>
        apiClient.patch<CrmTaskStep>(`/crm/tasks/${id}/steps/${stepId}`, { done }).then((r) => r.data),

    /**
     * Anhänge (Bild UND PDF) — alle in EINER Sendung und ROH als multipart:
     * Base64 in einem JSON-Körper wäre ein Drittel grösser und müsste zweimal
     * umkodiert werden. Zurück kommt die vollständige Liste der Aufgabe.
     */
    addTaskDocuments: (id: string, files: File[]) => {
        const form = new FormData();
        files.forEach((file) => form.append('files', file, file.name));
        // Grosszügiger Zeitrahmen: zehn Bilder aus einer Handykamera sind
        // schnell 30 MB, und die Standardgrenze des Klienten ist auf kurze
        // JSON-Antworten gemünzt.
        return apiClient
            .post<CrmTaskDocument[]>(`/crm/tasks/${id}/documents`, form, { timeout: 120_000 })
            .then((r) => r.data);
    },

    /** Der INHALT eines Anhangs (Daten-URI) — erst beim Öffnen. */
    getTaskDocument: (documentId: string) =>
        apiClient.get<CrmTaskDocument & { data: string }>(`/crm/tasks/documents/${documentId}`).then((r) => r.data),

    deleteTaskDocument: (documentId: string) =>
        apiClient.delete(`/crm/tasks/documents/${documentId}`).then(() => undefined),

    createTask: (body: TaskWriteBody) => apiClient.post<CrmTaskRecord>('/crm/tasks', body).then((r) => r.data),

    updateTask: (id: string, body: Partial<TaskWriteBody & { status: CrmTaskStatus }>) =>
        apiClient.patch<CrmTaskRecord>(`/crm/tasks/${id}`, body).then((r) => r.data),

    bulkCreateTasks: (entries: TaskWriteBody[]) =>
        apiClient.post<BulkResult>('/crm/tasks/bulk', { entries }).then((r) => r.data),

    deleteTask: (id: string) => apiClient.delete(`/crm/tasks/${id}`).then(() => undefined),

    /** Fällige Erinnerungen der angemeldeten Person (Wecker der Oberfläche). */
    listDueReminders: () => apiClient.get<DueReminder[]>('/crm/reminders/due').then((r) => r.data),

    /** Gezeigte Erinnerungen stempeln, damit sie nicht erneut aufpoppen. */
    ackReminders: (ids: string[]) =>
        apiClient.post<{ acknowledged: number }>('/crm/reminders/ack', { ids }).then((r) => r.data),

    /**
     * Erinnerungen ENDGÜLTIG schliessen (= löschen; nur die eigenen). Das X am
     * Einblendfenster ruft das — auth-only, braucht keine CRM-Rechte.
     */
    dismissReminders: (ids: string[]) =>
        apiClient.post<{ dismissed: number }>('/crm/reminders/dismiss', { ids }).then((r) => r.data),
};
