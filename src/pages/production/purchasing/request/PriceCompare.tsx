import { useMemo, useState } from 'react';
import { ArrowRight, Check, Paperclip, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { ProcurementDetail } from '@/types/purchasing';

import { fmtPrice, fmtQty, shownPurchaseCode, unitLabel } from '../../bom/bomFormat';
import { docStateLabel, fmtAmount } from '../purchasingModel';
import { mailPriceRequest } from '../purchasingSend';
import { DocToken } from '../purchasingUi';

const P = 'productionBom.purchasing.compare';
const EPS = 1e-9;

/**
 * ── PREISVERGLEICH (28.09.2026) ────────────────────────────────────────────
 * Je Anfrage (Lieferant) eine Spalte, je Zeile ein Preis. Die günstigste
 * Antwort ist vorgewählt; «Seçimi kaydet» gibt Lieferant und Preis an die
 * Depo-Karten — die spätere Bestellung kommt damit vorbelegt.
 */
export const PriceCompare = ({ detail, onReply, onAsk, onChanged, onOpenDocument }: {
    detail: ProcurementDetail;
    onReply: (purchaseOrderId: string) => void;
    onAsk: (() => void) | null;
    onChanged: () => void;
    onOpenDocument: (id: string) => void;
}) => {
    const { request, bom, canProcure } = detail;
    const open = request.status === 'OPEN' || request.status === 'IN_PROGRESS';
    const asks = detail.docs.filter((doc) => doc.kind === 'REQUEST' && doc.state !== 'CANCELLED');
    const purchases = useMemo(() => new Map(bom.purchases.map((purchase) => [purchase.purchaseOrderId, purchase])), [bom.purchases]);

    /** Stückpreis der Antwort für eine Zeile; null = nicht gefragt, 0 = noch kein Preis. */
    const priceOf = (purchaseOrderId: string, bomLineId: string): number | null => {
        const line = purchases.get(purchaseOrderId)?.lines.find((entry) => entry.bomLineId === bomLineId);
        return line ? line.grossPrice || line.netPrice || 0 : null;
    };
    const cheapest: Record<string, string> = Object.fromEntries(request.lines.flatMap((line) => {
        const best = asks
            .map((doc) => ({ id: doc.purchaseOrderId, price: priceOf(doc.purchaseOrderId, line.bomLineId) ?? 0 }))
            .filter((entry) => entry.price > EPS)
            .sort((a, b) => a.price - b.price)[0];
        return best ? [[line.bomLineId, best.id]] : [];
    }));
    const [pick, setPick] = useState<Record<string, string> | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const chosen = pick ?? cheapest;

    const currency = asks.map((doc) => doc.currency).find(Boolean) ?? 'CHF';
    const picks = request.lines.flatMap((line) => {
        const id = chosen[line.bomLineId];
        const price = id ? priceOf(id, line.bomLineId) ?? 0 : 0;
        return id && price > EPS ? [{ line, id, price }] : [];
    });
    const bySupplier = new Map<string, { name: string; count: number; sum: number }>();
    for (const { line, id, price } of picks) {
        const doc = asks.find((entry) => entry.purchaseOrderId === id)!;
        const group = bySupplier.get(id) ?? { name: doc.supplierName, count: 0, sum: 0 };
        group.count += 1;
        group.sum += price * line.quantity;
        bySupplier.set(id, group);
    }
    const total = picks.reduce((sum, { line, price }) => sum + price * line.quantity, 0);
    const columnTotal = (id: string) => request.lines.reduce((sum, line) => sum + (priceOf(id, line.bomLineId) ?? 0) * line.quantity, 0);

    const resend = async (purchaseOrderId: string, code: string) => {
        setBusy(purchaseOrderId);
        try {
            const mail = await mailPriceRequest(purchaseOrderId);
            if (mail.preview) toast.warning(t('inv.orders.mail.previewToast'));
            else {
                await purchasingApi.report(request.id, { action: 'PRICE_REQUESTS_SENT', purchaseOrderIds: [purchaseOrderId] }).catch(() => undefined);
                toast.success(t('productionBom.purchasing.ask.sent', { count: 1 }));
            }
            onChanged();
        } catch {
            toast.error(t('productionBom.purchasing.ask.mailFailed', { code: shownPurchaseCode(code), supplier: '' }));
        } finally {
            setBusy(null);
        }
    };

    const save = async () => {
        setBusy('save');
        try {
            await purchasingApi.saveSelection(request.id, picks.map(({ line, id }) => ({ bomLineId: line.bomLineId, purchaseOrderId: id })));
            toast.success(t(`${P}.saved`));
            onChanged();
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="ofi-buy-box">
            <header className="ofi-buy-boxhead">
                <h3>{t(`${P}.title`)}</h3>
                <span className="ofi-buy-boxhead__meta">{t(`${P}.hint`)}</span>
                {onAsk && (
                    <button type="button" className="ofi-buy-btn is-link ofi-nosize" onClick={onAsk}>
                        <Plus aria-hidden />
                        {t(`${P}.askMore`)}
                    </button>
                )}
            </header>
            <div className="ofi-buy-scroll">
                <table className="ofi-buy-matrix" data-unstyled-table>
                    <thead>
                        <tr>
                            <th>{t('productionBom.purchasing.composer.product')}</th>
                            <th className="is-num">{t('productionBom.purchasing.composer.quantity')}</th>
                            {asks.map((doc) => (
                                <th key={doc.purchaseOrderId} className="is-supplier">
                                    <b>{doc.supplierName || '—'}</b>
                                    <button type="button" className="ofi-buy-btn is-icon is-quiet ofi-nosize" aria-label={t('productionBom.purchasing.openOrder')} onClick={() => onOpenDocument(doc.purchaseOrderId)}><ArrowRight /></button>
                                    <span className="ofi-buy-matrix__doc">
                                        <DocToken code={shownPurchaseCode(doc.code)} kind={doc.kind} state={doc.state} />
                                        <small>{docStateLabel(doc.kind, doc.state)}</small>
                                    </span>
                                    {canProcure && open && doc.state === 'SENT' && (
                                        <button type="button" className="ofi-buy-act ofi-nosize" onClick={() => onReply(doc.purchaseOrderId)}>
                                            <Paperclip aria-hidden />
                                            {t('productionBom.purchasing.next.REPLY')}
                                        </button>
                                    )}
                                    {canProcure && open && doc.state === 'DRAFT' && (
                                        <button type="button" className="ofi-buy-act ofi-nosize" disabled={busy !== null} onClick={() => void resend(doc.purchaseOrderId, doc.code)}>
                                            {busy === doc.purchaseOrderId ? <span className="ofi-buy-spinner" /> : <Send aria-hidden />}
                                            {t(`${P}.send`)}
                                        </button>
                                    )}
                                    {canProcure && open && doc.state === 'REPLIED' && (
                                        <button type="button" className="ofi-buy-btn is-link ofi-nosize" onClick={() => onReply(doc.purchaseOrderId)}>
                                            {t(`${P}.editReply`)}
                                        </button>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {request.lines.map((line) => (
                            <tr key={line.bomLineId}>
                                <td>
                                    <span className="ofi-buy-l1">{line.name}</span>
                                    <span className="ofi-buy-l2">{[line.brand, line.modelNumber].filter(Boolean).join(' · ') || line.erpCode}</span>
                                </td>
                                <td className="is-num">{fmtQty(line.quantity)} <small>{unitLabel(line.unit)}</small></td>
                                {asks.map((doc) => {
                                    const price = priceOf(doc.purchaseOrderId, line.bomLineId);
                                    const on = chosen[line.bomLineId] === doc.purchaseOrderId;
                                    const best = cheapest[line.bomLineId] === doc.purchaseOrderId;
                                    if (price === null) return <td key={doc.purchaseOrderId} className="is-cell is-none">—</td>;
                                    if (price <= EPS) return <td key={doc.purchaseOrderId} className="is-cell is-none">{t(`${P}.waiting`)}</td>;
                                    return (
                                        <td key={doc.purchaseOrderId} className={`is-cell is-price${on ? ' is-on' : ''}${best ? ' is-best' : ''}`}>
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                className="ofi-buy-pick ofi-nosize"
                                                disabled={!canProcure || !open}
                                                onClick={() => setPick({ ...chosen, [line.bomLineId]: doc.purchaseOrderId })}
                                            >
                                                <span className="ofi-buy-radio" aria-hidden />
                                                <span>
                                                    <b>{fmtAmount(price)}</b>
                                                    {line.quantity > 1 && <small>{t(`${P}.lineTotal`, { value: fmtAmount(price * line.quantity) })}</small>}
                                                </span>
                                                {best && <em>{t(`${P}.best`)}</em>}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={2}>{t(`${P}.allFromOne`)}</td>
                            {asks.map((doc) => {
                                const sum = columnTotal(doc.purchaseOrderId);
                                return <td key={doc.purchaseOrderId} className="is-cell">{sum > EPS ? fmtPrice(sum, doc.currency) : '—'}</td>;
                            })}
                        </tr>
                    </tfoot>
                </table>
            </div>
            <footer className="ofi-buy-boxfoot">
                <span className="ofi-buy-groups">
                    {[...bySupplier.values()].map((group) => (
                        <span key={group.name}><Check aria-hidden />{group.name} <small>{t('productionBom.procurement.linesCount', { count: group.count })} · {fmtPrice(group.sum, currency)}</small></span>
                    ))}
                </span>
                {picks.length > 0 && <b className="ofi-buy-total">{fmtPrice(total, currency)}</b>}
                {canProcure && open && (
                    <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled={!picks.length || busy !== null} onClick={() => void save()}>
                        {busy === 'save' ? <span className="ofi-buy-spinner" /> : <Check aria-hidden />}
                        {t(`${P}.save`)}
                    </button>
                )}
            </footer>
        </section>
    );
};
