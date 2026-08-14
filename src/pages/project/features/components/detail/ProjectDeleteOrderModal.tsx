import { Button } from '@/components/ui-shared/Button';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';
import type { ProjectSalesOrder } from '@/types/project';

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
    <Modal
        open
        width="sm"
        title={t('projects.deleteOrderTitle')}
        onClose={() => { if (!deleting) onClose(); }}
        closeOnBackdrop={!deleting}
        footer={(
            <>
                <Button variant="ghost" onClick={onClose} disabled={deleting}>
                    {t('common.cancel')}
                </Button>
                <Button variant="danger" onClick={onConfirm} loading={deleting}>
                    {t('common.delete')}
                </Button>
            </>
        )}
    >
        <p className="text-[13px] text-slate-600">
            {t(
                order.parentSalesOrderId
                    ? 'projects.deleteAddonConfirm'
                    : hasAddons
                        ? 'projects.detail.deleteMainCascadeConfirm'
                        : 'projects.deleteMainConfirm',
                { orderNumber: order.orderNumber },
            )}
        </p>
    </Modal>
);
