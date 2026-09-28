import { ArrowRight } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { ProcurementDocView, ProcurementNextAction } from '@/types/purchasing';

import { fmtPrice, shownPurchaseCode } from '../../bom/bomFormat';
import { docStateLabel, orderAction } from '../purchasingModel';
import { DocToken, NextButton } from '../purchasingUi';

const P = 'productionBom.purchasing';

/** Die Bestellungen des Talep — je Zeile Lieferant, Umfang, Stand und EIN Knopf. */
export const OrderDocs = ({ docs, canProcure, onAction, onOpenDocument }: {
    docs: ProcurementDocView[];
    canProcure: boolean;
    onAction: (action: ProcurementNextAction, purchaseOrderId: string) => void;
    onOpenDocument: (id: string) => void;
}) => {
    const orders = docs.filter((doc) => doc.kind === 'ORDER');
    if (!orders.length) return null;
    return (
        <section className="ofi-buy-box">
            <header className="ofi-buy-boxhead">
                <h3>{t(`${P}.orders`)}</h3>
                <span className="ofi-buy-count">{orders.length}</span>
            </header>
            <ul className="ofi-buy-docs">
                {orders.map((doc) => {
                    const action = canProcure ? orderAction(doc) : null;
                    return (
                        <li key={doc.purchaseOrderId}>
                            <DocToken code={shownPurchaseCode(doc.code)} kind={doc.kind} state={doc.state} />
                            <b className="ofi-buy-docs__supplier">{doc.supplierName || '—'}</b>
                            <span className="ofi-buy-docs__meta">
                                {t('productionBom.procurement.linesCount', { count: doc.lineCount })}
                                {doc.totalNet > 0 ? ` · ${fmtPrice(doc.totalNet, doc.currency)}` : ''}
                                {doc.quoteNumber ? ` · ${t(`${P}.quoteNo`, { number: doc.quoteNumber })}` : ''}
                            </span>
                            <span className="ofi-buy-docs__state">{docStateLabel(doc.kind, doc.state)}</span>
                            <span className="ofi-buy-docs__act">
                                {action && <NextButton action={action} onClick={() => onAction(action, doc.purchaseOrderId)} />}
                                <button
                                    type="button"
                                    className="ofi-buy-btn is-icon is-quiet ofi-nosize"
                                    title={t(`${P}.openOrder`)}
                                    aria-label={t(`${P}.openOrder`)}
                                    onClick={() => onOpenDocument(doc.purchaseOrderId)}
                                >
                                    <ArrowRight aria-hidden />
                                </button>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};
