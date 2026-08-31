import { useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Clipboard as ClipboardPenLine, Send01 as Send } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { MailSettingDto, ProjectDto, ProjectSalesOrder } from '@/types/project';

import { PersonAvatar } from '@/components/ui-shared/PersonAvatar';
import { scopedRecords } from '../../../utils/projectOrderScope';

// Send field reports to signature: to the technician, the customer or both.
export const SignatureRequestTab = ({ project, order, isPrimary, settings, userEmail }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; settings: MailSettingDto | null; userEmail: string; onSaved: () => Promise<void> }) => {
    const reports = scopedRecords(project.reports, order, isPrimary, project.salesOrders);
    const [loadingKey, setLoadingKey] = useState<string | null>(null);

    const send = async (report: any, channel: 'technician' | 'mail' | 'both') => {
        setLoadingKey(`${report.id}:${channel}`);
        try {
            await projectApi.requestReportSignature(report.id, {
                channel,
                to: project.customer?.mainEmail || undefined,
                fromEmail: settings?.fromEmail || userEmail,
                fromName: settings?.fromName || t('auto.offitec_erp'),
                subject: `${project.projectName} - saha raporu imzasi`,
            });
            toast.success(channel === 'technician' ? t('auto.teknisyene_imza_bildirimi_gonderildi') : channel === 'mail' ? t('auto.musteriye_imza_maili_gonderildi') : t('auto.imza_istegi_gonderildi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.imza_istegi_gonderilemedi'));
        } finally {
            setLoadingKey(null);
        }
    };

    return (
        <Card title={t('auto.imzaya_gonder')} icon={<Send size={13} />} noPadding>
            {reports.length === 0 ? (
                <EmptyState icon={<ClipboardPenLine size={28} />} title={t('auto.saha_raporu_yok')} description={t('auto.imzaya_gondermek_icin_once_saha_raporu_olusturun')} />
            ) : (
                <div className="divide-y divide-slate-100">
                    {reports.map((report: any) => {
                        const employeeName = report.employee ? `${report.employee.firstName || ''} ${report.employee.lastName || ''}`.trim() : '';
                        return (
                        <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                                {/* The person whose signature/report this is — visible
                                    at a glance: their profile photo, or the initials
                                    circle when none is stored. */}
                                <PersonAvatar id={report.employee?.id} name={employeeName || t('auto.teknisyen')} size={32} />
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-slate-900">{dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')} · {t('auto.saha_raporu')}</div>
                                    <div className="mt-0.5 text-[12px] text-slate-500">
                                        {employeeName ? `${employeeName} · ` : ''}{dayjs(report.startedAt).format('HH:mm')} - {dayjs(report.endedAt).format('HH:mm')} · {report.isSigned ? t('auto.imzali') : t('auto.imza_bekliyor')}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" loading={loadingKey === `${report.id}:technician`} onClick={() => send(report, 'technician')}>{t('auto.teknikere_gonder')}</Button>
                                <Button size="sm" variant="secondary" loading={loadingKey === `${report.id}:mail`} onClick={() => send(report, 'mail')}>{t('auto.musteriye_mail')}</Button>
                                <Button size="sm" loading={loadingKey === `${report.id}:both`} onClick={() => send(report, 'both')}>{t('auto.ikisine_gonder')}</Button>
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};
