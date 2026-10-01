import { Mail } from 'lucide-react';

import { PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { MailPanel } from '@/pages/inventory/workspace/MailPanel';
import type { PurchaseOrderRow } from '@/types/inventory';

/**
 * «Manuel gönder» (30.09.2026): der Reiter «E-posta» ist in der Produktion
 * fort — die Automatik sendet selbst. Wer doch von Hand schreiben will (eigener
 * Text, Kopie an jemanden, «manuell gesendet» abhaken), öffnet hier dasselbe
 * Mailfenster wie im Stok.
 */
export const ManualSendDialog = ({ open, order, priceRequest, onClose, onOrderChanged }: {
    open: boolean;
    order: PurchaseOrderRow;
    priceRequest: boolean;
    onClose: () => void;
    onOrderChanged: (next: PurchaseOrderRow) => void;
}) => (
    <PopupDialog
        open={open}
        title={t('productionBom.purchasing.send.manualTitle')}
        subtitle={t('productionBom.purchasing.send.manualHint')}
        icon={<Mail size={18} />}
        width={1120}
        onClose={onClose}
    >
        {open && <MailPanel order={order} priceRequest={priceRequest} onOrderChanged={onOrderChanged} />}
    </PopupDialog>
);
