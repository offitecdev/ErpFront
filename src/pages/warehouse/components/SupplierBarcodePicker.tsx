import { useState } from 'react';

import { t } from '@/i18n/translate';

import { isBlankRow, withBlankRow, type SupplierRow } from '../supplierRows';
import { isValidEan13 } from '../warehouseCodes';
import { BarcodeInput } from './BarcodeInput';
import { Ean13Barcode } from './Ean13Barcode';

/** Ein EAN-13 (oder ein UPC-A, der mit führender 0 einer ist) — sonst nichts zum Zeichnen. */
const drawableEan = (code: string): string | null => {
    const clean = code.trim();
    if (isValidEan13(clean)) return clean;
    if (/^\d{12}$/.test(clean) && isValidEan13(`0${clean}`)) return `0${clean}`;
    return null;
};

/**
 * ── DER HERSTELLERBARCODE JE LIEFERANT (vierter Durchgang, 26.09.2026) ──────
 *
 * «Barkod alanlarına göre tedarikçi seçim yeri olacak — eklenen tedarikçileri
 *  seçtikçe barkodlar değişecek.»
 *
 * In der Tafel «Barkodlar»: oben die Lieferanten der Karte als Segmente,
 * darunter der Barcode des gewählten — dasselbe Feld wie in seiner Zeile unter
 * «Tedarikçiler» (tippen, Handscanner, Kamera), und ein gültiger EAN-13 steht
 * als Strichcode darunter. Ohne Lieferanten gilt das Feld dem Barcode ohne
 * Lieferant; sobald Lieferanten da sind, wird gewählt.
 */
export const SupplierBarcodePicker = ({
    rows,
    onChange,
    disabled,
    invalidKey,
}: {
    rows: SupplierRow[];
    onChange: (next: SupplierRow[]) => void;
    disabled?: boolean;
    invalidKey?: string | null;
}) => {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const entries = rows.filter((row) => !isBlankRow(row));
    // Die gewählte Zeile — fällt sie weg, die erste; ohne Einträge die bereitstehende.
    const target = entries.find((row) => row.key === selectedKey) ?? entries[0] ?? rows[rows.length - 1] ?? null;
    if (!target) return null;

    const nameOf = (row: SupplierRow) => row.value?.name ?? t('warehouse.supplier.none');
    const ean = drawableEan(target.barcode);
    const setBarcode = (next: string) =>
        onChange(withBlankRow(rows.map((row) => (row.key === target.key ? { ...row, barcode: next } : row))));

    return (
        <div className="ofi-wh-makerbar">
            {entries.length > 0 && (
                <div className="ofi-wh-seg is-small ofi-wh-makerbar__seg" role="tablist" aria-label={t('warehouse.supplier.pickerLabel')}>
                    {entries.map((row) => {
                        const on = row.key === target.key;
                        const missing = !row.barcode.trim();
                        return (
                            <button
                                key={row.key}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                className={`ofi-nosize ${on ? 'is-on' : ''} ${row.value ? '' : 'is-unassigned'}`}
                                title={missing ? t('warehouse.supplier.noBarcode') : row.barcode}
                                onClick={() => setSelectedKey(row.key)}
                            >
                                <span>{nameOf(row)}</span>
                                {missing && <i className="ofi-wh-makerbar__missing" aria-hidden />}
                            </button>
                        );
                    })}
                </div>
            )}
            <BarcodeInput
                key={target.key}
                value={target.barcode}
                onChange={setBarcode}
                ariaLabel={target.value
                    ? t('warehouse.supplier.barcodeOf', { name: target.value.name })
                    : t('warehouse.fields.manufacturerBarcode')}
                placeholder={t('warehouse.supplier.barcodePlaceholder')}
                scanTitle={target.value
                    ? t('warehouse.supplier.scanTitleOf', { name: target.value.name })
                    : t('warehouse.fields.manufacturerBarcode')}
                invalid={target.key === invalidKey}
                disabled={disabled}
            />
            {ean && <Ean13Barcode code={ean} className="ofi-wh-makerbar__svg" title={`${nameOf(target)} · ${ean}`} />}
            {!entries.length && <span className="ofi-wh-row__hint">{t('warehouse.supplier.pickerHint')}</span>}
            {entries.length > 0 && !target.value && (
                <span className="ofi-wh-row__hint is-warn">{t('warehouse.supplier.unassignedHint')}</span>
            )}
        </div>
    );
};
