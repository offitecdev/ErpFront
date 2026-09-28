import { useMemo, useState } from 'react';
import { Barcode, FileText, Info, PackageCheck, ShoppingCart, Undo2, Warehouse } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { Bom, BomGoodsIn, BomProcurementSummary, BomReceiptAllocation } from '@/types/productionBom';

import { fmtQty, shortDate, unitLabel } from '../bomFormat';
import { ProgressRing } from './BomProcessButton';

/**
 * ── TALEPLER & GELEN MALLAR AN DER BOM (27.09.2026 abends, Vorgabe Samet) ────
 *
 * Nur der Weg, nie Lieferant oder Preis: was die BOM beim Einkauf angefragt
 * hat und wie weit er ist («süreçsel bilgilendirme»), und welche Ware bei
 * der Buchung an diese BOM ging («gelen mallar»). Karten mit Seriennummer
 * tragen ein ⓘ — dahinter die Nummern, wie sie ankamen.
 */

const statusTone: Record<BomProcurementSummary['status'], string> = {
    OPEN: 'is-open',
    IN_PROGRESS: 'is-progress',
    DONE: 'is-done',
    CANCELLED: 'is-cancelled',
};

export const ProcurementStatusPill = ({ status }: { status: BomProcurementSummary['status'] }) => (
    <span className={`ofi-bom-reqpill ${statusTone[status]}`}>{t(`productionBom.procurement.status.${status}`)}</span>
);

export const ProcurementKindTag = ({ kind }: { kind: BomProcurementSummary['kind'] }) => (
    <span className={`ofi-bom-reqkind is-${kind.toLowerCase()}`}>
        {kind === 'PRICE' ? <FileText aria-hidden /> : <ShoppingCart aria-hidden />}
        {t(`productionBom.procurement.kind.${kind}`)}
    </span>
);

export const BomProcurementSection = ({
    bom,
    canEdit,
    onChanged,
}: {
    bom: Bom;
    canEdit: boolean;
    onChanged: (bom: Bom) => void;
}) => {
    const [busy, setBusy] = useState<string | null>(null);
    const requests = bom.procurement ?? [];
    if (!requests.length) return null;

    const withdraw = async (request: BomProcurementSummary) => {
        setBusy(request.id);
        try {
            const result = await productionBomApi.withdrawProcurementRequest(request.id);
            toast.success(t('productionBom.procurement.withdrawn', { number: request.requestNumber }));
            onChanged(result.bom);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="ofi-bom-group ofi-bom-reqs">
            <h3 className="ofi-bom-group__title">
                {t('productionBom.procurement.title')}
                <span className="ofi-bom-group__count">{requests.length}</span>
                <span className="ofi-bom-group__meta">{t('productionBom.procurement.titleMeta')}</span>
            </h3>
            <div className="ofi-bom-group__box is-list">
                {requests.map((request) => {
                    const { covered, total } = request.progress;
                    const untouched = request.status === 'OPEN' && request.progress.requests + request.progress.orders === 0;
                    return (
                        <div key={request.id} className={`ofi-bom-reqrow ${statusTone[request.status]}`}>
                            <span className="ofi-bom-reqrow__main">
                                <span className="ofi-bom-reqrow__top">
                                    <b className="ofi-bom-code">{request.requestNumber}</b>
                                    <ProcurementKindTag kind={request.kind} />
                                    <ProcurementStatusPill status={request.status} />
                                </span>
                                <small>
                                    {t('productionBom.procurement.linesCount', { count: request.lines.length })}
                                    {' · '}
                                    {shortDate(request.createdAt)}
                                    {request.createdByName ? ` · ${request.createdByName}` : ''}
                                    {request.note ? ` · ${request.note}` : ''}
                                </small>
                            </span>
                            {request.status !== 'CANCELLED' ? (
                                <span className="ofi-bom-reqrow__progress" title={t(`productionBom.procurement.progressTitle.${request.kind}`)}>
                                    <ProgressRing value={total ? covered / total : 0} size={16} />
                                    <small>{t(`productionBom.procurement.progress.${request.kind}`, { done: covered, total })}</small>
                                </span>
                            ) : <span aria-hidden />}
                            {/* Die dritte Spalte bleibt immer da — so stehen die Balken aller Zeilen bündig. */}
                            {!(canEdit && untouched) && <span aria-hidden />}
                            {canEdit && untouched && (
                                <button
                                    type="button"
                                    className="ofi-bom-btn is-small is-quiet ofi-nosize"
                                    disabled={busy !== null}
                                    onClick={() => void withdraw(request)}
                                >
                                    {busy === request.id ? <span className="ofi-bom-spinner is-small" /> : <Undo2 />}
                                    {t('productionBom.procurement.withdraw')}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

/* ── Gelen mallar ───────────────────────────────────────────────────────── */

export const BomGoodsInSection = ({ bom }: { bom: Bom }) => {
    const goods = bom.goodsIn ?? [];
    const [open, setOpen] = useState<BomGoodsIn | null>(null);
    const unitOf = useMemo(() => new Map(bom.lines.map((line) => [line.id, line.unit])), [bom.lines]);
    if (!goods.length) return null;
    const total = goods.reduce((sum, entry) => sum + entry.quantity, 0);

    return (
        <section className="ofi-bom-group ofi-bom-goods">
            <h3 className="ofi-bom-group__title">
                {t('productionBom.goodsIn.title')}
                <span className="ofi-bom-group__count">{goods.length}</span>
                <span className="ofi-bom-group__meta">{t('productionBom.goodsIn.meta', { total: fmtQty(total) })}</span>
            </h3>
            <div className="ofi-bom-group__box is-list">
                <div className="ofi-bom-goodsrow is-head">
                    <span>{t('productionBom.goodsIn.date')}</span>
                    <span>{t('productionBom.columns.erpCode')}</span>
                    <span>{t('productionBom.columns.name')}</span>
                    <span className="is-num">{t('productionBom.goodsIn.quantity')}</span>
                    <span>{t('productionBom.goodsIn.source')}</span>
                    <span aria-hidden />
                </div>
                {goods.map((entry) => (
                    <div key={entry.id} className="ofi-bom-goodsrow">
                        <span className="ofi-bom-goodsrow__date">{shortDate(entry.receivedAt)}</span>
                        <span className="ofi-bom-code">{entry.erpCode ?? '—'}</span>
                        <span className="ofi-bom-goodsrow__name" title={entry.name}>
                            <b>{entry.name}</b>
                            {entry.serials.length > 0 && <i className="ofi-bom-sn">{t('productionBom.detail.serialTag')}</i>}
                        </span>
                        <span className="is-num">
                            <b>{fmtQty(entry.quantity)}</b>
                            <small>{unitLabel(entry.lineId ? unitOf.get(entry.lineId) ?? 'PCS' : 'PCS')}</small>
                        </span>
                        <span className="ofi-bom-goodsrow__source">
                            {entry.source === 'ORDER' && entry.referenceNumber
                                ? <><PackageCheck aria-hidden /><PurchaseCode value={entry.referenceNumber} /></>
                                : <><Warehouse aria-hidden />{t('productionBom.goodsIn.fromStock')}</>}
                        </span>
                        <span className="ofi-bom-goodsrow__info">
                            {entry.serials.length > 0 && (
                                <button
                                    type="button"
                                    className="ofi-bom-infobtn ofi-nosize"
                                    aria-label={t('productionBom.goodsIn.serialsOf', { name: entry.name })}
                                    title={t('productionBom.goodsIn.serialsOf', { name: entry.name })}
                                    onClick={() => setOpen(entry)}
                                >
                                    <Info />
                                </button>
                            )}
                        </span>
                    </div>
                ))}
            </div>
            <GoodsInSerialsDialog entry={open} bom={bom} onClose={() => setOpen(null)} />
        </section>
    );
};

/** ⓘ — die Seriennummern eines Eingangs, wie sie ankamen und wohin sie gingen. */
const GoodsInSerialsDialog = ({ entry, bom, onClose }: { entry: BomGoodsIn | null; bom: Bom; onClose: () => void }) => {
    const reservedNow = useMemo(() => {
        const line = entry?.lineId ? bom.lines.find((candidate) => candidate.id === entry.lineId) : null;
        return new Set(line?.coverage.serials ?? []);
    }, [bom.lines, entry]);
    return (
        <PopupDialog
            open={Boolean(entry)}
            onClose={onClose}
            title={t('productionBom.goodsIn.serialsTitle')}
            subtitle={entry ? `${entry.erpCode ? `${entry.erpCode} · ` : ''}${entry.name}` : undefined}
            icon={<Barcode size={18} />}
            width={440}
            footer={(
                <PopupActions>
                    <PopupButton variant="primary" onClick={onClose}>{t('productionBom.common.close')}</PopupButton>
                </PopupActions>
            )}
        >
            {entry && (
                <div className="ofi-bom-pop ofi-bom-snpop">
                    <dl className="ofi-bom-snpop__facts">
                        <div><dt>{t('productionBom.goodsIn.date')}</dt><dd>{shortDate(entry.receivedAt)}</dd></div>
                        <div>
                            <dt>{t('productionBom.goodsIn.source')}</dt>
                            <dd>{entry.source === 'ORDER' && entry.referenceNumber ? <PurchaseCode value={entry.referenceNumber} /> : t('productionBom.goodsIn.fromStock')}</dd>
                        </div>
                        <div><dt>{t('productionBom.goodsIn.bom')}</dt><dd className="ofi-bom-code">{bom.bomNumber}</dd></div>
                        {entry.receivedByName && <div><dt>{t('productionBom.goodsIn.by')}</dt><dd>{entry.receivedByName}</dd></div>}
                    </dl>
                    <span className="ofi-bom-snpop__caption">{t('productionBom.goodsIn.serialCount', { count: entry.serials.length })}</span>
                    <ul className="ofi-bom-snpop__list">
                        {entry.serials.map((serial, index) => (
                            <li key={serial}>
                                <span className="ofi-bom-snpop__index">{index + 1}</span>
                                <code>{serial}</code>
                                {reservedNow.has(serial)
                                    ? <span className="ofi-bom-snpop__state is-reserved">{t('productionBom.goodsIn.reserved')}</span>
                                    : <span className="ofi-bom-snpop__state">{t('productionBom.goodsIn.moved')}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </PopupDialog>
    );
};

/* ── Nach dem Wareneingang: wohin die Ware ging ─────────────────────────── */

/**
 * «Mal kabulde projeler arasında en erken teslim tarihli projeye aktarılması
 *  gerekmektedir … direkt otomatik çekmesi.» Nach der Buchung zeigt das
 * Fenster je Karte, welches Projekt sie bekam (frühester Liefertermin zuerst)
 * und was frei blieb — samt Seriennummern.
 */
export const ReceiptAllocationDialog = ({ allocations, onClose }: { allocations: BomReceiptAllocation[] | null; onClose: () => void }) => (
    <PopupDialog
        open={Boolean(allocations?.length)}
        onClose={onClose}
        title={t('productionBom.goodsIn.allocTitle')}
        subtitle={t('productionBom.goodsIn.allocSubtitle')}
        icon={<PackageCheck size={18} />}
        tone="success"
        width={560}
        footer={(
            <PopupActions>
                <PopupButton variant="primary" onClick={onClose}>{t('productionBom.common.close')}</PopupButton>
            </PopupActions>
        )}
    >
        <div className="ofi-bom-pop ofi-bom-alloc">
            {(allocations ?? []).map((entry, index) => (
                <div key={`${entry.productId}:${entry.bomId ?? 'free'}:${index}`} className={`ofi-bom-alloc__row${entry.bomId ? '' : ' is-free'}`}>
                    <span className="ofi-bom-alloc__what">
                        <b title={entry.name}>{entry.name}</b>
                        <small className="ofi-bom-code">{entry.erpCode ?? '—'}</small>
                    </span>
                    <span className="ofi-bom-alloc__qty">{fmtQty(entry.quantity)}</span>
                    <span className="ofi-bom-alloc__where">
                        {entry.bomId ? (
                            <>
                                <b>{[entry.projectNumber, entry.projectName].filter(Boolean).join(' · ') || '—'}</b>
                                <small>
                                    {[entry.deviceName, entry.bomNumber].filter(Boolean).join(' · ')}
                                    {entry.deliveryDate ? ` · ${t('productionBom.device.delivery', { date: shortDate(entry.deliveryDate) })}` : ''}
                                </small>
                            </>
                        ) : (
                            <>
                                <b>{t('productionBom.goodsIn.freeStock')}</b>
                                <small>{t('productionBom.goodsIn.freeStockHint')}</small>
                            </>
                        )}
                        {entry.serials.length > 0 && (
                            <span className="ofi-bom-alloc__serials">{entry.serials.map((serial) => <code key={serial}>{serial}</code>)}</span>
                        )}
                    </span>
                </div>
            ))}
        </div>
    </PopupDialog>
);
