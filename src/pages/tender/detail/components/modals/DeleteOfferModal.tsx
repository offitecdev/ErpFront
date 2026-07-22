import React from 'react';
import Modal from 'antd/es/modal';
import { AlertTriangle } from '@/components/icons/antIconCompat';

import { Button } from '../../../../../components/ui-shared/Button';
import { t } from '@/i18n/translate';

interface DeleteOfferModalProps {
    open: boolean;
    /** Permanently delete the offer. Primary (destructive) button. */
    onConfirm: () => void;
    /** Dismiss the popup and keep the offer (backdrop / X / cancel). */
    onCancel: () => void;
    /** True while the delete request is in flight, so the button shows a spinner. */
    deleting?: boolean;
}

/**
 * Destructive confirmation popup for removing an offer. Opened from the offer
 * settings drawer's "Delete offer" option; kept as its own component so the
 * drawer only decides *when* to ask and this owns the "are you sure?" wording.
 */
export const DeleteOfferModal: React.FC<DeleteOfferModalProps> = ({
    open,
    onConfirm,
    onCancel,
    deleting = false,
}) => {
    return (
        <Modal
            open={open}
            onCancel={onCancel}
            centered
            footer={null}
            mask={{ closable: !deleting }}
            keyboard={!deleting}
            width={456}
            destroyOnHidden
        >
            <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <AlertTriangle size={22} />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">{t('tenders.delete_offer')}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t('tenders.delete_offer_confirm_desc')}</p>
                </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
                <Button variant="danger" onClick={onConfirm} loading={deleting} className="flex-1">
                    {t('common.delete')}
                </Button>
                <Button variant="secondary" onClick={onCancel} disabled={deleting} className="flex-1">
                    {t('common.cancel')}
                </Button>
            </div>
        </Modal>
    );
};
