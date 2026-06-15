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

export interface BillingSummaryDto {
    baseAmount: number;
    billedPercent: number;
    billedAmount: number;
    remainingPercent: number;
    remainingAmount: number;
    invoices: BillingSummaryInvoice[];
}

export interface MyOrderAddonDto {
    id: string;
    orderNumber: string;
    orderType: string;
    status: string;
    revisionNumber?: number | null;
    totalAmount: number;
    createdAt: string;
    billingSummary?: BillingSummaryDto | null;
}

export interface MyOrderDto {
    id: string;
    tenantId: string;
    orderNumber: string;
    orderType: string;
    status: string;
    totalAmount: number;
    createdAt: string;
    customerId?: string | null;
    projectId?: string | null;
    customer?: { id: string; companyName: string; mainEmail?: string | null; mainPhone?: string | null } | null;
    project?: { id: string; projectName: string; status: ProjectStatus; plannedBudget?: number; actualCost?: number } | null;
    createdBy?: { id: string; firstName: string; lastName: string; email: string } | null;
    addonSalesOrders?: MyOrderAddonDto[];
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
    parentSalesOrder?: { id: string; orderNumber: string } | null;
    project?: (MyOrderDto['project'] & {
        startDate?: string | null;
        endDate?: string | null;
        phases?: Array<{ id: string; phaseName: string; progressPercentage: number; isCompleted: boolean }>;
    }) | null;
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
