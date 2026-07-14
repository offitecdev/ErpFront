import dayjs from 'dayjs';

import type { DeliveryReportDto } from '@/lib/api/project';

import { cleanText, minutesBetweenValues } from './installationFormatters';

export const appointmentOrderId = (appointment: any) => appointment.salesOrderId || appointment.salesOrder?.id || null;

export const isPrimaryAppointmentOrder = (appointment: any) => {
    const orderId = appointmentOrderId(appointment);
    return Boolean(orderId && appointment.project?.salesOrders?.[0]?.id === orderId);
};

// Order-wide: every record belonging to the appointment's sales order. Used by the
// aggregate "general report", which intentionally spans all of the order's appointments.
export const matchesOrderScope = (record: any, appointment: any) => {
    if (!record) return false;
    const orderId = appointmentOrderId(appointment);
    const recordOrderId = record.salesOrderId || null;
    if (orderId && recordOrderId === orderId) return true;
    if (isPrimaryAppointmentOrder(appointment) && recordOrderId === null) return true;
    return !orderId && recordOrderId === null;
};

// Per-appointment: a record carrying an appointmentId belongs to exactly that
// appointment and must never leak onto its siblings on the same order. Legacy rows
// with no appointmentId fall back to order/day scoping.
export const matchesAppointmentScope = (record: any, appointment: any) => {
    if (!record) return false;
    if (record.appointmentId) return record.appointmentId === appointment.id;
    return matchesOrderScope(record, appointment);
};

// ── report record accessors ─────────────────────────────────────────────────
export const reportDateValue = (report: any) => report?.workDate || report?.reportDate || report?.startedAt || null;

export const operationItems = (report: any): string[] => {
    const fromItems = Array.isArray(report?.operationsDoneItems) ? report.operationsDoneItems : [];
    const rows = fromItems.length ? fromItems : cleanText(report?.operationsDone).split(/\r?\n/);
    return rows.map((item: any) => cleanText(item).replace(/^[-\s]+/, '')).filter(Boolean);
};

export const reportImageUrls = (report: any): string[] =>
    (Array.isArray(report?.images) ? report.images : []).map((image: any) => image?.imageData || image?.url || image?.imageUrl).filter(Boolean);

export const reportWorkedMinutes = (report: any) =>
    Number(report?.workedMinutes || 0) || minutesBetweenValues(report?.startedAt, report?.endedAt);

export const reportPlannedMinutes = (report: any) => Number(report?.plannedMinutesForDay || 0);
export const reportOvertimeMinutes = (report: any) => Number(report?.overtimeMinutes || 0);

export const orderFieldReports = (appointment: any) =>
    ((appointment.project?.reports || []) as any[]).filter((report) => matchesOrderScope(report, appointment));

export const orderDeliveryReports = (appointment: any, deliveryReports: DeliveryReportDto[]) =>
    (deliveryReports || []).filter((report) => matchesOrderScope(report, appointment));

const dayKey = (value?: string | null) => (value ? dayjs(value).format('YYYY-MM-DD') : '');

/** The field report captured for this appointment's day and scope, if any. */
export const findReport = (appointment?: any | null) => {
    if (!appointment?.project?.reports) return null;
    return (
        appointment.project.reports.find((report: any) => {
            const sameDay = dayKey(report.workDate || report.reportDate || report.startedAt) === dayKey(appointment.startTime);
            return sameDay && matchesAppointmentScope(report, appointment);
        }) || null
    );
};
