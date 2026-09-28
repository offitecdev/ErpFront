import { ChevronRight, ShoppingCart, Tag } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { ProcurementFeedRow, ProcurementNextAction } from '@/types/purchasing';

import { shortDate, shownPurchaseCode } from '../../bom/bomFormat';
import { daysLeft, daysText, docStateLabel, eventText, isUrgent, whenText } from '../purchasingModel';
import { DocToken, NextButton, StageText } from '../purchasingUi';
import { readPurchasingWorkspace } from '@/lib/api/purchasing';
import { purchaseOrdersApi } from '@/lib/api/inventory';

/**
 * Eine Zeile: Talep · Projekt · Gerät · Belege · Stand · Liefertermin · letzter
 * Handgriff — und rechts der EINE nächste Schritt («Sipariş oluştur», «Teklif
 * ekle», «Mal kabul» …). Ein Klick auf die Zeile öffnet den Talep.
 */
export const FeedRow = ({ row, canProcure, onOpen, onAction }: {
    row: ProcurementFeedRow;
    canProcure: boolean;
    onOpen: () => void;
    onAction: (action: ProcurementNextAction, purchaseOrderId: string | null) => void;
}) => {
    const settled = row.stage.key === 'DONE' || row.stage.key === 'CANCELLED';
    const days = settled ? null : daysLeft(row.deliveryDate);
    const next = canProcure ? row.stage.next : null;
    return (
        <tr
            className="ofi-buy-row"
            tabIndex={0}
            onPointerEnter={() => { readPurchasingWorkspace(row.id, () => undefined, () => undefined); }}
            onFocus={() => {
                readPurchasingWorkspace(row.id, () => undefined, () => undefined);
                if (row.stage.next?.purchaseOrderId) void purchaseOrdersApi.get(row.stage.next.purchaseOrderId).catch(() => undefined);
            }}
            onClick={onOpen}
            onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(); }}
        >
            <td>
                <span className="ofi-buy-l1 is-code">{row.requestNumber}</span>
                <span className="ofi-buy-l2 is-kind">
                    {row.kind === 'PRICE' ? <Tag aria-hidden /> : <ShoppingCart aria-hidden />}
                    {t(`productionBom.procurement.kind.${row.kind}`)}
                </span>
            </td>
            <td>
                <span className="ofi-buy-l1">{row.project?.name || '—'}</span>
                <span className="ofi-buy-l2 is-code">{row.project?.number ?? ''}</span>
            </td>
            <td>
                <span className="ofi-buy-l1">{row.device?.name ?? '—'}</span>
                <span className="ofi-buy-l2">
                    {[row.device?.position ? t('productionBom.purchasing.position', { value: row.device.position }) : null, row.bomNumber].filter(Boolean).join(' · ')}
                </span>
            </td>
            <td>
                {row.docs.length ? (
                    <span className="ofi-buy-toks">
                        {row.docs.map((doc) => (
                            <DocToken
                                key={doc.purchaseOrderId}
                                code={shownPurchaseCode(doc.code)}
                                kind={doc.kind}
                                state={doc.state}
                                title={`${doc.supplierName} · ${docStateLabel(doc.kind, doc.state)}`}
                            />
                        ))}
                    </span>
                ) : <span className="ofi-buy-none">—</span>}
            </td>
            <td><StageText stage={row.stage} /></td>
            <td>
                <span className={`ofi-buy-l1 is-date${isUrgent(days) ? ' is-urgent' : ''}${settled ? ' is-muted' : ''}`}>
                    {row.deliveryDate ? shortDate(row.deliveryDate) : '—'}
                </span>
                {days !== null && <span className={`ofi-buy-l2${isUrgent(days) ? ' is-urgent' : ''}`}>{daysText(days)}</span>}
            </td>
            <td>
                <span className="ofi-buy-l1 is-event">{eventText(row.last)}</span>
                <span className="ofi-buy-l2">{[row.last.actorName, whenText(row.last.at)].filter(Boolean).join(' · ')}</span>
            </td>
            <td className="is-act">
                {next
                    ? <NextButton action={next.action} onClick={() => onAction(next.action, next.purchaseOrderId)} />
                    : <ChevronRight className="ofi-buy-chev" aria-hidden />}
            </td>
        </tr>
    );
};
