import { t } from '@/i18n/translate';
import { ORDER_STATUS_META } from '@/pages/inventory/utils/orderStatus';
import type { PurchaseOrderStatus } from '@/types/inventory';

/** Der Stand einer Lieferantenbestellung als Schild — dieselben Farben wie die Bestellliste. */
export const PurchaseStatus = ({ status }: { status: string }) => {
    const meta = ORDER_STATUS_META[status as PurchaseOrderStatus];
    return <span className={`ofi-bom-postatus ${meta?.className ?? ''}`}>{meta ? t(meta.labelKey) : status}</span>;
};
