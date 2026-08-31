import { AlertTriangle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { PopupActions, PopupButton, TenderDialog } from './shell/TenderPopupShell';

type DeleteOfferPopupProps = {
    open: boolean;
    /** Permanently delete the offer — the destructive primary action. */
    onConfirm: () => void;
    /** Keep the offer (X / scrim / cancel). */
    onCancel: () => void;
    /** True while the delete request is in flight. */
    deleting?: boolean;
};

/**
 * "Delete this offer?" — opened from the settings gear. A centred dialog with
 * a scrim: this is the one quote popup that must interrupt whatever the user
 * was doing, so it does not float.
 */
export const DeleteOfferPopup = ({ open, onConfirm, onCancel, deleting = false }: DeleteOfferPopupProps) => (
    <TenderDialog
        open={open}
        onClose={() => { if (!deleting) onCancel(); }}
        title={t('tenders.delete_offer')}
        subtitle={t('tenders.delete_offer_confirm_desc')}
        icon={<AlertTriangle size={20} />}
        tone="danger"
        width={440}
        closeOnBackdrop={!deleting}
        closeOnEscape={!deleting}
        footer={(
            <PopupActions>
                <PopupButton onClick={onCancel} disabled={deleting}>{t('common.cancel')}</PopupButton>
                <PopupButton variant="danger" onClick={onConfirm} loading={deleting}>{t('common.delete')}</PopupButton>
            </PopupActions>
        )}
    />
);
