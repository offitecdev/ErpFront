import { Check, ChevronRight, ScanLine } from 'lucide-react';

import { t } from '@/i18n/translate';

import { BarcodeInput } from '../components/BarcodeInput';
import { Group, Row } from './formParts';

/**
 * «Seri numarası gereklidir tıklayınca direkt altında input çıkmalı …
 * okutuldukça bir sayı olarak yazsın sadece, tıklayınca seri numaraları
 * bölümü açılsın.»
 */
export const SerialSection = ({
    serialRequired,
    onSerialRequired,
    readOnly,
    serialInput,
    onSerialInput,
    addSerial,
    serialCount,
    onOpenList,
}: {
    serialRequired: boolean;
    onSerialRequired: (next: boolean) => void;
    readOnly: boolean;
    serialInput: string;
    onSerialInput: (value: string) => void;
    addSerial: (raw: string) => Promise<boolean>;
    serialCount: number;
    onOpenList: () => void;
}) => (
    <Group title={t('warehouse.section.serial')}>
        <Row>
            <label className="ofi-wh-check">
                <input type="checkbox" checked={serialRequired} disabled={readOnly} onChange={(event) => onSerialRequired(event.target.checked)} />
                <span className="ofi-wh-check__box" aria-hidden><Check /></span>
                <span className="ofi-wh-check__text">
                    <b>{t('warehouse.fields.serialRequired')}</b>
                    <small>{t('warehouse.fields.serialRequiredHint')}</small>
                </span>
            </label>
        </Row>
        {serialRequired && (
            <Row>
                <div className="ofi-wh-serialinline">
                    {!readOnly && (
                        <BarcodeInput
                            value={serialInput}
                            onChange={onSerialInput}
                            onEnter={(value) => {
                                // Sofort leer: der nächste Scan landet nie auf einer abgewiesenen Nummer.
                                onSerialInput('');
                                return addSerial(value);
                            }}
                            continuous
                            scanStatus={t('warehouse.serials.count', { count: serialCount })}
                            lead={<ScanLine className="ofi-wh-field__lead" />}
                            ariaLabel={t('warehouse.serials.inputPlaceholder')}
                            placeholder={t('warehouse.serials.inputPlaceholder')}
                            scanTitle={t('warehouse.serials.scanTitle')}
                        />
                    )}
                    <button
                        type="button"
                        key={serialCount}
                        className="ofi-wh-serialcount ofi-nosize"
                        title={t('warehouse.serials.openList')}
                        onClick={onOpenList}
                    >
                        <b>{serialCount}</b>
                        <span>{t('warehouse.serials.countLabel', { count: serialCount })}</span>
                        <ChevronRight />
                    </button>
                </div>
            </Row>
        )}
    </Group>
);
