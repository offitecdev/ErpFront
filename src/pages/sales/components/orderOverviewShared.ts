import type { MyOrderDetailDto } from '@/types/billing';

export interface StageItem { label: string; meta?: string; done: boolean }
export interface Stage { key: string; label: string; completed: boolean; items: StageItem[] }

/**
 * Ein Lieferauftrag hat keine technische Seite — kein Montagebericht, kein
 * Abnahmeprotokoll. Für ihn bleiben nur die kaufmännischen Stufen stehen.
 */
const COMMERCIAL_STAGES = new Set(['quotation', 'billing']);

/** PROJECT_NEW / PROJECT_EXISTING / PROJECT_ADDON laufen über ein Projekt, INVOICE nicht. */
export const isDeliveryOrder = (order: MyOrderDetailDto) =>
    (order.orderType ? order.orderType === 'INVOICE' : !order.project);

/**
 * Welche Fertigstellungsstufen dieser Auftrag überhaupt kennt. Einmal hier
 * entschieden, damit die Kopfzeile und die Übersicht nicht auseinander laufen.
 */
export const stagesForOrder = (order: MyOrderDetailDto, stages: Stage[]) =>
    (isDeliveryOrder(order) ? stages.filter((stage) => COMMERCIAL_STAGES.has(stage.key)) : stages);
