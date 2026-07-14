import type { AppointmentWithProject, ScopedRecord, UsedMaterial } from '../types/signatureTypes';

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

/** Materials used on an appointment, derived from the tender usage + position mappings. */
export const getAppointmentUsedMaterials = (appointment: AppointmentWithProject): UsedMaterial[] => {
    const tender = appointment.salesOrder?.tender || appointment.project?.tender;
    return [
        ...((tender?.usedMaterials || []).map((usage: any) => ({
            id: `usage-${usage.id}`,
            material: usage.material,
            quantity: Number(usage.quantity || 0),
        }))),
        ...((tender?.positions || []).flatMap((position: any) =>
            (position.materialMappings || []).map((mapping: any) => ({
                id: `mapping-${mapping.id}`,
                material: mapping.material,
                quantity: Number(mapping.quantityMultiplier || 0),
            }))
        )),
    ].filter((item) => item.quantity > 0);
};
