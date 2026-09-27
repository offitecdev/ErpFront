import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, FilePen, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { Bom, BomLineChange, BomOrderAction, BomRevisionPreview } from '@/types/productionBom';

import { fmtQty, orderUnitLabel, shownPurchaseCode, unitLabel } from '../bomFormat';
import { Note } from '../bomUi';
import { PurchaseStatus } from './BomPurchasesView';

/**
 * ── REVISIONEN · DIE FENSTER (27.09.2026, Vorgabe Samet) ────────────────────
 *
 * «Bom onaylanırsa geri dönüş yok, revize olması lazım … sistem tedarikçiye
 *  gitmiş siparişi sessizce değiştirmez; revizyon onaylanınca etkilenen
 *  siparişler listesi çıkar, her sipariş için önerilen işlem gösterilir,
 *  satınalmacı onaylar.»
 *
 *   StartRevisionDialog     «Revize et» — der Grund ist Pflicht
 *   RevisionApproveDialog   was die Freigabe schreibt, Bestellung für Bestellung;
 *                           eine blosse Minderung beim Lieferanten darf bleiben
 *   DiscardRevisionDialog   die Arbeitskopie verwerfen
 */

export const StartRevisionDialog = ({
    open,
    bom,
    onClose,
    onStarted,
}: {
    open: boolean;
    bom: Bom;
    onClose: () => void;
    onStarted: (bom: Bom) => void;
}) => {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const next = bom.revision + 1;

    const start = async () => {
        if (!reason.trim() || busy) return;
        setBusy(true);
        try {
            const result = await productionBomApi.startRevision(bom.id, reason.trim());
            toast.success(t('productionBom.revision.started', { revision: next }));
            setReason('');
            onStarted(result.bom);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={() => { if (!busy) onClose(); }}
            title={t('productionBom.revision.startTitle', { number: bom.bomNumber })}
            subtitle={t('productionBom.revision.startSubtitle', { current: bom.revision, next })}
            icon={<FilePen size={18} />}
            width={500}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={busy}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton variant="primary" disabled={!reason.trim()} loading={busy} onClick={() => void start()}>
                        {t('productionBom.revision.startButton', { revision: next })}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-bom-pop ofi-bom-revdialog">
                <label className="ofi-bom-revdialog__field">
                    <span>{t('productionBom.revision.reasonLabel')}<b className="ofi-bom-req">*</b></span>
                    <textarea
                        value={reason}
                        rows={3}
                        maxLength={1000}
                        autoFocus
                        placeholder={t('productionBom.revision.reasonPlaceholder')}
                        onChange={(event) => setReason(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void start();
                        }}
                    />
                </label>
                <ul className="ofi-bom-revdialog__rules">
                    <li>{t('productionBom.revision.ruleKeeps', { current: bom.revision })}</li>
                    <li>{t('productionBom.revision.ruleOrders')}</li>
                    <li>{t('productionBom.revision.ruleArchive', { current: bom.revision })}</li>
                </ul>
            </div>
        </PopupDialog>
    );
};

export const DiscardRevisionDialog = ({
    open,
    bom,
    onClose,
    onDiscarded,
}: {
    open: boolean;
    bom: Bom;
    onClose: () => void;
    onDiscarded: (bom: Bom) => void;
}) => {
    const [busy, setBusy] = useState(false);
    const draft = bom.revisionDraft?.revision ?? bom.revision + 1;
    const discard = async () => {
        setBusy(true);
        try {
            const result = await productionBomApi.discardRevision(bom.id);
            toast.success(t('productionBom.revision.discarded', { revision: draft }));
            onDiscarded(result.bom);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(false);
        }
    };
    return (
        <PopupDialog
            open={open}
            onClose={() => { if (!busy) onClose(); }}
            title={t('productionBom.revision.discardTitle', { revision: draft })}
            subtitle={t('productionBom.revision.discardText', { revision: draft, current: bom.revision })}
            icon={<Trash2 size={18} />}
            tone="danger"
            width={460}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={busy}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton variant="danger" loading={busy} onClick={() => void discard()}>{t('productionBom.revision.discard')}</PopupButton>
                </PopupActions>
            )}
        />
    );
};

/** Der Unterschied einer Revision als ruhige Tabelle: Art · Code · Name · vorher → nachher. */
export const RevisionChangesTable = ({ changes }: { changes: BomLineChange[] }) => {
    if (!changes.length) return <p className="ofi-bom-revdialog__empty">{t('productionBom.revision.noChanges')}</p>;
    return (
        <div className="ofi-bom-revtable">
            {changes.map((change) => (
                <div key={`${change.kind}:${change.lineId}`} className="ofi-bom-revtable__row">
                    <span className={`ofi-bom-revkind is-${change.kind.toLowerCase()}`}>{t(`productionBom.revision.kind.${change.kind}`)}</span>
                    <span className="ofi-bom-code">{change.erpCode ?? '—'}</span>
                    <span className="ofi-bom-revtable__name" title={change.name}>{change.name}</span>
                    <span className="ofi-bom-revtable__qty">
                        {change.kind === 'ADDED' ? null : <s>{fmtQty(change.before)} {unitLabel(change.unitBefore)}</s>}
                        {change.kind === 'ADDED' || change.kind === 'REMOVED' ? null : <ArrowRight aria-hidden />}
                        {change.kind === 'REMOVED' ? null : <b>{fmtQty(change.after)} {unitLabel(change.unitAfter)}</b>}
                    </span>
                </div>
            ))}
        </div>
    );
};

/** Was mit einer Bestellung geschieht (Vorschau und Geschichte). */
export const OrderActionCard = ({
    action,
    kept,
    onKeep,
    done,
}: {
    action: BomOrderAction;
    /** Nur in der Vorschau: der Einkauf lässt eine Minderung beim Lieferanten stehen. */
    kept?: boolean;
    onKeep?: (keep: boolean) => void;
    /** In der Geschichte: was geschah (Vergangenheit, ohne die Anleitung). */
    done?: boolean;
}) => {
    const shown = kept && action.canKeep ? 'KEEP' : action.action;
    const revision = action.orderRevision ?? 0;
    return (
        <div className={`ofi-bom-revorder is-${shown.toLowerCase()}`}>
            <div className="ofi-bom-revorder__head">
                <b className="ofi-bom-code is-large"><PurchaseCode value={action.referenceNumber} /></b>
                <span className="ofi-bom-revorder__supplier">{action.supplierName || '—'}</span>
                <PurchaseStatus status={action.status} />
                <span className={`ofi-bom-revaction is-${shown.toLowerCase()}`}>
                    {t(`productionBom.revision.${done ? 'actionDone' : 'action'}.${shown}`, { revision })}
                </span>
            </div>
            {!done && (
                <p className="ofi-bom-revorder__text">
                    {t(`productionBom.revision.actionText.${shown}`, { revision, number: shownPurchaseCode(action.referenceNumber) })}
                </p>
            )}
            <ul className="ofi-bom-revorder__lines">
                {action.lines.map((line) => (
                    <li key={`${line.index}:${line.bomLineId}`}>
                        <span className="ofi-bom-revorder__name" title={line.name}>{line.name}</span>
                        <span className="ofi-bom-revtable__qty">
                            <s>{fmtQty(line.before)} {orderUnitLabel(line.unitBefore)}</s>
                            <ArrowRight aria-hidden />
                            <b>{line.after > 0 ? `${fmtQty(line.after)} ${orderUnitLabel(line.unitAfter)}` : t('productionBom.revision.lineDropped')}</b>
                        </span>
                        {line.received > 0 && <small>{t('productionBom.revision.received', { value: fmtQty(line.received) })}</small>}
                    </li>
                ))}
            </ul>
            {onKeep && action.canKeep && action.action !== 'CANCEL' && (
                <div className="ofi-bom-revorder__choice" role="radiogroup" aria-label={t('productionBom.revision.choiceLabel')}>
                    <button type="button" role="radio" aria-checked={!kept} className={`ofi-nosize${!kept ? ' is-on' : ''}`} onClick={() => onKeep(false)}>
                        {t('productionBom.revision.choiceRevise', { revision })}
                    </button>
                    <button type="button" role="radio" aria-checked={Boolean(kept)} className={`ofi-nosize${kept ? ' is-on' : ''}`} onClick={() => onKeep(true)}>
                        {t('productionBom.revision.choiceKeep')}
                    </button>
                </div>
            )}
        </div>
    );
};

export const RevisionApproveDialog = ({
    open,
    bom,
    onClose,
    onApproved,
}: {
    open: boolean;
    bom: Bom;
    onClose: () => void;
    onApproved: (bom: Bom) => void;
}) => {
    /* Das Fenster wird nur eingehängt, solange es offen ist — jede Öffnung
       beginnt ohne «bleibt so». Die Vorschau gilt für genau eine Anfrage
       (BOM, Stand, «bleibt so»); die vorige bleibt sichtbar, bis die neue da ist. */
    const [keep, setKeep] = useState<string[]>([]);
    const [result, setResult] = useState<{ key: string; preview: BomRevisionPreview | null; error: string | null } | null>(null);
    const [busy, setBusy] = useState(false);

    const keepKey = keep.join(',');
    const requestKey = `${bom.id}|${bom.updatedAt}|${keepKey}`;
    useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        productionBomApi.revisionPreview(bom.id, keepKey ? keepKey.split(',') : [])
            .then((value) => { if (alive) setResult({ key: requestKey, preview: value, error: null }); })
            .catch((failure) => { if (alive) setResult({ key: requestKey, preview: null, error: productionBomErrorText(failure) }); });
        return () => { alive = false; };
    }, [open, bom.id, keepKey, requestKey]);
    const loading = open && result?.key !== requestKey;
    const preview = result?.preview ?? null;
    const error = result?.key === requestKey ? result.error : null;

    const toggleKeep = (purchaseOrderId: string, value: boolean) =>
        setKeep((current) => (value ? [...new Set([...current, purchaseOrderId])] : current.filter((id) => id !== purchaseOrderId)).sort());

    const approve = async () => {
        if (!preview || busy) return;
        setBusy(true);
        try {
            const result = await productionBomApi.approveRevision(bom.id, keep);
            toast.success(t('productionBom.revision.approved', { revision: preview.toRevision }));
            onApproved(result.bom);
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(false);
        }
    };

    const from = preview?.fromRevision ?? bom.revision;
    const to = preview?.toRevision ?? (bom.revisionDraft?.revision ?? bom.revision + 1);
    const orders = preview?.orders ?? [];
    return (
        <PopupDialog
            open={open}
            onClose={() => { if (!busy) onClose(); }}
            title={t('productionBom.revision.approveTitle', { number: bom.bomNumber, revision: to })}
            subtitle={t('productionBom.revision.approveSubtitle', { from, to })}
            icon={<CheckCircle2 size={18} />}
            width={720}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={busy}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton
                        variant="primary"
                        disabled={!preview || loading || !preview.changes.length}
                        loading={busy}
                        onClick={() => void approve()}
                    >
                        {t('productionBom.revision.approveButton', { revision: to })}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-bom-pop ofi-bom-revdialog">
                {error && <Note tone="error">{error}</Note>}
                {!preview && loading && <div className="ofi-bom-state" aria-busy="true"><span className="ofi-bom-spinner" /></div>}
                {preview && (
                    <div className={`ofi-bom-revdialog__body${loading ? ' is-loading' : ''}`}>
                        {preview.reason && (
                            <p className="ofi-bom-revdialog__reason">
                                <b>{t('productionBom.revision.reasonLabel')}</b>
                                <span>{preview.reason}</span>
                            </p>
                        )}
                        <section className="ofi-bom-revdialog__section">
                            <h4>{t('productionBom.revision.changesTitle')}<i>{preview.changes.length}</i></h4>
                            <RevisionChangesTable changes={preview.changes} />
                        </section>
                        <section className="ofi-bom-revdialog__section">
                            <h4>{t('productionBom.revision.ordersTitle')}<i>{orders.length}</i></h4>
                            {orders.length ? (
                                <div className="ofi-bom-revdialog__orders">
                                    {orders.map((action) => (
                                        <OrderActionCard
                                            key={action.purchaseOrderId}
                                            action={action}
                                            kept={keep.includes(action.purchaseOrderId)}
                                            onKeep={(value) => toggleKeep(action.purchaseOrderId, value)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="ofi-bom-revdialog__empty">{t('productionBom.revision.noOrders')}</p>
                            )}
                        </section>
                        {preview.toOrder.length > 0 && (
                            <section className="ofi-bom-revdialog__section">
                                <h4>{t('productionBom.revision.toOrderTitle')}<i>{preview.toOrder.length}</i></h4>
                                <div className="ofi-bom-revtable">
                                    {preview.toOrder.map((entry) => (
                                        <div key={entry.lineId} className="ofi-bom-revtable__row is-plain">
                                            <span className="ofi-bom-code">{entry.erpCode ?? '—'}</span>
                                            <span className="ofi-bom-revtable__name" title={entry.name}>{entry.name}</span>
                                            <span className="ofi-bom-revtable__qty"><b>{fmtQty(entry.missing)} {unitLabel(entry.unit)}</b></span>
                                        </div>
                                    ))}
                                </div>
                                <p className="ofi-bom-revdialog__hint">{t('productionBom.revision.toOrderHint')}</p>
                            </section>
                        )}
                        {preview.staleRequests.length > 0 && (
                            <Note>
                                {t('productionBom.revision.staleRequests', {
                                    count: preview.staleRequests.length,
                                    list: preview.staleRequests.map((entry) => shownPurchaseCode(entry.referenceNumber)).join(', '),
                                    revision: from,
                                })}
                            </Note>
                        )}
                        {preview.reopens.bom && <Note>{t('productionBom.revision.reopensBom')}</Note>}
                        {preview.reopens.main && <Note>{t('productionBom.revision.reopensMain', { number: preview.reopens.main })}</Note>}
                        {!preview.changes.length && <Note tone="warn">{t('productionBom.err.REVISION_NO_CHANGES')}</Note>}
                    </div>
                )}
            </div>
        </PopupDialog>
    );
};
