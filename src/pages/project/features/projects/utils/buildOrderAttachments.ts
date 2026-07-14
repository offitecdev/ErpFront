import { t } from '@/i18n/translate';

import type { AppointmentWithProject, SignatureAttachment } from '../types/signatureTypes';
import { getAppointmentUsedMaterials, scopedAppointmentRecords } from './orderAttachmentScope';
import { money, numberFmt } from './signatureFormatters';
import { displayExpenseType } from '../../utils/projectFormatters';

/** Materials consumed on the order, as attachment rows. */
const buildUsedMaterialAttachments = (appointment: AppointmentWithProject): SignatureAttachment[] =>
    getAppointmentUsedMaterials(appointment).map((item) => ({
        id: `used-${item.id}`,
        group: t('signatures.attach.materials'),
        label: item.material?.name || t('signatures.attach.materials'),
        detail: `${numberFmt(item.quantity)} x ${item.material?.serialId || ''}`.trim(),
    }));

/** Additional (non-tender) materials booked against the order, as attachment rows. */
const buildExtraMaterialAttachments = (appointment: AppointmentWithProject): SignatureAttachment[] =>
    scopedAppointmentRecords<any>(appointment.project?.extraMaterials, appointment).map((item) => {
        const total = Number(item.quantity || 0) * Number(item.unitPrice || 0);
        return {
            id: `extra-${item.id}`,
            group: t('signatures.attach.extra'),
            label: item.material?.name || t('signatures.attach.extra'),
            detail: `${numberFmt(item.quantity)} x ${money(item.unitPrice)}`,
            amount: money(total),
        };
    });

/** External expenses booked against the order, as attachment rows. */
const buildExpenseAttachments = (appointment: AppointmentWithProject): SignatureAttachment[] =>
    scopedAppointmentRecords<any>(appointment.project?.expenses, appointment).map((item) => ({
        id: `expense-${item.id}`,
        group: t('signatures.attach.expenses'),
        label: displayExpenseType(item.expenseType),
        detail: item.description || undefined,
        amount: money(item.amount),
    }));

/**
 * Materials, additional materials and external expenses for an order, formatted
 * as removable attachment rows for the signature popup.
 */
export const buildOrderAttachments = (appointment: AppointmentWithProject): SignatureAttachment[] => [
    ...buildUsedMaterialAttachments(appointment),
    ...buildExtraMaterialAttachments(appointment),
    ...buildExpenseAttachments(appointment),
];
