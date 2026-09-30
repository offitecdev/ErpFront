import { useRef, useState } from 'react';
import { Inbox, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { DispatchResult, ProcurementDetail } from '@/types/purchasing';

import { shownPurchaseCode } from '../../bom/bomFormat';
import { DispatchSheet } from '../dispatch/DispatchSheet';
import { useDispatchQueue } from '../dispatch/useDispatchQueue';
import { failureText } from '../purchasingSend';
import { AskRow } from './AskRow';
import { IconAction } from './IconAction';
import { SupplierGlassPicker } from './SupplierGlassPicker';
import { useDispatchStatus } from './useDispatchStatus';
import { useInboxCheck } from './useInboxCheck';

const P = 'productionBom.purchasing.requests';
/** So viele Lieferanten nimmt der Server je Aufruf (BOM_LIMITS.requestSuppliers). */
const SUPPLIERS_PER_CALL = 10;
const PDF_MAX_BYTES = 12 * 1024 * 1024;

const fold = (name: string) => name.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');

/** Die Meldung nach dem Senden EINER Anfrage. */
const reportResult = (result: DispatchResult) => {
    const code = shownPurchaseCode(result.code);
    if (result.status === 'SENT') toast.success(t(`${P}.sentToast`, { code, to: result.to[0] ?? '' }));
    else if (result.status === 'PREVIEW') toast.message(t(`${P}.previewToast`, { code }));
    else toast.error(result.problem ? t(`productionBom.purchasing.dispatch.problem.${result.problem}`) : (result.error || t(`${P}.sendFailed`)));
};

interface PendingAsk { purchaseOrderId: string; code: string; supplierName: string; email: string | null; lineCount: number }

/**
 * ── FİYAT TALEPLERİ (29.09.2026, umgebaut 30.09.2026) ───────────────────────
 *
 * «Fiyat talepleri artık otomatik gönderiliyor … eğer gelmediyse manuel olarak
 *  pdf'i ekleme seçeneğimiz olması lazım.» Aus der BOM entsteht je Lieferant
 * der Karten eine Anfrage und geht sofort aus rfq@… hinaus; die Antwort mit
 * PDF hängt sich von selbst an. Hier:
 *   · je Zeile, wohin und wann sie ging und ob die Antwort da ist — fehlt die
 *     Adresse, fragt die Zeile danach (sie wird die E-Mail des Lieferanten);
 *   · «Kartlardaki tedarikçilere gönder» — was noch nicht hinausging (auch
 *     neue Lieferanten der Karten), Beleg für Beleg im Fenster der Sendung;
 *   · der Posteingang wird beim Öffnen gleich gelesen («direkt sayfa açılınca»),
 *     «Yanıtları kontrol et» liest ihn noch einmal;
 *   · «Ekle» fragt weitere Lieferanten — und schickt ihnen die Anfrage sofort
 *     («ekle deyince o tedarikçinin mailine otomatik göndermeye çalışması lazım»);
 *   · von Hand: das Angebot hochladen, eine Anfrage erneut senden.
 */
export const PriceRequests = ({ detail, onChanged, onOffer, onOpenDocument }: {
    detail: ProcurementDetail;
    onChanged: () => void;
    /** Das Angebot sofort zeigen (null = zurücknehmen, wenn das Hochladen scheitert). */
    onOffer: (purchaseOrderId: string, file: { name: string; type: string } | null) => void;
    onOpenDocument: (purchaseOrderId: string) => void;
}) => {
    const { request, bom, canProcure } = detail;
    const open = request.status === 'OPEN' || request.status === 'IN_PROGRESS';
    const asks = detail.docs.filter((doc) => doc.kind === 'REQUEST' && doc.state !== 'CANCELLED');
    const mayAdd = canProcure && open && !bom.consumedAt;
    const status = useDispatchStatus(asks.map((doc) => doc.purchaseOrderId));
    // Die Sprechblase zeigt mit ihrem Pfeil auf das «+» (30.09.2026, Skizze Samet): null = zu.
    const [picking, setPicking] = useState<HTMLElement | null>(null);
    const addRef = useRef<HTMLSpanElement>(null);
    const [busy, setBusy] = useState<'create' | 'prepare' | null>(null);
    const [sending, setSending] = useState<Record<string, true>>({});
    const [uploading, setUploading] = useState<Record<string, true>>({});
    /** Belege, deren Senden «keine E-Mail» sagte — die Zeile fragt nach der Adresse. */
    const [noEmail, setNoEmail] = useState<Record<string, true>>({});
    const [dropOn, setDropOn] = useState<string | null>(null);
    const [sheet, setSheet] = useState(false);
    const queue = useDispatchQueue([]);
    const fileRef = useRef<HTMLInputElement>(null);
    const uploadFor = useRef<string | null>(null);

    /* Antworten erwartet (eine Anfrage oder Bestellung liegt beim Lieferanten)? Dann gleich nachsehen —
       und bis bestellt wird, jede Minute wieder («sipariş aşamasına geçilmeden önce otomatik yenileme»). */
    const awaiting = canProcure && detail.docs.some((doc) => doc.state === 'SENT');
    const beforeOrders = !detail.docs.some((doc) => doc.kind === 'ORDER' && doc.state !== 'CANCELLED');
    const inbox = useInboxCheck(awaiting, (result, manual) => {
        if (result.attached > 0) {
            toast.success(t(`${P}.checkFound`, { count: result.attached }));
            status.reload();
            onChanged();
        } else if (manual) {
            if (result.error) toast.error(t(`${P}.checkFailed`, { error: result.error }));
            else toast.message(t(`${P}.checkNothing`));
            status.reload();
        }
    }, beforeOrders ? 60_000 : undefined);

    /** Die Anfragen im Fenster der Sendung — eine nach der anderen, jeder Schritt sichtbar. */
    const runSheet = (entries: PendingAsk[]) => {
        const cards = entries.map((entry) => ({
            purchaseOrderId: entry.purchaseOrderId,
            code: entry.code,
            supplierName: entry.supplierName,
            detail: t('productionBom.procurement.linesCount', { count: entry.lineCount }),
            phase: 'waiting' as const,
            to: entry.email,
            fileName: null,
            mailId: null,
            problem: null,
            error: null,
        }));
        queue.setCards(cards);
        setSheet(true);
        void queue.run(cards.map((card) => card.purchaseOrderId));
    };

    const create = async (suppliers: Array<{ id: string | null; name: string }>) => {
        const fresh = suppliers.filter((supplier) => !asks.some((doc) => (supplier.id && doc.supplierId
            ? doc.supplierId === supplier.id
            : fold(doc.supplierName) === fold(supplier.name))));
        if (!fresh.length || busy) return;
        setBusy('create');
        const created: PendingAsk[] = [];
        try {
            for (let start = 0; start < fresh.length; start += SUPPLIERS_PER_CALL) {
                const batch = fresh.slice(start, start + SUPPLIERS_PER_CALL);
                const result = await productionBomApi.createRequests(bom.id, request.lines.map((line) => ({
                    lineId: line.bomLineId,
                    quantity: line.quantity,
                    suppliers: batch.map((supplier) => ({ supplierId: supplier.id, supplierName: supplier.name })),
                })), request.id);
                result.failed.forEach((entry) => toast.error(t('productionBom.wizard.failed', { supplier: entry.supplierName })));
                created.push(...result.created.map((entry) => ({
                    purchaseOrderId: entry.purchaseOrderId,
                    code: entry.referenceNumber,
                    supplierName: entry.supplierName,
                    email: null,
                    lineCount: entry.lineCount,
                })));
            }
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(null);
            if (created.length) onChanged();
        }
        // Gleich hinaus an die neuen Lieferanten — ohne Adresse sagt es die Karte, und die Zeile fragt danach.
        if (created.length) runSheet(created);
    };

    /** Was noch nicht hinausging (auch neue Lieferanten der Karten) — sichtbar, Beleg für Beleg. */
    const sendPending = async () => {
        if (busy) return;
        setBusy('prepare');
        try {
            const { pending } = await purchasingApi.dispatchRequest(request.id, false);
            if (!pending.length) {
                toast.message(t(`${P}.nothingToSend`));
                return;
            }
            runSheet(pending);
        } catch (failure) {
            toast.error(failureText(failure));
        } finally {
            setBusy(null);
        }
    };

    const sendOne = async (purchaseOrderId: string, resend: boolean, to?: string) => {
        if (sending[purchaseOrderId]) return;
        setSending((current) => ({ ...current, [purchaseOrderId]: true }));
        try {
            const result = await purchasingApi.dispatch(purchaseOrderId, { trigger: resend ? 'RESEND' : 'MANUAL', ...(to ? { to } : {}) });
            reportResult(result);
            setNoEmail((current) => {
                const next = { ...current };
                if (result.problem === 'NO_EMAIL') next[purchaseOrderId] = true;
                else delete next[purchaseOrderId];
                return next;
            });
            status.reload();
            onChanged();
        } catch (failure) {
            toast.error(failureText(failure));
        } finally {
            setSending((current) => {
                const next = { ...current };
                delete next[purchaseOrderId];
                return next;
            });
        }
    };

    const pickFile = (purchaseOrderId: string) => {
        uploadFor.current = purchaseOrderId;
        fileRef.current?.click();
    };

    /* Das PDF steht SOFORT in der Zeile (und zählt für den Vergleich); das
       Hochladen nach R2 läuft dahinter, der Stand des Talep kommt im Hintergrund. */
    const upload = async (purchaseOrderId: string | null, file: File | null | undefined) => {
        if (!file || !purchaseOrderId || uploading[purchaseOrderId]) return;
        const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (!pdf || !file.size || file.size > PDF_MAX_BYTES) {
            toast.error(t(`${P}.pdfOnly`));
            return;
        }
        onOffer(purchaseOrderId, { name: file.name, type: 'application/pdf' });
        setUploading((current) => ({ ...current, [purchaseOrderId]: true }));
        try {
            // Manche Systeme melden kein `type` — das Angebot geht dann ausdrücklich als PDF.
            const named = file.type === 'application/pdf' ? file : new File([file], file.name, { type: 'application/pdf' });
            await productionBomApi.uploadQuote(purchaseOrderId, named, { lean: true });
            toast.success(t(`${P}.uploaded`));
            onChanged();
        } catch (failure) {
            onOffer(purchaseOrderId, null);
            toast.error(productionBomErrorText(failure));
        } finally {
            setUploading((current) => {
                const next = { ...current };
                delete next[purchaseOrderId];
                return next;
            });
        }
    };

    const sheetNoEmail = new Set(queue.cards.filter((card) => card.problem === 'NO_EMAIL').map((card) => card.purchaseOrderId));
    const sentCount = asks.filter((doc) => doc.state !== 'DRAFT').length;
    const repliedCount = asks.filter((doc) => doc.state === 'REPLIED').length;

    return (
        <section className="ofi-buy-box ofi-buy-asks">
            <header className="ofi-buy-boxhead">
                <h3>{t(`${P}.title`)}</h3>
                <span className="ofi-buy-count">{asks.length}</span>
                <span className="ofi-buy-boxhead__meta">
                    {asks.length ? t(`${P}.progress`, { sent: sentCount, replied: repliedCount, total: asks.length }) : t(`${P}.hint`)}
                </span>
                <span className="ofi-buy-headacts">
                    {canProcure && (
                        <IconAction tone="purple" icon={<Inbox />} label={t(inbox.checking ? `${P}.checking` : `${P}.check`)} busy={inbox.checking} onClick={() => void inbox.check()} />
                    )}
                    {mayAdd && (
                        <IconAction tone="blue" icon={<Send />} label={t(`${P}.sendPending`)} busy={busy === 'prepare'} disabled={busy !== null} onClick={() => void sendPending()} />
                    )}
                    {mayAdd && (
                        <span ref={addRef} className="ofi-buy-addanchor">
                            <IconAction tone="green" icon={<Plus />} label={t(`${P}.add`)} busy={busy === 'create'} disabled={busy !== null} onClick={() => setPicking(addRef.current?.querySelector<HTMLElement>('.ofi-iact__icon') ?? addRef.current)} />
                        </span>
                    )}
                </span>
            </header>

            {!asks.length ? (
                <p className="ofi-buy-note">{t(mayAdd ? `${P}.emptyAuto` : `${P}.emptyClosed`)}</p>
            ) : (
                <ul className="ofi-buy-docs ofi-buy-asklist">
                    {asks.map((doc) => (
                        <AskRow
                            key={doc.purchaseOrderId}
                            doc={doc}
                            state={status.items[doc.purchaseOrderId]}
                            canProcure={canProcure}
                            uploading={Boolean(uploading[doc.purchaseOrderId])}
                            sending={Boolean(sending[doc.purchaseOrderId])}
                            dropping={dropOn === doc.purchaseOrderId}
                            needsEmail={!doc.supplierEmail || Boolean(noEmail[doc.purchaseOrderId]) || sheetNoEmail.has(doc.purchaseOrderId)}
                            onDragState={(on) => setDropOn((current) => (on ? doc.purchaseOrderId : current === doc.purchaseOrderId ? null : current))}
                            onDropFile={(file) => void upload(doc.purchaseOrderId, file)}
                            onPickFile={() => pickFile(doc.purchaseOrderId)}
                            onSend={(resend, to) => void sendOne(doc.purchaseOrderId, resend, to)}
                            onOpen={() => onOpenDocument(doc.purchaseOrderId)}
                        />
                    ))}
                </ul>
            )}

            <input
                ref={fileRef}
                type="file"
                hidden
                accept="application/pdf,.pdf"
                onChange={(event) => {
                    const target = uploadFor.current;
                    uploadFor.current = null;
                    void upload(target, event.target.files?.[0]);
                    event.target.value = '';
                }}
            />

            {/* «Ekle»: das Glasfenster der Produktion (30.09.2026) — mehrere Lieferanten, die Anfragen gehen gleich hinaus. */}
            <SupplierGlassPicker
                open={picking !== null}
                anchor={picking}
                askedIds={asks.flatMap((doc) => (doc.supplierId ? [doc.supplierId] : []))}
                askedNames={asks.map((doc) => doc.supplierName)}
                onClose={() => setPicking(null)}
                onPick={(suppliers) => {
                    setPicking(null);
                    void create(suppliers);
                }}
            />

            <DispatchSheet
                open={sheet}
                title={t(`${P}.sheetTitle`)}
                subtitle={t(`${P}.sheetSubtitle`, { number: request.requestNumber })}
                cards={queue.cards}
                running={queue.running}
                onClose={() => { setSheet(false); status.reload(); onChanged(); }}
                onRetry={(id) => void queue.run([id])}
                onOpenDocument={(id) => { setSheet(false); onOpenDocument(id); }}
            />
        </section>
    );
};
