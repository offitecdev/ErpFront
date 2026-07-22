import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import dayjs from 'dayjs';
import {
    AlertCircle,
    Briefcase01 as BriefcaseBusiness,
    CalendarCheck01 as CalendarClock,
    CurrencyDollarCircle as CircleDollarSign,
    FilterLines,
    Plus,
    SearchLg as Search,
    X as XIcon,
} from '@/components/icons/antIconCompat';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { PageHeader } from '../../components/layout/PageHeader';
import { Select } from '../../components/ui-shared/Field';
import { projectApi, deliveryReportApi } from '../../lib/api/project';
import { billingApi, myOrdersApi } from '../../lib/api/billing';
import { computeProjectFlow, type ProjectFlow } from '../../lib/projectFlow';
import type { ProjectDto, ProjectStatus } from '../../types/project';
import { ProjectStatusBadge } from './features/components/common/ProjectStatusBadge';
import { getStatusLabel } from './features/utils/projectFormatters';

import { t } from '@/i18n/translate';
import { localizeTenderNumber, localizeTenderNumbersInText } from '@/utils/tenderNumber';

const money = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

// The three states a project is filtered by. ProjectStatus still carries the
// legacy AWAITING_APPROVAL / ON_HOLD / CANCELLED values and existing records
// keep rendering their own badge — they are just not offered as filters.
const FILTERABLE_STATUSES: ProjectStatus[] = ['ACTIVE', 'SPECIALLY_CLOSED', 'COMPLETED'];

/** Technical / invoicing progress across all of a project's orders — the plain
 *  figure, no progress bar. */
const PercentCell = ({ percent }: { percent?: number }) => {
    if (percent === undefined) return <span className="text-slate-300">—</span>;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <span className={`font-mono text-[12.5px] font-semibold tabular-nums ${clamped >= 100 ? 'text-emerald-600' : 'text-slate-700'}`}>
            {clamped}%
        </span>
    );
};

export const Projects = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<ProjectStatus | ''>('');
    const [flowMap, setFlowMap] = useState<Record<string, ProjectFlow>>({});
    const [addonMap, setAddonMap] = useState<Record<string, number>>({});
    // Bulk lists for the delivery/billing percentages, fetched once and reused across filters.
    const flowSourcesRef = useRef<{ orders: Awaited<ReturnType<typeof myOrdersApi.list>>; deliveryReports: Awaited<ReturnType<typeof deliveryReportApi.list>>; invoices: Awaited<ReturnType<typeof billingApi.listInvoices>> } | null>(null);

    const load = async (next: { status: ProjectStatus | ''; search: string } = { status, search }) => {
        setLoading(true);
        try {
            // Fetch the project list and the status sources together so the chips
            // render in the same paint as the table instead of popping in later.
            const [list, sources] = await Promise.all([
                projectApi.list(next),
                flowSourcesRef.current
                    ? Promise.resolve(flowSourcesRef.current)
                    : Promise.all([myOrdersApi.list(), deliveryReportApi.list(), billingApi.listInvoices()]).then(
                          ([orders, deliveryReports, invoices]) => ({ orders, deliveryReports, invoices }),
                      ),
            ]);
            flowSourcesRef.current = sources;

            const map: Record<string, ProjectFlow> = {};
            const addons: Record<string, number> = {};
            for (const project of list) {
                const flow = computeProjectFlow(project, {
                    projects: list,
                    orders: sources.orders,
                    deliveryReports: sources.deliveryReports,
                    invoices: sources.invoices,
                    fieldReports: [],
                    generalSignatures: [],
                });
                map[project.id] = flow;
                addons[project.id] = sources.orders
                    .filter((o) => o.projectId === project.id)
                    .reduce((n, o) => n + (o.addonSalesOrders?.length || 0), 0);
            }
            setProjects(list);
            setFlowMap(map);
            setAddonMap(addons);
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
                breadcrumb={t('projects.breadcrumb')}
                title={t('projects.title')}
                description={t('projects.description')}
            />
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('projects.activeProjects')} value={stats.active} icon={<BriefcaseBusiness size={16} />} tone="brand" />
                <Stat label={t('projects.pendingApproval')} value={stats.awaiting} icon={<AlertCircle size={16} />} tone="warning" />
                <Stat label={t('projects.fieldReport')} value={stats.reportCount} icon={<CalendarClock size={16} />} tone="success" />
                <Stat label={t('projects.tenderBudget')} value={money(stats.budget)} icon={<CircleDollarSign size={16} />} tone="total" small />
            </div>

            <Card
                title={t('projects.projectList')}
                icon={<BriefcaseBusiness size={14} />}
                noPadding
                actions={
                    <form
                        className="flex items-center gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            // Searching always spans every status: reset the status
                            // filter so a match is never hidden by a stale selection.
                            setStatus('');
                            void load({ status: '', search });
                        }}
                    >
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('projects.searchPlaceholder')}
                                className="ofi-light-search-input min-h-9 rounded-md border border-slate-300 bg-slate-50/80 py-2 pl-8 pr-2.5 text-[12px] text-slate-950 transition-colors placeholder:text-slate-400 focus:border-[#272f67] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#272f67]/10 dark:bg-white dark:text-slate-950 dark:placeholder:text-slate-400"
                            />
                        </div>
                        <Select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')} size="sm" className="w-[150px] text-[12px]">
                            <option value="">{t('auto.tum_durumlar')}</option>
                            {FILTERABLE_STATUSES.map((key) => (
                                <option key={key} value={key}>{getStatusLabel()[key]}</option>
                            ))}
                        </Select>
                        <Button type="submit" variant="ghost" size="sm" icon={<FilterLines size={12} />}>{t('auto.uygula')}</Button>
                    </form>
                }
            >
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
                                <th className="px-3 py-2 text-left font-semibold">{t('projects.flow.colTechnical')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('projects.flow.colBilling')}</th>
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
                                        <div className="px-4 py-6">
                                            <EmptyState
                                                icon={<BriefcaseBusiness size={32} />}
                                                title={t('auto.proje_yok')}
                                                description={(search || status)
                                                    ?t('auto.secili_filtrelere_uygun_proje_bulunamadi_arama_v')
                                                    :t('auto.onayli_teklif_uzerinden_proje_olusturabilirsiniz')}
                                                action={(search || status) ? (
                                                    <Button variant="secondary" size="sm" icon={<XIcon size={13} />} onClick={clearFilters}>
                                                        {t('auto.filtreleri_temizle')}
                                                    </Button>
                                                ) : undefined}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && projects.map((project) => {
                                // Prefer the next upcoming booked appointment; fall back to the most
                                // recent one so past-only projects still show their last plan.
                                const bookedAll = (project.appointments || [])
                                    .filter((a) => a.status === 'BOOKED')
                                    .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
                                const booked = bookedAll.find((a) => dayjs(a.startTime).isAfter(dayjs())) || bookedAll[bookedAll.length - 1];
                                return (
                                    <tr
                                        key={project.id}
                                        className="cursor-pointer hover:bg-slate-50/70"
                                        onClick={() => navigate(`/projects/${project.id}`)}
                                    >
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-800">{localizeTenderNumbersInText(project.projectName)}</span>
                                                {addonMap[project.id] > 0 && (
                                                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                                                        <Plus size={9} />{t('projects.complete.addonCount', { count: addonMap[project.id] })}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-slate-400">{dayjs(project.createdAt).format('DD.MM.YYYY')}</div>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600">{project.customer?.companyName || project.customerId}</td>
                                        <td className="px-3 py-2 font-mono text-[11.5px] text-slate-500">{project.tender?.tenderNumber ? localizeTenderNumber(project.tender.tenderNumber) : (project.tenderId || '-')}</td>
                                        <td className="px-3 py-2 text-right font-mono">{money(project.plannedBudget)}</td>
                                        <td className="px-3 py-2 text-right font-mono">{project._count?.reports || 0}</td>
                                        <td className="px-3 py-2">
                                            {booked ? (
                                                <span className={`inline-flex items-center gap-1.5 ${dayjs(booked.startTime).isAfter(dayjs()) ? 'text-[#272f67]' : 'text-slate-500'}`}>
                                                    <CalendarClock size={12} className="shrink-0" />
                                                    <span>
                                                        <span className="block font-medium leading-tight">{dayjs(booked.startTime).format('DD.MM.YYYY')}</span>
                                                        <span className="block text-[11px] leading-tight text-slate-400">{dayjs(booked.startTime).format('HH:mm')}</span>
                                                    </span>
                                                </span>
                                            ) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-3 py-2">
                                            <ProjectStatusBadge status={project.status} />
                                        </td>
                                        {/* Percentages across ALL of the project's orders, not a
                                            done/not-done tick: computeProjectFlow already averages
                                            delivery sign-off and invoiced share over every order. */}
                                        <td className="px-3 py-2">
                                            <PercentCell percent={flowMap[project.id]?.technicalPercent} />
                                        </td>
                                        <td className="px-3 py-2">
                                            <PercentCell percent={flowMap[project.id]?.billingPercent} />
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

const statToneClass: Record<StatTone, { bubble: string }> = {
    brand: {
        bubble: 'bg-[#272f67]/10 text-[#272f67]',
    },
    success: {
        bubble: 'bg-emerald-500/10 text-emerald-600',
    },
    warning: {
        bubble: 'bg-amber-500/10 text-amber-600',
    },
    total: {
        bubble: 'bg-slate-500/10 text-slate-600',
    },
};

const Stat = ({ label, value, icon, small, tone = 'brand' }: { label: string; value: string | number; icon: React.ReactNode; small?: boolean; tone?: StatTone }) => {
    const styles = statToneClass[tone];

    return (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-md">
            <div className="flex items-center gap-3">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${styles.bubble}`}>{icon}</span>
                <div className="min-w-0">
                    <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                    <div className={`truncate font-semibold text-slate-900 ${small ? 'text-[15px]' : 'text-[20px]'}`}>{value}</div>
                </div>
            </div>
        </div>
    );
};
