import { ArrowRight, CheckCircle2, FileText, MailCheck, MailWarning, PackageCheck, RefreshCw, RotateCw, Send, Upload } from 'lucide-react';

import { t } from '@/i18n/translate';
import { purchasingApi } from '@/lib/api/purchasing';
import type { DispatchState, ProcurementDocView } from '@/types/purchasing';

import { openBlob, openQuoteFile } from '../../bom/device/bomFiles';
import { fmtPrice, shownPurchaseCode } from '../../bom/bomFormat';
import { canReceive, docStateLabel, whenText } from '../purchasingModel';
import { DocToken } from '../purchasingUi';
import { IconAction, SourceTag } from './IconAction';
import { QuoteNumberField } from './QuoteNumberField';

const P = 'productionBom.purchasing';
const L = `${P}.orderList`;

/**
 * ── EINE BESTELLUNG IN DER LISTE DES TALEP (30.09.2026, Vorgabe Samet) ─────
 * «Siparişlerde fiyat talepleri gibi tek listede PDF ekleyebilelim, tek
 *  seferde gönderebilelim, orada tedarikçi numarasını ekleyebilelim» — und
 * am Abend: «bütün butonlar ikon şeklinde, farklı renkte, hover'da sola doğru
 * açılsın; yazıları azalt». Lieferant · letzte Sendung · Angebotsnummer zum
 * Eintippen · die PDF der Revisionen · rechts die Handgriffe als Symbole.
 * Kein Dateiname in der Zeile — das Angebot ist das rote PDF-Symbol.
 */
export const OrderRow = ({
    doc,
    state,
    sourceCode,
    canProcure,
    sending,
    uploading,
    confirming,
    dropping,
    onDragState,
    onDropFile,
    onPickFile,
    onSend,
    onConfirm,
    onReceive,
    onQuoteSaved,
    onOpen,
    onOpenSource,
}: {
    doc: ProcurementDocView;
    state: DispatchState | undefined;
    sourceCode: string | null;
    canProcure: boolean;
    sending: boolean;
    uploading: boolean;
    confirming: boolean;
    dropping: boolean;
    onDragState: (on: boolean) => void;
    onDropFile: (file: File | null | undefined) => void;
    onPickFile: () => void;
    onSend: (resend: boolean) => void;
    onConfirm: () => void;
    onReceive: () => void;
    onQuoteSaved: () => void;
    onOpen: () => void;
    onOpenSource: () => void;
}) => {
    const mails = (state?.mails ?? []).filter((mail) => mail.kind !== 'RFQ');
    const last = mails[0] ?? null;
    const revisions = mails.filter((mail) => mail.kind === 'REVISION' && mail.hasFile);
    const open = doc.state === 'DRAFT' || doc.state === 'REVISED' || doc.state === 'SENT';
    const revision = doc.orderRevision ?? 0;
    const quoteMissing = !String(doc.quoteNumber ?? '').trim();
    const droppable = canProcure && !uploading && doc.state !== 'CANCELLED';
    // Das Angebots-PDF braucht nur die erste Bestätigung; eine Revision bestätigt man ohne.
    const confirmBlocked = quoteMissing || (!doc.quoteFile && revision === 0);

    const mailLine = (() => {
        if (sending) return <span className="ofi-buy-askmail is-busy"><Send aria-hidden />{t(`${P}.requests.sending`)}</span>;
        if (last?.status === 'FAILED') {
            return <span className="ofi-buy-askmail is-warn" title={last.error ?? undefined}><MailWarning aria-hidden />{t(`${P}.requests.sendFailed`)}</span>;
        }
        if (last) {
            return (
                <span className="ofi-buy-askmail is-ok" title={last.to.join(', ')}>
                    <MailCheck aria-hidden />
                    {last.kind === 'REVISION' ? `${t(`${L}.revisionTag`)} · ` : ''}
                    {t(`${P}.requests.sentManual`, { when: whenText(last.at), to: last.to[0] ?? '' })}
                </span>
            );
        }
        if (doc.sentAt) return <span className="ofi-buy-askmail is-ok"><MailCheck aria-hidden />{whenText(doc.sentAt)}</span>;
        return <span className="ofi-buy-askmail" title={doc.supplierEmail ?? undefined}>{doc.supplierEmail ? t(`${P}.requests.notSentTo`, { to: doc.supplierEmail }) : t(`${P}.requests.notSent`)}</span>;
    })();

    return (
        <li
            className={`ofi-buy-orderrow${dropping ? ' is-drop' : ''}`}
            onDragOver={droppable ? (event) => { event.preventDefault(); onDragState(true); } : undefined}
            onDragLeave={droppable ? () => onDragState(false) : undefined}
            onDrop={droppable ? (event) => { event.preventDefault(); onDragState(false); onDropFile(event.dataTransfer.files?.[0]); } : undefined}
        >
            <DocToken code={shownPurchaseCode(doc.code)} kind={doc.kind} state={doc.state} />
            <span className="ofi-buy-askrow__who">
                <b>{doc.supplierName || '—'}</b>
                {mailLine}
                <small className="ofi-buy-orderrow__meta">
                    {t('productionBom.procurement.linesCount', { count: doc.lineCount })}
                    {doc.totalNet > 0 ? ` · ${fmtPrice(doc.totalNet, doc.currency)}` : ''}
                    {sourceCode && <SourceTag code={shownPurchaseCode(sourceCode)} title={t(`${P}.send.backToRequest`)} onOpen={onOpenSource} />}
                </small>
            </span>
            <span className="ofi-buy-orderrow__work">
                <QuoteNumberField
                    key={`${doc.purchaseOrderId}:${doc.quoteNumber ?? ''}`}
                    purchaseOrderId={doc.purchaseOrderId}
                    value={doc.quoteNumber}
                    disabled={!canProcure || !open}
                    onSaved={onQuoteSaved}
                />
                {revisions.length > 0 && (
                    <span className="ofi-buy-revpdfs">
                        {revisions.map((mail, index) => (
                            <button
                                key={mail.id}
                                type="button"
                                className="ofi-buy-pdfchip ofi-nosize"
                                title={`${t(`${L}.revisionTag`)} · ${whenText(mail.at)}`}
                                onClick={() => void openBlob(() => purchasingApi.file('mail', mail.id))}
                            >
                                <FileText aria-hidden />
                                {t(`${L}.revisionPdf`, { number: revisions.length - index })}
                            </button>
                        ))}
                    </span>
                )}
            </span>
            <span className="ofi-buy-docs__state">{docStateLabel(doc.kind, doc.state)}</span>
            <span className="ofi-buy-docs__act">
                {/* Das Bestell-PDF, wie es jetzt aussieht (Preise, Rabatt, Revision) — nicht nur das gesendete. */}
                <IconAction tone="red" icon={<FileText />} label={t(`${L}.orderPdf`)} onClick={() => void openBlob(() => purchasingApi.documentPdf(doc.purchaseOrderId))} />
                {doc.quoteFile && (
                    <IconAction tone="orange" icon={<FileText />} label={t(`${L}.offerPdf`)} title={doc.quoteFile.name} onClick={() => void openQuoteFile(doc.purchaseOrderId)} />
                )}
                {canProcure && doc.state !== 'CANCELLED' && (
                    <IconAction
                        tone="teal"
                        icon={doc.quoteFile ? <RefreshCw /> : <Upload />}
                        label={t(doc.quoteFile ? `${P}.requests.replaceOffer` : `${L}.uploadOffer`)}
                        busy={uploading}
                        onClick={onPickFile}
                    />
                )}
                {canProcure && (doc.state === 'DRAFT' || doc.state === 'REVISED') && (
                    <IconAction
                        tone="blue"
                        icon={<Send />}
                        label={t(doc.state === 'REVISED' ? `${P}.next.RESEND` : `${P}.next.SEND`)}
                        title={quoteMissing ? t(`${L}.quoteMissing`) : undefined}
                        disabled={quoteMissing}
                        busy={sending}
                        onClick={() => onSend(doc.state === 'REVISED')}
                    />
                )}
                {canProcure && doc.state === 'SENT' && (
                    <>
                        <IconAction tone="indigo" icon={<RotateCw />} label={t(`${P}.send.resend`)} busy={sending} onClick={() => onSend(true)} />
                        <IconAction
                            tone="green"
                            icon={<CheckCircle2 />}
                            label={revision > 0 ? t(`${P}.send.confirmRevision`, { revision }) : t(`${P}.send.supplierConfirmed`)}
                            title={confirmBlocked ? t(revision > 0 ? `${L}.quoteMissing` : 'productionBom.origin.confirmNeeds') : undefined}
                            disabled={confirmBlocked}
                            busy={confirming}
                            onClick={onConfirm}
                        />
                    </>
                )}
                {canProcure && canReceive(doc) && (
                    <IconAction tone="purple" icon={<PackageCheck />} label={t(`${P}.next.RECEIVE`)} onClick={onReceive} />
                )}
                <IconAction tone="gray" icon={<ArrowRight />} label={t(`${P}.goToOrder`)} onClick={onOpen} />
            </span>
        </li>
    );
};
