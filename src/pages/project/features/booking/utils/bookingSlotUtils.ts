import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import type { AppointmentDto } from '@/types/project';

export interface SlotDay {
    /** Stable day identifier, formatted as YYYY-MM-DD. */
    key: string;
    /** Human label: "Bugün", "Yarın" or DD.MM.YYYY. */
    label: string;
    slots: AppointmentDto[];
}

/**
 * Booking window shown to the customer: from the start of today until the end
 * of the day 21 days from now. Kept identical to the original BookingPage logic.
 */
export const getBookingRange = (): { startDate: string; endDate: string } => ({
    startDate: dayjs().startOf('day').toISOString(),
    endDate: dayjs().add(21, 'day').endOf('day').toISOString(),
});

export const formatSlotDate = (value: string): string => {
    const day = dayjs(value).startOf('day');
    const diff = day.diff(dayjs().startOf('day'), 'day');
    if (diff === 0) return t('auto.bugun');
    if (diff === 1) return t('auto.yarin');
    return dayjs(value).format('DD.MM.YYYY');
};

export const formatSlotTimeRange = (slot: AppointmentDto): string =>
    `${dayjs(slot.startTime).format('HH:mm')} - ${dayjs(slot.endTime).format('HH:mm')}`;

/**
 * Comma-separated technician names for an appointment (assigned + collaborators),
 * de-duplicated. Returns the translated "unassigned" label when none are set.
 * Mirrors the authenticated app's `appointmentTechnicianNames` without importing
 * the heavy ProjectDetail module into the public booking page.
 */
export const appointmentTechnicianNames = (appointment: AppointmentDto): string => {
    const names = new Map<string, string>();
    const add = (tech?: { id: string; firstName: string; lastName: string } | null) => {
        if (tech) names.set(tech.id, `${tech.firstName} ${tech.lastName}`.trim());
    };
    add(appointment.assignedTechnician);
    (appointment.technicianAssignments || []).forEach((assignment) => add(assignment.technician));
    return Array.from(names.values()).filter(Boolean).join(', ') || t('auto.atanmadi');
};

/** Group slots by calendar day and sort both days and per-day slots ascending. */
export const groupSlotsByDay = (slots: AppointmentDto[]): SlotDay[] => {
    const byDay = new Map<string, AppointmentDto[]>();
    for (const slot of slots) {
        const key = dayjs(slot.startTime).format('YYYY-MM-DD');
        const bucket = byDay.get(key);
        if (bucket) bucket.push(slot);
        else byDay.set(key, [slot]);
    }

    return Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, daySlots]) => ({
            key,
            label: formatSlotDate(daySlots[0].startTime),
            slots: [...daySlots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
        }));
};
