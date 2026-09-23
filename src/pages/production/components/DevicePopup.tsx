import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PopupCaption, PopupCard, PopupEmpty } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { readProductionItem } from '@/lib/api/production';
import { fmtDate } from '@/pages/inventory/utils/format';
import type { ProductionItemDetail } from '@/types/production';
import '@/styles/modules/production.css';

import { KindIcon, marginOf, money, orderKindLabel, quantity } from './productionUi';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';

/**
 * ── DAS GERÄT IM FENSTER ────────────────────────────────────────────────────
 * Vorgabe Samet: Geräte stehen als eigene Karte/Zeichen; ein Klick öffnet ein
 * Fenster mit ihren Angaben. Das Fenster ist die schwebende Karte der
 * Anwendung (PopupCard): die Liste dahinter bleibt lesbar und klickbar.
 *
 * Es zeigt, was das Gerät verkauft hat, was dafür bestellt und eingegangen
 * ist, und jede bestätigte Bestellzeile, die daran hängt. Einen Knopf
 * «Projekt öffnen» gibt es nicht mehr (Vorgabe Samet, 19.09.2026): das Projekt
 * öffnet der Klick in der Liste direkt, das Fenster schliesst das Kreuz.
 */
export const DevicePopup = ({ itemId, onClose }: { itemId: string | null; onClose: () => void }) => {
    const navigate = useNavigate();
    const [detail, setDetail] = useState<ProductionItemDetail | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!itemId) return undefined;
        setDetail((current) => (current?.item.id === itemId ? current : null));
        setFailed(false);
        return readProductionItem(itemId, (value) => setDetail(value), () => setFailed(true));
    }, [itemId]);

    const shown = detail && detail.item.id === itemId ? detail : null;
    const item = shown?.item;
    const figures = shown?.figures;

    return (
        <PopupCard
            open={Boolean(itemId)}
            onClose={onClose}
            width={640}
            closeOnOutside
            title={(
                <span className="inline-flex min-w-0 items-center gap-2">
                    {item && <KindIcon kind={item.kind} />}
                    <span className="truncate">{item?.name ?? t('production.device.title')}</span>
                </span>
            )}
            subtitle={shown?.project
                ? `${shown.project.projectNumber} · ${shown.project.projectName}`
                : undefined}
        >
            {!shown && <PopupEmpty>{failed ? t('production.loadFailed') : t('common.loading')}</PopupEmpty>}
            {shown && item && figures && (
                <div className="ofi-prod-pop">
                    <dl className="ofi-prod-pop__kv">
                        <dt>{t('production.device.kind')}</dt>
                        <dd>{item.kind === 'SERVICE' ? t('production.kind.service') : t('production.kind.device')}</dd>
                        {item.positionNumber && (
                            <>
                                <dt>{t('production.device.position')}</dt>
                                <dd>{item.positionNumber}</dd>
                            </>
                        )}
                        {item.articleCode && (
                            <>
                                <dt>{t('production.device.article')}</dt>
                                <dd className="font-mono">{item.articleCode}</dd>
                            </>
                        )}
                        <dt>{t('production.device.quantity')}</dt>
                        <dd>{quantity(item.quantity, item.unit)} × {money(item.unitPrice)}</dd>
                        {shown.order && (
                            <>
                                <dt>{t('production.device.order')}</dt>
                                <dd>
                                    {shown.order.orderNumber} · {orderKindLabel(shown.order)}
                                    {shown.parentOrder ? ` · ${t('production.device.addonOf', { number: shown.parentOrder.orderNumber })}` : ''}
                                    {shown.order.orderDate ? ` · ${fmtDate(shown.order.orderDate)}` : ''}
                                </dd>
                            </>
                        )}
                        {shown.project?.customerName && (
                            <>
                                <dt>{t('production.columns.customer')}</dt>
                                <dd>{shown.project.customerName}</dd>
                            </>
                        )}
                        {!item.isActive && (
                            <>
                                <dt>{t('production.columns.status')}</dt>
                                <dd>{t('production.status.cancelled')}</dd>
                            </>
                        )}
                    </dl>

                    <div className="ofi-prod-pop__figures">
                        <div className="ofi-prod-pop__figure">
                            <span>{t('production.figures.sales')}</span>
                            <b>{money(figures.salesTotal)}</b>
                        </div>
                        <div className="ofi-prod-pop__figure">
                            <span>{t('production.figures.ordered')}</span>
                            <b>{money(figures.orderedTotal)}</b>
                        </div>
                        <div className="ofi-prod-pop__figure">
                            <span>{t('production.figures.received')}</span>
                            <b>{money(figures.receivedTotal)}</b>
                        </div>
                        <div className={`ofi-prod-pop__figure ${figures.orderedTotal > 0 ? (figures.difference < 0 ? 'is-bad' : 'is-good') : ''}`}>
                            <span>{t('production.figures.difference')} · {marginOf(figures)}</span>
                            <b>{money(figures.difference)}</b>
                        </div>
                    </div>

                    {item.description && <p className="ofi-prod-pop__desc">{item.description}</p>}

                    <div>
                        <PopupCaption>{t('production.device.confirmedLines', { count: shown.confirmedLines.length })}</PopupCaption>
                        {shown.confirmedLines.length === 0 ? (
                            <PopupEmpty>{t('production.device.noConfirmed')}</PopupEmpty>
                        ) : (
                            <table data-unstyled-table className="ofi-prod-pop__table">
                                <thead>
                                    <tr>
                                        <th>{t('production.columns.purchaseOrder')}</th>
                                        <th>{t('production.columns.article')}</th>
                                        <th className="is-num">{t('production.columns.quantity')}</th>
                                        <th className="is-num">{t('production.columns.lineTotal')}</th>
                                        <th className="is-num">{t('production.columns.received')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shown.confirmedLines.map((line) => (
                                        <tr key={line.id}>
                                            <td>
                                                <a
                                                    className="ofi-prod-link font-mono"
                                                    href={`/inventory/orders/${line.purchaseOrderId}`}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        onClose();
                                                        navigate(`/inventory/orders/${line.purchaseOrderId}`);
                                                    }}
                                                >
                                                    <PurchaseCode value={line.purchaseOrderNumber} />
                                                </a>
                                                {line.supplierName ? <div className="text-[11px] opacity-70">{line.supplierName}</div> : null}
                                            </td>
                                            <td>
                                                {line.name}
                                                {line.code ? <div className="font-mono text-[11px] opacity-70">{line.code}</div> : null}
                                            </td>
                                            <td className="is-num">{quantity(line.quantity, line.unit)}</td>
                                            <td className="is-num">{money(line.lineTotal, line.currency)}</td>
                                            <td className="is-num">{line.receivedQuantity ? quantity(line.receivedQuantity, line.unit) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {shown.openRows.length > 0 && (
                        <div>
                            <PopupCaption>{t('production.device.openRows', { count: shown.openRows.length })}</PopupCaption>
                            <table data-unstyled-table className="ofi-prod-pop__table">
                                <tbody>
                                    {shown.openRows.map((row) => (
                                        <tr key={`${row.purchaseOrderId}:${row.lineIndex}`}>
                                            <td className="font-mono"><PurchaseCode value={row.referenceNumber} /></td>
                                            <td>{row.name}</td>
                                            <td className="is-num">{quantity(row.quantity, row.unit)}</td>
                                            <td className="is-num">{money(row.lineTotal, row.currency)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </PopupCard>
    );
};
