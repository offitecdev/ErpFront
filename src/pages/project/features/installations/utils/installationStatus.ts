import dayjs from 'dayjs';

import { t } from '@/i18n/translate';

import type { InstallationAppointment } from '../hooks/useInstallationDetail';
import { eventStart } from './installationAppointments';

export const installationState = (appointment: InstallationAppointment, report: any) => {
    // "Completed" is driven by the appointment status only — a field report being
    // attached (e.g. drafted by a manager) does NOT mean the montaj is finished. It is
    // done when a technician finishes it or an administrator marks it complete.
    if (appointment.status === 'COMPLETED') return { label: report?.isSigned ?t('projects.bitti') :t('projects.imza_bekliyor'), tone: 'emerald' };
    if (dayjs().isBefore(eventStart(appointment), 'day')) return { label:t('projects.daha_baslamadi'), tone: 'slate' };
    if (dayjs().isBefore(eventStart(appointment))) return { label:t('projects.bugun_baslayacak'), tone: 'amber' };
    return { label:t('projects.basladi'), tone: 'blue' };
};
