import { Mail, X } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';

import { isBlankRow, isEmail, withBlankRow, type SupplierRow } from '../supplierRows';
import { sameText } from '../warehouseText';
import { BarcodeInput } from './BarcodeInput';
import { SupplierSelect, type SupplierValue } from './SupplierSelect';

/**
 * ── DIE LIEFERANTEN DER KARTE (dritter/vierter Durchgang, 26.09.2026) ───────
 *
 * «Bir ürün kartında birden fazla tedarikçi olabilir» — und neben jedem
 * Lieferanten SEIN Barcode des Produkts: «bu tedarikçi ürün kodu değil
 * aslında bu ürün barkodu olması lazım … barkod okutma yeri de tedarikçi
 * yanında, orada buton olacak.»
 *
 * 30.09.2026 dazu SEINE E-Mail («tedarikçi kısmında tedarikçi, tedarikçi
 * maili, ürün barkodu olması gerekmektedir») — an sie geht die automatische
 * Preisanfrage. Wer einen Lieferanten aus der Liste wählt, bekommt dessen
 * E-Mail vorgeschlagen (die leere Zelle wird gefüllt, eine getippte bleibt).
 *
 * Am Ende steht immer eine leere Zeile bereit («hep bir boş input olması
 * lazım»); sobald sie etwas trägt, kommt die nächste. Derselbe Lieferant
 * zweimal wird abgewiesen. Der erste Lieferant steht in der Liste der Karten.
 */
export const SupplierListEditor = ({
    rows,
    onChange,
    disabled,
    invalidKey,
}: {
    rows: SupplierRow[];
    onChange: (next: SupplierRow[]) => void;
    disabled?: boolean;
    /** Die Zeile, an der der letzte Fehler hängt. */
    invalidKey?: string | null;
}) => {
    const commit = (next: SupplierRow[]) => onChange(withBlankRow(next));
    const setRow = (key: string, patch: Partial<SupplierRow>) =>
        commit(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

    const pick = (key: string, value: SupplierValue | null) => {
        if (value && rows.some((row) => row.key !== key && row.value
            && (value.id ? row.value.id === value.id : sameText(row.value.name, value.name)))) {
            toast.error(t('warehouse.supplier.duplicate', { name: value.name }));
            return;
        }
        const row = rows.find((entry) => entry.key === key);
        const suggested = value?.email?.trim() ?? '';
        setRow(key, { value, ...(row && !row.email.trim() && suggested ? { email: suggested } : {}) });
    };

    const remove = (key: string) => commit(rows.filter((row) => row.key !== key));

    return (
        <div className="ofi-wh-suppliers has-email">
            <div className="ofi-wh-suppliers__head" aria-hidden>
                <span>{t('warehouse.supplier.columns.name')}</span>
                <span>{t('warehouse.supplier.columns.email')}</span>
                <span>{t('warehouse.supplier.columns.barcode')}</span>
            </div>
            {rows.map((row, index) => {
                const ready = index === rows.length - 1 && isBlankRow(row);
                const name = row.value?.name ?? null;
                const emailBad = Boolean(row.email.trim()) && !isEmail(row.email);
                const emailMissing = Boolean(row.value) && !row.email.trim();
                return (
                    <div key={row.key} className={`ofi-wh-suppliers__row ${ready ? 'is-ready' : ''}`}>
                        <div className="ofi-wh-suppliers__pick">
                            <SupplierSelect
                                value={row.value}
                                onChange={(next) => pick(row.key, next)}
                                disabled={disabled}
                                invalid={row.key === invalidKey && !row.value}
                                taken={rows.flatMap((other) => (other.key !== row.key && other.value ? [other.value] : []))}
                            />
                        </div>
                        <label className={`ofi-wh-field ofi-wh-suppliers__email${emailBad || (row.key === invalidKey && row.email.trim()) ? ' is-invalid' : ''}${emailMissing ? ' is-missing' : ''}`}>
                            <Mail className="ofi-wh-field__lead" aria-hidden />
                            <input
                                type="email"
                                inputMode="email"
                                autoComplete="off"
                                spellCheck={false}
                                value={row.email}
                                disabled={disabled}
                                placeholder={t('warehouse.supplier.emailPlaceholder')}
                                aria-label={name ? t('warehouse.supplier.emailOf', { name }) : t('warehouse.supplier.emailLabel', { index: index + 1 })}
                                onChange={(event) => setRow(row.key, { email: event.target.value })}
                            />
                        </label>
                        <BarcodeInput
                            value={row.barcode}
                            onChange={(next) => setRow(row.key, { barcode: next })}
                            ariaLabel={name
                                ? t('warehouse.supplier.barcodeOf', { name })
                                : t('warehouse.supplier.barcodeLabel', { index: index + 1 })}
                            placeholder={t('warehouse.supplier.barcodePlaceholder')}
                            scanTitle={name ? t('warehouse.supplier.scanTitleOf', { name }) : t('warehouse.supplier.scanTitle')}
                            invalid={row.key === invalidKey && !row.email.trim()}
                            disabled={disabled}
                        />
                        {!disabled && (
                            <button
                                type="button"
                                className="ofi-wh-suppliers__remove ofi-nosize"
                                title={t('warehouse.supplier.remove')}
                                aria-label={t('warehouse.supplier.remove')}
                                disabled={ready}
                                onClick={() => remove(row.key)}
                            >
                                <X />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
