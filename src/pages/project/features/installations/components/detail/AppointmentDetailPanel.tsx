import { memo, useMemo } from 'react';

import { Clock } from '@/components/icons/antIconCompat';
import type { DeliveryReportDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

import type { InstallationAppointment } from '../../hooks/useInstallationDetail';
import { appointmentTechnicianNames, eventEnd, eventStart } from '../../utils/installationAppointments';
import { cleanLabel, durationFmt, timeFmt } from '../../utils/installationFormatters';
import {
    findReport,
    matchesAppointmentScope,
    operationItems,
    orderDeliveryReports,
    reportImageUrls,
    reportOvertimeMinutes,
    reportPlannedMinutes,
    reportWorkedMinutes,
} from '../../utils/installationScope';
import { OvertimeStat } from '../common/OvertimeStat';

// Right-hand detail for a single appointment in the general-report table.
export const AppointmentDetailPanel = memo(({ appointment, deliveryReports }: { appointment: InstallationAppointment; deliveryReports: DeliveryReportDto[] }) => {
    const report = useMemo(() => findReport(appointment), [appointment]);
    const deliveries = useMemo(
        () => orderDeliveryReports(appointment, deliveryReports).filter((d) => matchesAppointmentScope(d, appointment)),
        [appointment, deliveryReports],
    );
    const ops = useMemo(() => (report ? operationItems(report) : []), [report]);
    const imgs = useMemo(() => (report ? reportImageUrls(report) : []), [report]);
    const overtime = report ? reportOvertimeMinutes(report) : 0;
    return (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
            <div>
                <div className="font-mono text-[11px] font-semibold text-slate-500">{appointment.salesOrder?.orderNumber ? localizeTenderNumbersInText(appointment.salesOrder.orderNumber) : '-'}</div>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900"><Clock size={12} />{eventStart(appointment).format('DD.MM.YYYY HH:mm')} - {eventEnd(appointment).format('HH:mm')}</div>
                <div className="mt-1 text-[12px] text-slate-600">{appointmentTechnicianNames(appointment)}</div>
            </div>
            {!report ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-5 text-center text-[12px] text-slate-500">{t('projects.henuz_bitmedi')}</div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <OvertimeStat label={`${t('common.start')}/${t('common.end')}`} value={`${timeFmt(report.startedAt)}-${timeFmt(report.endedAt)}`} />
                        <OvertimeStat label={t('common.total')} value={durationFmt(reportWorkedMinutes(report))} />
                        <OvertimeStat label={cleanLabel(t('projects.planlanan'))} value={durationFmt(reportPlannedMinutes(report))} />
                        <OvertimeStat label={cleanLabel(t('projects.fazla_calisma'))} value={durationFmt(overtime)} tone={overtime > 0 ? 'amber' : undefined} />
                    </div>
                    <div>
                        <div className="mb-1 text-[11.5px] font-semibold text-slate-600">{t('projects.yapilan_isler')}</div>
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700">
                            {ops.length ? <ul className="list-disc space-y-0.5 pl-4">{ops.map((o, i) => <li key={i}>{o}</li>)}</ul> : '-'}
                            {report.technicalNotes && <div className="mt-1.5 text-slate-500">{report.technicalNotes}</div>}
                        </div>
                    </div>
                    {imgs.length > 0 && (
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                            {imgs.map((src, i) => (
                                <a key={i} href={src} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200 bg-white"><img src={src} alt="" className="h-full w-full object-cover" /></a>
                            ))}
                        </div>
                    )}
                    {deliveries.length > 0 && (
                        <div className="space-y-1.5">
                            <div className="text-[11.5px] font-semibold text-slate-600">{t('projects.delivery.tab')}</div>
                            {deliveries.map((d) => (
                                <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-[12px]">
                                    <span className="truncate font-semibold text-slate-800">{d.checklistName || t('projects.delivery.pdf.title')}</span>
                                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${d.isSigned ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{d.isSigned ? t('projects.delivery.statusSigned') : t('projects.delivery.statusUnsigned')}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
});
