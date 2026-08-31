import { Trash01 } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ProjectSalesOrder } from '@/types/project';

/**
 * "Delete this order?" — a confirmation, so it is the popup kit's centred
 * dialog: red badge, the consequence as the subtitle (deleting a main order
 * takes its addon orders with it), nothing else to read.
 */
export const ProjectDeleteOrderModal = ({
    order,
    hasAddons,
    deleting,
    onClose,
    onConfirm,
}: {
    order: ProjectSalesOrder;
    hasAddons: boolean;
    deleting: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) => (
    <PopupDialog
        open
        title={t('projects.deleteOrderTitle')}
        subtitle={t(
            order.parentSalesOrderId
                ? 'projects.deleteAddonConfirm'
                : hasAddons
                    ? 'projects.detail.deleteMainCascadeConfirm'
                    : 'projects.deleteMainConfirm',
            { orderNumber: order.orderNumber },
        )}
        icon={<Trash01 size={20} />}
        tone="danger"
        width={440}
        onClose={() => { if (!deleting) onClose(); }}
        closeOnBackdrop={!deleting}
        closeOnEscape={!deleting}
        footer={(
            <PopupActions>
                <PopupButton disabled={deleting} onClick={onClose}>{t('common.cancel')}</PopupButton>
                <PopupButton variant="danger" loading={deleting} onClick={onConfirm}>{t('common.delete')}</PopupButton>
            </PopupActions>
        )}
    />
);
