import { useEffect, useMemo, useState } from 'react';

import { deliveryReportApi } from '@/lib/api/project';
import { billingApi, myOrdersApi } from '@/lib/api/billing';
import { computeProjectFlow, type ProjectFlow } from '@/lib/projectFlow';
import type { InvoiceDto, MyOrderDto } from '@/types/billing';
import type { ProjectDto } from '@/types/project';

/** A base order or one of its addon orders, flattened for display. */
export type FlowBillItem = {
    id: string;
    label: string;
    amount: number;
    isAddon: boolean;
    /** Technical delivery signed off. Addons inherit their parent's state. */
    technicalDone: boolean;
    billedPercent: number;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/**
 * Loads everything the project flow needs (orders, delivery reports, invoices)
 * and derives the completion picture for a single project. Extracted from
 * ProjectProcessModal so the Details modal can show the same numbers without
 * duplicating the fetch/derive logic.
 *
 * `enabled` keeps the three requests from firing until the consumer is actually
 * visible — the Details modal only mounts its body when open.
 */
export const useProjectFlowSummary = (project: ProjectDto | null, enabled = true) => {
    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [flow, setFlow] = useState<ProjectFlow | null>(null);
    const [loading, setLoading] = useState(true);

    const projectId = project?.id;

    useEffect(() => {
        if (!enabled || !project || !projectId) return;
        let cancelled = false;
        (async () => {
            // Inside the async body, not the effect body: a synchronous setState
            // during the effect would trigger a cascading render.
            setLoading(true);
            try {
                const [allOrders, deliveryReports, projectInvoices] = await Promise.all([
                    myOrdersApi.list(),
                    deliveryReportApi.list({ projectId }),
                    billingApi.listInvoices({ projectId }),
                ]);
                if (cancelled) return;
                const projectOrders = allOrders.filter((o) => o.projectId === projectId);
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
                if (!cancelled) setFlow(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, project, enabled]);

    const billedForOrder = useMemo(() => (orderId: string) =>
        clampPercent(invoices
            .filter((inv) => inv.salesOrderId === orderId && inv.status !== 'CANCELLED')
            .reduce((sum, inv) => sum + (Number(inv.billedPercent) || 0), 0)),
        [invoices]);

    /** Every billable line — base orders and their addons — with both statuses. */
    const items = useMemo<FlowBillItem[]>(() => {
        const rows: FlowBillItem[] = [];
        for (const order of orders) {
            const technicalDone = (flow?.orders || []).find((o) => o.id === order.id)?.deliveryReport === 'completed';
            rows.push({
                id: order.id,
                label: order.orderNumber,
                amount: Number(order.totalAmount) || 0,
                isAddon: false,
                technicalDone,
                billedPercent: billedForOrder(order.id),
            });
            for (const addon of order.addonSalesOrders || []) {
                rows.push({
                    id: addon.id,
                    label: addon.orderNumber,
                    amount: Number(addon.totalAmount) || 0,
                    isAddon: true,
                    // Addons ride on the parent order's delivery report — there is
                    // no separate handover for them.
                    technicalDone,
                    billedPercent: billedForOrder(addon.id),
                });
            }
        }
        return rows;
    }, [orders, flow, billedForOrder]);

    return { flow, orders, invoices, items, loading, billedForOrder };
};
