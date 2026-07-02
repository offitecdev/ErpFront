import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';

import { parseInlineNumber } from '../../utils/tenderLine.utils';

type TenderBulkDiscountModalProps = {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    eligibleCount: number;
    value: number;
    onValueChange: (value: number) => void;
    onConfirm: () => void;
};

export const TenderBulkDiscountModal = ({
    open,
    onClose,
    loading,
    eligibleCount,
    value,
    onValueChange,
    onConfirm,
}: TenderBulkDiscountModalProps) => (
    <Modal
        open={open}
        onClose={() => !loading && onClose()}
        title={t('tenders.bulk_discount')}
        description={t('tenders.discount_applies_to_selected_product_lines')}
        width="sm"
        closeOnBackdrop={!loading}
        footer={
            <>
                <Button variant="secondary" onClick={onClose} disabled={loading}>{t('tenders.vazgec')}</Button>
                <Button
                    variant="primary"
                    loading={loading}
                    disabled={eligibleCount === 0}
                    onClick={onConfirm}
                >{t('tenders.bulk_discount_yap')}</Button>
            </>
        }
    >
        <div className="space-y-3">
            <Field label={t('tenders.discount')}>
                <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(event) => onValueChange(parseInlineNumber(event.target.value, 100))}
                />
            </Field>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px]">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">{t('tenders.product_to_apply')}</div>
                <div className="mt-1 font-mono text-lg font-semibold text-emerald-900">{eligibleCount}</div>
            </div>
        </div>
    </Modal>
);
