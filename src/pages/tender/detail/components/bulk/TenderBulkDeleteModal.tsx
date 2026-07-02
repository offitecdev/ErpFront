import { Button } from '@/components/ui-shared/Button';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';

import type { SimpleTenderLine } from '../../types/tenderDetail.types';

type TenderBulkDeleteModalProps = {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    selectedRows: SimpleTenderLine[];
    onConfirm: () => void;
};

export const TenderBulkDeleteModal = ({ open, onClose, loading, selectedRows, onConfirm }: TenderBulkDeleteModalProps) => (
    <Modal
        open={open}
        onClose={() => !loading && onClose()}
        title={t('tenders.bulk_silme')}
        description={`${selectedRows.length} satır seçildi.`}
        width="sm"
        closeOnBackdrop={!loading}
        footer={
            <>
                <Button variant="secondary" onClick={onClose} disabled={loading}>{t('tenders.vazgec')}</Button>
                <Button variant="danger" loading={loading} onClick={onConfirm}>{t('common.delete')}</Button>
            </>
        }
    >
        <div className="space-y-3 text-[13px]">
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{t('tenders.silmek_istediginizden_emin_misiniz')}</div>
            <div className="rounded-md border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('tenders.silinecek_satirlar')}{selectedRows.length})
                </div>
                <ul className="max-h-[180px] overflow-y-auto divide-y divide-slate-100">
                    {selectedRows.slice(0, 8).map((row) => (
                        <li key={row.id} className="px-3 py-2">
                            <div className="font-medium text-slate-800">{row.position.shortDescription}</div>
                        </li>
                    ))}
                    {selectedRows.length > 8 && (
                        <li className="px-3 py-2 text-slate-500">+{selectedRows.length - 8}{t('tenders.line_daha')}</li>
                    )}
                </ul>
            </div>
        </div>
    </Modal>
);
