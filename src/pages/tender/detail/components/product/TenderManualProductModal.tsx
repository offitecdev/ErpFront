import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';

import { RichTextMarkdownEditor } from '../../TenderRichText';
import type { ManualProductForm } from '../../types/tenderDetail.types';
import { parseInlineNumber } from '../../utils/tenderLine.utils';

type TenderManualProductModalProps = {
    open: boolean;
    onClose: () => void;
    manualProduct: ManualProductForm;
    onChange: (product: ManualProductForm) => void;
    onSubmit: () => void;
};

export const TenderManualProductModal = ({
    open,
    onClose,
    manualProduct,
    onChange,
    onSubmit,
}: TenderManualProductModalProps) => (
    <Modal
        open={open}
        onClose={onClose}
        title={t('tenders.tender_only_product')}
        description={t('tenders.bu_product_stock_card_yazilmaz_only_bu_tender')}
        width="lg"
        closeOnBackdrop
        footer={
            <>
                <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                <Button variant="primary" onClick={onSubmit}>{t('tenders.tender_add')}</Button>
            </>
        }
    >
        <div className="grid grid-cols-2 gap-3">
            <Field label={t('tenders.product_adi')} required className="col-span-2">
                <Input value={manualProduct.name} onChange={(event) => onChange({ ...manualProduct, name: event.target.value })} />
            </Field>
            <Field label={t('common.quantity')}>
                <Input type="number" min={0} step="any" value={manualProduct.quantity} onChange={(event) => onChange({ ...manualProduct, quantity: parseInlineNumber(event.target.value) })} />
            </Field>
            <Field label={t('tenders.unit')}>
                <Input value={manualProduct.unit} onChange={(event) => onChange({ ...manualProduct, unit: event.target.value })} />
            </Field>
            <Field label={t('tenders.unit_price')}>
                <Input type="number" min={0} step="any" value={manualProduct.unitPrice} onChange={(event) => onChange({ ...manualProduct, unitPrice: parseInlineNumber(event.target.value) })} />
            </Field>
            <Field label={t('tenders.discount')}>
                <Input type="number" min={0} max={100} step="any" value={manualProduct.discount} onChange={(event) => onChange({ ...manualProduct, discount: parseInlineNumber(event.target.value, 100) })} />
            </Field>
            <Field label={t('tenders.kdv')}>
                <Input type="number" min={0} max={100} step="any" value={manualProduct.taxRate} onChange={(event) => onChange({ ...manualProduct, taxRate: parseInlineNumber(event.target.value, 100) })} />
            </Field>
            <Field label={t('tenders.product_content')} className="col-span-2">
                <RichTextMarkdownEditor
                    value={manualProduct.description}
                    onChange={(description) => onChange({ ...manualProduct, description })}
                    minHeight={140}
                    placeholder=""
                />
            </Field>
        </div>
    </Modal>
);
