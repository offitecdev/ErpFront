import { apiClient } from '../axios';
import type { PagedResult } from './crm';
import type { FormFieldDef, FormValues } from '../formFields';

/* Checklisten / Formulare / Vorlagen — Anbindung an /forms (Backend
   FormController). Listen sind SCHLANK (ohne Werte/Feldsatz); der Einzelabruf
   liefert die eingefrorenen Felder und die Werte samt Data-URLs. */

export type FormSubmissionStatus = 'DRAFT' | 'COMPLETED';
export type FormContextKind = 'customer' | 'tender' | 'salesOrder' | 'project' | 'appointment';

export interface FormTemplateDto {
    id: string;
    tenantId: string;
    name: string;
    description?: string | null;
    category?: string | null;
    fields: FormFieldDef[];
    isActive: boolean;
    createdByEmployeeId?: string | null;
    createdAt: string;
    updatedAt: string;
    /** Nur in der Liste: Felder ohne Abschnitte / bisher ausgefüllte Formulare. */
    fieldCount?: number;
    submissionCount?: number;
}

export interface FormTemplateInput {
    name: string;
    description?: string | null;
    category?: string | null;
    fields: FormFieldDef[];
    isActive?: boolean;
}

/** Schlanke Listenzeile eines ausgefüllten Formulars (mit Beschriftungen der Kette). */
export interface FormSubmissionRow {
    id: string;
    templateId: string | null;
    templateName: string;
    status: FormSubmissionStatus;
    customerId: string | null;
    customerName: string | null;
    customerLanguage?: string | null;
    tenderId: string | null;
    tenderNumber: string | null;
    salesOrderId: string | null;
    orderNumber: string | null;
    projectId: string | null;
    projectNumber: string | null;
    appointmentId: string | null;
    appointmentStart: string | null;
    /* Eine Checkliste hängt an MEHREREN Kunden (16.08.2026). Die flachen
       Felder oben tragen die ERSTE Verknüpfung (Beschriftung, PDF-Kopf), die
       Zähler und die Namenszeile hier beschreiben den ganzen Satz. */
    linkCount: number;
    customerCount: number;
    tenderCount: number;
    linkedCustomerNames: string | null;
    filledByEmployeeId: string | null;
    filledByName: string | null;
    notes: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Eine Verknüpfung einer Checkliste (Kunde + Angebot samt aufgelöster Kette). */
export interface FormSubmissionLinkDto {
    id: string;
    customerId: string | null;
    customerName: string | null;
    tenderId: string | null;
    tenderNumber: string | null;
    salesOrderId: string | null;
    orderNumber: string | null;
    projectId: string | null;
    projectNumber: string | null;
    appointmentId: string | null;
    appointmentStart: string | null;
}

export interface FormSubmissionDto extends FormSubmissionRow {
    /** Alle Verknüpfungen — nur beim Einzelabruf, die Liste zählt bloss. */
    links: FormSubmissionLinkDto[];
    templateFields: FormFieldDef[];
    values: FormValues;
}

export interface FormLinkInput {
    customerId?: string | null;
    tenderId?: string | null;
    salesOrderId?: string | null;
    projectId?: string | null;
    appointmentId?: string | null;
}

export interface FormSubmissionCreateInput extends FormLinkInput {
    templateId: string;
    /** Mehrere Kunden/Angebote auf EINER Checkliste (statt der Einzelfelder). */
    links?: FormLinkInput[];
    values?: FormValues;
    notes?: string | null;
    status?: FormSubmissionStatus;
}

export interface FormSubmissionUpdateInput extends FormLinkInput {
    /** ERSETZT den ganzen Verknüpfungssatz; weglassen lässt ihn unberührt. */
    links?: FormLinkInput[];
    values?: FormValues;
    notes?: string | null;
    status?: FormSubmissionStatus;
}

export interface FormContextDto {
    kind: FormContextKind;
    id: string;
    customerId: string | null;
    customerName: string | null;
    tenderId: string | null;
    tenderNumber: string | null;
    salesOrderId: string | null;
    orderNumber: string | null;
    projectId: string | null;
    projectNumber: string | null;
    projectName: string | null;
    appointmentId: string | null;
    appointmentStart: string | null;
    tenderIds: string[];
    salesOrderIds: string[];
}

export interface FieldNoteDto {
    id: string;
    customerId: string | null;
    projectId: string | null;
    salesOrderId: string | null;
    appointmentId: string | null;
    text: string;
    createdByEmployeeId: string | null;
    createdByName: string | null;
    createdAt: string;
    updatedAt: string;
    projectNumber?: string | null;
    orderNumber?: string | null;
}

export interface FormContextResult {
    context: FormContextDto;
    submissions: FormSubmissionRow[];
    notes: FieldNoteDto[];
}

export interface FormSubmissionListParams {
    search?: string;
    status?: FormSubmissionStatus | '';
    templateId?: string;
    customerId?: string;
    tenderId?: string;
    salesOrderId?: string;
    projectId?: string;
    appointmentId?: string;
    page?: number;
    pageSize?: number;
}

export const formsApi = {
    // Vorlagen
    listTemplates: async (params?: { search?: string; active?: boolean }): Promise<FormTemplateDto[]> => {
        const res = await apiClient.get('/forms/templates', {
            params: { search: params?.search || undefined, active: params?.active === undefined ? undefined : String(params.active) },
        });
        return res.data;
    },
    getTemplate: async (id: string): Promise<FormTemplateDto> => {
        const res = await apiClient.get(`/forms/templates/${id}`);
        return res.data;
    },
    createTemplate: async (input: FormTemplateInput): Promise<FormTemplateDto> => {
        const res = await apiClient.post('/forms/templates', input);
        return res.data;
    },
    updateTemplate: async (id: string, input: Partial<FormTemplateInput>): Promise<FormTemplateDto> => {
        const res = await apiClient.put(`/forms/templates/${id}`, input);
        return res.data;
    },
    duplicateTemplate: async (id: string): Promise<FormTemplateDto> => {
        const res = await apiClient.post(`/forms/templates/${id}/duplicate`);
        return res.data;
    },
    deleteTemplate: async (id: string): Promise<void> => {
        await apiClient.delete(`/forms/templates/${id}`);
    },

    // Kontext (eine Anfrage je Bildschirm)
    getContext: async (kind: FormContextKind, id: string): Promise<FormContextResult> => {
        const res = await apiClient.get(`/forms/context/${kind}/${encodeURIComponent(id)}`);
        return res.data;
    },

    // Ausgefüllte Formulare
    listSubmissions: async (params: FormSubmissionListParams): Promise<PagedResult<FormSubmissionRow>> => {
        const res = await apiClient.get('/forms/submissions', {
            params: Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== '')),
        });
        return res.data;
    },
    getSubmission: async (id: string): Promise<FormSubmissionDto> => {
        const res = await apiClient.get(`/forms/submissions/${id}`);
        return res.data;
    },
    createSubmission: async (input: FormSubmissionCreateInput): Promise<FormSubmissionDto> => {
        const res = await apiClient.post('/forms/submissions', input);
        return res.data;
    },
    updateSubmission: async (id: string, input: FormSubmissionUpdateInput): Promise<FormSubmissionDto> => {
        const res = await apiClient.put(`/forms/submissions/${id}`, input);
        return res.data;
    },
    deleteSubmission: async (id: string): Promise<void> => {
        await apiClient.delete(`/forms/submissions/${id}`);
    },

    // Einsatz-Hinweise
    listNotes: async (params: { projectId?: string; customerId?: string; salesOrderId?: string; appointmentId?: string }): Promise<FieldNoteDto[]> => {
        const res = await apiClient.get('/forms/notes', { params });
        return res.data;
    },
    createNote: async (input: FormLinkInput & { text: string }): Promise<FieldNoteDto> => {
        const res = await apiClient.post('/forms/notes', input);
        return res.data;
    },
    updateNote: async (id: string, text: string): Promise<FieldNoteDto> => {
        const res = await apiClient.put(`/forms/notes/${id}`, { text });
        return res.data;
    },
    deleteNote: async (id: string): Promise<void> => {
        await apiClient.delete(`/forms/notes/${id}`);
    },
};
