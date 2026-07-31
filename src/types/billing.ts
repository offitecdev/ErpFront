import type { ProjectStatus } from './project';

export type InvoiceStatus = 'ISSUED' | 'PAID' | 'CANCELLED';
export type InvoiceBillingType = 'FULL' | 'PARTIAL';
export type InvoiceLineSourceType = 'ORDER' | 'OVERTIME' | 'EXPENSE' | 'EXTRA_MATERIAL' | 'MANUAL';

export interface InvoiceLineItemDto {
    id: string;
    invoiceId: string;
    description: string;
    sourceType: InvoiceLineSourceType;
    sourceId?: string | null;
    quantity: number;
    unitAmount: number;
    lineTotal: number;
}

export interface InvoiceDto {
    id: string;
    tenantId: string;
    customerId?: string | null;
    projectId?: string | null;
    salesOrderId?: string | null;
    invoiceNumber: string;
    billingType: InvoiceBillingType;
    billedPercent: number;
    baseAmount: number;
    amount: number;
    status: InvoiceStatus;
    notes?: string | null;
    issuedByEmployeeId: string;
    createdAt: string;
    updatedAt: string;
    lineItems?: InvoiceLineItemDto[];
    customer?: { id: string; companyName: string } | null;
    project?: { id: string; projectName: string } | null;
    salesOrder?: { id: string; orderNumber: string } | null;
    issuedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface BillingSummaryInvoice {
    id: string;
    invoiceNumber: string;
    billingType: InvoiceBillingType;
    billedPercent: number;
    amount: number;
    status: InvoiceStatus;
    createdAt: string;
}

/**
 * The two figures every billing column is derived from — see
 * `orderBillingTotals`. The My Orders list gets only these; the order detail
 * page gets the full `BillingSummaryDto`.
 */
export interface OrderBillingFiguresDto {
    baseAmount: number;
    billedAmount: number;
}

export interface BillingSummaryDto extends OrderBillingFiguresDto {
    billedPercent: number;
    remainingPercent: number;
    remainingAmount: number;
    /** Order-level payment schedule (percent array); null when free-form. */
    paymentStages?: number[] | null;
    /** Derived next stage to bill; null when done or no schedule. */
    nextStage?: { index: number; percent: number; suggestedPercent: number } | null;
    invoices: BillingSummaryInvoice[];
}

/** An additional order as the My Orders list needs it: label + billing figures. */
export interface MyOrderListAddonDto {
    id: string;
    orderNumber: string;
    totalAmount: number;
    billingSummary?: OrderBillingFiguresDto | null;
}

/**
 * One row of `GET /sales-orders/my-orders`.
 *
 * A list shape on purpose — the endpoint selects the table's own columns and
 * the sub-orders under them, nothing more. Anything richer (order type/status,
 * payment schedule, tender/project/creator relations, the invoice breakdown)
 * lives on `MyOrderDetailDto` and is only fetched when a single order is opened.
 */
export interface MyOrderDto {
    id: string;
    orderNumber: string;
    totalAmount: number;
    createdAt: string;
    /** Kept so the project screens can group this feed by project. */
    projectId?: string | null;
    customer?: { id: string; companyName: string } | null;
    addonSalesOrders?: MyOrderListAddonDto[];
    billingSummary?: OrderBillingFiguresDto | null;
}

/** An additional order on the detail page — the full row plus its own summary. */
export interface MyOrderAddonDto extends MyOrderListAddonDto {
    orderType: string;
    status: string;
    revisionNumber?: number | null;
    createdAt: string;
    orderDate?: string | null;
    /** JSON percent array copied from the tender (e.g. "[30,20,10,40]"). */
    paymentStages?: string | null;
    billingSummary?: BillingSummaryDto | null;
}

export interface MyOrderReportDto {
    id: string;
    workDate: string;
    reportType: string;
    operationsDone: string;
    technicalNotes?: string | null;
    workedMinutes: number;
    overtimeMinutes: number;
    overtimeCost: number;
    isSigned: boolean;
    signedAt?: string | null;
    employee?: { id: string; firstName: string; lastName: string } | null;
}

export interface MyOrderCostSummary {
    orderAmount: number;
    expensesTotal: number;
    extraMaterialsTotal: number;
    overtimeTotal: number;
    addonTotal: number;
    grandTotal: number;
}

export interface MyOrderDetailDto extends MyOrderDto {
    tenantId: string;
    orderType: string;
    status: string;
    /** JSON percent array copied from the tender (e.g. "[30,20,10,40]"). */
    paymentStages?: string | null;
    customerId?: string | null;
    customer?: { id: string; companyName: string; mainEmail?: string | null; mainPhone?: string | null; address?: string | null } | null;
    createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
    addonSalesOrders?: MyOrderAddonDto[];
    billingSummary?: BillingSummaryDto | null;
    parentSalesOrder?: { id: string; orderNumber: string } | null;
    project?: {
        id: string;
        projectName: string;
        status: ProjectStatus;
        plannedBudget?: number;
        actualCost?: number;
        startDate?: string | null;
        endDate?: string | null;
        phases?: Array<{ id: string; phaseName: string; progressPercentage: number; isCompleted: boolean }>;
    } | null;
    reports?: MyOrderReportDto[];
    expenses?: Array<{ id: string; expenseType: string; amount: number; description?: string | null; expenseDate: string }>;
    extraMaterials?: Array<{ id: string; quantity: number; unitPrice: number; description?: string | null; addedAt: string; material?: { id: string; name: string; serialId: string } | null }>;
    costSummary?: MyOrderCostSummary;
}

export interface CreateInvoiceInput {
    salesOrderId?: string | null;
    projectId?: string | null;
    billingType: InvoiceBillingType;
    percent?: number | null;
    invoiceNumber?: string | null;
    notes?: string | null;
}
