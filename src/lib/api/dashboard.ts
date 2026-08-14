import { getShared } from '../axios';

// Tenant-wide aggregates for the home dashboard — numbers only, no records.
// Both endpoints are permission-gated with "any business view permission";
// callers must treat a 403 as "hide the stats", not as a hard error.

export interface DashboardSummaryDto {
    counts: {
        customers: number;
        tenders: number;
        orders: number;
        projects: number;
        activeProjects: number;
    };
    conversion: {
        tenders: number;
        converted: number;
        toProject: number;
        toDelivery: number;
        /** Percentages 0–100, one decimal. */
        orderRate: number;
        projectRate: number;
        deliveryRate: number;
    };
    financials: {
        quoteValue: number;
        orderValue: { total: number; delivery: number; project: number; other: number };
        orderCountsByType: Array<{ type: string; count: number; total: number }>;
        invoiced: number;
        paid: number;
        open: number;
        unbilled: number;
    };
}

export interface DashboardMonthlyPoint {
    /** "YYYY-MM" */
    month: string;
    tenders: number;
    orders: number;
    orderValue: number;
    invoiced: number;
}

export interface DashboardChartsDto {
    monthly: DashboardMonthlyPoint[];
    tendersByStatus: Array<{ status: string; count: number }>;
    projectsByStatus: Array<{ status: string; count: number }>;
    invoicesByKind: Array<{ kind: string; count: number; total: number }>;
    customersByStatus: Array<{ status: string; count: number }>;
}

export const dashboardApi = {
    getSummary: (): Promise<DashboardSummaryDto> =>
        getShared<DashboardSummaryDto>('/dashboard/summary').then((r) => r.data),
    getCharts: (): Promise<DashboardChartsDto> =>
        getShared<DashboardChartsDto>('/dashboard/charts').then((r) => r.data),
};
