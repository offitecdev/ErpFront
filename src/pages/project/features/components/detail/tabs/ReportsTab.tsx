import { memo, useMemo, useState } from 'react';
import dayjs from 'dayjs';

import { ChevronRight, Clipboard as ClipboardPenLine } from '@/components/icons/antIconCompat';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { FieldReportPanel } from '../reports/FieldReportPanel';
import { InitialsAvatar } from '../../common/InitialsAvatar';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { findAppointmentReport } from '../../../utils/projectAppointments';
import { appointmentTechnicianNames } from '../../../utils/appointmentPeople';

// Field reports per appointment. The aggregate "general report" moved to its own
// sub-tab (GeneralReportTab) under the field section.
export const ReportsTab = memo(({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
    const appointments = useMemo(
        () => scopedRecords(project.appointments, order, isPrimary, project.salesOrders),
        [project.appointments, project.salesOrders, order, isPrimary],
    );
    const selectedAppt = useMemo(
        () => appointments.find((a: any) => a.id === selectedApptId) || null,
        [appointments, selectedApptId],
    );

    return (
        <>
        <Card title={t('projects.fieldSectionTitle')} icon={<ClipboardPenLine size={13} />} noPadding>
            {appointments.length === 0 ? (
                <EmptyState icon={<ClipboardPenLine size={28} />} title={t('auto.rapor_yok')} description={t('auto.bu_proje_icin_henuz_saha_raporu_girilmemis')} />
            ) : (
                <div className="divide-y divide-slate-100">
                    {appointments.map((appt: any) => {
                        const r = findAppointmentReport(project, appt);
                        const technicianNames = appointmentTechnicianNames(appt);
                        return (
                            <button
                                key={appt.id}
                                type="button"
                                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50"
                                onClick={() => setSelectedApptId(appt.id)}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <InitialsAvatar name={technicianNames.split(',')[0]} size={30} />
                                    <div className="min-w-0">
                                        <div className="font-medium text-slate-800">
                                            {dayjs(appt.startTime).format('DD.MM.YYYY')} · {dayjs(appt.startTime).format('HH:mm')} - {dayjs(appt.endTime).format('HH:mm')}
                                        </div>
                                        <div className="mt-0.5 truncate text-[11px] text-slate-500">{technicianNames}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {r ? <StatusChip variant="active">{t('projects.reportAvailable')}</StatusChip> : <span className="text-[11px] text-slate-400">{t('projects.reportUnavailable')}</span>}
                                    <ChevronRight size={14} className="text-slate-400" />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </Card>
        {selectedAppt && (
            <FieldReportPanel
                open
                project={project}
                order={order}
                appointment={selectedAppt}
                report={findAppointmentReport(project, selectedAppt)}
                materials={materials}
                onSaved={onSaved}
                onClose={() => setSelectedApptId(null)}
            />
        )}
        </>
    );
});
