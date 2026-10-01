import { t } from '@/i18n/translate';
import { CURRENCY_CODES } from '@/utils/currency';

import { Group, Row } from './formParts';
import type { FormState } from './productForm';

/** «Miktar ve fiyat»: Bestand (bei Seriennummern gezählt), Alışpreis, Mindestbestellmenge. */
export const StockSection = ({
    form,
    update,
    errorFor,
    readOnly,
    serialCount,
}: {
    form: FormState;
    update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
    errorFor: (field: keyof FormState) => string | null;
    readOnly: boolean;
    serialCount: number;
}) => (
    <Group title={t('warehouse.section.stock')}>
        <Row
            label={t('warehouse.fields.quantity')}
            htmlFor="wh-qty"
            hint={form.serialRequired ? t('warehouse.fields.quantityFromSerials') : undefined}
            error={errorFor('quantity')}
        >
            <input
                id="wh-qty"
                className={`ofi-wh-input is-num ${errorFor('quantity') ? 'is-invalid' : ''}`}
                inputMode="decimal"
                value={form.serialRequired ? String(serialCount) : form.quantity}
                readOnly={form.serialRequired}
                disabled={readOnly}
                onChange={(event) => update('quantity', event.target.value)}
            />
        </Row>
        <Row label={t('warehouse.fields.purchasePrice')} htmlFor="wh-price" error={errorFor('purchasePrice')}>
            <div className="ofi-wh-money">
                <input
                    id="wh-price"
                    className={`ofi-wh-input is-num ${errorFor('purchasePrice') ? 'is-invalid' : ''}`}
                    inputMode="decimal"
                    value={form.purchasePrice}
                    placeholder="0.00"
                    disabled={readOnly}
                    onChange={(event) => update('purchasePrice', event.target.value)}
                />
                <select
                    className="ofi-wh-input"
                    aria-label={t('warehouse.fields.currency')}
                    value={form.currency}
                    disabled={readOnly}
                    onChange={(event) => update('currency', event.target.value)}
                >
                    {CURRENCY_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
            </div>
        </Row>
        <Row
            label={t('warehouse.fields.minimumOrderQuantity')}
            htmlFor="wh-moq"
            hint={t('warehouse.fields.minimumOrderQuantityHint')}
            error={errorFor('minimumOrderQuantity')}
        >
            <input
                id="wh-moq"
                className={`ofi-wh-input is-num ${errorFor('minimumOrderQuantity') ? 'is-invalid' : ''}`}
                inputMode="decimal"
                value={form.minimumOrderQuantity}
                placeholder="—"
                disabled={readOnly}
                onChange={(event) => update('minimumOrderQuantity', event.target.value)}
            />
        </Row>
    </Group>
);
