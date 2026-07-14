import { memo, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { ChevronRight, Clipboard as ClipboardPenLine, FileDownload02 as FileDown } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { FieldReportPanel } from '../reports/FieldReportPanel';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { findAppointmentReport } from '../../../utils/projectAppointments';
// appointmentTechnicianNames stays in ProjectDetail.tsx (shared with staying components);
// referenced only at render time, so this back-import is safe despite the module cycle.
import { appointmentTechnicianNames } from '../../../../ProjectDetail';

export const ReportsTab = memo(({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
    const [genBusy, setGenBusy] = useState(false);
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
        <Card
            title={t('projects.fieldSectionTitle')}
            icon={<ClipboardPenLine size={13} />}
            noPadding
            actions={
                <Button
                    variant="secondary"
                    size="sm"
                    icon={<FileDown size={13} />}
                    loading={genBusy}
                    disabled={(project.reports || []).length === 0}
                    onClick={async () => {
                        // Directly produce the signed aggregate of all field reports
                        // up to now — no custom date-range selection.
                        setGenBusy(true);
                        try {
                            const { exportProjectGeneralReportPdf } = await import('@/utils/pdf/projectReportPdf');
                            await exportProjectGeneralReportPdf(project);
                            toast.success(t('auto.genel_saha_raporu_olusturuldu'));
                        } catch (e: any) {
                            toast.error(e?.message || t('auto.genel_rapor_olusturulamadi'));
                        } finally {
                            setGenBusy(false);
                        }
                    }}
                >{t('auto.genel_rapor_al')}</Button>
            }
        >
            {appointments.length === 0 ? (
                <EmptyState icon={<ClipboardPenLine size={28} />} title={t('auto.rapor_yok')} description={t('auto.bu_proje_icin_henuz_saha_raporu_girilmemis')} />
            ) : (
                <div className="divide-y divide-slate-100">
                    {appointments.map((appt: any) => {
                        const r = findAppointmentReport(project, appt);
                        return (
                            <button
                                key={appt.id}
                                type="button"
                                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50/60"
                                onClick={() => setSelectedApptId(appt.id)}
                            >
                                <div>
                                    <div className="font-medium text-slate-800">
                                        {dayjs(appt.startTime).format('DD.MM.YYYY')} · {dayjs(appt.startTime).format('HH:mm')} - {dayjs(appt.endTime).format('HH:mm')}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-500">{appointmentTechnicianNames(appt)}</div>
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
