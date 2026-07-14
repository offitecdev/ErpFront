import dayjs from 'dayjs';

import type { InstallationAppointment } from '../hooks/useInstallationDetail';
import { personName } from './installationFormatters';
import { matchesOrderScope } from './installationScope';

export const eventStart = (appointment: InstallationAppointment) => dayjs(appointment.startTime);
export const eventEnd = (appointment: InstallationAppointment) => dayjs(appointment.endTime);

export const orderAppointments = (appointment: InstallationAppointment, availableAppointments: InstallationAppointment[] = []) => {
    const currentProjectId = appointment.projectId || appointment.project?.id || null;
    const source = [
        ...((appointment.project?.appointments || []) as InstallationAppointment[]),
        ...availableAppointments,
        appointment,
    ];
    const seen = new Set<string>();
    return source
        .filter((row) => {
            if (!row?.id || seen.has(row.id)) return false;
            const rowProjectId = row.projectId || row.project?.id || null;
            if (currentProjectId && rowProjectId && rowProjectId !== currentProjectId) return false;
            if (!matchesOrderScope(row, appointment)) return false;
            seen.add(row.id);
            return true;
        })
        .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
};

export const appointmentTechnicianNames = (appointment: InstallationAppointment) => {
    const names = [
        personName(appointment.assignedTechnician),
        ...((appointment.technicianAssignments || []).map((row) => personName(row.technician))),
    ].filter((name) => name && name !== '-');
    return Array.from(new Set(names)).join(', ') || '-';
};
