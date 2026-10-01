import { useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { DispatchResult, ProcurementDocView, ProcurementNextAction } from '@/types/purchasing';

import { shownPurchaseCode } from '../../bom/bomFormat';
import { DispatchSheet } from '../dispatch/DispatchSheet';
import { useDispatchQueue } from '../dispatch/useDispatchQueue';
import { failureText } from '../purchasingSend';
import { IconAction } from './IconAction';
import { OrderRow } from './OrderRow';
import { useDispatchStatus } from './useDispatchStatus';

const P = 'productionBom.purchasing';
const L = `${P}.orderList`;
const FILE_MAX_BYTES = 12 * 1024 * 1024;
const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const reportResult = (result: DispatchResult) => {
    const code = shownPurchaseCode(result.code);
    if (result.status === 'SENT') toast.success(t(`${P}.send.sentToast`, { code, to: result.to[0] ?? '' }));
    else if (result.status === 'PREVIEW') toast.message(t(`${P}.send.previewToast`, { code }));
    else toast.error(result.problem ? t(`${P}.dispatch.problem.${result.problem}`) : (result.error || t(`${P}.requests.sendFailed`)));
};

/**
 * ── DIE BESTELLUNGEN DES TALEP (30.09.2026, umgebaut am selben Abend) ──────
 *
 * Wie die Preisanfragen EINE Liste (Samet: «siparişlerde fiyat talepleri gibi
 * tek listede PDF ekleyebilelim, tek seferde onaylayıp gönderebilelim»): je
 * Bestellung die Angebotsnummer zum Eintippen, das Angebot als PDF, der Stand
 * der Sendung mit ihren PDF (auch die der Revisionen) und der eine Handgriff.
 * Oben «Hepsini onayla ve gönder» — alles, was noch nicht (oder geändert noch
 * nicht) beim Lieferanten ist, im Fenster der Sendung, Beleg für Beleg.
 */
export const OrderDocs = ({ docs, canProcure, requestNumber, onAction, onChanged, onOffer, onOpenDocument }: {
    docs: ProcurementDocView[];
    canProcure: boolean;
    requestNumber: string;
    onAction: (action: ProcurementNextAction, purchaseOrderId: string) => void;
    onChanged: () => void;
    /** Das Angebot sofort zeigen (null = zurücknehmen, wenn das Hochladen scheitert). */
    onOffer: (purchaseOrderId: string, file: { name: string; type: string } | null) => void;
    onOpenDocument: (id: string, kind: 'ORDER' | 'REQUEST') => void;
}) => {
    const orders = docs.filter((doc) => doc.kind === 'ORDER');
    const status = useDispatchStatus(orders.map((doc) => doc.purchaseOrderId));
    const [sending, setSending] = useState<Record<string, true>>({});
    const [uploading, setUploading] = useState<Record<string, true>>({});
    const [confirming, setConfirming] = useState<string | null>(null);
    const [dropOn, setDropOn] = useState<string | null>(null);
    const [sheet, setSheet] = useState(false);
    const queue = useDispatchQueue([], 'MANUAL');
    const fileRef = useRef<HTMLInputElement>(null);
    const uploadFor = useRef<string | null>(null);
    if (!orders.length) return null;
    const codeOf = new Map(docs.map((doc) => [doc.purchaseOrderId, doc.code]));

    const pending = orders.filter((doc) => doc.state === 'DRAFT' || doc.state === 'REVISED');
    const ready = pending.filter((doc) => String(doc.quoteNumber ?? '').trim());

    const mark = (setter: typeof setSending, id: string, on: boolean) => setter((current) => {
        const next = { ...current };
        if (on) next[id] = true;
        else delete next[id];
        return next;
    });

    const sendOne = async (doc: ProcurementDocView, resend: boolean) => {
        if (sending[doc.purchaseOrderId]) return;
        mark(setSending, doc.purchaseOrderId, true);
        try {
            reportResult(await purchasingApi.dispatch(doc.purchaseOrderId, { trigger: resend ? 'RESEND' : 'MANUAL' }));
            status.reload();
            onChanged();
        } catch (failure) {
            toast.error(failureText(failure));
        } finally {
            mark(setSending, doc.purchaseOrderId, false);
        }
    };

    /** «Hepsini onayla ve gönder» — was eine Angebotsnummer hat; die anderen sagt die Meldung. */
    const sendAll = () => {
        if (!ready.length) {
            toast.message(t(pending.length ? `${L}.allNeedQuote` : `${L}.nothingToSend`));
            return;
        }
        if (ready.length < pending.length) toast.warning(t(`${L}.someNeedQuote`, { count: pending.length - ready.length }));
        const cards = ready.map((doc) => ({
            purchaseOrderId: doc.purchaseOrderId,
            code: doc.code,
            supplierName: doc.supplierName,
            detail: t('productionBom.procurement.linesCount', { count: doc.lineCount }),
            phase: 'waiting' as const,
            to: doc.supplierEmail ?? null,
            fileName: null,
            mailId: null,
            problem: null,
            error: null,
        }));
        queue.setCards(cards);
        setSheet(true);
        // Eine revidierte Bestellung geht als Revision hinaus (der Server erkennt sie an ihrer Revision).
        void queue.run(cards.map((card) => card.purchaseOrderId));
    };

    const confirm = async (doc: ProcurementDocView) => {
        if (confirming) return;
        setConfirming(doc.purchaseOrderId);
        try {
            await purchaseOrdersApi.setStatus(doc.purchaseOrderId, 'TO_BE_STOCKED');
            toast.success(t(`${L}.confirmed`, { code: shownPurchaseCode(doc.code) }));
            onChanged();
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setConfirming(null);
        }
    };

    const upload = async (purchaseOrderId: string | null, file: File | null | undefined) => {
        if (!file || !purchaseOrderId || uploading[purchaseOrderId]) return;
        const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
        if (!FILE_TYPES.includes(type) || !file.size || file.size > FILE_MAX_BYTES) {
            toast.error(t(`${L}.fileOnly`));
            return;
        }
        onOffer(purchaseOrderId, { name: file.name, type });
        mark(setUploading, purchaseOrderId, true);
        try {
            const named = file.type === type ? file : new File([file], file.name, { type });
            await productionBomApi.uploadQuote(purchaseOrderId, named, { lean: true });
            toast.success(t(`${P}.requests.uploaded`));
            onChanged();
        } catch (failure) {
            onOffer(purchaseOrderId, null);
            toast.error(productionBomErrorText(failure));
        } finally {
            mark(setUploading, purchaseOrderId, false);
        }
    };

    return (
        <section className="ofi-buy-box ofi-buy-orderdocs">
            <header className="ofi-buy-boxhead">
                <h3>{t(`${P}.orders`)}</h3>
                <span className="ofi-buy-count">{orders.length}</span>
                <span className="ofi-buy-headacts">
                    {canProcure && pending.length > 0 && (
                        <IconAction tone="blue" icon={<Send />} label={t(`${L}.sendAll`, { count: pending.length })} badge={pending.length} busy={queue.running} onClick={sendAll} />
                    )}
                </span>
            </header>
            <ul className="ofi-buy-docs ofi-buy-orderlist">
                {orders.map((doc) => {
                    const sourceCode = doc.sourcePurchaseOrderId ? codeOf.get(doc.sourcePurchaseOrderId) ?? null : null;
                    return (
                        <OrderRow
                            key={doc.purchaseOrderId}
                            doc={doc}
                            state={status.items[doc.purchaseOrderId]}
                            sourceCode={sourceCode}
                            canProcure={canProcure}
                            sending={Boolean(sending[doc.purchaseOrderId])}
                            uploading={Boolean(uploading[doc.purchaseOrderId])}
                            confirming={confirming === doc.purchaseOrderId}
                            dropping={dropOn === doc.purchaseOrderId}
                            onDragState={(on) => setDropOn((current) => (on ? doc.purchaseOrderId : current === doc.purchaseOrderId ? null : current))}
                            onDropFile={(file) => void upload(doc.purchaseOrderId, file)}
                            onPickFile={() => { uploadFor.current = doc.purchaseOrderId; fileRef.current?.click(); }}
                            onSend={(resend) => void sendOne(doc, resend)}
                            onConfirm={() => void confirm(doc)}
                            onReceive={() => onAction('RECEIVE', doc.purchaseOrderId)}
                            onQuoteSaved={onChanged}
                            onOpen={() => onOpenDocument(doc.purchaseOrderId, 'ORDER')}
                            onOpenSource={() => doc.sourcePurchaseOrderId && onOpenDocument(doc.sourcePurchaseOrderId, 'REQUEST')}
                        />
                    );
                })}
            </ul>
            <input
                ref={fileRef}
                type="file"
                hidden
                accept={FILE_TYPES.join(',')}
                onChange={(event) => {
                    const target = uploadFor.current;
                    uploadFor.current = null;
                    void upload(target, event.target.files?.[0]);
                    event.target.value = '';
                }}
            />
            <DispatchSheet
                open={sheet}
                title={t(`${L}.sheetTitle`)}
                subtitle={t(`${L}.sheetSubtitle`, { number: requestNumber })}
                cards={queue.cards}
                running={queue.running}
                onClose={() => { setSheet(false); status.reload(); onChanged(); }}
                onRetry={(id) => void queue.run([id])}
                onOpenDocument={(id) => { setSheet(false); onOpenDocument(id, 'ORDER'); }}
            />
        </section>
    );
};
