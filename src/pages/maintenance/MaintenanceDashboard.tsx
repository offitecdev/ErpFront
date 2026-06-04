import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { AlertTriangle, ArrowRight, Calendar, CheckCircle, Clock, File02 as FileText, Plus } from '@untitledui/icons';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { maintenanceApi, regieApi } from '../../lib/api/maintenance';
import type { MaintenanceContractDto, MaintenanceReportDto, MaintenanceTaskDto, ServiceCallDto } from '../../types/maintenance';
import { fmtDate, PERIOD_LABEL, personName, StatCard, StatusPill } from './MaintenanceShared';

export const MaintenanceDashboard = () => {
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
            toast.error(error.response?.data?.error || 'Bakım panosu yüklenemedi.');
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
                breadcrumb="Bakım"
                title="Bakım yönetimi"
                description="Sözleşmeli bakım, saha görevleri, imzalı raporlar ve regie operasyonlarını tek ekrandan takip edin."
                actions={
                    <>
                        <Button variant="secondary" icon={<Calendar size={13} />} onClick={() => navigate('/maintenance/tasks')}>
                            Takvim
                        </Button>
                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/maintenance/contracts')}>
                            Sözleşme
                        </Button>
                    </>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <StatCard
                    label="Aktif sözleşme"
                    value={stats.activeContracts}
                    icon={<CheckCircle size={14} />}
                    tone="success"
                    sub="Süresi geçerli"
                />
                <StatCard
                    label="Yaklaşan bakım görevi"
                    value={stats.upcomingTasks}
                    icon={<Calendar size={14} />}
                    sub="45 günlük plan"
                />
                <StatCard
                    label="Geciken görev"
                    value={stats.overdueTasks}
                    icon={<AlertTriangle size={14} />}
                    tone={stats.overdueTasks ? 'danger' : 'neutral'}
                    sub="Tarihi geçmiş"
                />
                <StatCard
                    label="İmza bekleyen rapor"
                    value={stats.unsignedReports}
                    icon={<FileText size={14} />}
                    tone={stats.unsignedReports ? 'warning' : 'neutral'}
                    sub="Müşteri imzası yok"
                />
                <StatCard
                    label="Açık regie çağrısı"
                    value={stats.openCalls}
                    icon={<Clock size={14} />}
                    tone={stats.openCalls ? 'warning' : 'neutral'}
                    sub="Plan dışı işler"
                />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <div className="xl:col-span-7">
                    <Card
                        title="Yaklaşan bakım görevleri"
                        icon={<Calendar size={13} />}
                        noPadding
                        actions={<Button variant="ghost" size="sm" onClick={() => navigate('/maintenance/tasks')}>Tüm takvimi aç <ArrowRight size={11} /></Button>}
                    >
                        {loading ? (
                            <SkeletonRows rows={5} />
                        ) : upcoming.length === 0 ? (
                            <EmptyState icon={<Calendar size={30} />} title="Planlı görev yok" description="Yeni sözleşme oluşturulduğunda periyodik bakım görevleri otomatik üretilir." />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead className="border-b border-slate-100 bg-slate-50/60 text-[11px] text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">Bakım tarihi</th>
                                            <th className="px-3 py-2 text-left font-semibold">Müşteri / saha</th>
                                            <th className="px-3 py-2 text-left font-semibold">Teknisyen</th>
                                            <th className="px-3 py-2 text-left font-semibold">Durum</th>
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
                    <Card title="Süresi yaklaşan sözleşmeler" icon={<Clock size={13} />} noPadding>
                        {loading ? (
                            <SkeletonRows rows={4} />
                        ) : expiring.length === 0 ? (
                            <EmptyState title="Sözleşme yok" description="Aktif bakım sözleşmesi bulunmuyor." />
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
                                                {PERIOD_LABEL[contract.period]}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-[11px] text-slate-500">Bitiş: {fmtDate(contract.endDate)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card title="İmza bekleyen raporlar" icon={<FileText size={13} />} noPadding>
                        {loading ? (
                            <SkeletonRows rows={3} />
                        ) : unsigned.length === 0 ? (
                            <EmptyState icon={<CheckCircle size={28} />} title="Bekleyen imza yok" description="Raporlar imzalandıktan sonra kilitlenir." />
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {unsigned.map((report) => (
                                    <button
                                        key={report.id}
                                        type="button"
                                        className="block w-full px-4 py-3 text-left hover:bg-slate-50/70"
                                        onClick={() => navigate('/maintenance/reports')}
                                    >
                                        <div className="text-[13px] font-semibold text-slate-900">{report.task?.contract?.customer?.companyName || report.taskId}</div>
                                        <div className="mt-0.5 text-[12px] text-slate-500">{fmtDate(report.createdAt, 'DD.MM.YYYY HH:mm')} - {personName(report.technician)}</div>
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
