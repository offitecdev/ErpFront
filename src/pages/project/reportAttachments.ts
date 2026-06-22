import type { SignatureAttachment } from '../../components/ui-shared/SignatureSheet';
import { t } from '@/i18n/translate';

const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(Number(value || 0));
const numberFmt = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(Number(value || 0));

const orderId = (appointment: any) => appointment.salesOrderId || appointment.salesOrder?.id || null;
const isPrimaryOrder = (appointment: any) => {
    const oid = orderId(appointment);
    return Boolean(oid && appointment.project?.salesOrders?.[0]?.id === oid);
};
const scoped = <T extends { salesOrderId?: string | null; appointmentId?: string | null }>(records: T[] | undefined, appointment: any) => {
    const oid = orderId(appointment);
    return (records || []).filter((record) => {
        if (record.appointmentId && record.appointmentId === appointment.id) return true;
        const recordOrderId = record.salesOrderId || null;
        if (oid && recordOrderId === oid) return true;
        if (isPrimaryOrder(appointment) && recordOrderId === null) return true;
        return !oid && recordOrderId === null;
    });
};

const usedMaterials = (appointment: any) => {
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

/**
 * Materials, additional materials and external expenses for an order, formatted
 * as removable attachment rows for the signature popup.
 */
export const buildOrderAttachments = (appointment: any): SignatureAttachment[] => {
    const out: SignatureAttachment[] = [];

    for (const item of usedMaterials(appointment)) {
        out.push({
            id: `used-${item.id}`,
            group: t('signatures.attach.materials'),
            label: item.material?.name || t('signatures.attach.materials'),
            detail: `${numberFmt(item.quantity)} x ${item.material?.serialId || ''}`.trim(),
        });
    }

    for (const item of scoped(appointment.project?.extraMaterials, appointment) as any[]) {
        const total = Number(item.quantity || 0) * Number(item.unitPrice || 0);
        out.push({
            id: `extra-${item.id}`,
            group: t('signatures.attach.extra'),
            label: item.material?.name || t('signatures.attach.extra'),
            detail: `${numberFmt(item.quantity)} x ${money(item.unitPrice)}`,
            amount: money(total),
        });
    }

    for (const item of scoped(appointment.project?.expenses, appointment) as any[]) {
        out.push({
            id: `expense-${item.id}`,
            group: t('signatures.attach.expenses'),
            label: item.expenseType,
            detail: item.description || undefined,
            amount: money(item.amount),
        });
    }

    return out;
};
