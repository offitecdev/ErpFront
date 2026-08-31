import { Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import type { SimpleTenderLine } from '../types/tenderDetail.types';
import { PopupActions, PopupButton, TenderDialog } from './shell/TenderPopupShell';

type BulkDeletePopupProps = {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    selectedRows: SimpleTenderLine[];
    onConfirm: () => void;
};

const PREVIEW_ROWS = 8;

/**
 * "Delete the selected lines?" — the rows about to go are listed so the user
 * confirms what they see, not a number.
 */
export const BulkDeletePopup = ({ open, onClose, loading, selectedRows, onConfirm }: BulkDeletePopupProps) => (
    <TenderDialog
        open={open}
        onClose={() => { if (!loading) onClose(); }}
        title={t('tenders.bulk_silme')}
        subtitle={t('tenders.popup.rows_selected', { count: selectedRows.length })}
        icon={<Trash01 size={19} />}
        tone="danger"
        width={460}
        closeOnBackdrop={!loading}
        closeOnEscape={!loading}
        footer={(
            <PopupActions>
                <PopupButton onClick={onClose} disabled={loading}>{t('tenders.vazgec')}</PopupButton>
                <PopupButton variant="danger" onClick={onConfirm} loading={loading}>{t('common.delete')}</PopupButton>
            </PopupActions>
        )}
    >
        <div className="ofi-tp-list ofi-tp-list--scroll" style={{ maxHeight: 220 }}>
            {selectedRows.slice(0, PREVIEW_ROWS).map((row) => (
                <div key={row.id} className="ofi-tp-row">
                    <span className="ofi-tp-row__main">
                        <span className="ofi-tp-row__title">{row.position.shortDescription || '—'}</span>
                    </span>
                </div>
            ))}
            {selectedRows.length > PREVIEW_ROWS && (
                <div className="ofi-tp-row">
                    <span className="ofi-tp-row__meta">{t('tenders.popup.more_rows', { count: selectedRows.length - PREVIEW_ROWS })}</span>
                </div>
            )}
        </div>
        <p className="pt-3 text-[12.5px]" style={{ color: 'var(--ofi-cal-muted)' }}>{t('tenders.silmek_istediginizden_emin_misiniz')}</p>
    </TenderDialog>
);
