import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    Check,
    Plus,
    Receipt as ReceiptText,
} from '@/components/icons/antIconCompat';

import { SkeletonBar } from '../../components/ui-shared/Loader';
import {
    PopupActions,
    PopupButton,
    PopupCaption,
    PopupDialog,
    PopupEmpty,
    PopupNote,
} from '../../components/ui-shared/PopupKit';
import { BillingDialog } from '../../components/billing/BillingDialog';
import { SpecialClosureModal } from './SpecialClosureModal';
import { useAuthStore } from '../../store/authStore';
import { projectApi, deliveryReportApi } from '../../lib/api/project';
import { billingApi, myOrdersApi } from '../../lib/api/billing';
import { computeProjectFlow, type ProjectFlow } from '../../lib/projectFlow';
import type { InvoiceDto, MyOrderDto } from '../../types/billing';
import type { ProjectDto } from '../../types/project';

import { t } from '@/i18n/translate';

/* The billing sheet is opened from INSIDE this dialog, so it has to stack above
   it (the dialog itself sits at 150). */
const BILLING_SHEET_Z = 200;

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

/** Done / still open, in the popup's own palette. */
const StatePill = ({ done, pendingLabel }: { done: boolean; pendingLabel?: string }) => (
    <span className={`ofi-tp-pill ${done ? 'is-done' : 'is-open'}`}>
        {done
            ? <><Check size={12} strokeWidth={3} />{t('projects.flow.stateCompleted')}</>
            : (pendingLabel || t('projects.flow.statePending'))}
    </span>
);

/** "Technik: ✓ / offen" readout on the right of an order row. */
const OrderStat = ({ label, done }: { label: string; done: boolean }) => (
    <span className="ofi-tp-state">
        {label}
        {done
            ? <Check size={13} strokeWidth={3} className="ofi-tp-state__value is-done" aria-label={t('projects.flow.stateCompleted')} />
            : <span className="ofi-tp-state__value is-open">{t('projects.flow.statePending')}</span>}
    </span>
);

/**
 * The project completion wizard — a centred dialog of the app popup kit
 * (18.08.2026): it asks a question that must be answered, so unlike the details
 * readout it dims the page behind it. Three stops at most: the process picture,
 * the unfinished handovers, the unbilled orders — then the completion curtain.
 */
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
    const [showSpecialClosure, setShowSpecialClosure] = useState(false);
    /** The order currently being invoiced from the billing step. */
    const [billTarget, setBillTarget] = useState<BillItem | null>(null);

    const permissions = useAuthStore((state) => state.permissions);
    // "Special Closure" (Sonderabschluss) is a project-manager-only privilege.
    const canSpecialClose = permissions.includes('projects.manage');

    const alreadyCompleted = project.status === 'COMPLETED';
    const alreadyClosed = alreadyCompleted || project.status === 'SPECIALLY_CLOSED';

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

    const footer = (() => {
        if (loading) {
            return (
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('projects.complete.close')}</PopupButton>
                </PopupActions>
            );
        }
        if (phase === 'done') {
            return (
                <PopupActions>
                    <PopupButton variant="primary" onClick={() => (onCompleted ? onCompleted() : onClose())}>
                        {t('projects.complete.close')}
                    </PopupButton>
                </PopupActions>
            );
        }
        if (phase === 'overview') {
            return (
                <PopupActions
                    start={mode === 'complete' && canSpecialClose && !alreadyClosed && (
                        // Left of the strip — a way out, not the way forward.
                        <PopupButton variant="danger" onClick={() => setShowSpecialClosure(true)}>
                            {t('projects.specialClosure.button')}
                        </PopupButton>
                    )}
                >
                    <PopupButton onClick={onClose}>{t('projects.complete.close')}</PopupButton>
                    {mode === 'complete' && (
                        <PopupButton variant="primary" disabled={alreadyClosed} onClick={evaluate}>
                            {t('projects.complete.completeProject')}
                        </PopupButton>
                    )}
                </PopupActions>
            );
        }
        if (phase === 'technical') {
            return (
                <PopupActions>
                    <PopupButton onClick={() => setPhase('overview')}>{t('projects.complete.back')}</PopupButton>
                    <PopupButton variant="primary" disabled={technicalIncomplete.length > 0} onClick={evaluate}>
                        {t('projects.complete.continue')}
                    </PopupButton>
                </PopupActions>
            );
        }
        // billing
        return (
            <PopupActions>
                <PopupButton onClick={() => setPhase('overview')}>{t('projects.complete.back')}</PopupButton>
                <PopupButton variant="primary" loading={submitting} disabled={!billingComplete} onClick={() => void doComplete()}>
                    {t('projects.complete.completeProject')}
                </PopupButton>
            </PopupActions>
        );
    })();

    return (
        <>
            <PopupDialog
                open
                onClose={onClose}
                title={project.projectName}
                subtitle={t('projects.complete.processDesc')}
                width={680}
                footer={footer}
            >
                {loading && (
                    <div className="space-y-2.5 py-1">
                        <SkeletonBar className="h-10 rounded-lg" />
                        <SkeletonBar className="h-24 rounded-lg" delayMs={120} />
                    </div>
                )}

                {!loading && phase === 'overview' && flow && (
                    <div className="space-y-1">
                        <div className="ofi-tp-list">
                            <div className="ofi-tp-row">
                                <span className="ofi-tp-row__main">
                                    <span className="ofi-tp-row__title">{t('projects.complete.generalStatus')}</span>
                                </span>
                                <span className={`ofi-tp-pill ${alreadyCompleted || generalDone ? 'is-done' : ''}`}>
                                    {alreadyCompleted || generalDone ? t('projects.flow.stateCompleted') : t('projects.flow.stateOngoing')}
                                </span>
                            </div>
                            <div className="ofi-tp-row">
                                <span className="ofi-tp-row__main">
                                    <span className="ofi-tp-row__title">{t('projects.flow.colTechnical')}</span>
                                </span>
                                <StatePill done={flow.technicalStatus === 'completed'} pendingLabel={t('projects.flow.stateOngoing')} />
                            </div>
                            <div className="ofi-tp-row">
                                <span className="ofi-tp-row__main">
                                    <span className="ofi-tp-row__title">{t('projects.flow.colBilling')}</span>
                                </span>
                                <StatePill done={billingComplete} />
                            </div>
                        </div>

                        <PopupCaption>{t('projects.complete.orders')}</PopupCaption>
                        {flow.orders.length === 0 ? (
                            <PopupEmpty>{t('projects.flow.noOrders')}</PopupEmpty>
                        ) : (
                            <div className="ofi-tp-list">
                                {flow.orders.map((order) => {
                                    const addonCount = orders.find((o) => o.id === order.id)?.addonSalesOrders?.length || 0;
                                    return (
                                        <div key={order.id} className="ofi-tp-row">
                                            <span className="ofi-tp-icon"><ReceiptText size={14} /></span>
                                            <span className="ofi-tp-row__main">
                                                <span className="ofi-tp-row__title ofi-tp-code">{order.orderNumber}</span>
                                                {addonCount > 0 && (
                                                    <span className="ofi-tp-row__meta">
                                                        {t('projects.complete.addonCount', { count: addonCount })}
                                                    </span>
                                                )}
                                            </span>
                                            <OrderStat label={t('projects.flow.colTechnical')} done={order.deliveryReport === 'completed'} />
                                            <OrderStat label={t('projects.flow.colBilling')} done={billedForOrder(order.id) >= 100} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {!loading && phase === 'technical' && flow && (
                    <div className="space-y-1">
                        <PopupNote tone="danger">
                            <b>{t('projects.complete.technicalIncompleteTitle')}</b>
                            <div>{t('projects.complete.technicalIncompleteDesc')}</div>
                        </PopupNote>

                        <div className="ofi-tp-list mt-3">
                            {flow.orders.filter((o) => o.deliveryReport !== 'completed').map((order) => {
                                const isSkipped = skipped.has(order.id);
                                return (
                                    <div key={order.id} className="ofi-tp-row">
                                        <span className="ofi-tp-row__main">
                                            <span className="ofi-tp-row__title ofi-tp-code">{order.orderNumber}</span>
                                        </span>
                                        <span className={`ofi-tp-pill ${isSkipped ? '' : 'is-open'}`}>
                                            {isSkipped ? t('projects.complete.skipped') : t('projects.complete.technicalIncompleteBadge')}
                                        </span>
                                        {!isSkipped && (
                                            <PopupButton onClick={() => skipOrder(order.id)}>
                                                {t('projects.complete.skip')}
                                            </PopupButton>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {!loading && phase === 'billing' && (
                    <div className="space-y-1">
                        <PopupNote tone="success">
                            <b>{t('projects.complete.billingGateTitle')}</b>
                            <div>{t('projects.complete.billingGateDesc')}</div>
                        </PopupNote>

                        {billingComplete ? (
                            <PopupNote tone="success" className="mt-3">{t('projects.complete.allBilled')}</PopupNote>
                        ) : (
                            <>
                                <PopupCaption>{t('projects.complete.unbilledItems')}</PopupCaption>
                                <div className="ofi-tp-list">
                                    {unbilledItems.map((item) => (
                                        <div key={item.id} className={`ofi-tp-row ${item.isAddon ? 'is-child' : ''}`}>
                                            <span className={`ofi-tp-icon ${item.isAddon ? 'is-addon' : ''}`}>
                                                {item.isAddon ? <Plus size={14} /> : <ReceiptText size={14} />}
                                            </span>
                                            <span className="ofi-tp-row__main">
                                                <span className="ofi-tp-row__title ofi-tp-code">{item.label}</span>
                                                <span className="ofi-tp-row__meta">
                                                    {money(item.amount)}
                                                    {item.isAddon ? ` · ${t('projects.complete.addonLabel')}` : ''}
                                                </span>
                                            </span>
                                            <PopupButton onClick={() => setBillTarget(item)}>
                                                {t('billing.buttonLabel')}
                                            </PopupButton>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {!loading && phase === 'done' && (
                    <div className="ofi-tp-done">
                        <span className="ofi-tp-done__mark"><Check size={34} strokeWidth={3} /></span>
                        <div>
                            <div className="ofi-tp-done__title">{t('projects.complete.projectCompleted')}</div>
                            <div className="ofi-tp-done__desc">{t('projects.complete.projectCompletedDesc')}</div>
                        </div>
                    </div>
                )}
            </PopupDialog>

            {/* Invoicing an order from the billing step — the sheet stacks above
                this dialog and refreshes only the invoice figures on success. */}
            <BillingDialog
                open={Boolean(billTarget)}
                target={billTarget ? { type: 'order', id: billTarget.id, label: billTarget.label } : null}
                zIndex={BILLING_SHEET_Z}
                onClose={() => setBillTarget(null)}
                onSuccess={() => { setBillTarget(null); void reloadInvoices(); }}
            />

            {showSpecialClosure && (
                <SpecialClosureModal
                    project={project}
                    onClose={() => setShowSpecialClosure(false)}
                    onClosed={() => {
                        setShowSpecialClosure(false);
                        if (onCompleted) onCompleted();
                        else onClose();
                    }}
                />
            )}
        </>
    );
};
