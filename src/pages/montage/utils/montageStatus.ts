import dayjs from 'dayjs';

import type { InstallationAppointment } from '@/pages/project/features/installations/hooks/useInstallationDetail';
import { findReport } from '@/pages/project/features/installations/utils/installationScope';
import type { MontageOrderListItem } from '@/types/project';

import type { MontageHighlight, MontageOrderRow, MontageStatusKey } from '../types/montage';

/** How close a start time must be (minutes) to tint the row "starting soon". */
const SOON_WINDOW_MINUTES = 120;

// Mirrors installationState(): "completed" is driven by the appointment status
// only — an attached field report never marks the montage as finished.
export const montageStatusKey = (appointment: InstallationAppointment): MontageStatusKey => {
    if (appointment.status === 'COMPLETED') {
        return findReport(appointment)?.isSigned ? 'completed' : 'awaitingSignature';
    }
    const now = dayjs();
    const start = dayjs(appointment.startTime);
    if (now.isBefore(start, 'day')) return 'pending';
    if (now.isBefore(start)) return 'startingSoon';
    return 'inProgress';
};

export const MONTAGE_STATUS_LABEL_KEY: Record<MontageStatusKey, string> = {
    pending: 'montage.status.pending',
    startingSoon: 'montage.status.startingSoon',
    inProgress: 'montage.status.inProgress',
    awaitingSignature: 'montage.status.awaitingSignature',
    completed: 'montage.status.completed',
};

/** Row tint: overdue = end time passed but never completed; soon = starts within 2 h. */
export const montageHighlight = (
    appointment: Pick<InstallationAppointment, 'startTime' | 'endTime'>,
    status: MontageStatusKey,
): MontageHighlight => {
    if (status === 'completed' || status === 'awaitingSignature') return 'none';
    const now = dayjs();
    if (appointment.endTime && now.isAfter(dayjs(appointment.endTime))) return 'overdue';
    const start = dayjs(appointment.startTime);
    if (start.isAfter(now) && start.diff(now, 'minute') <= SOON_WINDOW_MINUTES) return 'soon';
    return 'none';
};

export const toMontageOrderRow = (appointment: InstallationAppointment): MontageOrderRow => {
    const status = montageStatusKey(appointment);
    return {
        id: appointment.id,
        fieldReportId: findReport(appointment)?.id || null,
        orderNumber: appointment.salesOrder?.orderNumber || appointment.project?.projectName || appointment.id,
        projectName: appointment.project?.projectName || '-',
        customerName: appointment.project?.customer?.companyName || '-',
        start: appointment.startTime,
        end: appointment.endTime,
        status,
        highlight: montageHighlight(appointment, status),
    };
};

/**
 * Sayfalı liste ucundan gelen düz satırı tabloya çevirir. İmza durumu sunucuda
 * hesaplandığı için rapor yükü taşınmaz; durum türetimi montageStatusKey ile
 * aynı kurallardır.
 */
export const montageRowFromListItem = (item: MontageOrderListItem): MontageOrderRow => {
    let status: MontageStatusKey;
    if (item.status === 'COMPLETED') {
        status = item.signed ? 'completed' : 'awaitingSignature';
    } else {
        const now = dayjs();
        const start = dayjs(item.startTime);
        status = now.isBefore(start, 'day') ? 'pending' : now.isBefore(start) ? 'startingSoon' : 'inProgress';
    }
    const timing = {
        startTime: item.startTime,
        endTime: item.endTime,
    };
    return {
        id: item.id,
        fieldReportId: item.fieldReportId,
        orderNumber: item.orderNumber,
        projectName: item.projectName,
        customerName: item.customerName,
        start: item.startTime,
        end: item.endTime,
        status,
        highlight: montageHighlight(timing, status),
    };
};
