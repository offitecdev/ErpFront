import { apiClient, MAIL_REQUEST_TIMEOUT_MS } from '../axios';
import type { InviteSendInput, InviteSendResult } from './project';

/* Workspace "meeting activities" (meetings & lightweight tasks) with mixed
   staff/customer participants — backend module /meetings. */

export type MeetingKind = 'MEETING' | 'TASK';
export type MeetingParticipantType = 'EMPLOYEE' | 'CUSTOMER';

export interface MeetingParticipantDto {
    id: string;
    participantType: MeetingParticipantType;
    employeeId?: string | null;
    customerId?: string | null;
    employee?: { id: string; firstName: string; lastName: string; email?: string | null; roleName?: string | null } | null;
    customer?: { id: string; companyName: string; mainEmail?: string | null; mainPhone?: string | null } | null;
}

export interface MeetingActivityDto {
    id: string;
    tenantId: string;
    kind: MeetingKind;
    /** Kalender-Etikett (25.08.2026) — die Farbe der Karte im Kalender. */
    labelId?: string | null;
    title: string;
    notes?: string | null;
    ccEmails?: string[] | null;
    startTime: string;
    endTime: string;
    customerId?: string | null;
    customer?: { id: string; companyName: string; mainEmail?: string | null } | null;
    createdByEmployeeId: string;
    createdBy?: { id: string; firstName: string; lastName: string } | null;
    participants: MeetingParticipantDto[];
    /** Set once the invitation was sent via sendInvite (never on save). */
    inviteSentAt?: string | null;
    /* AUS DER MAIL ÜBERNOMMEN (21.08.2026). Gesetzt (OUTLOOK | TEAMS) heisst:
       der Eintrag kam als Einladung herein, gehört dem Organisator draussen und
       wird bei jeder neuen Fassung der Einladung nachgeführt — im ERP wird er
       darum weder verschoben noch bearbeitet. `meetingUrl` ist der
       Beitrittslink der Online-Besprechung. */
    externalOrigin?: string | null;
    externalOrganizer?: string | null;
    meetingUrl?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface MeetingParticipantInput {
    participantType: MeetingParticipantType;
    employeeId?: string | null;
    customerId?: string | null;
}

export interface MeetingActivityInput {
    kind: MeetingKind;
    /** Kalender-Etikett; fehlt es beim Anlegen, wird «Besprechung» gesetzt. */
    labelId?: string | null;
    title: string;
    notes?: string | null;
    ccEmails?: string[];
    startTime: string;
    endTime: string;
    customerId?: string | null;
    participants: MeetingParticipantInput[];
}

/* Was der Abruf beim Öffnen des Kalenders ergeben hat. `started` false nennt im
   `reason`, warum nicht gelesen wurde: not_configured (kein IMAP-Server),
   disabled (Schalter aus), running (ein Durchgang läuft schon), recent (der
   letzte liegt keine Minute zurück). `pending` heisst: er läuft noch weiter,
   die Antwort kam nur nicht darauf zurück. */
export interface MeetingSyncResult {
    started: boolean;
    reason?: 'not_configured' | 'disabled' | 'running' | 'recent' | 'error';
    error?: string;
    calendar: number;
    /** Nur beim Nachholen: übernommene Termine, die nachträglich einer Person
        zugeordnet wurden (in `calendar` bereits enthalten). */
    repaired?: number;
    pending?: boolean;
    lastSyncAt?: string | null;
}

export const meetingApi = {
    /* Einladungen aus dem Firmenpostfach nachholen. Der Kalender ruft das beim
       Öffnen auf — der Server entscheidet, ob wirklich gelesen wird. */
    sync: async (force = false): Promise<MeetingSyncResult> => {
        const res = await apiClient.post('/meetings/sync', null, {
            params: force ? { force: 1 } : undefined,
            timeout: MAIL_REQUEST_TIMEOUT_MS,
        });
        return res.data;
    },

    /* ALLE Termine des Postfachfensters nachholen (14.09.2026). `sync` liest
       nur, was seit dem letzten Durchgang dazugekommen ist — dieser Aufruf
       geht Posteingang UND Gesendet noch einmal ganz durch und trägt dabei
       auch die Zuordnung schon übernommener Termine nach. Er darf Minuten
       dauern; `pending` heisst, er lief bei der Antwort noch. */
    backfill: async (): Promise<MeetingSyncResult> => {
        const res = await apiClient.post('/meetings/backfill', null, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    list: async (start?: string, end?: string): Promise<MeetingActivityDto[]> => {
        const res = await apiClient.get('/meetings', {
            params: { ...(start ? { start } : {}), ...(end ? { end } : {}) },
        });
        return Array.isArray(res.data) ? res.data : [];
    },

    create: async (input: MeetingActivityInput): Promise<MeetingActivityDto> => {
        const res = await apiClient.post('/meetings', input);
        return res.data;
    },

    update: async (id: string, patch: Partial<MeetingActivityInput>): Promise<MeetingActivityDto> => {
        const res = await apiClient.patch(`/meetings/${id}`, patch);
        return res.data;
    },

    // "Besprechung senden": the calendar invitation leaves only through here.
    sendInvite: async (id: string, input: InviteSendInput): Promise<InviteSendResult> => {
        const res = await apiClient.post(`/meetings/${id}/send-invite`, input);
        return res.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/meetings/${id}`);
    },
};

export const meetingParticipantName = (p: MeetingParticipantDto): string =>
    p.participantType === 'EMPLOYEE'
        ? `${p.employee?.firstName || ''} ${p.employee?.lastName || ''}`.trim()
        : p.customer?.companyName || '';
