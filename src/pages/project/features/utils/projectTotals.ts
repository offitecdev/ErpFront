import dayjs from 'dayjs';

import type { ProjectDto, ProjectSalesOrder } from '@/types/project';
import { getAddonParentOrder, getOrderRecordDate, scopedRecords } from './projectOrderScope';

// Totals for a single selected order. Addon orders never carry the base budget;
// their total is purely the additional expenses / materials / overtime they captured.
export const calculateTotals = (
    project: ProjectDto | null,
    order: ProjectSalesOrder | null,
    isPrimary: boolean,
    orders: ProjectSalesOrder[] = [],
) => {
    const reports = scopedRecords(project?.reports, order, isPrimary, orders);
    const expenses = scopedRecords(project?.expenses, order, isPrimary, orders).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const overtime = reports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0);
    const extraMaterials = scopedRecords(project?.extraMaterials, order, isPrimary, orders).reduce((sum: number, item: any) => {
        return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);
    const isAddonOrder = Boolean(order?.parentSalesOrderId);
    const orderBudget = isAddonOrder ? 0 : Number(order?.totalAmount ?? project?.plannedBudget ?? 0);
    const additions = expenses + extraMaterials + overtime;
    return { orderBudget, expenses, overtime, extraMaterials, additions, total: orderBudget + additions };
};

// Totals across the whole project (every base order summed, plus all additions).
export const calculateProjectTotals = (project: ProjectDto | null, orders: ProjectSalesOrder[]) => {
    const reports = project?.reports || [];
    const expenses = (project?.expenses || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const overtime = reports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0);
    const extraMaterials = (project?.extraMaterials || []).reduce((sum: number, item: any) => {
        return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);
    const baseOrders = orders.filter((order) => !order.parentSalesOrderId);
    const orderBudget = baseOrders.length
        ? baseOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
        : Number(project?.plannedBudget || 0);
    return { orderBudget, expenses, overtime, extraMaterials, total: orderBudget + expenses + overtime + extraMaterials };
};

// The as-yet-unbilled extra work sitting on a base order after its latest addon.
export const getPendingAddonSummary = (project: ProjectDto, order: ProjectSalesOrder | null, orders: ProjectSalesOrder[]) => {
    const parentOrder = getAddonParentOrder(order, orders);
    const addons = parentOrder
        ? orders
            .filter((candidate) => candidate.parentSalesOrderId === parentOrder.id)
            .sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())
        : [];
    const latestAddon = addons[addons.length - 1] || null;
    const start = latestAddon ? dayjs(latestAddon.createdAt).valueOf() : null;
    const afterLatestAddon = (record: any) => {
        if (!parentOrder || record.salesOrderId !== parentOrder.id) return false;
        if (start === null) return true;
        const rawDate = getOrderRecordDate(record);
        return rawDate ? dayjs(rawDate).valueOf() > start : false;
    };
    const pendingExpenses = (project.expenses || []).filter(afterLatestAddon);
    const pendingExtraMaterials = (project.extraMaterials || []).filter(afterLatestAddon);
    const pendingReports = (project.reports || []).filter(afterLatestAddon);
    const expenseTotal = pendingExpenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const materialTotal = pendingExtraMaterials.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const overtimeTotal = pendingReports.reduce((sum: number, item: any) => sum + Number(item.overtimeCost || 0), 0);
    return {
        parentOrder,
        addons,
        latestAddon,
        pendingExpenses,
        pendingExtraMaterials,
        pendingReports,
        expenseTotal,
        materialTotal,
        overtimeTotal,
        total: expenseTotal + materialTotal + overtimeTotal,
    };
};

// PENDING technician requests to turn this order's extra work into an addon order.
export const getPendingAddonRequests = (project: ProjectDto, order: ProjectSalesOrder | null, orders: ProjectSalesOrder[]) => {
    const parentOrder = getAddonParentOrder(order, orders);
    if (!parentOrder) return [];
    return (project.addonRequests || []).filter((request) => request.status === 'PENDING' && request.salesOrderId === parentOrder.id);
};

export const hasAddonAttention = (project: ProjectDto, order: ProjectSalesOrder | null, orders: ProjectSalesOrder[]) => {
    const summary = getPendingAddonSummary(project, order, orders);
    // An addon order that already exists means the extra work has been processed, so
    // it no longer needs attention. Only genuinely unbilled extra work (`total > 0`)
    // or a still-pending technician request should raise the flag.
    return summary.total > 0 || getPendingAddonRequests(project, order, orders).length > 0;
};
