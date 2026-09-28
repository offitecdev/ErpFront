import { t } from '@/i18n/translate';
import type { BomPurchase } from '@/types/productionBom';
import type { ProcurementDetail } from '@/types/purchasing';

import { fmtPrice, fmtQty, orderUnitLabel, shortDate } from '../../bom/bomFormat';
import { parseAmount } from '../purchasingSend';

/* ── Gemeinsame Bauteile der drei Seitenflächen (28.09.2026) ── */

/** «TLP-2026-00131 · Coop Basel · Pano OT-CP-250 (Poz. 3) · teslim 14.10.2026» */
export const PanelContext = ({ detail }: { detail: ProcurementDetail }) => {
    const { request } = detail;
    const device = request.device
        ? `${request.device.name}${request.device.positionNumber ? ` (${t('productionBom.purchasing.position', { value: request.device.positionNumber })})` : ''}`
        : null;
    const delivery = request.project?.deliveryDate ? t('productionBom.purchasing.deliveryOn', { date: shortDate(request.project.deliveryDate) }) : null;
    return (
        <>
            <b className="is-code">{request.requestNumber}</b>
            {[request.project?.projectName, device, delivery].filter(Boolean).map((part) => <span key={part}>{part}</span>)}
        </>
    );
};

/** Ürün · Miktar · Birim fiyat (Eingabe) · Tutar — die Preise eines Belegs. */
export const PriceTable = ({ purchase, prices, disabled, onChange }: {
    purchase: BomPurchase;
    prices: Record<number, string>;
    disabled?: boolean;
    onChange: (index: number, value: string) => void;
}) => {
    const total = purchase.lines.reduce((sum, line) => sum + (parseAmount(prices[line.index] ?? '') ?? 0) * line.quantity, 0);
    return (
        <div className="ofi-buy-scroll"><table className="ofi-buy-mini" data-unstyled-table>
            <colgroup><col /><col style={{ width: 84 }} /><col style={{ width: 118 }} /><col style={{ width: 104 }} /></colgroup>
            <thead>
                <tr>
                    <th>{t('productionBom.purchasing.composer.product')}</th>
                    <th className="is-num">{t('productionBom.purchasing.composer.quantity')}</th>
                    <th className="is-num">{t('productionBom.purchase.unitPrice')}</th>
                    <th className="is-num">{t('productionBom.purchase.lineTotal')}</th>
                </tr>
            </thead>
            <tbody>
                {purchase.lines.map((line) => {
                    const price = parseAmount(prices[line.index] ?? '');
                    return (
                        <tr key={line.index}>
                            <td>
                                <span className="ofi-buy-l1">{line.name}</span>
                                <span className="ofi-buy-l2">{[line.code, line.model].filter(Boolean).join(' · ')}</span>
                            </td>
                            <td className="is-num">{fmtQty(line.quantity)} <small>{orderUnitLabel(line.unit)}</small></td>
                            <td className="is-num">
                                <input
                                    value={prices[line.index] ?? ''}
                                    inputMode="decimal"
                                    disabled={disabled}
                                    className={`ofi-buy-input is-num${price === null || price <= 0 ? ' is-empty' : ''}`}
                                    aria-label={`${t('productionBom.purchase.unitPrice')} · ${line.name}`}
                                    onFocus={(event) => event.currentTarget.select()}
                                    onChange={(event) => onChange(line.index, event.target.value)}
                                />
                            </td>
                            <td className="is-num">{price ? fmtPrice(price * line.quantity, purchase.currency) : '—'}</td>
                        </tr>
                    );
                })}
            </tbody>
            <tfoot>
                <tr>
                    <td colSpan={2}>{t('productionBom.purchase.total')}</td>
                    <td colSpan={2} className="is-num">{fmtPrice(total, purchase.currency)}</td>
                </tr>
            </tfoot>
        </table></div>
    );
};
