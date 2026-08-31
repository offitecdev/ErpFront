import { t } from '@/i18n/translate';
import type { DeliveryReportDto } from '@/lib/api/project';
import type { ProjectSalesOrder } from '@/types/project';

/**
 * Figure cell: right aligned, monospaced and never wrapped, so amounts line up
 * across tables and a narrow column pushes "CHF 2'800.00" onto one line rather
 * than breaking it in half.
 */
export const NUM_CELL = 'whitespace-nowrap text-right font-mono font-semibold text-slate-900 dark:text-white';
/** Same, for the already-invoiced column — the only figure that carries a colour. */
export const NUM_CELL_BILLED = 'whitespace-nowrap text-right font-mono font-semibold text-[#059669] dark:text-[#8fd0ae]';

export type TechnicalState = 'completed' | 'ongoing' | 'pending';
export type DeliveryState = 'delivered' | 'unsigned' | 'none';

/**
 * The delivery reports of one order. A synthetic "project-main-*" order is not a
 * real sales order, so its reports are the ones filed without a sales order id.
 */
export const deliveryReportsForOrder = (
    order: ProjectSalesOrder | null,
    byOrderId: Map<string, DeliveryReportDto[]>,
): DeliveryReportDto[] => {
    if (!order) return [];
    return byOrderId.get(order.id.startsWith('project-main-') ? '' : order.id) || [];
};

export const orderDeliveryState = (rows: DeliveryReportDto[]): DeliveryState =>
    rows.some((row) => row.isSigned) ? 'delivered' : rows.length > 0 ? 'unsigned' : 'none';

// A signed delivery report is what closes an order technically; a drafted one
// means the work is under way.
export const orderTechnicalState = (rows: DeliveryReportDto[]): TechnicalState =>
    rows.some((row) => row.isSigned) ? 'completed' : rows.length > 0 ? 'ongoing' : 'pending';

/* Der WORTLAUT eines Zustands, getrennt vom Plättchen, das ihn zeigt: die
   anklickbare Zeile muss ihn in ihre Vorlesehilfe nehmen (siehe `linkRow`), und
   zwei Stellen, die denselben Zustand verschieden benennen, wären ein Fehler,
   der erst beim Vorlesen auffällt. */
export const deliveryStateLabel = (state: DeliveryState) => (
    state === 'delivered'
        ? t('projects.detail.overview.delivered')
        : state === 'unsigned'
            ? t('projects.delivery.statusUnsigned')
            : t('projects.detail.overview.notDelivered')
);

export const technicalStateLabel = (state: TechnicalState) => (
    state === 'completed'
        ? t('projects.flow.stateCompleted')
        : state === 'ongoing'
            ? t('projects.flow.stateOngoing')
            : t('projects.detail.incomplete')
);
