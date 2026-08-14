import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

export type CalendarView = 'week' | 'month';

export const dayKey = (value: dayjs.Dayjs | string) => dayjs(value).format('YYYY-MM-DD');

// The visible time band of the week view (same band the old day strip used).
export const SCHEDULE_START_HOUR = 6;
export const SCHEDULE_END_HOUR = 20;

// The overtime threshold is a fixed company rule, not a per-appointment choice:
// work beyond 15% of the planned duration is billed. Only the hourly rate that
// applies past that threshold is entered in the wizard.
export const FIXED_TOLERANCE_PERCENT = 15;

// Last hourly rate the user typed into the wizard, so the next appointment
// defaults to it (falls back to the project's stored rate, then 0). The minute
// price is never entered — the backend derives it as rate / 60.
export const LAST_HOURLY_RATE_STORAGE_KEY = 'ofi:lastAppointmentHourlyRate';

export const readLastHourlyRate = (project: ProjectDto): number => {
    try {
        const raw = localStorage.getItem(LAST_HOURLY_RATE_STORAGE_KEY);
        if (raw !== null && raw !== '' && Number.isFinite(Number(raw))) return Number(raw);
    } catch { /* storage unavailable — fall through to the project value */ }
    return Number(project.overtimeHourlyRate) || 0;
};

export const saveLastHourlyRate = (value: number) => {
    try {
        localStorage.setItem(LAST_HOURLY_RATE_STORAGE_KEY, String(value));
    } catch { /* storage unavailable — the default chain covers the next open */ }
};

// Minute price shown next to the hourly rate — the same division the backend
// applies when it bills overtime.
export const perMinuteRate = (hourlyRate: number) => (Number(hourlyRate) || 0) / 60;

export const rangesOverlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    aStart < bEnd && bStart < aEnd;

// Every technician id attached to an appointment (lead + assignment list).
export const appointmentTechIds = (appointment: any): string[] => {
    const ids = new Set<string>();
    if (appointment?.assignedTechId) ids.add(appointment.assignedTechId);
    if (appointment?.assignedTechnician?.id) ids.add(appointment.assignedTechnician.id);
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        const id = assignment.technicianId || assignment.technician?.id;
        if (id) ids.add(id);
    });
    return Array.from(ids);
};

const personName = (person: any) =>
    `${person?.firstName || ''} ${person?.lastName || ''}`.trim();

// All attendee names, deduped, lead first.
export const appointmentInstallerNames = (appointment: any): string[] => {
    const names = new Map<string, string>();
    if (appointment?.assignedTechnician) {
        names.set(appointment.assignedTechnician.id, personName(appointment.assignedTechnician));
    }
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        if (assignment.technician) names.set(assignment.technician.id, personName(assignment.technician));
    });
    return Array.from(names.values()).filter(Boolean);
};

// The person shown on the day table: the assembly lead — first assignee when
// several are booked, never just "whoever is responsible for the project".
export const leadInstallerName = (appointment: any): string =>
    appointmentInstallerNames(appointment)[0] || t('auto.atanmadi');

// Client label for a row: appointments from other projects carry their own
// project/customer payload; rows of the open project fall back to it.
export const appointmentClientLabel = (appointment: any, project?: ProjectDto | null): string =>
    appointment?.project?.customer?.companyName
    || appointment?.project?.projectName
    || project?.customer?.companyName
    || (project as any)?.projectName
    || appointment?.salesOrder?.orderNumber
    || '—';

export type AppointmentStatusKind = 'completed' | 'cancelled' | 'ongoing' | 'planned';

export const appointmentStatusKind = (appointment: any): AppointmentStatusKind => {
    if (appointment?.status === 'COMPLETED') return 'completed';
    if (appointment?.status === 'CANCELLED') return 'cancelled';
    // "Ongoing" = the planned window has started but the job is not finished.
    if (dayjs(appointment?.startTime).valueOf() <= Date.now()) return 'ongoing';
    return 'planned';
};

export const statusLabel = (kind: AppointmentStatusKind): string => {
    if (kind === 'completed') return t('common.completed');
    if (kind === 'cancelled') return t('common.cancel');
    if (kind === 'ongoing') return t('common.inProgress');
    return t('projects.schedule.planned');
};

export const statusBadgeClass = (kind: AppointmentStatusKind): string => {
    if (kind === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (kind === 'cancelled') return 'border-slate-200 bg-slate-50 text-slate-400 line-through';
    if (kind === 'ongoing') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-[#272f67]/20 bg-[#272f67]/[0.06] text-[#272f67]';
};
