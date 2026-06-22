import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { AlertTriangle, ArrowRight, Calendar, CheckCircle, Clock, File02 as FileText, Plus } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { maintenanceApi, regieApi } from '../../lib/api/maintenance';
import type { MaintenanceContractDto, MaintenanceReportDto, MaintenanceTaskDto, ServiceCallDto } from '../../types/maintenance';
import { fmtDate, getPeriodLabel, personName, StatCard, StatusPill } from './MaintenanceShared';

import { t } from '@/i18n/translate';
import { useTranslation } from 'react-i18next';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((tick) => tick + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};

export const MaintenanceDashboard = () => {
    useLanguageRefresh();
    const navigate = useNavigate();
    const [contracts, setContracts] = useState<MaintenanceContractDto[]>([]);
    const [tasks, setTasks] = useState<MaintenanceTaskDto[]>([]);
    const [reports, setReports] = useState<MaintenanceReportDto[]>([]);
    const [calls, setCalls] = useState<ServiceCallDto[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const start = dayjs().subtract(14, 'day').format('YYYY-MM-DD');
            const end = dayjs().add(45, 'day').format('YYYY-MM-DD');
            const [contractRows, taskRows, reportRows, callRows] = await Promise.all([
                maintenanceApi.listContracts(),
                maintenanceApi.listTasks(start, end),
                maintenanceApi.listReports(),
                regieApi.listCalls(),
            ]);
            setContracts(contractRows);
            setTasks(taskRows);
            setReports(reportRows);
            setCalls(callRows);
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('maintenance.dashboard.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const stats = useMemo(() => {
        const today = dayjs().startOf('day');
        const activeContracts = contracts.filter((contract) => contract.isActive && dayjs(contract.endDate).isAfter(today)).length;
        const upcomingTasks = tasks.filter((task) => task.status !== 'COMPLETED' && dayjs(task.plannedDate).isAfter(today.subtract(1, 'day'))).length;
        const overdueTasks = tasks.filter((task) => task.status !== 'COMPLETED' && dayjs(task.plannedDate).isBefore(today)).length;
        const unsignedReports = reports.filter((report) => !report.isSigned).length;
        const openCalls = calls.filter((call) => call.status !== 'COMPLETED' && call.status !== 'CANCELLED').length;
        return { activeContracts, upcomingTasks, overdueTasks, unsignedReports, openCalls };
    }, [contracts, tasks, reports, calls]);

    const upcoming = tasks
        .filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
        .sort((a, b) => dayjs(a.plannedDate).valueOf() - dayjs(b.plannedDate).valueOf())
        .slice(0, 8);

    const expiring = contracts
        .filter((contract) => contract.isActive)
        .sort((a, b) => dayjs(a.endDate).valueOf() - dayjs(b.endDate).valueOf())
        .slice(0, 6);

    const unsigned = reports.filter((report) => !report.isSigned).slice(0, 6);

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.maintenance')}
                title={t('maintenance.dashboard.title')}
                description={t('maintenance.dashboard.description')}
                actions={
                    <>
                        <Button variant="secondary" icon={<Calendar size={13} />} onClick={() => navigate('/maintenance/tasks')}>{t('maintenance.dashboard.calendar')}</Button>
                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/maintenance/contracts/new')}>{t('maintenance.dashboard.newContract')}</Button>
                    </>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <StatCard
                    label={t('maintenance.dashboard.activeContracts')}
                    value={stats.activeContracts}
                    icon={<CheckCircle size={14} />}
                    tone="success"
                    sub={t('maintenance.dashboard.validContractsSub')}
                />
                <StatCard
                    label={t('maintenance.dashboard.upcomingTasks')}
                    value={stats.upcomingTasks}
                    icon={<Calendar size={14} />}
                    sub={t('maintenance.dashboard.next45DaysSub')}
                />
                <StatCard
                    label={t('maintenance.dashboard.overdueTasks')}
                    value={stats.overdueTasks}
                    icon={<AlertTriangle size={14} />}
                    tone={stats.overdueTasks ? 'danger' : 'neutral'}
                    sub={t('maintenance.dashboard.overdueTasksSub')}
                />
                <StatCard
                    label={t('maintenance.dashboard.unsignedReports')}
                    value={stats.unsignedReports}
                    icon={<FileText size={14} />}
                    tone={stats.unsignedReports ? 'warning' : 'neutral'}
                    sub={t('maintenance.dashboard.unsignedReportsSub')}
                />
                <StatCard
                    label={t('maintenance.dashboard.openCalls')}
                    value={stats.openCalls}
                    icon={<Clock size={14} />}
                    tone={stats.openCalls ? 'warning' : 'neutral'}
                    sub={t('maintenance.dashboard.openCallsSub')}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="xl:col-span-7">
                    <Card
                        title={t('maintenance.dashboard.upcomingTasksCard')}
                        icon={<Calendar size={13} />}
                        noPadding
                        actions={<Button variant="ghost" size="sm" onClick={() => navigate('/maintenance/tasks')}>{t('maintenance.dashboard.openAllCalendar')}<ArrowRight size={11} /></Button>}
                    >
                        {loading ? (
                            <SkeletonRows rows={5} />
                        ) : upcoming.length === 0 ? (
                            <EmptyState icon={<Calendar size={30} />} title={t('maintenance.dashboard.noPlannedTasks')} description={t('maintenance.dashboard.noPlannedTasksDesc')} />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">{t('maintenance.dashboard.colDate')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('maintenance.dashboard.colCustomer')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('maintenance.dashboard.colTechnician')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('common.status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {upcoming.map((task) => (
                                            <tr key={task.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => navigate('/maintenance/tasks')}>
                                                <td className="px-3 py-2 font-mono text-slate-700">{fmtDate(task.plannedDate)}</td>
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-slate-800">{task.contract?.customer?.companyName || task.contract?.title}</div>
                                                    <div className="text-[11px] text-slate-400">{task.siteName || task.contract?.siteName || '-'}</div>
                                                </td>
                                                <td className="px-3 py-2 text-slate-600">{personName(task.technician)}</td>
                                                <td className="px-3 py-2"><StatusPill status={task.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>

                <div className="flex flex-col gap-4 xl:col-span-5">
                    <Card title={t('maintenance.dashboard.expiringContracts')} icon={<Clock size={13} />} noPadding>
                        {loading ? (
                            <SkeletonRows rows={4} />
                        ) : expiring.length === 0 ? (
                            <EmptyState title={t('maintenance.dashboard.noContracts')} description={t('maintenance.dashboard.noContractsDesc')} />
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {expiring.map((contract) => (
                                    <div key={contract.id} className="px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-[13px] font-semibold text-slate-900">{contract.title}</div>
                                                <div className="mt-0.5 text-[12px] text-slate-500">{contract.customer?.companyName || contract.customerId}</div>
                                            </div>
                                            <span className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                                {getPeriodLabel()[contract.period]}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-[11px] text-slate-500">{t('auto.bitis')}{fmtDate(contract.endDate)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card title={t('maintenance.dashboard.unsignedReportsCard')} icon={<FileText size={13} />} noPadding>
                        {loading ? (
                            <SkeletonRows rows={3} />
                        ) : unsigned.length === 0 ? (
                            <EmptyState icon={<CheckCircle size={28} />} title={t('maintenance.dashboard.noPendingSignatures')} description={t('maintenance.dashboard.noPendingSignaturesDesc')} />
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {unsigned.map((report) => (
                                    <button
                                        key={report.id}
                                        type="button"
                                        className="block w-full px-4 py-3 text-left hover:bg-slate-50/70"
                                        onClick={() => navigate('/maintenance/tasks?view=reports')}
                                    >
                                        <div className="text-[13px] font-semibold text-slate-900">{report.task?.contract?.customer?.companyName || report.taskId}</div>
                                        <div className="mt-0.5 text-[12px] text-slate-500">{fmtDate(report.createdAt,"DD.MM.YYYY HH:mm")} - {personName(report.technician)}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

const SkeletonRows = ({ rows }: { rows: number }) => (
    <div className="space-y-2 p-4">
        {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="h-9 animate-pulse rounded bg-slate-100" />
        ))}
    </div>
);
