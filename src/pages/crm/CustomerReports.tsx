import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    FileCheck02 as FileCheck,
    SearchLg as Search,
    FileDownload02 as DownloadIcon,
    X as XIcon,
} from '@/components/icons/antIconCompat';

import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { Input } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { projectApi, deliveryReportApi, type ServiceReportDto, type DeliveryReportDto } from '../../lib/api/project';
import type { ProjectDto } from '../../types/project';

import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

const money = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

const durationFmt = (minutes?: number | null) => {
    const min = Math.max(0, Math.round(Number(minutes || 0)));
    const h = Math.floor(min / 60);
    const mm = min % 60;
    return mm ? `${h} saat ${mm} dk` : `${h} saat`;
};

type ReportView = 'field' | 'general' | 'delivery';
type DateRange = { start: string; end: string };

// Field-report visuals for an order, gathered from the project's reports.
const gatherDeliveryImages = (project: ProjectDto, report: DeliveryReportDto): Array<{ imageData: string }> => {
    const reports = ((project as any).reports || []) as any[];
    return reports
        .filter((r) => !report.salesOrderId || (r.salesOrderId || null) === report.salesOrderId)
        .flatMap((r) => (Array.isArray(r.images) ? r.images : []))
        .filter((img: any) => img?.imageData)
        .map((img: any) => ({ imageData: img.imageData }));
};

const deliveryTechnicianName = (project: ProjectDto, report: DeliveryReportDto): string => {
    const appt = ((project as any).appointments || []).find((a: any) => a.id === report.appointmentId);
    const tech = appt?.assignedTechnician;
    return tech ? `${tech.firstName || ''} ${tech.lastName || ''}`.trim() : '';
};

/**
 * Customer-scoped reports: the same Field / General / Delivery reports shown in
 * Services > Reports, but filtered down to a single customer's projects.
 */
export const CustomerReports: React.FC<{ customerId: string }> = ({ customerId }) => {
    const [view, setView] = useState<ReportView>('field');

    // Customer projects — shared scoping source for the general + delivery views.
    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [projectsLoaded, setProjectsLoaded] = useState(false);

    // Field reports
    const [reports, setReports] = useState<ServiceReportDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

    // General reports (per-project date-range PDF)
    const [ranges, setRanges] = useState<Record<string, DateRange>>({});
    const [genBusyId, setGenBusyId] = useState<string | null>(null);

    // Delivery reports (Teslim Raporları)
    const [deliveryReports, setDeliveryReports] = useState<DeliveryReportDto[]>([]);
    const [deliveryLoaded, setDeliveryLoaded] = useState(false);
    const [delBusyId, setDelBusyId] = useState<string | null>(null);

    // General report on-screen preview
    const [previewBusyId, setPreviewBusyId] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewProject, setPreviewProject] = useState<ProjectDto | null>(null);
    const [previewReports, setPreviewReports] = useState<any[]>([]);
    const [previewRange, setPreviewRange] = useState<DateRange>({ start: '', end: '' });

    // Field reports — load tenant-wide then keep only this customer's.
    const load = async (nextSearch = search) => {
        setLoading(true);
        try {
            const all = await projectApi.listAllReports({ search: nextSearch });
            setReports(all.filter((r) => r.project?.customer?.id === customerId));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    // Customer projects feed both the general view and the delivery scoping.
    useEffect(() => {
        void load('');
        void (async () => {
            try {
                const list = (await projectApi.list()).filter((p) => p.customer?.id === customerId);
                setProjects(list);
                const defStart = dayjs().startOf('month').format('YYYY-MM-DD');
                const defEnd = dayjs().format('YYYY-MM-DD');
                setRanges(Object.fromEntries(list.map((p) => [p.id, { start: defStart, end: defEnd }])));
                setProjectsLoaded(true);
            } catch (e: any) {
                toast.error(e.response?.data?.error || t('projects.errorLoad'));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerId]);

    // Delivery reports — load tenant-wide then keep only those on this customer's projects.
    useEffect(() => {
        if (view !== 'delivery' || deliveryLoaded || !projectsLoaded) return;
        void (async () => {
            try {
                const ids = new Set(projects.map((p) => p.id));
                const all = await deliveryReportApi.list();
                setDeliveryReports(all.filter((r) => r.projectId && ids.has(r.projectId)));
                setDeliveryLoaded(true);
            } catch (e: any) {
                toast.error(e.response?.data?.error || t('projects.errorLoad'));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, deliveryLoaded, projectsLoaded, projects]);

    const downloadDeliveryPdf = async (row: DeliveryReportDto) => {
        setDelBusyId(row.id);
        try {
            const project = row.projectId ? await projectApi.getById(row.projectId) : null;
            const { exportDeliveryReportPdf } = await import('../../utils/pdf/deliveryReportPdf');
            await exportDeliveryReportPdf({
                report: row,
                project,
                fieldImages: project ? gatherDeliveryImages(project, row) : [],
                preparedBy: project ? deliveryTechnicianName(project, row) : '',
            });
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('services.toastPdfError'));
        } finally {
            setDelBusyId(null);
        }
    };

    const downloadReportPdf = async (row: ServiceReportDto) => {
        setPdfBusyId(row.id);
        try {
            const project = await projectApi.getById(row.projectId);
            const fullReport = (project.reports || []).find((r: any) => r.id === row.id) || row;
            const appointment = (project.appointments || []).find((a: any) => a.id === (fullReport as any).appointmentId) || null;
            const { exportFieldReportPdf } = await import('../../utils/pdf/fieldReportPdf');
            await exportFieldReportPdf(project, fullReport, { appointment });
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('services.toastPdfError'));
        } finally {
            setPdfBusyId(null);
        }
    };

    const openGeneralPreview = async (p: ProjectDto) => {
        const range = ranges[p.id];
        if (!range?.start || !range?.end) {
            toast.error(t('projects.general.selectRange'));
            return;
        }
        setPreviewBusyId(p.id);
        try {
            const project = await projectApi.getById(p.id);
            const start = dayjs(range.start).startOf('day');
            const end = dayjs(range.end).endOf('day');
            const rows = ((project as any).reports || []).filter((r: any) => {
                const d = dayjs(r.workDate || r.reportDate);
                return d.isAfter(start) && d.isBefore(end);
            });
            setPreviewProject(project);
            setPreviewReports(rows);
            setPreviewRange(range);
            setPreviewOpen(true);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.errorLoad'));
        } finally {
            setPreviewBusyId(null);
        }
    };

    const generateGeneralReport = async (p: ProjectDto) => {
        const range = ranges[p.id];
        if (!range?.start || !range?.end) {
            toast.error(t('projects.tarih_araligi_secin'));
            return;
        }
        setGenBusyId(p.id);
        try {
            const project = await projectApi.getById(p.id);
            const { exportProjectGeneralReportPdf } = await import('../../utils/pdf/projectReportPdf');
            await exportProjectGeneralReportPdf(project, { startDate: range.start, endDate: range.end });
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.genel_rapor_olusturulamadi'));
        } finally {
            setGenBusyId(null);
        }
    };

    const stats = useMemo(() => {
        const total = reports.length;
        const overtime = reports.reduce((sum, r) => sum + (r.overtimeCost || 0), 0);
        const pending = reports.filter((r) => !r.hoursApprovedAt).length;
        return { total, overtime, pending };
    }, [reports]);

    const TabButton = ({ id, label }: { id: ReportView; label: string }) => (
        <button
            type="button"
            onClick={() => setView(id)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition ${
                view === id ? 'bg-[#272f67] text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-white/15 dark:bg-white/5">
                    <TabButton id="field" label={t('services.tabField')} />
                    <TabButton id="general" label={t('services.tabGeneral')} />
                    <TabButton id="delivery" label={t('projects.delivery.adminTab')} />
                </div>
                {view === 'field' && (
                    <div className="flex flex-wrap gap-3 text-[12px] text-slate-600 dark:text-white">
                        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">{t('services.statsTotal')}: <b>{stats.total}</b></span>
                        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">{t('services.statsPending')}: <b>{stats.pending}</b></span>
                        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1">{t('services.statsOvertime')}: <b>{money(stats.overtime)}</b></span>
                    </div>
                )}
            </div>

            {view === 'field' && (
                <Card title={t('services.tabField')} icon={<FileCheck size={14} />} noPadding>
                    <form
                        className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-slate-100 px-3 py-3 [scrollbar-width:thin]"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void load(search);
                        }}
                    >
                        <div className="relative shrink-0">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('projects.flow.searchPlaceholder')} className="ofi-light-search-input w-[260px] pl-8 text-slate-950 placeholder:text-slate-400 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-400" />
                        </div>
                        <Button type="submit" variant="secondary" size="sm" className="shrink-0">{t('auto.uygula')}</Button>
                        <Button type="button" variant="ghost" size="sm" icon={<XIcon size={13} />} onClick={() => { setSearch(''); void load(''); }} className="shrink-0">{t('common.clear')}</Button>
                    </form>

                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">{t('services.colCreatedAt')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('services.colWorkDate')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('services.colCustomerProject')}</th>
                                    <th className="px-3 py-2 text-right font-semibold w-[92px]">{t('services.colAppointmentTime')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t('services.colWorkedHours')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t('services.colOvertime')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t('services.colHourlyRate')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t('services.colExtraFee')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('common.status')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">PDF</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading && Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i}>
                                        <td colSpan={10} className="px-3 py-3">
                                            <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                                        </td>
                                    </tr>
                                ))}
                                {!loading && reports.length === 0 && (
                                    <tr>
                                        <td colSpan={10}>
                                            <div className="px-4 py-6">
                                                <EmptyState
                                                    icon={<FileCheck size={32} />}
                                                    title={t('services.noFieldReports')}
                                                    description={t('services.noFieldReportsDesc')}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {!loading && reports.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50/60">
                                        <td className="px-3 py-2 text-slate-600">{dayjs(r.reportDate).format('DD.MM.YYYY HH:mm')}</td>
                                        <td className="px-3 py-2 font-medium text-slate-800">{dayjs(r.workDate).format('DD.MM.YYYY')}</td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-slate-800">{r.project?.customer?.companyName || '—'}</div>
                                            <div className="text-[11px] text-slate-500">{r.project?.projectName || '—'}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-600 w-[92px]">{durationFmt(r.plannedMinutesForDay)}</td>
                                        <td className="px-3 py-2 text-right text-slate-800">{durationFmt(r.workedMinutes)}</td>
                                        <td className="px-3 py-2 text-right text-slate-600">{r.overtimeMinutes > 0 ? durationFmt(r.overtimeMinutes) : '—'}</td>
                                        <td className="px-3 py-2 text-right text-slate-600">{money(r.overtimeHourlyRate)}</td>
                                        <td className="px-3 py-2 text-right font-medium text-slate-800">{money(r.overtimeCost)}</td>
                                        <td className="px-3 py-2">
                                            {r.hoursApprovedAt
                                                ? <StatusChip variant={r.autoApproved ? 'info' : 'active'}>{r.autoApproved ? t('services.autoApproved') : t('services.approved')}</StatusChip>
                                                : <StatusChip variant="warning">{t('services.statusPending')}</StatusChip>}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <Button variant="ghost" size="sm" icon={<DownloadIcon size={13} />} disabled={pdfBusyId === r.id} onClick={() => void downloadReportPdf(r)}>
                                                {pdfBusyId === r.id ? '…' : 'PDF'}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {view === 'general' && (
                <Card title={t('services.tabGeneral')} icon={<FileCheck size={14} />} noPadding>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">{t('services.colProject')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('services.colCustomer')}</th>
                                    <th className="px-3 py-2 text-left font-semibold w-[160px]">{t('services.colStart')}</th>
                                    <th className="px-3 py-2 text-left font-semibold w-[160px]">{t('services.colEnd')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">PDF</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {!projectsLoaded && (
                                    <tr><td colSpan={5} className="px-3 py-3"><div className="h-4 w-full animate-pulse rounded bg-slate-100" /></td></tr>
                                )}
                                {projectsLoaded && projects.length === 0 && (
                                    <tr><td colSpan={5}><div className="px-4 py-6"><EmptyState icon={<FileCheck size={32} />} title={t('services.noProjects')} description={t('services.noProjectsDesc')} /></div></td></tr>
                                )}
                                {projects.map((p) => (
                                    <tr key={p.id} className="hover:bg-slate-50/60">
                                        <td className="px-3 py-2 font-medium text-slate-800">{localizeTenderNumbersInText(p.projectName)}</td>
                                        <td className="px-3 py-2 text-slate-600">{p.customer?.companyName || '—'}</td>
                                        <td className="px-3 py-2 w-[160px]">
                                            <Input type="date" value={ranges[p.id]?.start || ''} onChange={(e) => setRanges((prev) => ({ ...prev, [p.id]: { ...prev[p.id], start: e.target.value } }))} />
                                        </td>
                                        <td className="px-3 py-2 w-[160px]">
                                            <Input type="date" value={ranges[p.id]?.end || ''} onChange={(e) => setRanges((prev) => ({ ...prev, [p.id]: { ...prev[p.id], end: e.target.value } }))} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button variant="ghost" size="sm" icon={<FileCheck size={13} />} disabled={previewBusyId === p.id} onClick={() => void openGeneralPreview(p)}>
                                                    {previewBusyId === p.id ? '…' : t('projects.general.preview')}
                                                </Button>
                                                <Button variant="secondary" size="sm" icon={<DownloadIcon size={13} />} disabled={genBusyId === p.id} onClick={() => void generateGeneralReport(p)}>
                                                    {genBusyId === p.id ? '…' : t('services.generalReportBtn')}
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {view === 'delivery' && (
                <Card title={t('projects.delivery.adminTitle')} icon={<FileCheck size={14} />} noPadding>
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">{t('projects.delivery.colSentAt')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('projects.delivery.colChecklist')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('projects.delivery.colCustomer')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('projects.delivery.colStatus')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t('projects.delivery.colDownload')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {!deliveryLoaded && (
                                    <tr><td colSpan={5} className="px-3 py-3"><div className="h-4 w-full animate-pulse rounded bg-slate-100" /></td></tr>
                                )}
                                {deliveryLoaded && deliveryReports.length === 0 && (
                                    <tr><td colSpan={5}><div className="px-4 py-6"><EmptyState icon={<FileCheck size={32} />} title={t('projects.delivery.noReports')} description={t('projects.delivery.noReportsHint')} /></div></td></tr>
                                )}
                                {deliveryReports.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50/60">
                                        <td className="px-3 py-2 text-slate-600">{dayjs(r.sentAt || r.createdAt).format('DD.MM.YYYY HH:mm')}</td>
                                        <td className="px-3 py-2 font-medium text-slate-800">{r.checklistName || '—'}</td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-slate-800">{r.customerName || (r.orderNumber ? localizeTenderNumbersInText(r.orderNumber) : '—')}</div>
                                            <div className="text-[11px] text-slate-500">{r.projectName || '—'}</div>
                                        </td>
                                        <td className="px-3 py-2">
                                            {r.isSigned
                                                ? <StatusChip variant="active">{t('projects.delivery.statusSigned')}</StatusChip>
                                                : <StatusChip variant="warning">{t('projects.delivery.statusUnsigned')}</StatusChip>}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <Button variant="secondary" size="sm" icon={<DownloadIcon size={13} />} disabled={delBusyId === r.id} onClick={() => void downloadDeliveryPdf(r)}>
                                                {delBusyId === r.id ? '…' : t('projects.delivery.download')}
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <Modal
                open={previewOpen}
                title={t('projects.general.previewTitle')}
                description={previewProject ? `${localizeTenderNumbersInText(previewProject.projectName)} · ${dayjs(previewRange.start).format('DD.MM.YYYY')} – ${dayjs(previewRange.end).format('DD.MM.YYYY')}` : ''}
                onClose={() => setPreviewOpen(false)}
                width="xl"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setPreviewOpen(false)}>{t('common.close')}</Button>
                        {previewProject && (
                            <Button variant="primary" icon={<DownloadIcon size={13} />} onClick={() => { setPreviewOpen(false); void generateGeneralReport(previewProject); }}>
                                {t('projects.general.generatePdf')}
                            </Button>
                        )}
                    </>
                }
            >
                <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
                    <div className="flex flex-wrap gap-2 text-[12px]">
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">{t('projects.general.reportsCount', { count: previewReports.length })}</span>
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">{previewProject?.customer?.companyName || '—'}</span>
                    </div>
                    {previewReports.length === 0 ? (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12.5px] text-slate-500">{t('projects.general.noReportsInRange')}</div>
                    ) : (
                        previewReports.map((r: any) => (
                            <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-[12.5px] font-semibold text-slate-900">{dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY')}</div>
                                    <div className="flex items-center gap-2">
                                        {r.startedAt && r.endedAt && (
                                            <span className="text-[11.5px] text-slate-500">{dayjs(r.startedAt).format('HH:mm')} – {dayjs(r.endedAt).format('HH:mm')}</span>
                                        )}
                                        {r.isSigned
                                            ? <StatusChip variant="active">{t('projects.delivery.statusSigned')}</StatusChip>
                                            : <StatusChip variant="warning">{t('projects.delivery.statusUnsigned')}</StatusChip>}
                                    </div>
                                </div>
                                {r.operationsDone && <div className="mt-1.5 whitespace-pre-wrap text-[12px] text-slate-700">{r.operationsDone}</div>}
                                {r.technicalNotes && <div className="mt-1 text-[11.5px] text-slate-500">{r.technicalNotes}</div>}
                                {Array.isArray(r.images) && r.images.length > 0 && (
                                    <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                                        {r.images.map((img: any) => (
                                            <a key={img.id} href={img.imageData} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200">
                                                <img src={img.imageData} alt="" className="h-full w-full object-cover" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default CustomerReports;
