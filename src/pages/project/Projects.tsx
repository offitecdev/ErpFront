import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import dayjs from 'dayjs';
import {
    AlertCircle,
    ArrowRight,
    Briefcase01 as BriefcaseBusiness,
    CalendarCheck01 as CalendarClock,
    CurrencyDollarCircle as CircleDollarSign,
    FilterLines,
    SearchLg as Search,
    X as XIcon,
} from '@untitledui/icons';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { Input, Select } from '../../components/ui-shared/Field';
import { projectApi } from '../../lib/api/project';
import type { ProjectDto, ProjectStatus } from '../../types/project';

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

const money = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

export const Projects = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<ProjectStatus | ''>('');

    const load = async (next: { status: ProjectStatus | ''; search: string } = { status, search }) => {
        setLoading(true);
        try {
            setProjects(await projectApi.list(next));
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Projeler yuklenemedi.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [status]);

    const stats = useMemo(() => {
        const active = projects.filter((p) => p.status === 'ACTIVE').length;
        const awaiting = projects.filter((p) => p.status === 'AWAITING_APPROVAL').length;
        const budget = projects.reduce((sum, p) => sum + (p.plannedBudget || 0), 0);
        const reportCount = projects.reduce((sum, p) => sum + (p._count?.reports || 0), 0);
        return { active, awaiting, budget, reportCount };
    }, [projects]);

    const clearFilters = () => {
        setSearch('');
        setStatus('');
        void load({ status: '', search: '' });
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Proje Yönetimi"
                title="Projeler"
                description="Onaylı tekliflerden oluşan projeleri, randevuları ve saha sürecini takip edin."
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Aktif Proje" value={stats.active} icon={<BriefcaseBusiness size={14} />} tone="brand" />
                <Stat label="Onay Bekleyen" value={stats.awaiting} icon={<AlertCircle size={14} />} tone="warning" />
                <Stat label="Saha Raporu" value={stats.reportCount} icon={<CalendarClock size={14} />} tone="success" />
                <Stat label="Teklif Bütçesi" value={money(stats.budget)} icon={<CircleDollarSign size={14} />} tone="total" small />
            </div>

            <Card
                title="Proje Listesi"
                icon={<BriefcaseBusiness size={14} />}
                noPadding
            >
                    <form
                        className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-slate-100 px-3 py-3 [scrollbar-width:thin]"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void load({ status, search });
                        }}
                    >
                        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                            <FilterLines size={16} />
                        </div>
                        <div className="relative shrink-0">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Proje, müşteri, teklif ara"
                                className="w-[230px] pl-8"
                            />
                        </div>
                        <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')} className="w-[150px]">
                            <option value="">Tüm durumlar</option>
                            {Object.entries(STATUS_LABEL).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </Select>
                        <Button type="submit" variant="secondary" size="sm" className="shrink-0">
                            Uygula
                        </Button>
                        <Button type="button" variant="ghost" size="sm" icon={<XIcon size={13} />} onClick={clearFilters} className="shrink-0">
                            Temizle
                        </Button>
                    </form>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">Proje</th>
                                <th className="px-3 py-2 text-left font-semibold">Musteri</th>
                                <th className="px-3 py-2 text-left font-semibold">Teklif</th>
                                <th className="px-3 py-2 text-right font-semibold">Butce</th>
                                <th className="px-3 py-2 text-right font-semibold">Rapor</th>
                                <th className="px-3 py-2 text-left font-semibold">Randevu</th>
                                <th className="px-3 py-2 text-left font-semibold">Durum</th>
                                <th className="px-3 py-2 text-right font-semibold">Aç</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i}>
                                    <td colSpan={8} className="px-3 py-3">
                                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                                    </td>
                                </tr>
                            ))}
                            {!loading && projects.length === 0 && (
                                <tr>
                                    <td colSpan={8}>
                                        <div className="px-4 py-4">
                                            <div className="mb-3 flex items-start gap-2 rounded-md border border-[#d30f15]/20 bg-[#d30f15]/5 px-3 py-2 text-[12px] font-medium text-[#b90d12]">
                                                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                                <span>Seçili filtrelere uygun proje bulunamadı. Arama veya durum filtresini değiştirin.</span>
                                            </div>
                                            <EmptyState
                                                icon={<BriefcaseBusiness size={32} />}
                                                title="Proje yok"
                                                description="Onaylı teklif üzerinden proje oluşturabilirsiniz."
                                                action={
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSearch('');
                                                            setStatus('');
                                                            void load({ status: '', search: '' });
                                                        }}
                                                    >
                                                        Filtreleri temizle
                                                    </Button>
                                                }
                                            />
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && projects.map((project) => {
                                const booked = project.appointments?.find((a) => a.status === 'BOOKED');
                                return (
                                    <tr
                                        key={project.id}
                                        className="cursor-pointer hover:bg-slate-50/70"
                                        onClick={() => navigate(`/projects/${project.id}`)}
                                    >
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-slate-800">{project.projectName}</div>
                                            <div className="text-[11px] text-slate-400">{dayjs(project.createdAt).format('DD.MM.YYYY')}</div>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600">{project.customer?.companyName || project.customerId}</td>
                                        <td className="px-3 py-2 font-mono text-[11.5px] text-slate-500">{project.tender?.tenderNumber || project.tenderId || '-'}</td>
                                        <td className="px-3 py-2 text-right font-mono">{money(project.plannedBudget)}</td>
                                        <td className="px-3 py-2 text-right font-mono">{project._count?.reports || 0}</td>
                                        <td className="px-3 py-2 text-slate-500">{booked ? dayjs(booked.startTime).format('DD.MM.YYYY HH:mm') : '-'}</td>
                                        <td className="px-3 py-2">
                                            <StatusChip variant={STATUS_VARIANT[project.status]}>{STATUS_LABEL[project.status]}</StatusChip>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <ArrowRight className="inline size-4 text-slate-400" />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

type StatTone = 'brand' | 'success' | 'warning' | 'total';

const statToneClass: Record<StatTone, { card: string; label: string; value: string }> = {
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
    total: {
        card: 'border-slate-300 bg-slate-50',
        label: 'text-slate-700',
        value: 'text-slate-950',
    },
};

const Stat = ({ label, value, icon, small, tone = 'brand' }: { label: string; value: string | number; icon: React.ReactNode; small?: boolean; tone?: StatTone }) => {
    const styles = statToneClass[tone];

    return (
        <div className={`rounded-lg border px-4 py-3 shadow-xs ${styles.card}`}>
            <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal ${styles.label}`}>
                {icon}
                {label}
            </div>
            <div className={`mt-1 font-semibold ${small ? 'text-[15px]' : 'text-[21px]'} ${styles.value}`}>{value}</div>
        </div>
    );
};
