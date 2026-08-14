import type { AppointmentWithProject, ScopedRecord, UsedMaterial } from '../types/signatureTypes';
import { rowMaterial } from '../../utils/materialCompat';

/** The sales-order id an appointment belongs to, if any. */
export const getAppointmentOrderId = (appointment: AppointmentWithProject): string | null =>
    appointment.salesOrderId || appointment.salesOrder?.id || null;

/** Whether the appointment points at the project's primary (first) sales order. */
export const isPrimaryAppointmentOrder = (appointment: AppointmentWithProject): boolean => {
    const oid = getAppointmentOrderId(appointment);
    return Boolean(oid && appointment.project?.salesOrders?.[0]?.id === oid);
};

/**
 * Filter a set of order-scoped records (extra materials, expenses, …) down to
 * the ones that belong to the given appointment / its order.
 */
export const scopedAppointmentRecords = <T extends ScopedRecord>(
    records: T[] | undefined,
    appointment: AppointmentWithProject,
): T[] => {
    const oid = getAppointmentOrderId(appointment);
    return (records || []).filter((record) => {
        if (record.appointmentId && record.appointmentId === appointment.id) return true;
        const recordOrderId = record.salesOrderId || null;
        if (oid && recordOrderId === oid) return true;
        if (isPrimaryAppointmentOrder(appointment) && recordOrderId === null) return true;
        return !oid && recordOrderId === null;
    });
};

/**
 * Materials used on an appointment, derived from the tender usage rows.
 * (Position material mappings were dropped with the material/product merge
 * 2026-08-14; the rows link to Article and are adapted to the legacy shape.)
 */
export const getAppointmentUsedMaterials = (appointment: AppointmentWithProject): UsedMaterial[] => {
    const tender = appointment.salesOrder?.tender || appointment.project?.tender;
    return (tender?.usedMaterials || [])
        .map((usage: any) => ({
            id: `usage-${usage.id}`,
            material: rowMaterial(usage),
            quantity: Number(usage.quantity || 0),
        }))
        .filter((item: any) => item.quantity > 0);
};
