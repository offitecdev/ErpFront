import { Printer } from 'lucide-react';

import { t } from '@/i18n/translate';

import { Ean13Barcode } from '../components/Ean13Barcode';
import { SupplierBarcodePicker } from '../components/SupplierBarcodePicker';
import type { SupplierRow } from '../supplierRows';
import { Group, Row } from './formParts';

/**
 * «Barkodlar»: unser GS1-Barcode (mit Etikett) und — nach Lieferant — der
 * Barcode des Herstellers («Barkod alanlarına göre tedarikçi seçim yeri
 * olacak — eklenen tedarikçileri seçtikçe barkodlar değişecek»).
 */
export const BarcodesSection = ({
    savedBarcode,
    savedCode,
    printing,
    onPrint,
    rows,
    onRows,
    readOnly,
    invalidKey,
}: {
    savedBarcode: string | null;
    savedCode: string | null;
    printing: boolean;
    onPrint: () => void;
    rows: SupplierRow[];
    onRows: (next: SupplierRow[]) => void;
    readOnly: boolean;
    invalidKey: string | null;
}) => (
    <Group title={t('warehouse.section.barcodes')}>
        <Row label={t('warehouse.fields.barcode')} top={Boolean(savedBarcode)} hint={savedBarcode ? undefined : t('warehouse.fields.barcodeHint')}>
            {savedBarcode ? (
                <div className="ofi-wh-gs1">
                    <Ean13Barcode code={savedBarcode} caption={savedCode} className="ofi-wh-gs1__svg" />
                    <div className="ofi-wh-gs1__side">
                        <span className="ofi-wh-code">{savedBarcode}</span>
                        <span className="ofi-wh-row__hint">{t('warehouse.fields.barcodeGs1')}</span>
                        <button
                            type="button"
                            className="ofi-wh-btn is-small ofi-nosize"
                            disabled={!savedCode || printing}
                            title={savedCode ? undefined : t('warehouse.fields.printNeedsCode')}
                            onClick={onPrint}
                        >
                            <Printer />
                            {printing ? t('warehouse.pdf.preparing') : t('warehouse.fields.printLabel')}
                        </button>
                    </div>
                </div>
            ) : (
                <span className="ofi-wh-erp__empty">—</span>
            )}
        </Row>
        <Row label={t('warehouse.fields.manufacturerBarcode')} top>
            <SupplierBarcodePicker rows={rows} onChange={onRows} disabled={readOnly} invalidKey={invalidKey} />
        </Row>
    </Group>
);
