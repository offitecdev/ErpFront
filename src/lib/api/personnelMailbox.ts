import { apiClient, MAIL_REQUEST_TIMEOUT_MS } from '../axios';
import type { CaptureSummaryDto } from './mail';

/* PERSÖNLICHES POSTFACH JE PERSON (28.09.2026) — die Verwaltung richtet es im
   Fenster «Mail» der Personalliste ein. Ist es da, gilt für die Person überall
   nur noch dieses Konto: Versand über sein SMTP, /crm/mail zeigt nur seine Post.
   Backend: presentation/routes/employeeMailbox.routes.ts (unter /personnel/mailboxes). */

export interface PersonnelMailboxDto {
    id: string;
    isActive: boolean;
    fromName: string | null;
    fromEmail: string;
    smtpHost: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string | null;
    hasSmtpPassword: boolean;
    imapHost: string | null;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string | null;
    hasImapPassword: boolean;
    sentFolder: string | null;
    imapInboxFolder: string | null;
    imapCaptureEnabled: boolean;
    imapWindowMonths: number;
}

export interface PersonnelMailboxStatus {
    running: boolean;
    lastSyncAt: string | null;
    lastSummary: string | null;
    lastError: string | null;
    inbox: number;
    sent: number;
}

export interface PersonnelMailboxDefaults {
    smtpHost: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    imapHost: string | null;
    imapPort: number;
    imapSecure: boolean;
}

export interface PersonnelMailboxDetail {
    employee: { id: string; firstName: string; lastName: string; email: string };
    mailbox: PersonnelMailboxDto | null;
    status: PersonnelMailboxStatus | null;
    defaults: PersonnelMailboxDefaults;
}

export interface PersonnelMailboxInput {
    fromName: string;
    fromEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    /** Leer = gespeichertes behalten. */
    smtpPassword?: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPassword?: string;
    sentFolder: string;
    imapInboxFolder: string;
    imapCaptureEnabled: boolean;
    imapWindowMonths: number;
    isActive: boolean;
    /** Die Adresse auch als E-Mail der Person im System (Liste, Anmeldung). */
    useAsAccountEmail: boolean;
}

export interface PersonnelMailboxSaveResult {
    mailbox: PersonnelMailboxDto | null;
    status: PersonnelMailboxStatus | null;
    summary: CaptureSummaryDto | null;
    purgedMessages?: number;
    accountEmail?: string;
}

export interface PersonnelMailboxTestResult {
    smtp: { ok: boolean; error?: string } | null;
    imap: { ok: boolean; error?: string; messages?: number } | null;
}

export const personnelMailboxApi = {
    list: async (): Promise<Array<{ employeeId: string; fromEmail: string; isActive: boolean; imapLastError: string | null; imapLastSyncAt: string | null }>> =>
        (await apiClient.get('/personnel/mailboxes')).data.mailboxes,
    get: async (employeeId: string): Promise<PersonnelMailboxDetail> =>
        (await apiClient.get(`/personnel/mailboxes/${encodeURIComponent(employeeId)}`)).data,
    save: async (employeeId: string, input: PersonnelMailboxInput): Promise<PersonnelMailboxSaveResult> =>
        (await apiClient.put(`/personnel/mailboxes/${encodeURIComponent(employeeId)}`, input, { timeout: MAIL_REQUEST_TIMEOUT_MS })).data,
    test: async (employeeId: string, input: PersonnelMailboxInput): Promise<PersonnelMailboxTestResult> =>
        (await apiClient.post(`/personnel/mailboxes/${encodeURIComponent(employeeId)}/test`, input, { timeout: MAIL_REQUEST_TIMEOUT_MS })).data,
    restart: async (employeeId: string): Promise<PersonnelMailboxSaveResult> =>
        (await apiClient.post(`/personnel/mailboxes/${encodeURIComponent(employeeId)}/restart`, {}, { timeout: MAIL_REQUEST_TIMEOUT_MS })).data,
    remove: async (employeeId: string): Promise<void> => {
        await apiClient.delete(`/personnel/mailboxes/${encodeURIComponent(employeeId)}`);
    },
};
