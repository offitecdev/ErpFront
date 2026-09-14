import { primeShared } from '../axios';
import type { ProjectDto } from '../../types/project';
import type { ProjectListInvoiceDto, ProjectListOrderDto } from '../../types/billing';
import type { ProjectListDeliveryReportDto } from './project';
import { batchBody, batchUrl, fetchBatch } from './batch';

/**
 * Everything the project list needs, in one round trip: the projects and the
 * three light "project-list" views its progress columns are computed from.
 * They used to be four requests — four times the 150–200 ms latency.
 *
 * ⚠ index.html prefetches `batchUrl(PROJECT_LIST_GETS)` at document parse time
 *   on /projects. Change this list and the literal list there together, or the
 *   prefetch silently stops matching (the page still works, just slower).
 */
export const PROJECT_LIST_GETS = [
    '/projects',
    '/sales-orders/my-orders?view=project-list',
    '/delivery-reports?view=project-list',
    '/billing/invoices?view=project-list',
];

export type ProjectListBundle = {
    projects: ProjectDto[];
    orders: ProjectListOrderDto[];
    deliveryReports: ProjectListDeliveryReportDto[];
    invoices: ProjectListInvoiceDto[];
};

export const fetchProjectListBundle = async (): Promise<ProjectListBundle> => {
    const results = await fetchBatch(PROJECT_LIST_GETS);
    const [projects, orders, deliveryReports, invoices] = PROJECT_LIST_GETS;
    return {
        projects: batchBody<ProjectDto[]>(results, projects),
        orders: batchBody<ProjectListOrderDto[]>(results, orders),
        deliveryReports: batchBody<ProjectListDeliveryReportDto[]>(results, deliveryReports),
        invoices: batchBody<ProjectListInvoiceDto[]>(results, invoices),
    };
};

/** Hover/intent warm-up (lib/routeIntent.ts). */
export const primeProjectListBundle = () => primeShared(batchUrl(PROJECT_LIST_GETS));
