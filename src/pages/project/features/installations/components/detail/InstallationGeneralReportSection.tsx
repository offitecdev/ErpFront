import { memo } from 'react';

import { Clock, Send01 as Send } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import type { DeliveryReportDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';

import type { InstallationAppointment } from '../../hooks/useInstallationDetail';
import { appointmentTechnicianNames, eventEnd, eventStart } from '../../utils/installationAppointments';
import { findReport } from '../../utils/installationScope';
import { installationState } from '../../utils/installationStatus';
import { buildGeneralSnapshot } from '../../utils/installationSnapshots';
import { buildOrderAttachments } from '../../../projects/utils/buildOrderAttachments';
import { StatusBadge } from '../common/StatusBadge';
import { AppointmentDetailPanel } from './AppointmentDetailPanel';
import { InstallationSignatureSection } from './InstallationSignatureSection';

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

// "General report" view: all appointments on the order so far, a selectable list with a
// detail panel, and a signature row that can be signed and sent independently.
export const InstallationGeneralReportSection = memo(({
    selected,
    deliveryReports,
    relatedAppointments,
    generalDetail,
    setGeneralDetailId,
    generalSignature,
    setGeneralSignature,
    generalSignOpen,
    setGeneralSignOpen,
    generalSending,
    sendGeneral,
}: {
    selected: InstallationAppointment;
    deliveryReports: DeliveryReportDto[];
    relatedAppointments: InstallationAppointment[];
    generalDetail: InstallationAppointment | null;
    setGeneralDetailId: StateSetter<string | null>;
    generalSignature: string | null;
    setGeneralSignature: StateSetter<string | null>;
    generalSignOpen: boolean;
    setGeneralSignOpen: StateSetter<boolean>;
    generalSending: boolean;
    sendGeneral: () => void;
}) => (
    <div className="space-y-3">
        {/* Sign (capture) then Send — the general report can be sent
            signed or unsigned, and is never sent by "Finish & Send". */}
        <InstallationSignatureSection label={t('projects.general.button')} signed={Boolean(generalSignature)}>
            <div className="flex items-center gap-1.5">
                <Button type="button" variant="secondary" size="sm" onClick={() => setGeneralSignOpen(true)}>{generalSignature ? t('signatures.getSignature') : t('projects.task.sign')}</Button>
                <Button type="button" variant="primary" size="sm" icon={<Send size={13} />} loading={generalSending} onClick={sendGeneral}>{t('signatures.send')}</Button>
            </div>
        </InstallationSignatureSection>

        <SignatureSheet
            open={generalSignOpen}
            title={`${selected.salesOrder?.orderNumber || selected.project?.projectName || ''} - ${t('projects.general.button')}`}
            snapshot={buildGeneralSnapshot(selected, deliveryReports)}
            attachments={buildOrderAttachments(selected)}
            saving={false}
            onClose={() => setGeneralSignOpen(false)}
            onSave={(signatureBase64) => { if (signatureBase64) setGeneralSignature(signatureBase64); setGeneralSignOpen(false); }}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                    <div className="text-[12px] font-semibold text-slate-700">{t('projects.randevu_saat_planlari')}</div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{relatedAppointments.length}</span>
                </div>
                <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                    {relatedAppointments.map((appointment) => {
                        const row = {
                            ...appointment,
                            project: appointment.project || selected.project,
                            salesOrder: appointment.salesOrder || selected.salesOrder,
                        } as InstallationAppointment;
                        const report = findReport(row);
                        const state = installationState(row, report);
                        const active = (generalDetail?.id || null) === row.id;
                        return (
                            <button key={row.id} type="button" onClick={() => setGeneralDetailId(row.id)} className={`flex w-full flex-col gap-2 px-3 py-2.5 text-left transition-colors sm:flex-row sm:items-center sm:justify-between ${active ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-900">
                                        <Clock size={12} />
                                        {eventStart(row).format("DD.MM.YYYY HH:mm")} - {eventEnd(row).format('HH:mm')}
                                    </div>
                                    <div className="mt-1 truncate text-[12px] text-slate-600">{appointmentTechnicianNames(row)}</div>
                                    {row.notes && <div className="mt-1 text-[11.5px] text-slate-500">{row.notes}</div>}
                                </div>
                                <StatusBadge label={state.label} tone={state.tone} />
                            </button>
                        );
                    })}
                </div>
            </div>
            {generalDetail ? (
                <AppointmentDetailPanel
                    appointment={{ ...generalDetail, project: generalDetail.project || selected.project, salesOrder: generalDetail.salesOrder || selected.salesOrder } as InstallationAppointment}
                    deliveryReports={deliveryReports}
                />
            ) : (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-[12.5px] text-slate-500">{t('projects.randevu_secin')}</div>
            )}
        </div>
    </div>
));
