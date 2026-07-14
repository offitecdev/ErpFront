import dayjs from 'dayjs';

import type { ProjectDto, ProjectSalesOrder } from '@/types/project';
import { localizeTenderNumber } from '@/utils/tenderNumber';

// Sales orders sorted oldest-first (the main order followed by its addons in time order).
export const getProjectSalesOrders = (project?: ProjectDto | null): ProjectSalesOrder[] =>
    [...(project?.salesOrders || [])].sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf());

// The orders shown in the UI. When a project has no real sales order yet but does
// have a tender, we synthesize a single virtual "main" order so the screen still works.
export const getProjectDisplayOrders = (project?: ProjectDto | null): ProjectSalesOrder[] => {
    const orders = getProjectSalesOrders(project);
    if (orders.length || !project?.tender) return orders;
    return [{
        id: `project-main-${project.id}`,
        tenantId: project.tenantId,
        customerId: project.customerId,
        tenderId: project.tenderId || project.tender.id,
        projectId: project.id,
        orderNumber: project.tender.tenderNumber ? localizeTenderNumber(project.tender.tenderNumber) : project.projectName,
        orderType: 'PROJECT_NEW',
        status: 'ORDERED',
        totalAmount: project.plannedBudget,
        createdAt: project.createdAt,
        customer: project.customer,
        tender: project.tender,
    }];
};

// The salesOrderId that record mutations should be stamped with for the given order.
// Virtual "project-main-*" orders have no real id, so records stay unscoped (null).
export const orderPayloadId = (order?: ProjectSalesOrder | null) =>
    order?.id && !order.id.startsWith('project-main-') ? order.parentSalesOrderId || order.id : null;

export const getOrderRecordDate = (record: any) =>
    record.expenseDate || record.addedAt || record.reportDate || record.createdAt || record.workDate || record.startTime || null;

// Narrows a record list (reports / expenses / materials / appointments) to those
// belonging to the selected order. For addon orders the window is the time slice
// between the previous addon and this one; for base orders it is the order id
// (plus any legacy unscoped records when this is the primary order).
export const scopedRecords = <T extends { salesOrderId?: string | null }>(
    records: T[] | undefined,
    order: ProjectSalesOrder | null,
    isPrimary: boolean,
    orders: ProjectSalesOrder[] = [],
) => {
    if (order?.parentSalesOrderId) {
        const previousAddon = orders
            .filter((candidate) =>
                candidate.parentSalesOrderId === order.parentSalesOrderId &&
                dayjs(candidate.createdAt).isBefore(dayjs(order.createdAt))
            )
            .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())[0];
        const start = previousAddon ? dayjs(previousAddon.createdAt).valueOf() : null;
        const end = dayjs(order.createdAt).valueOf();
        return (records || []).filter((record) => {
            if (record.salesOrderId !== order.parentSalesOrderId) return false;
            const rawDate = getOrderRecordDate(record);
            if (!rawDate) return false;
            const time = dayjs(rawDate).valueOf();
            return time <= end && (start === null || time > start);
        });
    }
    const payloadId = orderPayloadId(order);
    if (!payloadId) return records || [];
    return (records || []).filter((record) => record.salesOrderId === payloadId || (isPrimary && !record.salesOrderId));
};

// For an addon order returns its parent (base) order; for a base order returns itself.
export const getAddonParentOrder = (order: ProjectSalesOrder | null, orders: ProjectSalesOrder[]) =>
    order?.parentSalesOrderId
        ? orders.find((candidate) => candidate.id === order.parentSalesOrderId) || null
        : order;
