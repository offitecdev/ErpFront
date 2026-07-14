import { useMemo } from 'react';
import dayjs from 'dayjs';

import { Activity, Building02, Clock, Mail01 as Mail, MarkerPin01, Phone } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { InfoCard } from '../../common/InfoCard';
import { ContactRow } from '../ContactRow';
import { ProjectStatusBadge } from '../../common/ProjectStatusBadge';
import { localizeTenderNumber } from '@/utils/tenderNumber';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { displayOperationsDone, money } from '../../../utils/projectFormatters';

export const ProjectOverviewTab = ({
    project,
    order,
    isPrimary,
    onGoReports,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    onGoReports: () => void;
}) => {
    // Memoize the scoped list first so the sort below only re-runs when the underlying
    // reports/order actually change (scopedRecords returns a fresh array every call).
    const reports = useMemo(
        () => scopedRecords(project.reports, order, isPrimary, project.salesOrders),
        [project.reports, project.salesOrders, order, isPrimary],
    );
    const recentReports = useMemo(
        () => [...reports].sort((a: any, b: any) =>
            dayjs(b.workDate || b.reportDate || b.startedAt).valueOf() - dayjs(a.workDate || a.reportDate || a.startedAt).valueOf()
        ).slice(0, 4),
        [reports],
    );

    return (
    <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InfoCard title={t('projects.projectInfo')} rows={[
                [t('projects.order'), order?.orderNumber ? localizeTenderNumbersInText(order.orderNumber) : '-'],
                [t('projects.tender'), localizeTenderNumber(order?.tender?.tenderNumber || project.tender?.tenderNumber || '') || order?.tenderId || project.tenderId || '-'],
                [t('projects.manager'), project.manager ? `${project.manager.firstName} ${project.manager.lastName}` : '-'],
                [t('common.start'), project.startDate ? dayjs(project.startDate).format('DD.MM.YYYY') : '-'],
                [t('common.end'), project.endDate ? dayjs(project.endDate).format('DD.MM.YYYY') : '-'],
                [t('common.status'), <ProjectStatusBadge status={project.status} />],
            ]} />
            <div className="rounded-md border border-slate-200/70 bg-white p-4">
                <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-slate-900">
                    <Building02 size={14} className="text-slate-400" />{t('projects.customerContact')}
                </div>
                <div className="space-y-2.5 text-[12.5px]">
                    <div className="font-semibold text-slate-800">{project.customer?.companyName || project.customerId}</div>
                    <ContactRow icon={<Mail size={13} />} value={project.customer?.mainEmail} href={project.customer?.mainEmail ? `mailto:${project.customer.mainEmail}` : undefined} />
                    <ContactRow icon={<Phone size={13} />} value={project.customer?.mainPhone} href={project.customer?.mainPhone ? `tel:${project.customer.mainPhone}` : undefined} />
                    <ContactRow icon={<MarkerPin01 size={13} />} value={project.customer?.address} />
                </div>
            </div>
        </div>

        <div className="rounded-md border border-slate-200/70 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-900">
                    <Activity size={14} className="text-slate-400" />{t('projects.recentReports')}
                </div>
                {reports.length > 0 && (
                    <button type="button" onClick={onGoReports} className="text-[11.5px] font-medium text-[#272f67] hover:underline">{t('projects.viewAll')}</button>
                )}
            </div>
            {recentReports.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-slate-400">{t('projects.noReportsYet')}</div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {recentReports.map((report: any) => (
                        <div key={report.id} className="flex items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-800">
                                    <span>{dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')}</span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-400"><Clock size={11} />{dayjs(report.startedAt).format('HH:mm')}-{dayjs(report.endedAt).format('HH:mm')}</span>
                                </div>
                                {report.operationsDone && <div className="mt-1 line-clamp-2 text-[12px] text-slate-500">{displayOperationsDone(report.operationsDone)}</div>}
                            </div>
                            {Number(report.overtimeCost) > 0 && (
                                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-700">+{money(Number(report.overtimeCost))}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
    );
};
