import { useMemo, useState, type KeyboardEvent } from 'react';
import { Check, Download, Info, PackageCheck, ScanBarcode, X } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomApi } from '@/lib/api/productionBom';

import { fmtQty, orderUnitLabel, shownPurchaseCode } from '../../bom/bomFormat';
import { failureText, parseAmount } from '../purchasingSend';
import { Failure, Loading } from '../purchasingUi';
import { PanelContext } from './panelKit';
import { usePurchase } from './panelData';
import { SidePanel } from './SidePanel';

const P = 'productionBom.purchasing.receive';
const EPS = 1e-9;

/**
 * ── MAL KABUL VON DER LISTE (28.09.2026) ───────────────────────────────────
 * Die offenen Positionen, die Restmenge schon eingetragen; Karten mit
 * Seriennummer bekommen je Stück eine gescannte Nummer. Die Ware geht an die
 * wartende Zeile mit dem frühesten Liefertermin. Was im Depo gescannt wird,
 * bucht sich ohnehin selbst.
 */
export const ReceivePanel = ({ requestId, purchaseOrderId, onClose, onDone, onOpenOrder }: {
    requestId: string;
    purchaseOrderId: string;
    onClose: () => void;
    onDone: () => void;
    /** «Siparişe git» — die Bestellung selbst öffnen. */
    onOpenOrder: () => void;
}) => {
    const { detail, purchase, error } = usePurchase(requestId, purchaseOrderId);
    const [amounts, setAmounts] = useState<Record<number, string>>({});
    const [serials, setSerials] = useState<Record<number, string[]>>({});
    const [scan, setScan] = useState<Record<number, string>>({});
    const [busy, setBusy] = useState(false);
    const serialLines = useMemo(() => new Set((detail?.bom.lines ?? []).filter((line) => line.product?.serialRequired).map((line) => line.id)), [detail]);

    const title = t(`${P}.title`);
    if (error) return <SidePanel icon={<PackageCheck />} title={title} onClose={onClose}><Failure text={error} /></SidePanel>;
    if (!detail || !purchase) return <SidePanel icon={<PackageCheck />} title={title} onClose={onClose}><Loading rows={4} /></SidePanel>;

    const open = purchase.lines.filter((line) => line.received + EPS < line.quantity);
    const isSerial = (bomLineId: string | null) => Boolean(bomLineId && serialLines.has(bomLineId));
    const remaining = (line: (typeof open)[number]) => Math.max(0, line.quantity - line.received);
    // Die Restmenge steht schon da — wer weniger bekam, ändert die Zahl.
    const amountOf = (line: (typeof open)[number]) => amounts[line.index] ?? String(remaining(line));

    const payload = open.flatMap((line) => {
        if (isSerial(line.bomLineId)) {
            const list = serials[line.index] ?? [];
            return list.length ? [{ index: line.index, quantity: list.length, serials: list }] : [];
        }
        const quantity = parseAmount(amountOf(line));
        return quantity && quantity > 0 ? [{ index: line.index, quantity: Math.min(quantity, remaining(line)), serials: [] }] : [];
    });

    const addSerial = (index: number, max: number, event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = (scan[index] ?? '').trim();
        const list = serials[index] ?? [];
        setScan({ ...scan, [index]: '' });
        if (!value || list.length >= max) return;
        if (list.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
            toast.error(t('productionBom.receipt.duplicateSerial'));
            return;
        }
        setSerials({ ...serials, [index]: [...list, value] });
    };

    const submit = async () => {
        if (!payload.length || busy) return;
        setBusy(true);
        try {
            const result = await productionBomApi.receive(purchaseOrderId, payload);
            const target = result.allocations?.find((entry) => entry.projectName);
            toast.success(target
                ? t(`${P}.doneFor`, { count: payload.length, project: target.projectName })
                : t(`${P}.done`, { count: payload.length }));
            onDone();
        } catch (failure) {
            toast.error(failureText(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SidePanel
            onOpenOrder={onOpenOrder}
            icon={<PackageCheck />}
            title={title}
            subtitle={<><b className="is-code">{shownPurchaseCode(purchase.referenceNumber)}</b> · {purchase.supplierName}</>}
            context={<PanelContext detail={detail} />}
            busy={busy}
            onClose={onClose}
            footer={(
                <>
                    <p>{t(`${P}.foot`)}</p>
                    <button type="button" className="ofi-buy-btn ofi-nosize" disabled={busy} onClick={onClose}>{t('productionBom.common.cancel')}</button>
                    <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled={!payload.length || busy} onClick={() => void submit()}>
                        {busy ? <span className="ofi-buy-spinner" /> : <PackageCheck aria-hidden />}
                        {t('productionBom.receipt.submit')}
                    </button>
                </>
            )}
        >
            <p className="ofi-buy-notice"><ScanBarcode aria-hidden /><span>{t(`${P}.depot`)}</span></p>
            {!open.length ? <p className="ofi-buy-note">{t('productionBom.receipt.complete')}</p> : (
                <section className="ofi-buy-sect">
                    <h4>
                        {t(`${P}.lines`)}
                        <button type="button" className="ofi-buy-btn is-link ofi-nosize" disabled={busy} onClick={() => setAmounts({})}>
                            <Download aria-hidden />
                            {t(`${P}.all`)}
                        </button>
                    </h4>
                    <table className="ofi-buy-mini" data-unstyled-table>
                        <colgroup><col /><col style={{ width: 88 }} /><col style={{ width: 72 }} /><col style={{ width: 120 }} /></colgroup>
                        <thead>
                            <tr>
                                <th>{t('productionBom.purchasing.composer.product')}</th>
                                <th className="is-num">{t('productionBom.receipt.ordered')}</th>
                                <th className="is-num">{t('productionBom.receipt.received')}</th>
                                <th className="is-num">{t('productionBom.receipt.now')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {open.map((line) => {
                                const serial = isSerial(line.bomLineId);
                                const list = serials[line.index] ?? [];
                                return (
                                    <tr key={line.index}>
                                        <td>
                                            <span className="ofi-buy-l1">{line.name}{serial && <i className="ofi-buy-sn">SN</i>}</span>
                                            <span className="ofi-buy-l2">{line.code ?? ''}</span>
                                            {serial && (
                                                <span className="ofi-buy-serials">
                                                    {list.map((value) => (
                                                        <span key={value} className="ofi-buy-serial">
                                                            <Check aria-hidden />{value}
                                                            <button type="button" className="ofi-nosize" aria-label={t('productionBom.common.remove')} onClick={() => setSerials({ ...serials, [line.index]: list.filter((entry) => entry !== value) })}>
                                                                <X aria-hidden />
                                                            </button>
                                                        </span>
                                                    ))}
                                                    {list.length < remaining(line) && (
                                                        <input
                                                            value={scan[line.index] ?? ''}
                                                            className="ofi-buy-input is-scan"
                                                            placeholder={t('productionBom.receipt.serialPlaceholder')}
                                                            autoComplete="off"
                                                            spellCheck={false}
                                                            onChange={(event) => setScan({ ...scan, [line.index]: event.target.value })}
                                                            onKeyDown={(event) => addSerial(line.index, remaining(line), event)}
                                                        />
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                        <td className="is-num">{fmtQty(line.quantity)} <small>{orderUnitLabel(line.unit)}</small></td>
                                        <td className="is-num">{fmtQty(line.received)}</td>
                                        <td className="is-num">
                                            {serial ? (
                                                <small>{t('productionBom.receipt.serialCount', { count: list.length, total: fmtQty(remaining(line)) })}</small>
                                            ) : (
                                                <input
                                                    value={amountOf(line)}
                                                    inputMode="decimal"
                                                    className="ofi-buy-input is-num"
                                                    aria-label={t('productionBom.receipt.now')}
                                                    disabled={busy}
                                                    onFocus={(event) => event.currentTarget.select()}
                                                    onChange={(event) => setAmounts({ ...amounts, [line.index]: event.target.value })}
                                                />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            )}
            <p className="ofi-buy-notice is-quiet"><Info aria-hidden /><span>{t(`${P}.priority`)}</span></p>
        </SidePanel>
    );
};
