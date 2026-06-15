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
} from '@/components/icons/antIconCompat';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { Input, Select } from '../../components/ui-shared/Field';
import { BillingButton } from '../../components/billing/BillingButton';
import { projectApi } from '../../lib/api/project';
import type { ProjectDto, ProjectStatus } from '../../types/project';

import { t } from '@/i18n/translate';

const STATUS_LABEL: Record<ProjectStatus, string> = {
    AWAITING_APPROVAL:t('projects.statusPending'),
    ACTIVE:t('common.active'),
    ON_HOLD:t('projects.statusOnHold'),
    COMPLETED:t('common.completed'),
    CANCELLED:t('common.cancel'),
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
            toast.error(e.response?.data?.error ||t('projects.errorLoad'));
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
                title={t('projects.tableTitle')}
                description={t('projects.description')}
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('projects.activeProjects')} value={stats.active} icon={<BriefcaseBusiness size={14} />} tone="brand" />
                <Stat label={t('projects.pendingApproval')} value={stats.awaiting} icon={<AlertCircle size={14} />} tone="warning" />
                <Stat label={t('projects.fieldReport')} value={stats.reportCount} icon={<CalendarClock size={14} />} tone="success" />
                <Stat label={t('projects.tenderBudget')} value={money(stats.budget)} icon={<CircleDollarSign size={14} />} tone="total" small />
            </div>

            <Card
                title={t('projects.projectList')}
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
                                placeholder={t('projects.searchPlaceholder')}
                                className="w-[230px] pl-8"
                            />
                        </div>
                        <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')} className="w-[150px]">
                            <option value="">{t('auto.tum_durumlar')}</option>
                            {Object.entries(STATUS_LABEL).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </Select>
                        <Button type="submit" variant="secondary" size="sm" className="shrink-0">{t('auto.uygula')}</Button>
                        <Button type="button" variant="ghost" size="sm" icon={<XIcon size={13} />} onClick={clearFilters} className="shrink-0">{t('common.clear')}</Button>
                    </form>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">{t('nav.projects')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('nav.quickActionsGroup.customers')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.teklif')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.butce')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.rapor')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.randevu')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('common.status')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.fatura')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.ac')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i}>
                                    <td colSpan={9} className="px-3 py-3">
                                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                                    </td>
                                </tr>
                            ))}
                            {!loading && projects.length === 0 && (
                                <tr>
                                    <td colSpan={9}>
                                        <div className="px-4 py-4">
                                            <div className="mb-3 flex items-start gap-2 rounded-md border border-[#d30f15]/20 bg-[#d30f15]/5 px-3 py-2 text-[12px] font-medium text-[#b90d12]">
                                                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                                                <span>{t('auto.secili_filtrelere_uygun_proje_bulunamadi_arama_v')}</span>
                                            </div>
                                            <EmptyState
                                                icon={<BriefcaseBusiness size={32} />}
                                                title={t('auto.proje_yok')}
                                                description={t('auto.onayli_teklif_uzerinden_proje_olusturabilirsiniz')}
                                                action={
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSearch('');
                                                            setStatus('');
                                                            void load({ status: '', search: '' });
                                                        }}
                                                    >{t('auto.filtreleri_temizle')}</Button>
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
                                        <td className="px-3 py-2 text-slate-500">{booked ? dayjs(booked.startTime).format("DD.MM.YYYY HH:mm") : '-'}</td>
                                        <td className="px-3 py-2">
                                            <StatusChip variant={STATUS_VARIANT[project.status]}>{STATUS_LABEL[project.status]}</StatusChip>
                                        </td>
                                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                            <BillingButton
                                                target={{ type: 'project', id: project.id, label: project.projectName }}
                                                size="sm"
                                                variant="ghost"
                                            />
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
        card:"border-[#272f67] bg-white",
        label: 'text-[#272f67]',
        value: 'text-[#272f67]',
    },
    success: {
        card:"border-[#059669] bg-white",
        label: 'text-[#059669]',
        value: 'text-[#059669]',
    },
    warning: {
        card:"border-[#f59e0b] bg-white",
        label: 'text-[#f59e0b]',
        value: 'text-[#f59e0b]',
    },
    total: {
        card:"border-[#64748b] bg-white",
        label: 'text-[#64748b]',
        value: 'text-[#64748b]',
    },
};

const Stat = ({ label, value, icon, small, tone = 'brand' }: { label: string; value: string | number; icon: React.ReactNode; small?: boolean; tone?: StatTone }) => {
    const styles = statToneClass[tone];

    return (
        <div className={`rounded-lg border-2 px-4 py-3 ${styles.card}`}>
            <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal ${styles.label}`}>
                {icon}
                {label}
            </div>
            <div className={`mt-1 font-semibold ${small ? 'text-[15px]' : 'text-[21px]'} ${styles.value}`}>{value}</div>
        </div>
    );
};
