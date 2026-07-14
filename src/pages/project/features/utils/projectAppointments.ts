import dayjs from 'dayjs';

import type { ProjectDto, ProjectSalesOrder } from '@/types/project';
import { scopedRecords } from './projectOrderScope';

export const appointmentDuration = (appointment: { startTime: string; endTime: string }) =>
    Math.max(0, dayjs(appointment.endTime).diff(dayjs(appointment.startTime), 'minute'));

export const appointmentDayKey = (value?: string | null) => (value ? dayjs(value).format('YYYY-MM-DD') : '');

export const findAppointmentReport = (
    project: ProjectDto,
    appointment: { id?: string; startTime: string; salesOrderId?: string | null },
) =>
    (project.reports || []).find((report: any) => {
        // A report stamped with an appointmentId belongs to exactly that appointment;
        // never fall through to same-day/same-order matching (which leaks the report
        // onto sibling appointments sharing the sales order). Legacy reports without
        // an appointmentId still resolve by day + order.
        if (report.appointmentId) return report.appointmentId === appointment.id;
        const sameDay = appointmentDayKey(report.workDate || report.reportDate || report.startedAt) === appointmentDayKey(appointment.startTime);
        const sameOrder = (report.salesOrderId || null) === (appointment.salesOrderId || null);
        return sameDay && sameOrder;
    }) || null;

export const hasAppointmentDayStarted = (appointment: { startTime: string }) =>
    !dayjs().isBefore(dayjs(appointment.startTime), 'day');

// A montaj is "done" only when the appointment is actually COMPLETED — not merely
// because a field report is attached. A manager can draft/attach a report while
// leaving the appointment open, so the technician keeps working and the manager can
// still finish it explicitly.
export const isAppointmentAwaitingTechnician = (_project: ProjectDto, appointment: any) =>
    appointment.status !== 'COMPLETED' && hasAppointmentDayStarted(appointment);

// The administrator can finish the montaj once it has started (now >= startTime) and it
// is not already completed; an attached (but un-finished) report does not block finishing.
export const canManagerFinishAppointment = (_project: ProjectDto, appointment: any) =>
    appointment.status !== 'COMPLETED'
    && !dayjs().isBefore(dayjs(appointment.startTime));

export const getAwaitingTechnicianAppointments = (
    project: ProjectDto,
    order: ProjectSalesOrder | null,
    isPrimary: boolean,
    orders: ProjectSalesOrder[],
) =>
    scopedRecords(project.appointments, order, isPrimary, orders).filter((appointment: any) =>
        isAppointmentAwaitingTechnician(project, appointment),
    );
