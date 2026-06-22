import type { ProjectDto } from '../types/project';
import type { MyOrderDto, InvoiceDto } from '../types/billing';
import type { DeliveryReportDto, ServiceReportDto, SignatureRequestDto } from './api/project';

/**
 * Shared computation for the Project Flow module.
 *
 * Everything here is derived on the client from bulk list endpoints
 * (projects, sales-orders, delivery-reports, field-reports, invoices,
 * general signatures) so the flow board never needs an N+1 fetch.
 */

export type StageState = 'pending' | 'ongoing' | 'completed';

export interface OrderFlow {
    id: string;
    orderNumber: string;
    totalAmount: number;
    fieldReport: StageState;
    deliveryReport: StageState;
    billing: StageState;
    billedPercent: number;
}

export interface ProjectFlow {
    project: ProjectDto;
    orders: OrderFlow[];
    /** Technical completion: signed delivery reports / orders. */
    technicalPercent: number;
    /** Combined technical + billing progress. */
    overallPercent: number;
    billingPercent: number;
    technicalStatus: StageState;
    billingStatus: StageState;
    generalReport: StageState;
    /** All orders delivered & signed, but not yet fully billed. */
    readyForBilling: boolean;
}

export interface FlowSources {
    projects: ProjectDto[];
    orders: MyOrderDto[];
    deliveryReports: DeliveryReportDto[];
    fieldReports: ServiceReportDto[];
    invoices: InvoiceDto[];
    generalSignatures: SignatureRequestDto[];
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const stageFromPercent = (percent: number): StageState =>
    percent >= 100 ? 'completed' : percent > 0 ? 'ongoing' : 'pending';

const billedPercentForOrder = (orderId: string, invoices: InvoiceDto[]): number => {
    const total = invoices
        .filter((inv) => inv.salesOrderId === orderId && inv.status !== 'CANCELLED')
        .reduce((sum, inv) => sum + (Number(inv.billedPercent) || 0), 0);
    return clampPercent(total);
};

const computeOrderFlow = (
    order: MyOrderDto,
    sources: Pick<FlowSources, 'deliveryReports' | 'fieldReports' | 'invoices'>,
): OrderFlow => {
    const field = sources.fieldReports.filter((r) => r.salesOrderId === order.id);
    const fieldReport: StageState = field.some((r) => r.isSigned)
        ? 'completed'
        : field.length > 0
            ? 'ongoing'
            : 'pending';

    const delivery = sources.deliveryReports.filter((r) => r.salesOrderId === order.id);
    const deliveryReport: StageState = delivery.some((r) => r.isSigned)
        ? 'completed'
        : delivery.length > 0
            ? 'ongoing'
            : 'pending';

    const billedPercent = billedPercentForOrder(order.id, sources.invoices);

    return {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: Number(order.totalAmount) || 0,
        fieldReport,
        deliveryReport,
        billing: stageFromPercent(billedPercent),
        billedPercent,
    };
};

const computeProjectBillingPercent = (
    project: ProjectDto,
    orders: OrderFlow[],
    rawOrders: MyOrderDto[],
    invoices: InvoiceDto[],
): number => {
    // Project-scoped invoices (no salesOrderId) cover the whole project.
    const projectLevel = invoices
        .filter((inv) => inv.projectId === project.id && !inv.salesOrderId && inv.status !== 'CANCELLED')
        .reduce((sum, inv) => sum + (Number(inv.billedPercent) || 0), 0);
    if (projectLevel > 0) return clampPercent(projectLevel);

    if (orders.length === 0) return 0;
    // Amount-weighted average across the project's orders.
    const totalAmount = rawOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    if (totalAmount <= 0) {
        const avg = orders.reduce((sum, o) => sum + o.billedPercent, 0) / orders.length;
        return clampPercent(avg);
    }
    const weighted = orders.reduce((sum, o) => sum + o.billedPercent * (o.totalAmount || 0), 0) / totalAmount;
    return clampPercent(weighted);
};

export const computeProjectFlow = (project: ProjectDto, sources: FlowSources): ProjectFlow => {
    const rawOrders = sources.orders.filter((o) => o.projectId === project.id);
    const orders = rawOrders.map((order) => computeOrderFlow(order, sources));

    const deliveredCount = orders.filter((o) => o.deliveryReport === 'completed').length;
    const technicalPercent = orders.length > 0 ? clampPercent((deliveredCount / orders.length) * 100) : 0;

    const billingPercent = computeProjectBillingPercent(project, orders, rawOrders, sources.invoices);
    const overallPercent = clampPercent((technicalPercent + billingPercent) / 2);

    const anyTechnicalProgress = orders.some(
        (o) => o.deliveryReport !== 'pending' || o.fieldReport !== 'pending',
    );
    const technicalStatus: StageState = orders.length > 0 && deliveredCount === orders.length
        ? 'completed'
        : anyTechnicalProgress
            ? 'ongoing'
            : 'pending';

    const billingStatus = stageFromPercent(billingPercent);

    const generals = sources.generalSignatures.filter((s) => s.projectId === project.id);
    const generalReport: StageState = generals.some((s) => s.status === 'SIGNED')
        ? 'completed'
        : generals.length > 0
            ? 'ongoing'
            : 'pending';

    const readyForBilling = orders.length > 0 && technicalStatus === 'completed' && billingStatus !== 'completed';

    return {
        project,
        orders,
        technicalPercent,
        overallPercent,
        billingPercent,
        technicalStatus,
        billingStatus,
        generalReport,
        readyForBilling,
    };
};

export const buildProjectFlows = (sources: FlowSources): ProjectFlow[] =>
    sources.projects.map((project) => computeProjectFlow(project, sources));
