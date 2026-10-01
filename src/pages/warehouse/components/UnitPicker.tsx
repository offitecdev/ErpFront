import { t } from '@/i18n/translate';
import { WAREHOUSE_UNITS, type WarehouseUnit } from '@/types/warehouse';

/**
 * ── DIE EINHEIT DER KARTE (30.09.2026, Vorgabe Samet) ──────────────────────
 * «Her ürünün de birim türü olmalıdır — adet, uzunluk … bom listede vardı,
 *  oraya otomatik gelmesi gerekmektedir.» Fünf Kapseln wie das Segment von
 * SwiftUI (dieselben Einheiten wie die BOM-Zeile); die gewählte trägt die
 * weisse Plakette. Eine neue BOM-Zeile übernimmt sie.
 */
export const UnitPicker = ({
    value,
    onChange,
    disabled,
    invalid,
    id,
}: {
    value: WarehouseUnit | null;
    onChange: (next: WarehouseUnit) => void;
    disabled?: boolean;
    invalid?: boolean;
    id?: string;
}) => (
    <div
        id={id}
        role="radiogroup"
        aria-label={t('warehouse.fields.unit')}
        className={`ofi-wh-units${invalid ? ' is-invalid' : ''}${disabled ? ' is-disabled' : ''}`}
    >
        {WAREHOUSE_UNITS.map((unit) => (
            <button
                key={unit}
                type="button"
                role="radio"
                aria-checked={value === unit}
                disabled={disabled}
                className={`ofi-wh-units__pill ofi-nosize${value === unit ? ' is-on' : ''}`}
                onClick={() => onChange(unit)}
            >
                {t(`warehouse.units.${unit}`)}
            </button>
        ))}
    </div>
);
