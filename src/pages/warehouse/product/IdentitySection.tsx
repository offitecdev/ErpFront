import type { RefObject } from 'react';

import { t } from '@/i18n/translate';
import type { WarehouseCatalog, WarehouseGroupRef, WarehouseUnit } from '@/types/warehouse';

import { MaterialGroupSelect } from '../components/MaterialGroupSelect';
import { UnitPicker } from '../components/UnitPicker';
import { Group, Row } from './formParts';
import type { FormState } from './productForm';

export interface ErpCodeState {
    value: string | null;
    pending: string | null;
    hint: string;
}

/**
 * ── «TANIM» — WER DIE KARTE IST ─────────────────────────────────────────────
 * ERP-Code (vom System), Materialgruppe, Name (Pflicht), Marke, «Üretici
 * kodu» (früher «Model numarası» — Samet 30.09.2026: «model numarasını
 * kaldırın … basılmayacak»), «Ürün kodu» (steht im PDF des Lieferanten,
 * «şimdilik boş, talepler geldikçe dolduracağız») und die Einheit.
 */
export const IdentitySection = ({
    form,
    update,
    errorFor,
    readOnly,
    isNew,
    catalog,
    codeState,
    groupCleared,
    nameRef,
}: {
    form: FormState;
    update: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
    errorFor: (field: keyof FormState) => string | null;
    readOnly: boolean;
    isNew: boolean;
    catalog: WarehouseCatalog | null;
    codeState: ErpCodeState;
    groupCleared: boolean;
    nameRef: RefObject<HTMLInputElement | null>;
}) => (
    <Group title={t('warehouse.section.identity')}>
        <Row label={t('warehouse.fields.erpCode')} hint={codeState.hint || undefined}>
            <div className="ofi-wh-erp" aria-live="polite">
                {codeState.value && (
                    <span className={`ofi-wh-erp__code ${codeState.pending || groupCleared ? 'is-old' : ''}`}>
                        {codeState.value}
                    </span>
                )}
                {codeState.pending && (
                    <span className="ofi-wh-erp__next">
                        {codeState.value && <span aria-hidden>→</span>}
                        {codeState.pending}
                    </span>
                )}
                {!codeState.value && !codeState.pending && <span className="ofi-wh-erp__empty">—</span>}
            </div>
        </Row>
        <Row label={t('warehouse.fields.materialGroup')} error={errorFor('materialGroup')}>
            <MaterialGroupSelect
                value={form.materialGroup}
                catalog={catalog}
                onChange={(next: WarehouseGroupRef | null) => update('materialGroup', next)}
                disabled={readOnly}
                invalid={Boolean(errorFor('materialGroup'))}
            />
        </Row>
        <Row label={t('warehouse.fields.name')} htmlFor="wh-name" required error={errorFor('name')}>
            <input
                id="wh-name"
                ref={nameRef}
                className={`ofi-wh-input ${errorFor('name') ? 'is-invalid' : ''}`}
                value={form.name}
                maxLength={255}
                autoFocus={isNew}
                aria-required
                disabled={readOnly}
                onChange={(event) => update('name', event.target.value)}
            />
        </Row>
        <Row label={t('warehouse.fields.productCode')} htmlFor="wh-product-code" hint={t('warehouse.fields.productCodeHint')}>
            <input
                id="wh-product-code"
                className="ofi-wh-input is-mono"
                value={form.productCode}
                maxLength={120}
                spellCheck={false}
                disabled={readOnly}
                onChange={(event) => update('productCode', event.target.value)}
            />
        </Row>
        <Row label={t('warehouse.fields.brand')} htmlFor="wh-brand">
            <input id="wh-brand" className="ofi-wh-input" value={form.brand} maxLength={120} disabled={readOnly} onChange={(event) => update('brand', event.target.value)} />
        </Row>
        <Row label={t('warehouse.fields.modelNumber')} htmlFor="wh-model" hint={t('warehouse.fields.modelNumberHint')}>
            <input id="wh-model" className="ofi-wh-input is-mono" value={form.modelNumber} maxLength={120} spellCheck={false} disabled={readOnly} onChange={(event) => update('modelNumber', event.target.value)} />
        </Row>
        <Row label={t('warehouse.fields.unit')} htmlFor="wh-unit" required error={errorFor('unit')}>
            <UnitPicker
                id="wh-unit"
                value={form.unit}
                onChange={(next: WarehouseUnit) => update('unit', next)}
                disabled={readOnly}
                invalid={Boolean(errorFor('unit'))}
            />
        </Row>
    </Group>
);
