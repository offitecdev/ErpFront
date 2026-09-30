import { CheckCircle2, Circle, Info } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { ComparisonLine, ComparisonOffer, ComparisonResult, ComparisonSupplier, PriceComparison } from '@/types/purchasing';

import { fmtPrice, fmtQty, unitLabel } from '../../bom/bomFormat';
import { fmtAmount } from '../purchasingModel';
import { Segmented } from '../purchasingUi';
import { selectable, type Selection } from './comparisonSelection';

const P = 'productionBom.purchasing.comparison';

export type Measure = 'unit' | 'total';

/**
 * Eine Zelle: das Angebot eines Lieferanten für eine Zeile — ein Knopf, der
 * es wählt («oradaki çarpılara tıklayıp»). «Sorulmadı» = der Lieferant wurde
 * nach dieser Zeile nicht gefragt (A: X,Y · B: X,Y,Z,T …), «Teklif yok» = er
 * nennt keinen Preis. Das günstigste trägt die grüne Marke, das gewählte den
 * blauen Rahmen und den Punkt.
 */
const OfferCell = ({ offer, line, supplier, measure, best, chosen, onPick, disabled }: {
    offer: ComparisonOffer;
    line: ComparisonLine;
    supplier: ComparisonSupplier;
    measure: Measure;
    best: boolean;
    chosen: boolean;
    onPick: () => void;
    disabled: boolean;
}) => {
    if (offer.asked === false) {
        return <td className="is-offer is-none is-unasked"><span>{t(`${P}.notAsked`)}</span></td>;
    }
    if (offer.unitPrice === null && offer.total === null) {
        return <td className="is-offer is-none"><span>{t(`${P}.noOffer`)}</span></td>;
    }
    const main = measure === 'unit' ? offer.unitPrice : offer.total;
    const other = measure === 'unit' ? offer.total : offer.unitPrice;
    const tip = [
        offer.evidence && `${t(`${P}.evidence`)}: ${offer.evidence}`,
        offer.listPrice && offer.discount ? t(`${P}.listDiscount`, { list: fmtAmount(offer.listPrice), discount: offer.discount }) : null,
        offer.deliveryTime && `${t(`${P}.delivery`)}: ${offer.deliveryTime}`,
        offer.note,
        offer.computed ? t(`${P}.computed`) : null,
    ].filter(Boolean).join('\n');
    const canPick = selectable(line, line.offers.indexOf(offer)) && !disabled;
    return (
        <td className={`is-offer is-pickable${best ? ' is-best' : ''}${chosen ? ' is-chosen' : ''}`} title={tip || undefined}>
            <button type="button" className="ofi-buy-offerpick ofi-nosize" disabled={!canPick} aria-pressed={chosen} onClick={onPick}>
                <span className="ofi-buy-offercell">
                    <b>
                        {main !== null ? fmtPrice(main, supplier.currency) : '—'}
                        {offer.computed && <sup aria-hidden>≈</sup>}
                    </b>
                    <small>
                        {other !== null ? t(measure === 'unit' ? `${P}.lineTotal` : `${P}.perUnit`, { value: fmtAmount(other) }) : ''}
                        {offer.discount ? ` · −${offer.discount}%` : ''}
                    </small>
                    {best && <em className="ofi-buy-bestmark"><CheckCircle2 aria-hidden />{line.bestBy === 'ai' ? t(`${P}.bestAi`) : t(`${P}.best`)}</em>}
                </span>
                <span className="ofi-buy-offerpick__dot" aria-hidden>{chosen ? <CheckCircle2 /> : <Circle />}</span>
            </button>
        </td>
    );
};

/** Die Tabelle des Vergleichs: je Zeile die Angebote, wählbar; unten die Summen. */
export const ComparisonMatrix = ({ result, orderable, selection, onPick, measure, onMeasure, disabled }: {
    result: ComparisonResult;
    /** Je Zeile: bestellt würde … / nicht, weil … (null = BOM noch nicht freigegeben). */
    orderable: PriceComparison['orderable'];
    selection: Selection;
    onPick: (bomLineId: string, supplier: number | null) => void;
    measure: Measure;
    onMeasure: (next: Measure) => void;
    disabled: boolean;
}) => {
    const suppliers = result.suppliers;
    return (
        <section className="ofi-buy-box ofi-buy-cmptable">
            <header className="ofi-buy-boxhead">
                <h3>{t(`${P}.tableTitle`)}</h3>
                <span className="ofi-buy-count">{result.lines.length}</span>
                <span className="ofi-buy-boxhead__meta">
                    <Segmented
                        tabs={[
                            { key: 'unit' as const, label: t(`${P}.unitPrice`) },
                            { key: 'total' as const, label: t(`${P}.lineTotalTab`) },
                        ]}
                        value={measure}
                        onChange={onMeasure}
                        label={t(`${P}.measure`)}
                        idPrefix="comparison-measure"
                    />
                </span>
            </header>
            <p className="ofi-buy-cmppickhint"><Info aria-hidden />{t(`${P}.pickHint`)}</p>
            <div className="ofi-buy-scroll" id="comparison-measure-panel" role="tabpanel" aria-labelledby={`comparison-measure-tab-${measure}`}>
                <table className="ofi-buy-cmpgrid" data-unstyled-table style={{ minWidth: 420 + suppliers.length * 190 }}>
                    <colgroup>
                        <col style={{ width: 44 }} />
                        <col />
                        <col style={{ width: 110 }} />
                        {suppliers.map((supplier) => <col key={supplier.purchaseOrderId} style={{ width: 190 }} />)}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="is-num">#</th>
                            <th>{t(`${P}.product`)}</th>
                            <th className="is-num">{t(`${P}.quantity`)}</th>
                            {suppliers.map((supplier, index) => (
                                <th key={supplier.purchaseOrderId} className={`is-supplier${result.bestSupplier === index ? ' is-best' : ''}`}>
                                    <b>{supplier.supplierName}</b>
                                    <small>{[supplier.currency, supplier.askedLines ? t(`${P}.askedLines`, { count: supplier.askedLines }) : null].filter(Boolean).join(' · ')}</small>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {result.lines.map((line, row) => {
                            const chosen = selection[line.bomLineId] ?? null;
                            const order = orderable?.[line.bomLineId] ?? null;
                            return (
                                <tr key={line.bomLineId} className={chosen === null || order?.reason ? 'is-unpicked' : undefined}>
                                    <td className="is-num is-index">{row + 1}</td>
                                    <td>
                                        <span className="ofi-buy-l1">{line.name}</span>
                                        {order?.reason ? (
                                            <em className={`ofi-buy-cmpskip is-${order.reason.toLowerCase()}`}>{t(`${P}.skipTag.${order.reason}`)}</em>
                                        ) : (
                                            <span className="ofi-buy-l2">
                                                {chosen === null
                                                    ? t(`${P}.nothingPicked`)
                                                    : [line.brand, line.modelNumber].filter(Boolean).join(' · ') || line.erpCode || ''}
                                            </span>
                                        )}
                                    </td>
                                    <td className="is-num">
                                        {fmtQty(line.quantity)} <small>{unitLabel(line.unit)}</small>
                                        {order && !order.reason && Math.abs(order.quantity - line.quantity) > 1e-9 && (
                                            <small className="ofi-buy-cmporderqty">{t(`${P}.orderQty`, { qty: fmtQty(order.quantity) })}</small>
                                        )}
                                    </td>
                                    {line.offers.map((offer, index) => (
                                        <OfferCell
                                            key={suppliers[index]?.purchaseOrderId ?? index}
                                            offer={offer}
                                            line={line}
                                            supplier={suppliers[index]!}
                                            measure={measure}
                                            best={line.best === index}
                                            chosen={chosen === index}
                                            disabled={disabled}
                                            // Noch einmal auf das gewählte: die Zeile wird nicht bestellt.
                                            onPick={() => onPick(line.bomLineId, chosen === index ? null : index)}
                                        />
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td />
                            <td>{t(`${P}.total`)}</td>
                            <td />
                            {suppliers.map((supplier, index) => (
                                <td key={supplier.purchaseOrderId} className={`is-offer${result.bestSupplier === index ? ' is-best' : ''}`}>
                                    <span className="ofi-buy-offercell">
                                        <b>{supplier.total > 0 ? fmtPrice(supplier.total, supplier.currency) : '—'}</b>
                                        <small>
                                            {supplier.complete
                                                ? t(`${P}.complete`)
                                                : t(`${P}.missingLines`, { count: (supplier.askedLines ?? result.lines.length) - supplier.pricedLines })}
                                        </small>
                                    </span>
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </section>
    );
};
