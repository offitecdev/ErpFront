import { memo, useMemo, useState } from 'react';
import dayjs from 'dayjs';

import { Edit01 as PenLine, File05 as FilePdf, File05 as FileText } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { AllSignaturesSheet } from '../reports/AllSignaturesSheet';
import { AppointmentReportSheet } from '../reports/AppointmentReportSheet';
import { OrderReportsSheet } from '../reports/OrderReportsSheet';
import { appointmentStatusKind, statusLabel } from '../booking/schedule/scheduleShared';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { findAppointmentReport } from '../../../utils/projectAppointments';

/**
 * The consolidated "Reports" section: appointments in two clean lists (ongoing /
 * completed, tender-table styling — appointment times instead of technician
 * names, no appointment colors). Each row carries a PDF glyph (dimmed until a
 * field report exists); clicking a row opens the square bottom-sheet where the
 * whole flow — field report, delivery checklist, signatures, PDFs — slides
 * sideways inside one popup.
 */
export const ReportsTab = memo(({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
    const [sheetInitialView, setSheetInitialView] = useState<'overview' | 'pdf'>('overview');
    const [signaturesOpen, setSignaturesOpen] = useState(false);
    const [orderReportsOpen, setOrderReportsOpen] = useState(false);

    const appointments = useMemo(
        () => scopedRecords(project.appointments, order, isPrimary, project.salesOrders)
            .sort((a: any, b: any) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf()),
        [project.appointments, project.salesOrders, order, isPrimary],
    );
    const ongoing = appointments.filter((a: any) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED');
    const completed = appointments.filter((a: any) => a.status === 'COMPLETED' || a.status === 'CANCELLED');

    const selectedAppt = useMemo(
        () => appointments.find((a: any) => a.id === selectedApptId) || null,
        [appointments, selectedApptId],
    );

    const orderNumberFor = (salesOrderId: string | null | undefined) =>
        (project.salesOrders || []).find((o) => o.id === (salesOrderId || null))?.orderNumber
        || order?.orderNumber
        || '—';

    const openSheet = (appointmentId: string, view: 'overview' | 'pdf') => {
        setSheetInitialView(view);
        setSelectedApptId(appointmentId);
    };

    const AppointmentTable = ({ rows }: { rows: any[] }) => (
        <table data-montage-table data-unstyled-table className="w-full">
            <thead>
                <tr>
                    <th className="w-28 text-left">{t('common.date')}</th>
                    <th className="w-36 text-left">{t('projects.schedule.time')}</th>
                    <th className="text-left">{t('projects.reportsHub.order')}</th>
                    <th className="w-40 text-left">{t('projects.reportsHub.fieldSection')}</th>
                    <th className="w-28 text-left">{t('common.status')}</th>
                    <th className="w-14 text-right" />
                </tr>
            </thead>
            <tbody>
                {rows.map((appt: any) => {
                    const report = findAppointmentReport(project, appt);
                    const kind = appointmentStatusKind(appt);
                    return (
                        <tr
                            key={appt.id}
                            onClick={() => openSheet(appt.id, 'overview')}
                            className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                            <td className="text-[12.5px] font-semibold tabular-nums text-slate-800">{dayjs(appt.startTime).format('DD.MM.YYYY')}</td>
                            <td className="text-[12.5px] tabular-nums text-slate-700">{dayjs(appt.startTime).format('HH:mm')} – {dayjs(appt.endTime).format('HH:mm')}</td>
                            <td className="text-[12.5px] text-slate-600">{orderNumberFor(appt.salesOrderId)}</td>
                            <td>
                                {report
                                    ? <StatusChip variant={report.isSigned ? 'active' : 'info'}>{report.isSigned ? t('projects.reportsHub.signed') : t('projects.reportAvailable')}</StatusChip>
                                    : <span className="text-[11.5px] text-slate-400">{t('projects.reportUnavailable')}</span>}
                            </td>
                            <td className="text-[12px] text-slate-600">{statusLabel(kind)}</td>
                            <td>
                                {/* PDF glyph: lit when a field report exists, dimmed until then. */}
                                <div className="flex items-center justify-end">
                                    <button
                                        type="button"
                                        title={report ? t('projects.reportsHub.preview') : t('projects.reportUnavailable')}
                                        aria-label={t('projects.reportsHub.preview')}
                                        disabled={!report}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            openSheet(appt.id, 'pdf');
                                        }}
                                        className={`inline-flex size-7 items-center justify-center rounded-[2px] border transition-colors ${report ? 'ofi-rs-pdf' : 'ofi-rs-pdf-dim cursor-default'}`}
                                    >
                                        <FilePdf size={14} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    const SectionCard = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
        <section className="overflow-hidden rounded-[3px] border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <span className="text-[12.5px] font-semibold text-slate-800">{title}</span>
                {action}
            </header>
            {children}
        </section>
    );

    return (
        <div className="space-y-4">
            {/* Toolbar only — no section heading text. */}
            <div className="flex items-center justify-end gap-1.5">
                <Button variant="secondary" size="sm" icon={<FileText size={13} />} onClick={() => setOrderReportsOpen(true)}>
                    {t('projects.reportsHub.orderReports')}
                </Button>
                <Button variant="secondary" size="sm" icon={<PenLine size={13} />} onClick={() => setSignaturesOpen(true)}>
                    {t('nav.signatures')}
                </Button>
            </div>

            {appointments.length === 0 ? (
                <EmptyState title={t('projects.reportsHub.noAppointments')} description={t('auto.bu_proje_icin_henuz_saha_raporu_girilmemis')} />
            ) : (
                <>
                    <SectionCard title={t('projects.reportsHub.ongoing')}>
                        {ongoing.length === 0
                            ? <div className="px-3 py-4 text-center text-[12px] text-slate-400">{t('projects.reportsHub.noAppointments')}</div>
                            : <AppointmentTable rows={ongoing} />}
                    </SectionCard>

                    <SectionCard title={t('projects.reportsHub.completed')}>
                        {completed.length === 0
                            ? <div className="px-3 py-4 text-center text-[12px] text-slate-400">{t('projects.reportsHub.noAppointments')}</div>
                            : <AppointmentTable rows={completed} />}
                    </SectionCard>
                </>
            )}

            {/* Sheets — everything mounts only while open, so the tab stays light. */}
            {selectedAppt && (
                <AppointmentReportSheet
                    open
                    project={project}
                    order={order}
                    appointment={selectedAppt}
                    report={findAppointmentReport(project, selectedAppt)}
                    materials={materials}
                    initialView={sheetInitialView}
                    onSaved={onSaved}
                    onClose={() => setSelectedApptId(null)}
                />
            )}
            <AllSignaturesSheet open={signaturesOpen} project={project} onClose={() => setSignaturesOpen(false)} />
            <OrderReportsSheet open={orderReportsOpen} project={project} order={order} onClose={() => setOrderReportsOpen(false)} />
        </div>
    );
});
