import type { MovementOrigin } from '@/types/inventory';

/** Richtung einer Bewegung, wie die Tabelle sie zeigt: Giriş oder Çıkış. */
export type MovementDirection = 'IN' | 'OUT';

/** Die Wahl im Filter «Hareket»: Richtung und Herkunft, beide mehrfach. */
export interface MovementFilterValue {
    directions: MovementDirection[];
    origins: MovementOrigin[];
}

export const DIRECTION_LABEL: Record<MovementDirection, string> = {
    IN: 'inv.movement.in',
    OUT: 'inv.movement.out',
};

export const ORIGIN_LABEL: Record<MovementOrigin, string> = {
    ORDER_RECEIPT: 'inv.origin.orderReceipt',
    QUICK_ADD: 'inv.origin.quickAdd',
    QUICK_DELETE: 'inv.origin.quickDelete',
    PRODUCTION: 'inv.origin.production',
    REPORT: 'inv.origin.report',
    MANUAL: 'inv.origin.manual',
};
