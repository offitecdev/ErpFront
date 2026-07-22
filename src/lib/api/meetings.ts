import { apiClient } from '../axios';

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
    title: string;
    notes?: string | null;
    startTime: string;
    endTime: string;
    customerId?: string | null;
    customer?: { id: string; companyName: string } | null;
    createdByEmployeeId: string;
    createdBy?: { id: string; firstName: string; lastName: string } | null;
    participants: MeetingParticipantDto[];
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
    title: string;
    notes?: string | null;
    startTime: string;
    endTime: string;
    customerId?: string | null;
    participants: MeetingParticipantInput[];
}

export const meetingApi = {
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

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/meetings/${id}`);
    },
};

export const meetingParticipantName = (p: MeetingParticipantDto): string =>
    p.participantType === 'EMPLOYEE'
        ? `${p.employee?.firstName || ''} ${p.employee?.lastName || ''}`.trim()
        : p.customer?.companyName || '';
