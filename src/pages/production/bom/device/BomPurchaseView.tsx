import { useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, FileText, History, PackageCheck, RefreshCw, Save, Trash2, Undo2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { useUnsavedChangesGuard } from '@/pages/sales/detail/hooks/useUnsavedChangesGuard';

import { openQuoteFile } from './bomFiles';
import { BomPurchaseRevisions } from './BomPurchaseRevisions';
import type { Bom } from '@/types/productionBom';

import { fmtPrice, fmtQty, orderUnitLabel, shownPurchaseCode } from '../bomFormat';
import { EmptyState, Note } from '../bomUi';
import { NavBar, NavLinkRow } from '../NavStack';
import { viewKey } from './bomViews';
import type { BomViewContext } from './DeviceBomArea';
import { PurchaseChecks, PurchaseStatus } from './BomPurchasesView';
import { BomUnsavedDialog } from './BomUnsavedDialog';

const CONFIRMED = new Set(['PENDING', 'TO_BE_STOCKED', 'COMPLETED']);

/**
 * ── EINE BOM-BESTELLUNG (27.09.2026, Vorgabe Samet) ─────────────────────────
 *
 * «Bize verilen tedarikçi sipariş numarasını yazmadan asla ne PDF
 *  gönderebiliyoruz ne de siparişi onaylayabiliyoruz … sipariş onayından önce
 *  fiyat teklifi — yani bize verdikleri fiyat teklifi — zorunlu.»
 *
 * Die Angebotsnummer und das Angebot des Lieferanten stehen hier ganz oben;
 * «Siparişi onayla» geht erst mit beiden. Preise und eigene Spalten stehen
 * auf der Seite der Bestellung («Siparişi aç»); von hier aus geht es in den
 * Wareneingang (›), sobald bestätigt ist.
 *
 * Eine PREISANFRAGE (seit 27.09.2026 nur aus der BOM im Entwurf, je
 * Lieferant eine) zeigt nur Name, Modell und Menge — kein Angebot, keine
 * Angebotsnummer, keine Preise («pdf ekleme, sipariş numarası ekleme gibi
 * şeyler olmayacak»).
 */
export const BomPurchaseView = ({ context, bom, purchaseOrderId }: { context: BomViewContext; bom: Bom; purchaseOrderId: string }) => {
    const { nav } = context;
    const purchase = bom.purchases.find((entry) => entry.purchaseOrderId === purchaseOrderId) ?? null;
    // null = nicht angefasst: das Feld zeigt die Nummer des Servers.
    const [draftNumber, setDraftNumber] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [ask, setAsk] = useState<'delete' | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const serverNumber = purchase?.quoteNumber ?? '';
    const quoteNumber = draftNumber ?? serverNumber;
    /* Kein Speichern beim Verlassen des Feldes (27.09.2026: «hiçbir yerde otomatik
       kaydetme yok») — «Kaydet» oder ↵; wer vorher weggeht, wird gefragt. */
    const numberDirty = draftNumber !== null && draftNumber.trim() !== serverNumber.trim();
    const guard = useUnsavedChangesGuard(numberDirty && busy !== 'number');

    if (!purchase) {
        return (
            <>
                <NavBar nav={nav} backTitle={context.backTitle} title={t('productionBom.purchases.order')} />
                <div className="ofi-bom-body"><EmptyState title={t('productionBom.err.PURCHASE_NOT_FOUND')} /></div>
            </>
        );
    }

    const isOrder = purchase.kind === 'ORDER';
    const confirmed = CONFIRMED.has(purchase.status);
    const canConfirm = isOrder && !confirmed && purchase.checks.quoteNumber && purchase.checks.quoteFile;
    const missingForConfirm = [
        !purchase.checks.quoteNumber ? t('productionBom.origin.needQuoteNumber') : null,
        !purchase.checks.quoteFile ? t('productionBom.origin.needQuoteFile') : null,
    ].filter(Boolean).join(', ');

    const withBom = async (key: string, work: () => Promise<{ bom: Bom | null }>, success?: string) => {
        setBusy(key);
        try {
            const result = await work();
            if (result.bom) context.applyBom(result.bom);
            if (success) toast.success(success);
            return true;
        } catch (error) {
            toast.error(productionBomErrorText(error));
            return false;
        } finally {
            setBusy(null);
        }
    };

    const saveNumber = async (): Promise<boolean> => {
        if (quoteNumber.trim() === serverNumber.trim()) { setDraftNumber(null); return true; }
        const ok = await withBom('number', () => productionBomApi.setQuoteNumber(purchaseOrderId, quoteNumber.trim()), t('productionBom.purchase.quoteNumberSaved'));
        if (ok) setDraftNumber(null);
        return ok;
    };
    const upload = (file: File | null | undefined) => {
        if (!file) return;
        void withBom('upload', () => productionBomApi.uploadQuote(purchaseOrderId, file), t('productionBom.purchase.uploaded'));
    };
    const confirm = async () => {
        setBusy('confirm');
        try {
            await purchaseOrdersApi.setStatus(purchaseOrderId, 'TO_BE_STOCKED');
            const refreshed = await productionBomApi.bom(bom.id);
            context.applyBom(refreshed.bom);
            toast.success(t('productionBom.purchase.confirmed'));
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(null);
        }
    };
    const remove = async () => {
        setBusy('delete');
        try {
            await purchaseOrdersApi.remove(purchaseOrderId);
            const refreshed = await productionBomApi.bom(bom.id);
            context.applyBom(refreshed.bom);
            toast.success(t('productionBom.purchase.deleted'));
            setAsk(null);
            nav.popTo(viewKey({ kind: 'purchases', bomId: bom.id }));
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(null);
        }
    };

    const total = purchase.lines.reduce((sum, line) => sum + line.lineTotal, 0);

    return (
        <>
            <NavBar
                nav={nav}
                backTitle={context.backTitle}
                title={<span className="ofi-bom-code is-title"><PurchaseCode value={purchase.referenceNumber} /></span>}
                badge={<PurchaseStatus status={purchase.status} />}
                subtitle={`${purchase.supplierName || '—'} · ${isOrder ? t('productionBom.purchases.order') : t('productionBom.purchases.request')} · ${bom.bomNumber}`}
                actions={(
                    <>
                        {!confirmed && (
                            <button type="button" className="ofi-bom-btn is-quiet is-icon is-danger-hover ofi-nosize" title={isOrder ? t('productionBom.purchase.deleteOrder') : t('productionBom.common.delete')} aria-label={t('productionBom.common.delete')} onClick={() => setAsk('delete')}>
                                <Trash2 />
                            </button>
                        )}
                        {/* Keine «Fiyat talebi oluştur» mehr (27.09.2026): Preisanfragen
                            gibt es nur VOR der Freigabe der BOM — Bestellungen erst danach. */}
                        <button type="button" className="ofi-bom-btn ofi-nosize" onClick={() => context.openOrder(purchaseOrderId)}>
                            <ExternalLink />
                            {isOrder ? t('productionBom.purchase.open') : t('productionBom.purchase.openRequest')}
                        </button>
                        {isOrder && !confirmed && (
                            <button
                                type="button"
                                className="ofi-bom-btn is-primary ofi-nosize"
                                disabled={!canConfirm || busy !== null}
                                title={canConfirm ? undefined : t('productionBom.purchase.confirmNeeds', { items: missingForConfirm })}
                                onClick={() => void confirm()}
                            >
                                {busy === 'confirm' ? <span className="ofi-bom-spinner is-small is-light" /> : <CheckCircle2 />}
                                {t('productionBom.purchase.confirm')}
                            </button>
                        )}
                    </>
                )}
            />

            <div className="ofi-bom-body">
                <PurchaseChecks purchase={purchase} />
                {isOrder && !confirmed && !canConfirm && (
                    <Note tone="warn">{t('productionBom.purchase.confirmNeeds', { items: missingForConfirm })}</Note>
                )}
                {!isOrder && <Note>{t('productionBom.purchase.requestHint')}</Note>}
                {/* Nach einer BOM-Revision: dieselbe Nummer, neue Fassung — der Lieferant bestätigt neu. */}
                {isOrder && purchase.orderRevision > 0 && !confirmed && (
                    <Note tone="warn">{t('productionBom.revision.orderPending', { revision: purchase.orderRevision, bomRevision: purchase.bomRevision })}</Note>
                )}
                {!isOrder && purchase.stale && (
                    <Note tone="warn">{t('productionBom.revision.requestStale', { revision: purchase.bomRevision, current: bom.revision })}</Note>
                )}

                {isOrder && (
                    <section className="ofi-bom-group">
                        <h3 className="ofi-bom-group__title">{t('productionBom.purchase.quoteSection')}</h3>
                        <div className="ofi-bom-group__box">
                            <div className="ofi-bom-row">
                                <label className="ofi-bom-row__label" htmlFor="bom-quote-number">
                                    {t('productionBom.purchase.quoteNumber')}<b className="ofi-bom-req">*</b>
                                </label>
                                <div className="ofi-bom-row__control">
                                    <input
                                        id="bom-quote-number"
                                        className={`ofi-bom-input is-mono${purchase.checks.quoteNumber ? '' : ' is-attention'}`}
                                        value={quoteNumber}
                                        disabled={busy === 'number' || confirmed}
                                        placeholder={t('productionBom.purchase.quoteNumberPlaceholder')}
                                        onChange={(event) => setDraftNumber(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') { event.preventDefault(); void saveNumber(); }
                                            if (event.key === 'Escape') setDraftNumber(null);
                                        }}
                                    />
                                    {numberDirty && (
                                        <span className="ofi-bom-inlinesave">
                                            <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" disabled={busy === 'number'} onClick={() => setDraftNumber(null)}>
                                                <Undo2 />
                                                {t('productionBom.editor.revert')}
                                            </button>
                                            <button type="button" className="ofi-bom-btn is-small is-primary ofi-nosize" disabled={busy === 'number'} onClick={() => void saveNumber()}>
                                                {busy === 'number' ? <span className="ofi-bom-spinner is-small is-light" /> : <Save />}
                                                {t('productionBom.common.save')}
                                            </button>
                                        </span>
                                    )}
                                    <span className="ofi-bom-row__hint">{t('productionBom.purchase.quoteNumberHint')}</span>
                                </div>
                            </div>
                            <div className="ofi-bom-row is-top">
                                <span className="ofi-bom-row__label">
                                    {t('productionBom.purchase.quoteFile')}<b className="ofi-bom-req">*</b>
                                </span>
                                <div className="ofi-bom-row__control">
                                    {purchase.quoteFile ? (
                                        <span className="ofi-bom-filechip">
                                            <FileText aria-hidden />
                                            <span className="ofi-bom-filechip__name">
                                                <b>{purchase.quoteFile.name}</b>
                                                {purchase.quoteFile.size ? <small>{Math.max(1, Math.round(purchase.quoteFile.size / 1024))} KB</small> : null}
                                            </span>
                                            <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" onClick={() => void openQuoteFile(purchaseOrderId)}>
                                                <Eye />
                                                {t('productionBom.purchase.view')}
                                            </button>
                                            {!confirmed && (
                                                <>
                                                    <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                                                        <RefreshCw />
                                                        {t('productionBom.purchase.replace')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="ofi-bom-btn is-small is-quiet is-icon is-danger-hover ofi-nosize"
                                                        aria-label={t('productionBom.purchase.remove')}
                                                        disabled={busy !== null}
                                                        onClick={() => void withBom('removeFile', () => productionBomApi.removeQuote(purchaseOrderId), t('productionBom.purchase.removed'))}
                                                    >
                                                        <X />
                                                    </button>
                                                </>
                                            )}
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            className={`ofi-bom-drop ofi-nosize${dragging ? ' is-over' : ''}`}
                                            disabled={busy !== null}
                                            onClick={() => fileRef.current?.click()}
                                            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                                            onDragLeave={() => setDragging(false)}
                                            onDrop={(event) => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files?.[0]); }}
                                        >
                                            {busy === 'upload' ? <span className="ofi-bom-spinner" /> : <Upload aria-hidden />}
                                            <b>{t('productionBom.purchase.upload')}</b>
                                            <small>{t('productionBom.purchase.dropHint')}</small>
                                        </button>
                                    )}
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        hidden
                                        accept="application/pdf,image/png,image/jpeg,image/webp"
                                        onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }}
                                    />
                                    <span className="ofi-bom-row__hint">{t('productionBom.purchase.quoteFileHint')}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {isOrder && (
                    <div className="ofi-bom-links">
                        <NavLinkRow
                            icon={<PackageCheck />}
                            label={t('productionBom.purchase.receipt')}
                            detail={confirmed
                                ? t('productionBom.purchases.received', { done: purchase.receivedLines, total: purchase.lineCount })
                                : t('productionBom.purchase.receiptNeedsConfirm')}
                            tone={purchase.checks.received ? 'ok' : confirmed ? 'accent' : undefined}
                            disabled={!confirmed || purchase.status === 'COMPLETED'}
                            onClick={() => context.open({ kind: 'receipt', bomId: bom.id, purchaseOrderId })}
                        />
                    </div>
                )}

                {isOrder && purchase.revisions.length > 0 && (
                    <section className="ofi-bom-group">
                        <h3 className="ofi-bom-group__title">
                            <History aria-hidden className="ofi-bom-group__icon" />
                            {t('productionBom.revision.orderHistory')}
                            <span className="ofi-bom-group__count">{purchase.revisions.length}</span>
                        </h3>
                        <BomPurchaseRevisions purchase={purchase} />
                    </section>
                )}

                <section className="ofi-bom-group is-lines">
                    <h3 className="ofi-bom-group__title">
                        {t('productionBom.purchase.linesTitle')}
                        <span className="ofi-bom-group__count">{purchase.lines.length}</span>
                        {isOrder && <span className="ofi-bom-group__meta">{t('productionBom.purchase.pricesInWorkspace')}</span>}
                    </h3>
                    <div className="ofi-bom-tablewrap">
                        <table className="ofi-bom-table" data-unstyled-table>
                            <thead>
                                {/* Die Preisanfrage: nur Name, Modell und Menge — wie sie beim Lieferanten ankommt. */}
                                <tr>
                                    {isOrder && <th className="is-code">{t('productionBom.columns.erpCode')}</th>}
                                    <th className="is-name">{t('productionBom.columns.name')}</th>
                                    {!isOrder && <th>{t('productionBom.columns.modelNumber')}</th>}
                                    <th className="is-num">{t('productionBom.columns.quantity')}</th>
                                    {isOrder && <th className="is-num">{t('productionBom.purchase.unitPrice')}</th>}
                                    {isOrder && <th className="is-num">{t('productionBom.purchase.netPrice')}</th>}
                                    {isOrder && <th className="is-num">{t('productionBom.purchase.lineTotal')}</th>}
                                    {isOrder && <th className="is-num">{t('productionBom.receipt.received')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {purchase.lines.map((line) => (
                                    <tr key={line.index}>
                                        {isOrder && <td className="is-code"><span className="ofi-bom-code">{line.code ?? '—'}</span></td>}
                                        <td className="is-name">{line.name}</td>
                                        {!isOrder && <td className="is-mono">{line.model ?? '—'}</td>}
                                        <td className="is-num"><span className="ofi-bom-qty">{fmtQty(line.quantity)}<small>{orderUnitLabel(line.unit)}</small></span></td>
                                        {isOrder && <td className="is-num">{line.grossPrice > 0 ? fmtPrice(line.grossPrice, purchase.currency) : '—'}</td>}
                                        {isOrder && <td className="is-num">{line.netPrice > 0 ? fmtPrice(line.netPrice, purchase.currency) : '—'}</td>}
                                        {isOrder && <td className="is-num">{line.lineTotal > 0 ? fmtPrice(line.lineTotal, purchase.currency) : '—'}</td>}
                                        {isOrder && <td className={`is-num${line.received + 1e-9 >= line.quantity ? ' is-ok' : ''}`}>{fmtQty(line.received)}</td>}
                                    </tr>
                                ))}
                            </tbody>
                            {isOrder && total > 0 && (
                                <tfoot>
                                    <tr>
                                        <td colSpan={5} className="is-num">{t('productionBom.purchase.total')}</td>
                                        <td className="is-num"><b>{fmtPrice(total, purchase.currency)}</b></td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </section>
            </div>

            <BomUnsavedDialog
                guard={guard}
                text={t('productionBom.purchase.unsavedText', { number: shownPurchaseCode(purchase.referenceNumber) })}
                onSave={saveNumber}
            />
            <PopupDialog
                open={ask === 'delete'}
                onClose={() => { if (!busy) setAsk(null); }}
                title={isOrder ? t('productionBom.purchase.deleteTitle') : t('productionBom.purchase.deleteRequestTitle')}
                subtitle={isOrder
                    ? t('productionBom.purchase.deleteText', { number: shownPurchaseCode(purchase.referenceNumber) })
                    : t('productionBom.purchase.deleteRequestText', { number: shownPurchaseCode(purchase.referenceNumber) })}
                icon={<Trash2 size={18} />}
                tone="danger"
                width={460}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setAsk(null)} disabled={busy !== null}>{t('productionBom.common.cancel')}</PopupButton>
                        <PopupButton variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>{t('productionBom.common.delete')}</PopupButton>
                    </PopupActions>
                )}
            />
        </>
    );
};
