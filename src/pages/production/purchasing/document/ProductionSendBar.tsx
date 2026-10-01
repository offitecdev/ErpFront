import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, Mail, RotateCw, Send } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import type { PurchaseOrderRow } from '@/types/inventory';
import type { BomOrigin } from '@/types/productionBom';
import '@/styles/modules/purchasingDispatch.css';

import { openQuoteFile } from '../../bom/device/bomFiles';
import { shownPurchaseCode } from '../../bom/bomFormat';
import { PaperGlyph, StatusGlyph } from '../dispatch/DispatchGlyphs';
import { isFinal, phaseText, type DispatchPhase } from '../dispatch/dispatchModel';
import { useDispatchStatus } from '../request/useDispatchStatus';
import { ManualSendDialog } from './ManualSendDialog';
import { SendLog } from './SendLog';
import { sendMoves, sendStageOf, type SendStage } from './sendStage';
import { useSingleDispatch } from './useSingleDispatch';

const P = 'productionBom.purchasing.send';

/** Das Blatt links ruht, solange nichts gesendet wird — gesendet trägt es Nummer und «PDF». */
const restingPhase = (stage: SendStage): DispatchPhase =>
    (stage === 'draft' || stage === 'askDraft' || stage === 'revised' ? 'waiting' : 'sent');

/**
 * ── DIE SENDUNG EINES BOM-BELEGS AUF DER AUFTRAGSSEITE (30.09.2026) ────────
 *
 * «Siparişi onayla butonu onayla ve gönder olacak … mail PDF ile gidecek …
 *  sipariş sayfasında onay bekliyor butonları, manuel tekrar gönderme ve
 *  manuel seçeneği.» Unter dem Band der BOM:
 *   · links das Blatt (schreibt sich beim Senden), der Stand in einem Wort
 *     («Onay bekliyor», «Yanıt bekleniyor» …), die letzte Sendung und Antwort;
 *   · rechts EIN Hauptknopf — «Onayla ve gönder» / «Gönder» /
 *     «Revizyonu gönder» / «Tedarikçi onayladı» — und daneben «Tekrar
 *     gönder», «Manuel gönder» und der Weg zurück zur Preisanfrage.
 * Offene Änderungen der Tabelle werden vor dem Senden gespeichert.
 */
export const ProductionSendBar = ({
    order,
    origin,
    canSend,
    busy,
    confirming,
    onBeforeSend,
    onSent,
    onConfirm,
    onOrderChanged,
    onOpenDocument,
}: {
    order: PurchaseOrderRow;
    origin: BomOrigin;
    /** Senden darf der Einkauf (Purser) und die Administratorrolle. */
    canSend: boolean;
    busy: boolean;
    confirming: boolean;
    /** Offene Änderungen speichern — false = abbrechen. */
    onBeforeSend: () => Promise<boolean>;
    /** Nach einer Sendung: den Beleg (Stand, «gesendet am») neu lesen. */
    onSent: () => void;
    /** «Tedarikçi onayladı» — die Bestellung geht auf MAL KABULDE. */
    onConfirm: () => void;
    onOrderChanged: (next: PurchaseOrderRow) => void;
    onOpenDocument?: (purchaseOrderId: string, kind?: 'ORDER' | 'REQUEST') => void;
}) => {
    const stage = sendStageOf(order, origin);
    const moves = sendMoves(stage);
    const isOrder = origin.kind === 'ORDER';
    const status = useDispatchStatus([order.id]);
    const single = useSingleDispatch(order.id);
    const [manual, setManual] = useState(false);
    const quoteMissing = isOrder && !String(order.quoteNumber ?? '').trim();
    const confirmBlocked = isOrder && origin.confirmProblems.length > 0;
    const code = shownPurchaseCode(order.referenceNumber);

    const send = async (resend: boolean) => {
        if (busy || single.running) return;
        if (!(await onBeforeSend())) return;
        const result = await single.send(resend ? 'RESEND' : 'MANUAL');
        status.reload();
        if (!result) return;
        if (result.status === 'SENT') {
            toast.success(t(`${P}.sentToast`, { code, to: result.to[0] ?? '' }));
            onSent();
        } else if (result.status === 'PREVIEW') {
            toast.message(t(`${P}.previewToast`, { code }));
        }
    };

    const phase = single.phase ?? restingPhase(stage);
    const card = {
        purchaseOrderId: order.id,
        code: order.referenceNumber,
        supplierName: order.supplierName,
        detail: '',
        phase,
        to: single.result?.to[0] ?? order.supplierEmail ?? null,
        fileName: single.result?.fileName ?? null,
        mailId: single.result?.mailId ?? null,
        problem: single.result?.problem ?? null,
        error: single.result?.error ?? single.error,
    };
    const live = single.phase !== null;
    const problem = live && (phase === 'failed' || phase === 'skipped');
    const line = live
        ? phaseText(card)
        : t(`${P}.hint.${stage}`, { to: order.supplierEmail || t(`${P}.noEmail`), revision: origin.orderRevision ?? 0 });

    const primary = (() => {
        if (!canSend) return null;
        if (moves.send) {
            return (
                <button
                    type="button"
                    className="ofi-psend__btn is-primary ofi-nosize"
                    disabled={busy || single.running || quoteMissing}
                    title={quoteMissing ? t('productionBom.origin.sendNeeds') : undefined}
                    onClick={() => void send(false)}
                >
                    {single.running ? <span className="ofi-buy-spinner" /> : <Send aria-hidden />}
                    {t(isOrder ? `${P}.approveAndSend` : `${P}.sendRequest`)}
                </button>
            );
        }
        if (moves.revise) {
            return (
                <button type="button" className="ofi-psend__btn is-primary ofi-nosize" disabled={busy || single.running || quoteMissing} onClick={() => void send(true)}>
                    {single.running ? <span className="ofi-buy-spinner" /> : <Send aria-hidden />}
                    {t(`${P}.sendRevision`)}
                </button>
            );
        }
        if (moves.confirm && isOrder) {
            return (
                <button
                    type="button"
                    className="ofi-psend__btn is-confirm ofi-nosize"
                    disabled={busy || confirming || confirmBlocked}
                    title={confirmBlocked ? t('productionBom.origin.confirmNeeds') : t(`${P}.confirmHint`)}
                    onClick={onConfirm}
                >
                    {confirming ? <span className="ofi-buy-spinner" /> : <CheckCircle2 aria-hidden />}
                    {(origin.orderRevision ?? 0) > 0
                        ? t(`${P}.confirmRevision`, { revision: origin.orderRevision })
                        : t(`${P}.supplierConfirmed`)}
                </button>
            );
        }
        return null;
    })();

    return (
        <section className={`ofi-dsp ofi-psend is-${stage}${live ? ` is-live is-${phase}` : ''}`} aria-live="polite">
            <PaperGlyph phase={phase} code={code} />
            <span className="ofi-psend__text">
                <b>{t(`${P}.stage.${stage}`)}</b>
                <small className={problem ? 'is-warn' : undefined}>{line}</small>
                <SendLog state={status.items[order.id]} />
            </span>
            <span className="ofi-psend__acts">
                {origin.sourcePurchaseOrderId && onOpenDocument && (
                    <button type="button" className="ofi-psend__btn is-quiet ofi-nosize" onClick={() => onOpenDocument(origin.sourcePurchaseOrderId!, 'REQUEST')}>
                        <ArrowLeft aria-hidden />
                        {t(`${P}.backToRequest`)}
                    </button>
                )}
                {!isOrder && origin.quoteFile && (
                    <button type="button" className="ofi-psend__btn ofi-nosize" onClick={() => void openQuoteFile(order.id)}>
                        <Eye aria-hidden />
                        {t(`${P}.viewOffer`)}
                    </button>
                )}
                {canSend && moves.manual && (
                    <button type="button" className="ofi-psend__btn ofi-nosize" disabled={busy || single.running} onClick={() => setManual(true)}>
                        <Mail aria-hidden />
                        {t(`${P}.manual`)}
                    </button>
                )}
                {canSend && moves.resend && (
                    <button type="button" className="ofi-psend__btn ofi-nosize" disabled={busy || single.running || quoteMissing} onClick={() => void send(true)}>
                        {single.running ? <span className="ofi-buy-spinner" /> : <RotateCw aria-hidden />}
                        {t(`${P}.resend`)}
                    </button>
                )}
                {primary}
                {live && isFinal(phase) && <StatusGlyph phase={phase} />}
            </span>
            <ManualSendDialog
                open={manual}
                order={order}
                priceRequest={!isOrder}
                onClose={() => { setManual(false); status.reload(); }}
                onOrderChanged={(next) => { onOrderChanged(next); status.reload(); }}
            />
        </section>
    );
};
