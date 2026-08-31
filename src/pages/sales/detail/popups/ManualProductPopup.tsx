import { t } from '@/i18n/translate';

import { RichTextMarkdownEditor } from '../TenderRichText';
import type { ManualProductForm } from '../types/tenderDetail.types';
import { parseInlineNumber } from '../utils/tenderLine.utils';
import { PopupActions, PopupButton, PopupField, TenderFloatCard } from './shell/TenderPopupShell';

type ManualProductPopupProps = {
    open: boolean;
    onClose: () => void;
    manualProduct: ManualProductForm;
    onChange: (product: ManualProductForm) => void;
    onSubmit: () => void;
};

const INPUT = 'ofi-cal-input w-full';
const NUMBER = 'ofi-cal-input w-full text-right tabular-nums';

/**
 * A product that exists only in this quote (no stock card). Name first, then
 * the four figures in one row, then the rich description.
 */
export const ManualProductPopup = ({ open, onClose, manualProduct, onChange, onSubmit }: ManualProductPopupProps) => (
    <TenderFloatCard
        open={open}
        onClose={onClose}
        title={t('tenders.tender_only_product')}
        subtitle={t('tenders.bu_product_stock_card_yazilmaz_only_bu_tender')}
        width={600}
        footer={(
            <PopupActions>
                <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                <PopupButton variant="primary" onClick={onSubmit}>{t('tenders.tender_add')}</PopupButton>
            </PopupActions>
        )}
    >
        <PopupField label={t('tenders.product_adi')} required>
            <input autoFocus className={INPUT} value={manualProduct.name} onChange={(event) => onChange({ ...manualProduct, name: event.target.value })} />
        </PopupField>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-5">
            <PopupField label={t('common.quantity')}>
                <input className={NUMBER} type="number" min={0} step="any" value={manualProduct.quantity} onChange={(event) => onChange({ ...manualProduct, quantity: parseInlineNumber(event.target.value) })} />
            </PopupField>
            <PopupField label={t('tenders.unit')}>
                <input className={INPUT} value={manualProduct.unit} onChange={(event) => onChange({ ...manualProduct, unit: event.target.value })} />
            </PopupField>
            <PopupField label={t('tenders.unit_price')}>
                <input className={NUMBER} type="number" min={0} step="any" value={manualProduct.unitPrice} onChange={(event) => onChange({ ...manualProduct, unitPrice: parseInlineNumber(event.target.value) })} />
            </PopupField>
            <PopupField label={`${t('tenders.discount')} %`}>
                <input className={NUMBER} type="number" min={0} max={100} step="any" value={manualProduct.discount} onChange={(event) => onChange({ ...manualProduct, discount: parseInlineNumber(event.target.value, 100) })} />
            </PopupField>
            <PopupField label={`${t('tenders.kdv')} %`}>
                <input className={NUMBER} type="number" min={0} max={100} step="any" value={manualProduct.taxRate} onChange={(event) => onChange({ ...manualProduct, taxRate: parseInlineNumber(event.target.value, 100) })} />
            </PopupField>
        </div>
        <PopupField label={t('tenders.product_content')}>
            <RichTextMarkdownEditor
                value={manualProduct.description}
                onChange={(description) => onChange({ ...manualProduct, description })}
                minHeight={140}
                placeholder=""
            />
        </PopupField>
    </TenderFloatCard>
);
