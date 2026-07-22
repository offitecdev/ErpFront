import dayjs from 'dayjs';

import { t } from '@/i18n/translate';

// Form state used by the appointment scheduler (create + edit).
export const appointmentToForm = (appointment?: any) => ({
    id: appointment?.id || '',
    assignedTechId: appointment?.assignedTechId || '',
    technicianIds: appointment ? appointmentTechnicianIds(appointment) : [],
    date: appointment ? dayjs(appointment.startTime).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    start: appointment ? dayjs(appointment.startTime).format('HH:mm') : '09:00',
    end: appointment ? dayjs(appointment.endTime).format('HH:mm') : '17:00',
    notes: appointment?.notes || '',
});

export const appointmentTechnicianIds = (appointment: any) => {
    const ids = new Set<string>();
    if (appointment?.assignedTechId) ids.add(appointment.assignedTechId);
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        if (assignment.technicianId) ids.add(assignment.technicianId);
    });
    return Array.from(ids);
};

export const appointmentTechnicianNames = (appointment: any) => {
    const names = new Map<string, string>();
    if (appointment?.assignedTechnician) {
        names.set(appointment.assignedTechnician.id, `${appointment.assignedTechnician.firstName} ${appointment.assignedTechnician.lastName}`.trim());
    }
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        if (assignment.technician) {
            names.set(assignment.technician.id, `${assignment.technician.firstName} ${assignment.technician.lastName}`.trim());
        }
    });
    return Array.from(names.values()).filter(Boolean).join(', ') || t('auto.atanmadi');
};
