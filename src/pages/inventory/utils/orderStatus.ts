import type { PurchaseOrderStatus } from '@/types/inventory';

// Sipariş durum rozetleri — StockMovementsPage'deki KIND_META ile aynı desen
// (modül içi yumuşak tonlu pill'ler, koyu tema sınıflarıyla birlikte).
export const ORDER_STATUS_META: Record<PurchaseOrderStatus, { labelKey: string; className: string }> = {
    PENDING: { labelKey: 'inv.orders.status.pending', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    TO_BE_STOCKED: { labelKey: 'inv.orders.status.toBeStocked', className: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    UPDATED: { labelKey: 'inv.orders.status.updated', className: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
    COMPLETED: { labelKey: 'inv.orders.status.completed', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

export const FILTERABLE_ORDER_STATUSES: PurchaseOrderStatus[] = ['PENDING', 'TO_BE_STOCKED', 'UPDATED', 'COMPLETED'];
