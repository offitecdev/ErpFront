import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    ArrowLeft,
    Briefcase01 as BriefcaseBusiness,
    CalendarCheck01 as CalendarClock,
    CheckCircle as CheckCircle2,
    Clipboard as ClipboardPenLine,
    Edit01 as Pencil,
    File02 as FileText,
    FileDownload02 as FileDown,
    Mail01 as Mail,
    PackagePlus,
    Receipt as ReceiptText,
    Save01 as Save,
    Send01 as Send,
    Trash01 as Trash2,
    User01 as UserRound,
    X,
} from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { SlidePanel } from '../../components/layout/SlidePanel';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { mailApi, projectApi } from '../../lib/api/project';
import { tenderApi } from '../../lib/api/tender';
import { useAuthStore } from '../../store/authStore';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectStatus } from '../../types/project';

type TabKey = 'overview' | 'costs' | 'reports' | 'materials' | 'booking' | 'mail';

const STATUS_LABEL: Record<ProjectStatus, string> = {
    AWAITING_APPROVAL: 'Onay Bekliyor',
    ACTIVE: 'Aktif',
    ON_HOLD: 'Beklemede',
    COMPLETED: 'Tamamlandı',
    CANCELLED: 'İptal',
};

const STATUS_VARIANT: Record<ProjectStatus, 'warning' | 'active' | 'passive' | 'info'> = {
    AWAITING_APPROVAL: 'warning',
    ACTIVE: 'active',
    ON_HOLD: 'info',
    COMPLETED: 'active',
    CANCELLED: 'passive',
};

const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

const numberFmt = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(value || 0);

const durationFmt = (minutes?: number | null) => {
    const total = Math.max(0, Number(minutes || 0));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return `${hours} sa ${mins} dk`;
    if (hours) return `${hours} sa`;
    return `${mins} dk`;
};

const appointmentDuration = (appointment: { startTime: string; endTime: string }) =>
    Math.max(0, dayjs(appointment.endTime).diff(dayjs(appointment.startTime), 'minute'));

const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Genel Bakış' },
    { key: 'costs', label: 'Ücretler' },
    { key: 'reports', label: 'Saha Raporları' },
    { key: 'materials', label: 'Malzemeler' },
    { key: 'booking', label: 'Randevu' },
    { key: 'mail', label: 'Mail' },
];

export const ProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [project, setProject] = useState<ProjectDto | null>(null);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [mailSettings, setMailSettings] = useState<MailSettingDto | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [loading, setLoading] = useState(false);

    const load = async (silent = false) => {
        if (!id) return;
        if (!silent) setLoading(true);
        try {
            const [projectData, materialData] = await Promise.all([
                projectApi.getById(id),
                projectApi.materials().catch(() => []),
            ]);
            setProject(projectData);
            setMaterials(materialData);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Proje yuklenemedi.');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        void mailApi.getSettings().then(setMailSettings).catch(() => undefined);
    }, [id]);

    const totals = useMemo(() => calculateTotals(project), [project]);
    const booked = project?.appointments?.find((a) => a.status === 'BOOKED');

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[1, 2, 3, 4].map((x) => <div key={x} className="h-20 animate-pulse rounded-md border border-slate-100 bg-slate-50" />)}
                </div>
                <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
            </div>
        );
    }

    if (!project) {
        return <EmptyState icon={<BriefcaseBusiness size={32} />} title="Proje bulunamadı" description="Proje silinmiş ya da erişiminiz olmayabilir." />;
    }

    return (
        <div>
            <PageHeader
                breadcrumb="Proje Yönetimi"
                title={
                    <span className="flex flex-wrap items-center gap-3">
                        <span>{project.projectName}</span>
                        <StatusChip variant={STATUS_VARIANT[project.status]}>{STATUS_LABEL[project.status]}</StatusChip>
                    </span>
                }
                description={
                    <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px]">
                        <span className="inline-flex items-center gap-1"><UserRound size={11} /> {project.customer?.companyName || project.customerId}</span>
                        <span className="inline-flex items-center gap-1"><FileText size={11} /> {project.tender?.tenderNumber || project.tenderId || '-'}</span>
                        <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> {dayjs(project.createdAt).format('DD.MM.YYYY')}</span>
                    </span>
                }
                actions={
                    <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/projects')}>
                        Listeye Dön
                    </Button>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric label="Planlanan Bütçe" value={money(project.plannedBudget)} tone="brand" />
                <Metric label="Ek Tutar" value={money(totals.additions)} tone="success" />
                <Metric label="Harici Gider" value={money(totals.expenses)} tone="warning" />
                <Metric label="Malzeme" value={money(totals.extraMaterials)} tone="purple" />
                <Metric label="Toplam" value={money(totals.total)} tone="total" strong />
            </div>

            <Card noPadding>
                <div className="border-b border-secondary px-4 md:px-6">
                    <nav className="flex gap-7 overflow-x-auto" aria-label="Proje bolumleri">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`relative -mb-px whitespace-nowrap border-b-[3px] px-0.5 py-3 text-sm font-semibold transition-colors ${
                                    activeTab === tab.key
                                        ? 'border-brand text-brand-secondary'
                                        : 'border-transparent text-tertiary hover:border-utility-brand-200 hover:text-secondary'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="p-4 md:p-6">
                    {activeTab === 'overview' && (
                        <OverviewTab project={project} totals={totals} booked={booked?.startTime} />
                    )}
                    {activeTab === 'costs' && (
                        <CostsTab project={project} totals={totals} onSaved={() => load(true)} />
                    )}
                    {activeTab === 'reports' && (
                        <ReportsTab project={project} onSaved={() => load(true)} />
                    )}
                    {activeTab === 'materials' && (
                        <MaterialsTab project={project} materials={materials} onSaved={() => load(true)} />
                    )}
                    {activeTab === 'booking' && (
                        <BookingTab project={project} onSaved={() => load(true)} />
                    )}
                    {activeTab === 'mail' && (
                        <MailTab project={project} settings={mailSettings} userEmail={user?.email || ''} />
                    )}
                </div>
            </Card>
        </div>
    );
};

const calculateTotals = (project: ProjectDto | null) => {
    const reports = project?.reports || [];
    const expenses = (project?.expenses || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const overtime = reports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0);
    const extraMaterials = (project?.extraMaterials || []).reduce((sum: number, item: any) => {
        return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);
    const additions = expenses + extraMaterials + overtime;
    return { expenses, overtime, extraMaterials, additions, total: (project?.plannedBudget || 0) + additions };
};

const getProjectUsedMaterials = (project: ProjectDto) =>
    [
        ...(project.tender?.usedMaterials || []).map((usage) => ({
            id: `usage-${usage.id}`,
            rawId: usage.id,
            source: 'tender' as const,
            positionNumber: project.tender?.tenderNumber || '-',
            positionName: 'Teklif ayarları',
            quantity: Number(usage.quantity || 0),
            discount: 0,
            material: usage.material,
            unitCost: Number(usage.unitCost || usage.material?.unitCost || 0),
            value: Number(usage.quantity || 0) * Number(usage.unitCost || usage.material?.unitCost || 0),
            description: usage.description,
        })),
        ...((project.tender?.positions || []).flatMap((position) =>
            (position.materialMappings || []).map((mapping) => ({
                id: `mapping-${mapping.id}`,
                rawId: mapping.id,
                source: 'position' as const,
                positionNumber: position.positionNumber,
                positionName: position.shortDescription || 'Teklif pozisyonu',
                quantity: Number(mapping.quantityMultiplier || 0),
                discount: Number(mapping.discount || 0),
                material: mapping.material,
                unitCost: Number(mapping.material?.unitCost || 0),
                value: Number(mapping.quantityMultiplier || 0) * Number(mapping.material?.unitCost || 0),
            }))
        )),
    ].filter((item) => item.quantity > 0);

type MetricTone = 'brand' | 'success' | 'warning' | 'purple' | 'total' | 'danger';

const metricToneClass: Record<MetricTone, { card: string; label: string; value: string }> = {
    brand: {
        card: 'border-brand-200 bg-brand-primary_alt',
        label: 'text-brand-tertiary',
        value: 'text-brand-secondary',
    },
    success: {
        card: 'border-emerald-200 bg-emerald-50/70',
        label: 'text-emerald-700',
        value: 'text-emerald-900',
    },
    warning: {
        card: 'border-amber-200 bg-amber-50/70',
        label: 'text-amber-700',
        value: 'text-amber-950',
    },
    purple: {
        card: 'border-violet-200 bg-violet-50/70',
        label: 'text-violet-700',
        value: 'text-violet-950',
    },
    total: {
        card: 'border-slate-300 bg-slate-50',
        label: 'text-slate-700',
        value: 'text-slate-950',
    },
    danger: {
        card: 'border-rose-200 bg-rose-50/70',
        label: 'text-rose-700',
        value: 'text-rose-900',
    },
};

const Metric = ({ label, value, tone = 'brand', strong }: { label: string; value: string; tone?: MetricTone; strong?: boolean }) => {
    const styles = metricToneClass[tone];

    return (
        <div className={`rounded-lg border px-4 py-3 shadow-xs ${styles.card}`}>
            <div className={`text-[11px] font-semibold uppercase tracking-normal ${styles.label}`}>{label}</div>
            <div className={`mt-1 font-semibold ${strong ? 'text-[20px]' : 'text-[17px]'} ${styles.value}`}>{value}</div>
        </div>
    );
};

const OverviewTab = ({ project, totals, booked }: { project: ProjectDto; totals: ReturnType<typeof calculateTotals>; booked?: string }) => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InfoCard title="Proje Bilgileri" rows={[
            ['Müşteri', project.customer?.companyName || project.customerId],
            ['Teklif', project.tender?.tenderNumber || project.tenderId || '-'],
            ['Yönetici', project.manager ? `${project.manager.firstName} ${project.manager.lastName}` : '-'],
            ['Başlangıç', project.startDate ? dayjs(project.startDate).format('DD.MM.YYYY') : '-'],
            ['Bitiş', project.endDate ? dayjs(project.endDate).format('DD.MM.YYYY') : '-'],
        ]} />
        <InfoCard title="Süreç" rows={[
            ['Saha raporu', String(project.reports?.length || project._count?.reports || 0)],
            ['Malzeme', String((project.extraMaterials?.length || 0) + getProjectUsedMaterials(project).length)],
            ['Gider kaydı', String(project.expenses?.length || project._count?.expenses || 0)],
            ['Randevu', booked ? dayjs(booked).format('DD.MM.YYYY HH:mm') : '-'],
        ]} />
        <div className="rounded-md border border-slate-200/70 bg-slate-50/50 p-4">
            <div className="text-[12px] font-semibold text-slate-700">Ücret Özeti</div>
            <div className="mt-3 space-y-2 text-[12.5px]">
                <TotalRow label="Tekliften gelen ücret" value={project.plannedBudget} />
                <TotalRow label="Malzeme" value={totals.extraMaterials} />
                <TotalRow label="Harici gider" value={totals.expenses} />
                <TotalRow label="%15 üzeri fazla çalışma" value={totals.overtime} />
                <TotalRow label="Toplam" value={totals.total} total />
            </div>
        </div>
    </div>
);

const CostsTab = ({ project, totals, onSaved }: { project: ProjectDto; totals: ReturnType<typeof calculateTotals>; onSaved: () => Promise<void> }) => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
            <CostList title="Harici Giderler" empty="Gider yok" rows={(project.expenses || []).map((e: any) => ({
                id: e.id,
                title: e.expenseType,
                meta: dayjs(e.expenseDate).format('DD.MM.YYYY'),
                amount: e.amount,
                note: e.description,
            }))} />
            <CostList title="Projeye Eklenen Malzemeler" empty="Malzeme yok" rows={(project.extraMaterials || [])
                .map((v: any) => ({
                    id: v.id,
                    title: v.material?.name || 'Malzeme',
                    meta: `${numberFmt(v.quantity)} adet x ${money(v.unitPrice)}`,
                    amount: (Number(v.quantity) || 0) * (Number(v.unitPrice) || 0),
                    note: v.description,
                }))} />
            <CostList title="Kullanılan Malzemeler (Fiyata Dahil Değil)" empty="Kullanılan malzeme yok" rows={getProjectUsedMaterials(project)
                .map((v) => ({
                    id: v.id,
                    title: v.material?.name || 'Malzeme',
                    meta: `${numberFmt(v.quantity)} adet x ${money(v.unitCost)} · ${v.positionNumber}`,
                    amount: v.value,
                    note: `Bilgi amaçlı değer: ${money(v.value)} · ${v.positionName}`,
                }))} />
            <CostList title="%15 Üzeri Fazla Çalışma" empty="Fazla çalışma yok" rows={(project.reports || [])
                .filter((r: any) => Number(r.overtimeCost) > 0)
                .map((r: any) => ({
                    id: r.id,
                    title: dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY'),
                    meta: `${numberFmt((Number(r.overtimeMinutes) || 0) / 60)} saat x ${money(r.overtimeHourlyRate)}`,
                    amount: Number(r.overtimeCost) || 0,
                    note: 'Planlanan günlük sürenin %15 üzeri',
                }))} />
        </div>
        <div>
            <ExpenseForm projectId={project.id} onSaved={onSaved} />
            <div className="mt-4 rounded-md border border-slate-200/70 bg-white p-4">
                <div className="text-[12px] font-semibold text-slate-700">Toplam</div>
                <div className="mt-3 space-y-2 text-[12.5px]">
                    <TotalRow label="Tekliften gelen ücret" value={project.plannedBudget} />
                    <TotalRow label="Malzeme" value={totals.extraMaterials} />
                    <TotalRow label="Harici gider" value={totals.expenses} />
                    <TotalRow label="%15 üzeri fazla çalışma" value={totals.overtime} />
                    <TotalRow label="Genel toplam" value={totals.total} total />
                </div>
            </div>
        </div>
    </div>
);

const ReportsTab = ({ project, onSaved }: { project: ProjectDto; onSaved: () => Promise<void> }) => {
    const [editingReport, setEditingReport] = useState<any | null>(null);
    const [generalReportOpen, setGeneralReportOpen] = useState(false);

    const reload = async () => {
        setEditingReport(null);
        await onSaved();
    };

    return (
        <>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
                <Card
                    title="Saha Raporları"
                    icon={<ClipboardPenLine size={13} />}
                    noPadding
                >
                    {(project.reports || []).length === 0 ? (
                        <EmptyState icon={<ClipboardPenLine size={28} />} title="Rapor yok" description="Bu proje için henüz saha raporu girilmemiş." />
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {(project.reports || []).map((r: any) => (
                                <div key={r.id} className="px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <div className="font-medium text-slate-800">
                                                {dayjs(r.startedAt).format('HH:mm')} - {dayjs(r.endedAt).format('HH:mm')} saha çalışması
                                            </div>
                                            <div className="mt-1 text-[11.5px] text-slate-900">
                                                Planlanan {durationFmt(r.plannedMinutesForDay)} · azami {durationFmt(Math.ceil(Number(r.plannedMinutesForDay || 0) * 1.15))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="font-mono text-[11px] text-slate-900">{dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY')}</div>
                                            <button
                                                type="button"
                                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-900 hover:bg-slate-50"
                                                onClick={() => setEditingReport(r)}
                                            >
                                                Düzenle
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-900 hover:bg-slate-50"
                                                onClick={async () => {
                                                    const { exportProjectReportPdf } = await import('../../utils/pdf/projectReportPdf');
                                                    await exportProjectReportPdf(project, r);
                                                }}
                                            >
                                                PDF
                                            </button>
                                        </div>
                                    </div>
                                    {Number(r.overtimeMinutes) > 0 && (
                                        <div className="mt-2 text-[11.5px] text-slate-900">
                                            Kritik %15: {durationFmt(Number(r.overtimeMinutes))} fazla çalışma, {money(Number(r.overtimeCost) || 0)}
                                        </div>
                                    )}
                                    <div className="mt-1 whitespace-pre-wrap text-[12.5px] text-slate-900">{r.operationsDone}</div>
                                    {r.technicalNotes && <div className="mt-1 text-[12px] text-slate-900">{r.technicalNotes}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex justify-end border-t border-slate-100 px-4 py-3">
                        <Button
                            variant="secondary"
                            icon={<FileDown size={13} />}
                            onClick={() => setGeneralReportOpen(true)}
                            disabled={(project.reports || []).length === 0}
                        >
                            Genel Rapor Al
                        </Button>
                    </div>
                </Card>
            </div>
            <ReportForm project={project} editingReport={editingReport} onCancelEdit={() => setEditingReport(null)} onSaved={reload} />
        </div>
        <GeneralReportPanel project={project} open={generalReportOpen} onClose={() => setGeneralReportOpen(false)} />
        </>
    );
};

const reportDay = (report: any) => dayjs(report.workDate || report.reportDate || report.startedAt).format('YYYY-MM-DD');

const GeneralReportPanel = ({ project, open, onClose }: { project: ProjectDto; open: boolean; onClose: () => void }) => {
    const reportDates = useMemo(() => (project.reports || []).map(reportDay).filter(Boolean).sort(), [project.reports]);
    const [range, setRange] = useState({
        startDate: reportDates[0] || dayjs().format('YYYY-MM-DD'),
        endDate: reportDates[reportDates.length - 1] || dayjs().format('YYYY-MM-DD'),
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setRange({
            startDate: reportDates[0] || dayjs().format('YYYY-MM-DD'),
            endDate: reportDates[reportDates.length - 1] || dayjs().format('YYYY-MM-DD'),
        });
    }, [project.id, reportDates[0], reportDates[reportDates.length - 1]]);

    const selectedReports = useMemo(() => (project.reports || []).filter((report: any) => {
        const key = reportDay(report);
        return key >= range.startDate && key <= range.endDate;
    }), [project.reports, range.startDate, range.endDate]);

    return (
        <SlidePanel
            open={open}
            onClose={onClose}
            title="Özel Genel Rapor"
            subtitle="Tarih aralığındaki saha raporlarını tek çıktıda birleştirir."
            width="w-[440px]"
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Başlangıç">
                        <Input type="date" value={range.startDate} onChange={(e) => setRange({ ...range, startDate: e.target.value })} />
                    </Field>
                    <Field label="Bitiş">
                        <Input type="date" value={range.endDate} onChange={(e) => setRange({ ...range, endDate: e.target.value })} />
                    </Field>
                </div>

                <div className="rounded-md border border-slate-200/70 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                    <div className="flex items-center justify-between">
                        <span>Seçilen saha raporu</span>
                        <span className="font-semibold text-slate-900">{selectedReports.length}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                        <span>Ek çalışma toplamı</span>
                        <span className="font-semibold text-slate-900">
                            {money(selectedReports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0))}
                        </span>
                    </div>
                </div>

                <Button
                    className="w-full"
                    icon={<FileDown size={13} />}
                    loading={loading}
                    onClick={async () => {
                        if (!range.startDate || !range.endDate) return toast.error('Tarih aralığı seçin.');
                        if (range.startDate > range.endDate) return toast.error('Başlangıç tarihi bitişten sonra olamaz.');
                        if (selectedReports.length === 0) return toast.error('Seçilen aralıkta saha raporu yok.');
                        setLoading(true);
                        try {
                            const { exportProjectGeneralReportPdf } = await import('../../utils/pdf/projectReportPdf');
                            await exportProjectGeneralReportPdf(project, range);
                            toast.success('Genel saha raporu oluşturuldu.');
                            onClose();
                        } catch (e: any) {
                            toast.error(e?.message || 'Genel rapor oluşturulamadı.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    Özel Rapor Oluştur
                </Button>
            </div>
        </SlidePanel>
    );
};

const MaterialsTab = ({ project, materials, onSaved }: { project: ProjectDto; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [materialTab, setMaterialTab] = useState<'used' | 'extra'>('used');
    const usedMaterials = getProjectUsedMaterials(project);
    const materialTabs = [
        { key: 'used' as const, label: 'Kullanılan Malzemeler' },
        { key: 'extra' as const, label: 'Ek Malzemeler' },
    ];

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2 space-y-4">
                <div className="flex gap-2 border-b border-slate-200">
                    {materialTabs.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setMaterialTab(tab.key)}
                            className={`border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${
                                materialTab === tab.key ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {materialTab === 'used' && (
                    <Card title="Kullanılan Malzemeler" icon={<PackagePlus size={13} />} noPadding>
                        {usedMaterials.length === 0 ? (
                            <EmptyState icon={<PackagePlus size={28} />} title="Kullanılan malzeme yok" description="Teklif veya proje aşamasında kullanılan malzeme ekleyebilirsiniz." />
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {usedMaterials.map((item) => (
                                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                        <div>
                                            <div className="font-medium text-slate-800">{item.material?.name || 'Malzeme'}</div>
                                            <div className="text-[11.5px] text-slate-900">
                                                {item.material?.serialId || '-'} · {numberFmt(item.quantity)} adet x {money(item.unitCost)} · {item.positionNumber}
                                            </div>
                                            <div className="mt-1 text-[12px] text-slate-900">Kullanılan malzeme fiyat toplamına eklenmez.</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right font-mono text-[12.5px] font-semibold text-slate-800">
                                                <div>{money(item.value)}</div>
                                                <div className="text-[10.5px] font-normal text-slate-500">dahil değil</div>
                                            </div>
                                            {project.tenderId && item.source === 'tender' && (
                                                <button
                                                    type="button"
                                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                    onClick={async () => {
                                                        if (!confirm('Kullanılan malzeme kaldırılsın mı?')) return;
                                                        await tenderApi.removeMaterialMapping(project.tenderId!, item.rawId);
                                                        toast.success('Kullanılan malzeme kaldırıldı.');
                                                        await onSaved();
                                                    }}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                )}

                {materialTab === 'extra' && (
                    <Card title="Ek Malzemeler" icon={<PackagePlus size={13} />} noPadding>
                        {(project.extraMaterials || []).length === 0 ? (
                            <EmptyState icon={<PackagePlus size={28} />} title="Ek malzeme yok" description="Fiyata eklenecek proje malzemeleri buradan eklenir." />
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {(project.extraMaterials || []).map((v: any) => (
                                    <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                        <div>
                                            <div className="font-medium text-slate-800">{v.material?.name || 'Malzeme'}</div>
                                            <div className="text-[11.5px] text-slate-900">{numberFmt(v.quantity)} adet x {money(v.unitPrice)}</div>
                                            {v.description && <div className="mt-1 text-[12px] text-slate-900">{v.description}</div>}
                                        </div>
                                        <span className="font-mono text-[12.5px] font-semibold">{money((Number(v.quantity) || 0) * (Number(v.unitPrice) || 0))}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                )}
            </div>
            <div className="space-y-4">
                {materialTab === 'used' ? (
                    <UsedMaterialForm project={project} materials={materials} onSaved={onSaved} />
                ) : (
                    <VariationForm projectId={project.id} materials={materials} onSaved={onSaved} />
                )}
            </div>
        </div>
    );
};

const BookingTab = ({ project, onSaved }: { project: ProjectDto; onSaved: () => Promise<void> }) => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
            <AppointmentList project={project} onSaved={onSaved} />
        </div>
        <div className="space-y-4">
            <OvertimeRateCard project={project} onSaved={onSaved} />
            <InfoCard title="Musteri Iletisim" rows={[
                ['Musteri', project.customer?.companyName || '-'],
                ['E-posta', project.customer?.mainEmail || '-'],
                ['Telefon', project.customer?.mainPhone || '-'],
                ['Adres', project.customer?.address || '-'],
            ]} />
        </div>
    </div>
);

const appointmentToForm = (appointment?: any) => ({
    id: appointment?.id || '',
    date: appointment ? dayjs(appointment.startTime).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    start: appointment ? dayjs(appointment.startTime).format('HH:mm') : '09:00',
    end: appointment ? dayjs(appointment.endTime).format('HH:mm') : '17:00',
    notes: appointment?.notes || '',
});

const AppointmentList = ({ project, onSaved }: { project: ProjectDto; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState(appointmentToForm());
    const [loading, setLoading] = useState(false);
    const editing = Boolean(form.id);
    const appointments = project.appointments || [];

    const submit = async () => {
        const startTime = dayjs(`${form.date}T${form.start}`).toISOString();
        const endTime = dayjs(`${form.date}T${form.end}`).toISOString();
        if (!dayjs(endTime).isAfter(dayjs(startTime))) return toast.error('Bitis saati baslangictan sonra olmalidir.');
        setLoading(true);
        try {
            if (editing) {
                await projectApi.updateAppointment(form.id, { startTime, endTime, notes: form.notes });
                toast.success('Saat plani guncellendi.');
            } else {
                await projectApi.createAppointment(project.id, { startTime, endTime, notes: form.notes });
                toast.success('Saat plani eklendi.');
            }
            setForm(appointmentToForm());
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Saat plani kaydedilemedi.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card title="Randevu Saat Planlari" icon={<CalendarClock size={13} />} noPadding>
            <div className="divide-y divide-slate-100">
                {appointments.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-slate-900">Saat plani yok.</div>}
                {appointments.map((appointment) => (
                    <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[12.5px]">
                        <div>
                            <div className="font-medium text-slate-800">{dayjs(appointment.startTime).format('DD.MM.YYYY')}</div>
                            <div className="text-slate-900">
                                {dayjs(appointment.startTime).format('HH:mm')} - {dayjs(appointment.endTime).format('HH:mm')} · plan {durationFmt(appointmentDuration(appointment))} · azami {durationFmt(Math.ceil(appointmentDuration(appointment) * 1.15))}
                            </div>
                            {appointment.notes && <div className="mt-1 text-[11.5px] text-slate-900">{appointment.notes}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                            <button type="button" className="rounded p-1 text-slate-900 hover:bg-slate-50 hover:text-slate-700" onClick={() => setForm(appointmentToForm(appointment))}>
                                <Pencil size={13} />
                            </button>
                            <button
                                type="button"
                                className="rounded p-1 text-slate-900 hover:bg-rose-50 hover:text-rose-600"
                                onClick={async () => {
                                    if (!confirm('Saat plani silinsin mi?')) return;
                                    await projectApi.deleteAppointment(appointment.id);
                                    await onSaved();
                                }}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="border-t border-slate-100 p-4">
                <div className="mb-3 flex items-center justify-between">
                    <div className="text-[12px] font-semibold text-slate-900">{editing ? 'Saat Planini Duzenle' : 'Saat Plani Ekle'}</div>
                    {editing && (
                        <button type="button" className="rounded p-1 text-slate-900 hover:bg-slate-50" onClick={() => setForm(appointmentToForm())}>
                            <X size={13} />
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <Field label="Tarih"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                    <Field label="Baslangic"><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
                    <Field label="Bitis"><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
                    <Field label="Not"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                </div>
                <Button className="mt-3" loading={loading} icon={<Save size={13} />} onClick={submit}>
                    {editing ? 'Guncelle' : 'Ekle'}
                </Button>
            </div>
        </Card>
    );
};

const OvertimeRateCard = ({ project, onSaved }: { project: ProjectDto; onSaved: () => Promise<void> }) => {
    const [rate, setRate] = useState(Number(project.overtimeHourlyRate || 0));
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setRate(Number(project.overtimeHourlyRate || 0));
    }, [project.id, project.overtimeHourlyRate]);

    return (
        <Card title="Fazla Calisma Ucreti" icon={<ReceiptText size={13} />}>
            <Field label="%15 uzeri saat ucreti (CHF)">
                <Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} />
            </Field>
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Raporlarda planlanan surenin %15 fazlasi azami sure olarak kullanilir. Asan kisim dakika bazinda CHF saat ucretinden hesaplanir.
            </div>
            <Button
                className="mt-3"
                loading={loading}
                icon={<Save size={13} />}
                onClick={async () => {
                    setLoading(true);
                    try {
                        await projectApi.update(project.id, { overtimeHourlyRate: Math.max(0, Number(rate || 0)) });
                        toast.success('CHF saat ucreti guncellendi.');
                        await onSaved();
                    } catch (e: any) {
                        toast.error(e.response?.data?.error || 'CHF saat ucreti kaydedilemedi.');
                    } finally {
                        setLoading(false);
                    }
                }}
            >
                Kaydet
            </Button>
        </Card>
    );
};

const MailTab = ({ project, settings, userEmail }: { project: ProjectDto; settings: MailSettingDto | null; userEmail: string }) => {
    const [form, setForm] = useState({
        fromName: settings?.fromName || 'Offitec ERP',
        fromEmail: settings?.fromEmail || userEmail,
        to: project.customer?.mainEmail || '',
        subject: `${project.projectName} - Montaj randevusu`,
        message: 'Lutfen size uygun montaj saatini secin.',
    });
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        setSent(false);
        setForm({
            fromName: settings?.fromName || 'Offitec ERP',
            fromEmail: settings?.fromEmail || userEmail,
            to: project.customer?.mainEmail || '',
            subject: `${project.projectName} - Montaj randevusu`,
            message: 'Lutfen size uygun montaj saatini secin.',
        });
    }, [project.id, settings, userEmail]);

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title="Randevu Maili" icon={<Mail size={13} />} className="xl:col-span-2">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="Gonderici adi"><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                    <Field label="Gonderici e-posta"><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                    <Field label="Alici"><Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
                    <Field label="Konu"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                    <Field label="Mesaj" className="md:col-span-2"><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                </div>
                <Button
                    className="mt-3"
                    variant="primary"
                    icon={sent ? <CheckCircle2 size={13} /> : <Send size={13} />}
                    loading={loading}
                    disabled={sent}
                    onClick={async () => {
                        setLoading(true);
                        try {
                            const res = await projectApi.sendBookingMail(project.id, form);
                            setSent(true);
                            toast.success(res.message || 'Mail hazirlandi.');
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Mail gonderilemedi.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {sent ? 'Gonderildi' : 'Gonder'}
                </Button>
            </Card>
        </div>
    );
};

const emptyReportForm = () => ({ workDate: dayjs().format('YYYY-MM-DD'), start: '09:00', end: '17:00', operationsDone: '', technicalNotes: '' });

const reportToForm = (report: any) => ({
    workDate: dayjs(report.workDate || report.reportDate).format('YYYY-MM-DD'),
    start: dayjs(report.startedAt).format('HH:mm'),
    end: dayjs(report.endedAt).format('HH:mm'),
    operationsDone: report.operationsDone || '',
    technicalNotes: report.technicalNotes || '',
});

const ReportForm = ({ project, editingReport, onCancelEdit, onSaved }: { project: ProjectDto; editingReport: any | null; onCancelEdit: () => void; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState(emptyReportForm());
    const [loading, setLoading] = useState(false);
    const existingForDay = (project.reports || []).find((report: any) =>
        dayjs(report.workDate || report.reportDate).format('YYYY-MM-DD') === form.workDate && report.id !== editingReport?.id
    );

    useEffect(() => {
        setForm(editingReport ? reportToForm(editingReport) : emptyReportForm());
    }, [editingReport?.id]);

    return (
        <Card title={editingReport ? 'Raporu Düzenle' : 'Yeni Rapor'} icon={<Save size={13} />}>
            <div className="space-y-3">
                <Field label="Tarih"><Input type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></Field>
                {existingForDay && (
                    <div className="text-[12px] text-slate-900">
                        Bu güne ait bir rapor zaten var. Aynı güne ikinci rapor eklenemez; mevcut raporu düzenleyin.
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Başlangıç"><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
                    <Field label="Bitiş"><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
                </div>
                <Field label="Yapılan iş" required><Textarea rows={4} value={form.operationsDone} onChange={(e) => setForm({ ...form, operationsDone: e.target.value })} /></Field>
                <Field label="Teknik notlar"><Textarea rows={3} value={form.technicalNotes} onChange={(e) => setForm({ ...form, technicalNotes: e.target.value })} /></Field>
                {editingReport && (
                    <Button variant="secondary" className="w-full" icon={<X size={13} />} onClick={onCancelEdit}>
                        Düzenlemeyi İptal Et
                    </Button>
                )}
                <Button
                    className="w-full"
                    loading={loading}
                    disabled={Boolean(existingForDay)}
                    icon={<Save size={13} />}
                    onClick={async () => {
                        if (!form.operationsDone.trim()) return toast.error('Yapılan iş alanı zorunludur.');
                        setLoading(true);
                        try {
                            const payload = {
                                workDate: dayjs(`${form.workDate}T00:00`).toISOString(),
                                startedAt: dayjs(`${form.workDate}T${form.start}`).toISOString(),
                                endedAt: dayjs(`${form.workDate}T${form.end}`).toISOString(),
                                operationsDone: form.operationsDone,
                                technicalNotes: form.technicalNotes,
                            };
                            const res = editingReport
                                ? await projectApi.updateReport(editingReport.id, payload)
                                : await projectApi.addReport(project.id, payload);
                            if (res.report?.overtimeWarning) toast.warning(res.report.overtimeWarning);
                            toast.success(`Saha raporu ${editingReport ? 'güncellendi' : 'eklendi'}.`);
                            setForm(emptyReportForm());
                            await onSaved();
                            toast.success(editingReport ? 'Rapor guncellendi.' : 'Rapor kaydedildi.');
                            setForm(emptyReportForm());
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Rapor kaydedilemedi.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {editingReport ? 'Guncelle' : 'Kaydet'}
                </Button>
            </div>
        </Card>
    );
};

const UsedMaterialForm = ({ project, materials, onSaved }: { project: ProjectDto; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [loading, setLoading] = useState(false);

    return (
        <Card title="Kullanılan Malzeme Ekle" icon={<PackagePlus size={13} />}>
            <div className="space-y-3">
                <Field label="Malzeme" required>
                    <Select value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })} disabled={!project.tenderId}>
                        <option value="">Seçin</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({numberFmt(m.stockQuantity)})</option>)}
                    </Select>
                </Field>
                <Field label="Miktar"><Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} /></Field>
                <Field label="Açıklama"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">
                    Kullanılan malzemeler stoktan düşer, fakat proje fiyat toplamına eklenmez.
                </div>
                <Button
                    className="w-full"
                    loading={loading}
                    disabled={!project.tenderId}
                    icon={<PackagePlus size={13} />}
                    onClick={async () => {
                        if (!project.tenderId) return toast.error('Bu proje bir teklife bağlı değil.');
                        if (!form.materialId) return toast.error('Malzeme seçin.');
                        if (form.quantity <= 0) return toast.error('Miktar sıfırdan büyük olmalı.');
                        setLoading(true);
                        try {
                            await tenderApi.mapMaterial(project.tenderId, form.materialId, form.quantity, form.description);
                            toast.success('Kullanılan malzeme eklendi.');
                            setForm({ materialId: '', quantity: 1, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Kullanılan malzeme eklenemedi.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    Kullanılan Malzeme Ekle
                </Button>
            </div>
        </Card>
    );
};

const VariationForm = ({ projectId, materials, onSaved }: { projectId: string; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [loading, setLoading] = useState(false);

    return (
        <Card title="Malzeme Ekle" icon={<PackagePlus size={13} />}>
            <div className="space-y-3">
                <Field label="Malzeme" required><Select value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })}><option value="">Secin</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({numberFmt(m.stockQuantity)})</option>)}</Select></Field>
                <Field label="Miktar"><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} /></Field>
                <Field label="Aciklama"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <Button
                    className="w-full"
                    loading={loading}
                    icon={<PackagePlus size={13} />}
                    onClick={async () => {
                        if (!form.materialId) return toast.error('Malzeme secin.');
                        if (form.quantity <= 0) return toast.error('Miktar sifirdan buyuk olmali.');
                        setLoading(true);
                        try {
                            await projectApi.requestVariation(projectId, form);
                            toast.success('Talep olusturuldu.');
                            setForm({ materialId: '', quantity: 1, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Talep olusturulamadi.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    Talep Olustur
                </Button>
            </div>
        </Card>
    );
};

const ExpenseForm = ({ projectId, onSaved }: { projectId: string; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState({ expenseType: 'Nakliye', amount: 0, description: '' });
    const [loading, setLoading] = useState(false);

    return (
        <Card title="Harici Gider Ekle" icon={<ReceiptText size={13} />}>
            <div className="space-y-3">
                <Field label="Gider tipi"><Select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value })}>{['Nakliye', 'Ekipman Kiralama', 'Dış hizmetler', 'Taşeron', 'Diğer'].map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
                <Field label="Tutar"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} /></Field>
                <Field label="Aciklama"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <Button
                    className="w-full"
                    loading={loading}
                    icon={<ReceiptText size={13} />}
                    onClick={async () => {
                        if (form.amount <= 0) return toast.error('Tutar sifirdan buyuk olmali.');
                        setLoading(true);
                        try {
                            await projectApi.addExpense(projectId, form);
                            toast.success('Gider eklendi.');
                            setForm({ expenseType: 'Nakliye', amount: 0, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Gider eklenemedi.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    Gider Ekle
                </Button>
            </div>
        </Card>
    );
};

const InfoCard = ({ title, rows }: { title: string; rows: Array<[string, React.ReactNode]> }) => (
    <div className="rounded-md border border-slate-200/70 bg-white p-4">
        <div className="mb-3 text-[12px] font-semibold text-slate-900">{title}</div>
        <div className="space-y-2">
            {rows.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 text-[12.5px] last:border-0 last:pb-0">
                    <span className="text-slate-900">{label}</span>
                    <span className="max-w-[65%] text-right text-slate-800">{value}</span>
                </div>
            ))}
        </div>
    </div>
);

const CostList = ({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; title: string; meta: string; amount: number; note?: string }> }) => (
    <Card title={title} noPadding>
        {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-slate-900">{empty}</div>
        ) : (
            <div className="divide-y divide-slate-100">
                {rows.map((row) => (
                    <div key={row.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div>
                            <div className="font-medium text-slate-800">{row.title}</div>
                            <div className="text-[11.5px] text-slate-900">{row.meta}</div>
                            {row.note && <div className="mt-1 text-[12px] text-slate-900">{row.note}</div>}
                        </div>
                        <div className="font-mono text-[12.5px] font-semibold text-slate-800">{money(row.amount)}</div>
                    </div>
                ))}
            </div>
        )}
    </Card>
);

const TotalRow = ({ label, value, total }: { label: string; value: number; total?: boolean }) => (
    <div className={`flex items-center justify-between ${total ? 'border-t border-slate-200 pt-2 font-semibold text-slate-900' : 'text-slate-900'}`}>
        <span>{label}</span>
        <span className="font-mono">{money(value)}</span>
    </div>
);
