import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Briefcase01 as BriefcaseBusiness,
    ChevronDown,
    ChevronRight,
    CheckCircle,
    FileCheck02,
    SearchLg as Search,
    X as XIcon,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Input } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { BillingButton } from '../../components/billing/BillingButton';

import { projectApi, deliveryReportApi, signatureApi } from '../../lib/api/project';
import { billingApi, myOrdersApi } from '../../lib/api/billing';
import { buildProjectFlows, type FlowSources, type ProjectFlow as ProjectFlowData, type StageState, type OrderFlow } from '../../lib/projectFlow';

import { t } from '@/i18n/translate';

const STATE_VARIANT: Record<StageState, 'warning' | 'info' | 'active'> = {
    pending: 'warning',
    ongoing: 'info',
    completed: 'active',
};

const stateLabel = (state: StageState) =>
    state === 'completed'
        ? t('projects.flow.stateCompleted')
        : state === 'ongoing'
            ? t('projects.flow.stateOngoing')
            : t('projects.flow.statePending');

const ProgressBar = ({ percent, tone }: { percent: number; tone: 'brand' | 'success' }) => (
    <div className="flex items-center gap-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
                className={`h-full rounded-full ${tone === 'success' ? 'bg-[#059669]' : 'bg-[#272f67]'}`}
                style={{ width: `${percent}%` }}
            />
        </div>
        <span className="w-9 shrink-0 text-right font-mono text-[11.5px] font-semibold text-slate-600">{percent}%</span>
    </div>
);

const StageCell = ({ label, state, pendingLabel }: { label: string; state: StageState; pendingLabel?: string }) => (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200/70 bg-white px-3 py-2">
        <span className="text-[12px] font-medium text-slate-600">{label}</span>
        <StatusChip variant={STATE_VARIANT[state]}>
            {state === 'pending' && pendingLabel ? pendingLabel : stateLabel(state)}
        </StatusChip>
    </div>
);

const OrderRow = ({ order }: { order: OrderFlow }) => (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-mono text-[12.5px] font-semibold text-slate-800">{order.orderNumber}</div>
            {order.billing === 'completed' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#059669]">
                    <CheckCircle size={13} /> {t('projects.flow.stateCompleted')}
                </span>
            )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StageCell label={t('projects.flow.fieldReport')} state={order.fieldReport} pendingLabel={t('projects.flow.fieldReportPending')} />
            <StageCell label={t('projects.flow.deliveryReport')} state={order.deliveryReport} pendingLabel={t('projects.flow.deliveryPending')} />
            <StageCell label={t('projects.flow.billing')} state={order.billing} />
        </div>
    </div>
);

const ProjectFlowCard = ({ flow, onChanged }: { flow: ProjectFlowData; onChanged: () => void }) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const { project } = flow;

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50/70"
            >
                <span className="text-slate-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-slate-900">{project.projectName}</span>
                        {flow.readyForBilling && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#059669]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#059669]">
                                <CheckCircle size={11} /> {t('projects.flow.readyTitle')}
                            </span>
                        )}
                    </div>
                    <div className="truncate text-[12px] text-slate-500">
                        {project.customer?.companyName || project.customerId} · {flow.orders.length} {t('projects.flow.orders')}
                    </div>
                </div>

                <div className="hidden w-40 shrink-0 lg:block">
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.flow.colTechnical')}</div>
                    <ProgressBar percent={flow.technicalPercent} tone="brand" />
                </div>
                <div className="hidden w-40 shrink-0 lg:block">
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.flow.colGeneral')}</div>
                    <ProgressBar percent={flow.overallPercent} tone="success" />
                </div>

                <div className="hidden w-28 shrink-0 text-center md:block">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.flow.colBilling')}</div>
                    <StatusChip variant={flow.billingStatus === 'completed' ? 'active' : 'warning'}>
                        {flow.billingStatus === 'completed' ? t('projects.flow.stateCompleted') : t('projects.flow.statePending')}
                    </StatusChip>
                </div>
                <div className="w-28 shrink-0 text-center">
                    <div className="mb-1 hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:block">{t('projects.flow.colTechStatus')}</div>
                    <StatusChip variant={flow.technicalStatus === 'completed' ? 'active' : 'info'}>
                        {flow.technicalStatus === 'completed' ? t('projects.flow.stateCompleted') : t('projects.flow.stateOngoing')}
                    </StatusChip>
                </div>
            </button>

            {open && (
                <div className="space-y-3 border-t border-slate-100 bg-slate-50/30 px-4 py-4">
                    {/* Mobile progress summary */}
                    <div className="grid grid-cols-2 gap-3 lg:hidden">
                        <div>
                            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.flow.colTechnical')}</div>
                            <ProgressBar percent={flow.technicalPercent} tone="brand" />
                        </div>
                        <div>
                            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.flow.colGeneral')}</div>
                            <ProgressBar percent={flow.overallPercent} tone="success" />
                        </div>
                    </div>

                    {/* Project-level general report */}
                    <StageCell label={t('projects.flow.generalReport')} state={flow.generalReport} pendingLabel={t('projects.flow.generalReportPending')} />

                    {flow.readyForBilling && (
                        <div className="flex flex-col gap-3 rounded-lg border border-[#059669]/30 bg-[#059669]/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-start gap-2">
                                <CheckCircle size={18} className="mt-0.5 shrink-0 text-[#059669]" />
                                <div>
                                    <div className="text-[13px] font-semibold text-[#047857]">{t('projects.flow.readyTitle')}</div>
                                    <div className="text-[12px] text-[#047857]/80">{t('projects.flow.readyDesc')}</div>
                                </div>
                            </div>
                            <BillingButton
                                target={{ type: 'project', id: project.id, label: project.projectName }}
                                onBilled={onChanged}
                                size="sm"
                                variant="primary"
                                label={t('projects.flow.goBilling')}
                            />
                        </div>
                    )}

                    {!flow.readyForBilling && flow.billingStatus !== 'completed' && (
                        <div className="rounded-md border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-800">
                            {t('projects.flow.allOrdersDeliveredHint')}
                        </div>
                    )}

                    {flow.orders.length === 0 ? (
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-[12px] text-slate-400">
                            {t('projects.flow.noOrders')}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {flow.orders.map((order) => (
                                <OrderRow key={order.id} order={order} />
                            ))}
                        </div>
                    )}

                    <div className="pt-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${project.id}`)}>
                            {t('nav.projectManagement')} →
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const ProjectFlow = () => {
    const [sources, setSources] = useState<FlowSources | null>(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const [projects, orders, deliveryReports, fieldReports, invoices, generalSignatures] = await Promise.all([
                projectApi.list(),
                myOrdersApi.list(),
                deliveryReportApi.list(),
                projectApi.listAllReports(),
                billingApi.listInvoices(),
                signatureApi.list('GENERAL'),
            ]);
            setSources({ projects, orders, deliveryReports, fieldReports, invoices, generalSignatures });
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const flows = useMemo(() => (sources ? buildProjectFlows(sources) : []), [sources]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return flows;
        return flows.filter((f) =>
            f.project.projectName.toLowerCase().includes(q) ||
            (f.project.customer?.companyName || '').toLowerCase().includes(q),
        );
    }, [flows, search]);

    const stats = useMemo(() => {
        const ready = flows.filter((f) => f.readyForBilling).length;
        const technicallyDone = flows.filter((f) => f.technicalStatus === 'completed').length;
        const billed = flows.filter((f) => f.billingStatus === 'completed').length;
        return { ready, technicallyDone, billed };
    }, [flows]);

    return (
        <div>
            <PageHeader
                breadcrumb={t('projects.flow.breadcrumb')}
                title={t('projects.flow.title')}
                description={t('projects.flow.description')}
            />

            <div className="mb-4 grid grid-cols-3 gap-3">
                <Stat label={t('projects.flow.colTechStatus')} value={stats.technicallyDone} icon={<CheckCircle size={14} />} tone="brand" />
                <Stat label={t('projects.flow.readyTitle')} value={stats.ready} icon={<FileCheck02 size={14} />} tone="success" />
                <Stat label={t('projects.flow.colBilling')} value={stats.billed} icon={<BriefcaseBusiness size={14} />} tone="total" />
            </div>

            <Card title={t('projects.flow.title')} icon={<BriefcaseBusiness size={14} />} noPadding>
                <div className="flex flex-nowrap items-center gap-2 border-b border-slate-100 px-3 py-3">
                    <div className="relative flex-1 sm:max-w-xs">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('projects.flow.searchPlaceholder')}
                            className="w-full pl-8 text-slate-950 placeholder:text-slate-400 dark:bg-white dark:text-slate-950"
                        />
                    </div>
                    {search && (
                        <Button type="button" variant="ghost" size="sm" icon={<XIcon size={13} />} onClick={() => setSearch('')}>
                            {t('common.clear')}
                        </Button>
                    )}
                </div>

                <div className="space-y-2.5 p-3">
                    {loading && Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                    ))}

                    {!loading && filtered.length === 0 && (
                        <EmptyState
                            icon={<BriefcaseBusiness size={32} />}
                            title={t('projects.flow.empty')}
                            description={t('projects.flow.emptyHint')}
                        />
                    )}

                    {!loading && filtered.map((flow) => (
                        <ProjectFlowCard key={flow.project.id} flow={flow} onChanged={load} />
                    ))}
                </div>
            </Card>
        </div>
    );
};

type StatTone = 'brand' | 'success' | 'total';

const statToneClass: Record<StatTone, string> = {
    brand: 'border-[#272f67] text-[#272f67]',
    success: 'border-[#059669] text-[#059669]',
    total: 'border-[#64748b] text-[#64748b]',
};

const Stat = ({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: StatTone }) => (
    <div className={`rounded-lg border-2 bg-white px-4 py-3 ${statToneClass[tone]}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal">
            {icon}
            <span className="truncate">{label}</span>
        </div>
        <div className="mt-1 text-[21px] font-semibold">{value}</div>
    </div>
);

export default ProjectFlow;
