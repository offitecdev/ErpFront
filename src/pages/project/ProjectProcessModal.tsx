import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    AlertTriangle,
    Check,
    CheckCircle as CheckCircle2,
    Plus,
    Receipt as ReceiptText,
} from '@/components/icons/antIconCompat';

import { Modal } from '../../components/ui-shared/Modal';
import { Button } from '../../components/ui-shared/Button';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { BillingButton } from '../../components/billing/BillingButton';
import { projectApi, deliveryReportApi } from '../../lib/api/project';
import { billingApi, myOrdersApi } from '../../lib/api/billing';
import { computeProjectFlow, type ProjectFlow } from '../../lib/projectFlow';
import type { InvoiceDto, MyOrderDto } from '../../types/billing';
import type { ProjectDto } from '../../types/project';

import { t } from '@/i18n/translate';

type Phase = 'overview' | 'technical' | 'billing' | 'done';

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

/** Flat billable item: a base order or one of its addon orders. */
interface BillItem {
    id: string;
    label: string;
    amount: number;
    isAddon: boolean;
}

const DoneChip = ({ done, pendingLabel }: { done: boolean; pendingLabel?: string }) => (
    <StatusChip variant={done ? 'active' : 'warning'}>
        {done ? t('projects.flow.stateCompleted') : (pendingLabel || t('projects.flow.statePending'))}
    </StatusChip>
);

export const ProjectProcessModal = ({
    project,
    mode,
    onClose,
    onCompleted,
}: {
    project: ProjectDto;
    /** 'progress' = read-only status pop-up; 'complete' = the completion wizard. */
    mode: 'progress' | 'complete';
    onClose: () => void;
    onCompleted?: () => void;
}) => {
    const [phase, setPhase] = useState<Phase>('overview');
    const [skipped, setSkipped] = useState<Set<string>>(new Set());
    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [flow, setFlow] = useState<ProjectFlow | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const alreadyCompleted = project.status === 'COMPLETED';

    // Everything the flow needs is derived client-side from the bulk lists.
    const loadSources = async () => {
        try {
            const [allOrders, deliveryReports, projectInvoices] = await Promise.all([
                myOrdersApi.list(),
                deliveryReportApi.list({ projectId: project.id }),
                billingApi.listInvoices({ projectId: project.id }),
            ]);
            const projectOrders = allOrders.filter((o) => o.projectId === project.id);
            setOrders(projectOrders);
            setInvoices(projectInvoices);
            setFlow(computeProjectFlow(project, {
                projects: [project],
                orders: projectOrders,
                deliveryReports,
                invoices: projectInvoices,
                fieldReports: [],
                generalSignatures: [],
            }));
        } catch {
            setFlow(null);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void loadSources();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id]);

    // Refresh only the invoice-derived parts after billing from inside the modal.
    const reloadInvoices = async () => {
        try {
            setInvoices(await billingApi.listInvoices({ projectId: project.id }));
        } catch {
            /* keep previous */
        }
    };

    const billItems = useMemo<BillItem[]>(() => {
        const items: BillItem[] = [];
        for (const order of orders) {
            items.push({ id: order.id, label: order.orderNumber, amount: Number(order.totalAmount) || 0, isAddon: false });
            for (const addon of order.addonSalesOrders || []) {
                items.push({ id: addon.id, label: addon.orderNumber, amount: Number(addon.totalAmount) || 0, isAddon: true });
            }
        }
        return items;
    }, [orders]);

    const billedForOrder = (orderId: string) =>
        clampPercent(invoices
            .filter((inv) => inv.salesOrderId === orderId && inv.status !== 'CANCELLED')
            .reduce((sum, inv) => sum + (Number(inv.billedPercent) || 0), 0));

    const projectLevelBilled = clampPercent(invoices
        .filter((inv) => inv.projectId === project.id && !inv.salesOrderId && inv.status !== 'CANCELLED')
        .reduce((sum, inv) => sum + (Number(inv.billedPercent) || 0), 0));

    const unbilledItems = projectLevelBilled >= 100
        ? []
        : billItems.filter((item) => billedForOrder(item.id) < 100);
    const billingComplete = unbilledItems.length === 0;

    const technicalIncomplete = (flow?.orders || []).filter((o) => o.deliveryReport !== 'completed' && !skipped.has(o.id));

    const doComplete = async () => {
        setSubmitting(true);
        try {
            await projectApi.update(project.id, { status: 'COMPLETED' });
            setPhase('done');
            toast.success(t('projects.complete.completeSuccess'));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.complete.completeError'));
        } finally {
            setSubmitting(false);
        }
    };

    const evaluate = () => {
        if (technicalIncomplete.length > 0) {
            setPhase('technical');
            return;
        }
        if (!billingComplete) {
            setPhase('billing');
            return;
        }
        void doComplete();
    };

    const skipOrder = (orderId: string) => {
        setSkipped((prev) => {
            const next = new Set(prev);
            next.add(orderId);
            return next;
        });
    };

    const generalDone = flow?.technicalStatus === 'completed' && billingComplete;
    const generalStatusChip = (
        <StatusChip variant={alreadyCompleted || generalDone ? 'active' : 'info'}>
            {alreadyCompleted || generalDone ? t('projects.flow.stateCompleted') : t('projects.flow.stateOngoing')}
        </StatusChip>
    );

    const footer = (() => {
        if (loading) return <Button variant="ghost" onClick={onClose}>{t('projects.complete.close')}</Button>;
        if (phase === 'done') {
            return <Button variant="primary" onClick={() => (onCompleted ? onCompleted() : onClose())}>{t('projects.complete.close')}</Button>;
        }
        if (phase === 'overview') {
            return (
                <>
                    <Button variant="ghost" onClick={onClose}>{t('projects.complete.close')}</Button>
                    {mode === 'complete' && (
                        <Button variant="primary" disabled={alreadyCompleted} onClick={evaluate}>
                            {t('projects.complete.completeProject')}
                        </Button>
                    )}
                </>
            );
        }
        if (phase === 'technical') {
            return (
                <>
                    <Button variant="ghost" onClick={() => setPhase('overview')}>{t('projects.complete.back')}</Button>
                    <Button variant="primary" disabled={technicalIncomplete.length > 0} onClick={evaluate}>
                        {t('projects.complete.continue')}
                    </Button>
                </>
            );
        }
        // billing
        return (
            <>
                <Button variant="ghost" onClick={() => setPhase('overview')}>{t('projects.complete.back')}</Button>
                <Button variant="primary" loading={submitting} disabled={!billingComplete} onClick={() => void doComplete()}>
                    {t('projects.complete.completeProject')}
                </Button>
            </>
        );
    })();

    return (
        <Modal
            open
            onClose={onClose}
            title={project.projectName}
            description={t('projects.complete.processDesc')}
            width="lg"
            footer={footer}
        >
            {loading && <div className="h-40 animate-pulse rounded-lg bg-slate-100" />}

            {!loading && phase === 'overview' && flow && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{t('projects.complete.generalStatus')}</span>
                        {generalStatusChip}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-slate-50/50 px-3 py-2.5">
                            <span className="text-[12px] font-semibold text-slate-600">{t('projects.flow.colTechnical')}</span>
                            <DoneChip done={flow.technicalStatus === 'completed'} pendingLabel={t('projects.flow.stateOngoing')} />
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-slate-50/50 px-3 py-2.5">
                            <span className="text-[12px] font-semibold text-slate-600">{t('projects.flow.colBilling')}</span>
                            <DoneChip done={billingComplete} />
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.complete.orders')}</div>
                        <div className="space-y-2">
                            {flow.orders.length === 0 ? (
                                <div className="rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-[12px] text-slate-400">{t('projects.flow.noOrders')}</div>
                            ) : flow.orders.map((order) => {
                                const addonCount = orders.find((o) => o.id === order.id)?.addonSalesOrders?.length || 0;
                                return (
                                    <div key={order.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#272f67] text-white"><ReceiptText size={14} /></span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-mono text-[12.5px] font-semibold text-slate-800">{order.orderNumber}</span>
                                                {addonCount > 0 && (
                                                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                                                        <Plus size={9} />{t('projects.complete.addonCount', { count: addonCount })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <StatusChip variant={order.deliveryReport === 'completed' ? 'active' : 'warning'}>
                                            {t('projects.flow.colTechnical')}: {order.deliveryReport === 'completed' ? t('projects.flow.stateCompleted') : t('projects.flow.statePending')}
                                        </StatusChip>
                                        <StatusChip variant={billedForOrder(order.id) >= 100 ? 'active' : 'warning'}>
                                            {t('projects.flow.colBilling')}: {billedForOrder(order.id) >= 100 ? t('projects.flow.stateCompleted') : t('projects.flow.statePending')}
                                        </StatusChip>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {!loading && phase === 'technical' && flow && (
                <div className="space-y-4">
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                        <div>
                            <div className="text-[13px] font-semibold text-red-700">{t('projects.complete.technicalIncompleteTitle')}</div>
                            <div className="mt-0.5 text-[12px] text-red-700/80">{t('projects.complete.technicalIncompleteDesc')}</div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {flow.orders.filter((o) => o.deliveryReport !== 'completed').map((order) => {
                            const isSkipped = skipped.has(order.id);
                            return (
                                <div key={order.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-mono text-[12.5px] font-semibold text-slate-800">{order.orderNumber}</div>
                                        <div className="mt-0.5">
                                            <StatusChip variant={isSkipped ? 'passive' : 'warning'}>
                                                {isSkipped ? t('projects.complete.skipped') : t('projects.complete.technicalIncompleteBadge')}
                                            </StatusChip>
                                        </div>
                                    </div>
                                    {!isSkipped && (
                                        <Button variant="secondary" size="sm" onClick={() => skipOrder(order.id)}>
                                            {t('projects.complete.skip')}
                                        </Button>
                                    )}
                                    {isSkipped && <CheckCircle2 size={18} className="shrink-0 text-slate-400" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {!loading && phase === 'billing' && (
                <div className="space-y-4">
                    <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#059669]" />
                        <div>
                            <div className="text-[13px] font-semibold text-[#047857]">{t('projects.complete.billingGateTitle')}</div>
                            <div className="mt-0.5 text-[12px] text-[#047857]/80">{t('projects.complete.billingGateDesc')}</div>
                        </div>
                    </div>

                    {billingComplete ? (
                        <div className="rounded-md border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 text-[12px] font-medium text-[#047857]">{t('projects.complete.allBilled')}</div>
                    ) : (
                        <div>
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.complete.unbilledItems')}</div>
                            <div className="space-y-2">
                                {unbilledItems.map((item) => (
                                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${item.isAddon ? 'bg-amber-100 text-amber-700' : 'bg-[#272f67] text-white'}`}>
                                            {item.isAddon ? <Plus size={14} /> : <ReceiptText size={14} />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-mono text-[12.5px] font-semibold text-slate-800">{item.label}</span>
                                                {item.isAddon && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">{t('projects.complete.addonLabel')}</span>}
                                            </div>
                                            <div className="mt-0.5 font-mono text-[11px] text-slate-400">{money(item.amount)}</div>
                                        </div>
                                        <BillingButton
                                            target={{ type: 'order', id: item.id, label: item.label }}
                                            onBilled={() => void reloadInvoices()}
                                            size="sm"
                                            variant="secondary"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {!loading && phase === 'done' && (
                <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                    <Check size={80} strokeWidth={3} className="text-[#059669] duration-500 animate-in zoom-in-50" />
                    <div>
                        <div className="text-[16px] font-bold text-slate-900">{t('projects.complete.projectCompleted')}</div>
                        <div className="mt-1 text-[13px] text-slate-500">{t('projects.complete.projectCompletedDesc')}</div>
                    </div>
                </div>
            )}
        </Modal>
    );
};
