import { useState } from 'react';
import { Ban, CalendarClock, CheckCircle2, FileText, FolderOpen, PackageCheck, RotateCcw, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { Bom, ProcurementRequest } from '@/types/productionBom';
import '@/styles/modules/productionHub.css';

import { fmtPrice, fmtQty, shortDate, unitLabel } from '../bom/bomFormat';
import { Dash, Note, StatusPill } from '../bom/bomUi';
import { NavBar } from '../bom/NavStack';
import { BomProcessButton } from '../bom/device/BomProcessButton';
import { ProcurementKindTag, ProcurementStatusPill } from '../bom/device/BomProcurementPanels';
import { ProgressRing } from '../bom/device/BomProcessButton';
import { PurchaseStatus } from '../bom/device/BomPurchasesView';
import type { BomViewContext } from '../bom/device/DeviceBomArea';

/**
 * ── SATIN ALMA · EIN TALEP (27.09.2026 abends, Vorgabe Samet) ────────────────
 *
 * Was die BOM will (Zeilen, Mengen, Projekt, Liefertermin), was der Einkauf
 * daraus schon gemacht hat (Belege mit Lieferant und Betrag) und der Weg der
 * BOM. Oben: «Sipariş oluştur» / «Fiyat talebi oluştur» öffnet den
 * bekannten Assistenten — nur mit den Zeilen dieses Talep.
 *
 * 28.09.2026: «taleplerin siparişleri diğer sayfada gözüksün, ilk sayfada değil»
 * — die Preisanfragen/Bestellungen eines Talep stehen NUR hier, nicht in der Liste.
 */
export const PurchasingRequestView = ({
    context,
    bom,
    request,
    canProcure,
    onRequestChanged,
}: {
    context: BomViewContext;
    bom: Bom;
    request: ProcurementRequest;
    canProcure: boolean;
    onRequestChanged: (request: ProcurementRequest) => void;
}) => {
    const { nav } = context;
    const [busy, setBusy] = useState<string | null>(null);
    const [asking, setAsking] = useState<'close' | 'cancel' | null>(null);
    const open = request.status === 'OPEN' || request.status === 'IN_PROGRESS';
    const isPrice = request.kind === 'PRICE';

    const act = async (action: 'close' | 'reopen' | 'cancel') => {
        setBusy(action);
        try {
            const result = await productionBomApi.procurementAction(request.id, action);
            onRequestChanged(result.request);
            toast.success(t(`productionBom.purchasing.action.${action}Done`, { number: request.requestNumber }));
            setAsking(null);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(null);
        }
    };

    const startWizard = () => context.open(isPrice
        ? { kind: 'request', bomId: bom.id, step: 1 }
        : { kind: 'wizard', bomId: bom.id, step: 1 });

    const project = request.project;
    const delivery = project?.deliveryDate ?? null;

    return (
        <>
            <NavBar
                nav={nav}
                backTitle={context.backTitle}
                title={<span className="ofi-bom-code is-title">{request.requestNumber}</span>}
                badge={(
                    <>
                        <ProcurementKindTag kind={request.kind} />
                        <ProcurementStatusPill status={request.status} />
                        <BomProcessButton bom={bom} />
                    </>
                )}
                subtitle={(
                    <span className="ofi-bom-subline">
                        <b>{project ? [project.projectNumber, project.projectName].filter(Boolean).join(' · ') : '—'}</b>
                        <span className="ofi-bom-dot">·</span>
                        {request.device?.name ?? '—'}
                        <span className="ofi-bom-dot">·</span>
                        <span className="ofi-bom-code">{bom.bomNumber}</span>
                    </span>
                )}
                actions={(
                    <>
                        <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" onClick={() => context.open({ kind: 'purchases', bomId: bom.id })}>
                            <FolderOpen />
                            {t('productionBom.purchasing.bomDocuments')}
                        </button>
                        {canProcure && open && (
                            <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={busy !== null} onClick={() => setAsking('cancel')}>
                                <Ban />
                                {t('productionBom.purchasing.action.cancel')}
                            </button>
                        )}
                        {canProcure && open && (
                            <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={busy !== null} onClick={() => setAsking('close')}>
                                <CheckCircle2 />
                                {t('productionBom.purchasing.action.close')}
                            </button>
                        )}
                        {canProcure && !open && (
                            <button type="button" className="ofi-bom-btn is-quiet ofi-nosize" disabled={busy !== null} onClick={() => void act('reopen')}>
                                {busy === 'reopen' ? <span className="ofi-bom-spinner is-small" /> : <RotateCcw />}
                                {t('productionBom.purchasing.action.reopen')}
                            </button>
                        )}
                        {canProcure && open && (
                            <button type="button" className="ofi-bom-btn is-primary ofi-nosize" disabled={bom.consumedAt !== null} onClick={startWizard}>
                                {isPrice ? <FileText /> : <ShoppingCart />}
                                {t(isPrice ? 'productionBom.purchasing.createRequests' : 'productionBom.purchasing.createOrders')}
                            </button>
                        )}
                    </>
                )}
            />
            <div className="ofi-bom-body">
                {!canProcure && <Note>{t('productionBom.purchasing.readOnly')}</Note>}

                <div className="ofi-pur-facts">
                    <div>
                        <span>{t('productionBom.purchasing.fact.project')}</span>
                        <b>{project ? project.projectNumber : '—'}</b>
                        <small>{project?.projectName || project?.customerName || ''}</small>
                    </div>
                    <div>
                        <span>{t('productionBom.purchasing.fact.delivery')}</span>
                        <b className="ofi-pur-facts__date"><CalendarClock aria-hidden />{delivery ? shortDate(delivery) : '—'}</b>
                        <small>{t('productionBom.purchasing.fact.deliveryHint')}</small>
                    </div>
                    <div>
                        <span>{t('productionBom.purchasing.fact.bom')}</span>
                        <b className="ofi-bom-code">{bom.bomNumber}</b>
                        <small><StatusPill status={bom.status} consumed={Boolean(bom.consumedAt)} /> {t('productionBom.revision.label', { revision: request.bomRevision })}</small>
                    </div>
                    <div>
                        <span>{t('productionBom.purchasing.fact.requested')}</span>
                        <b>{shortDate(request.createdAt)}</b>
                        <small>{request.createdByName ?? '—'}</small>
                    </div>
                </div>
                {request.note && <Note>{request.note}</Note>}

                <section className="ofi-bom-group">
                    <h3 className="ofi-bom-group__title">
                        {t('productionBom.purchasing.lines')}
                        <span className="ofi-bom-group__count">{request.lines.length}</span>
                        <span className="ofi-bom-group__meta">
                            {t(`productionBom.procurement.progress.${request.kind}`, { done: request.progress.covered, total: request.progress.total })}
                        </span>
                    </h3>
                    <div className="ofi-bom-tablewrap is-plain">
                        <table className="ofi-bom-table" data-unstyled-table>
                            <thead>
                                <tr>
                                    <th className="is-code">{t('productionBom.columns.erpCode')}</th>
                                    <th className="is-name">{t('productionBom.columns.name')}</th>
                                    <th>{t('productionBom.columns.brand')}</th>
                                    <th>{t('productionBom.columns.modelNumber')}</th>
                                    <th className="is-num is-accent">{t('productionBom.procurement.quantity')}</th>
                                    {!isPrice && <th className="is-num">{t('productionBom.purchasing.missingNow')}</th>}
                                    <th>{t('productionBom.purchasing.state')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {request.lines.map((line) => (
                                    <tr key={line.bomLineId}>
                                        <td className="is-code"><span className="ofi-bom-code">{line.erpCode ?? '—'}</span></td>
                                        <td className="is-name">
                                            <span className="ofi-bom-cellname">
                                                <b>{line.name}</b>
                                                {line.note && <small>{line.note}</small>}
                                            </span>
                                        </td>
                                        <td>{line.brand ?? <Dash />}</td>
                                        <td className="is-mono">{line.modelNumber ?? <Dash />}</td>
                                        <td className="is-num is-accent"><span className="ofi-bom-qty">{fmtQty(line.quantity)}<small>{unitLabel(line.unit)}</small></span></td>
                                        {!isPrice && (
                                            <td className={`is-num${line.missingNow && line.missingNow > 1e-9 ? ' is-missing' : ''}`}>
                                                {line.missingNow === null ? <Dash /> : line.missingNow > 1e-9 ? fmtQty(line.missingNow) : <Dash />}
                                            </td>
                                        )}
                                        <td>
                                            <span className={`ofi-pur-linestate${line.covered ? ' is-done' : ''}`}>
                                                {line.covered
                                                    ? t(isPrice ? 'productionBom.purchasing.lineAsked' : 'productionBom.purchasing.lineOrdered')
                                                    : t('productionBom.purchasing.lineOpen')}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="ofi-bom-group">
                    <h3 className="ofi-bom-group__title">
                        {t(`productionBom.purchasing.documentsOf.${request.kind}`)}
                        <span className="ofi-bom-group__count">{request.documents.length}</span>
                    </h3>
                    {request.documents.length ? (
                        <div className="ofi-bom-group__box is-list">
                            {request.documents.map((doc) => (
                                <div key={doc.purchaseOrderId} className="ofi-pur-docitem">
                                    <button
                                        type="button"
                                        className="ofi-pur-docrow ofi-nosize"
                                        onClick={() => context.open({ kind: 'purchase', bomId: bom.id, purchaseOrderId: doc.purchaseOrderId })}
                                    >
                                        <b className="ofi-bom-code"><PurchaseCode value={doc.referenceNumber} /></b>
                                        <span className="ofi-pur-docrow__supplier">{doc.supplierName || '—'}</span>
                                        <PurchaseStatus status={doc.status} />
                                        <span className="ofi-pur-docrow__sum">{doc.kind === 'ORDER' && doc.totalNet > 0 ? fmtPrice(doc.totalNet, doc.currency) : ''}</span>
                                        {doc.kind === 'ORDER' ? (
                                            <span className="ofi-pur-docrow__recv" title={t('productionBom.purchasing.received')}>
                                                <ProgressRing value={doc.received} size={14} stroke={2.2} tone={doc.received >= 1 ? 'success' : 'accent'} />
                                                {Math.round(doc.received * 100)}%
                                            </span>
                                        ) : <span />}
                                    </button>
                                    {/* «Mal kabul … direkt ayrıntılardan görelim» (28.09.2026): der
                                        Wareneingang einer bestätigten Bestellung ohne Umweg über ihre Seite. */}
                                    {canProcure && doc.kind === 'ORDER' && doc.confirmed && doc.received < 1 && doc.status !== 'COMPLETED' && (
                                        <button
                                            type="button"
                                            className="ofi-bom-btn is-small ofi-nosize ofi-pur-docitem__act"
                                            onClick={() => context.open({ kind: 'receipt', bomId: bom.id, purchaseOrderId: doc.purchaseOrderId })}
                                        >
                                            <PackageCheck />
                                            {t('productionBom.purchasing.receiveNow')}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="ofi-bom-hint">{t(isPrice ? 'productionBom.purchasing.noRequestsYet' : 'productionBom.purchasing.noOrdersYet')}</p>
                    )}
                </section>
            </div>

            <PopupDialog
                open={asking !== null}
                onClose={() => { if (!busy) setAsking(null); }}
                title={asking ? t(`productionBom.purchasing.action.${asking}Title`, { number: request.requestNumber }) : ''}
                subtitle={asking ? t(`productionBom.purchasing.action.${asking}Text`) : undefined}
                icon={asking === 'cancel' ? <Ban size={18} /> : <CheckCircle2 size={18} />}
                tone={asking === 'cancel' ? 'danger' : 'success'}
                width={460}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setAsking(null)} disabled={busy !== null}>{t('productionBom.common.cancel')}</PopupButton>
                        <PopupButton
                            variant={asking === 'cancel' ? 'danger' : 'primary'}
                            loading={busy === asking}
                            onClick={() => { if (asking) void act(asking); }}
                        >
                            {asking ? t(`productionBom.purchasing.action.${asking}`) : ''}
                        </PopupButton>
                    </PopupActions>
                )}
            />
        </>
    );
};
