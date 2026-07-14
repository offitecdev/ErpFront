import { memo, useMemo } from 'react';

import { Clipboard, Clock } from '@/components/icons/antIconCompat';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { t } from '@/i18n/translate';

import type { InstallationAppointment } from '../../hooks/useInstallationDetail';
import { eventEnd, eventStart } from '../../utils/installationAppointments';
import { installationState } from '../../utils/installationStatus';
import { findReport } from '../../utils/installationScope';
import { StatusBadge } from '../common/StatusBadge';

// Technician task list: the week's assigned installation appointments. Selecting a row
// opens its detail (assembly) screen via onOpenAppointment.
export const InstallationTaskList = memo(({
    appointments,
    loading,
    onOpenAppointment,
}: {
    appointments: InstallationAppointment[];
    loading: boolean;
    onOpenAppointment: (appointmentId: string) => void;
}) => {
    // Precompute the pure, data-derived row fields once per appointment list so the rows
    // don't re-parse dates (eventStart/eventEnd) on every unrelated re-render. The status
    // badge stays computed in render since it is relative to the current time.
    const rows = useMemo(
        () => appointments.map((appointment) => ({
            appointment,
            report: findReport(appointment),
            orderLabel: appointment.salesOrder?.orderNumber || appointment.project?.projectName,
            company: appointment.project?.customer?.companyName || '-',
            dateText: `${eventStart(appointment).format('DD.MM.YYYY HH:mm')} - ${eventEnd(appointment).format('HH:mm')}`,
        })),
        [appointments],
    );

    return (
        <Card title={t('nav.technicianInstallations')} icon={<Clipboard size={13} />} noPadding>
            {loading ? <div className="m-4 h-72 animate-pulse rounded bg-slate-100" /> : appointments.length === 0 ? (
                <EmptyState icon={<Clipboard size={32} />} title={t('projects.montaj_yok')} description={t('projects.secili_haftada_montaj_kaydi_yok')} />
            ) : (
                <div className="divide-y divide-slate-100">
                    {rows.map(({ appointment, report, orderLabel, company, dateText }) => {
                        const state = installationState(appointment, report);
                        return (
                            <button key={appointment.id} type="button" onClick={() => onOpenAppointment(appointment.id)} className="w-full px-4 py-3 text-left transition-colors hover:bg-slate-50">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-[13.5px] font-semibold text-slate-900">{orderLabel}</div>
                                        <div className="mt-1 text-[12px] text-slate-600">{company}</div>
                                        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                                            <Clock size={12} />
                                            {dateText}
                                        </div>
                                    </div>
                                    <StatusBadge label={state.label} tone={state.tone} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </Card>
    );
});
