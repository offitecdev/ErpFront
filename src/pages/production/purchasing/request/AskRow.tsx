import { ArrowRight, CornerDownLeft, FileText, Mail, MailCheck, MailWarning, RefreshCw, RotateCw, Send, Upload } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { DispatchState, ProcurementDocView } from '@/types/purchasing';

import { openBlob, openQuoteFile } from '../../bom/device/bomFiles';
import { shownPurchaseCode } from '../../bom/bomFormat';
import { purchasingApi } from '@/lib/api/purchasing';
import { docStateLabel, whenText } from '../purchasingModel';
import { DocToken } from '../purchasingUi';
import { AskEmail } from './AskEmail';
import { IconAction } from './IconAction';

const P = 'productionBom.purchasing.requests';

/**
 * ── EINE PREISANFRAGE IN DER LISTE DES TALEP (30.09.2026) ──────────────────
 * Lieferant · wann und wohin sie ging · rechts die Handgriffe als farbige
 * Symbole (das Wort gleitet beim Zeigen links heraus): das Angebot öffnen
 * (rot), hochladen (türkis), senden (blau) bzw. neu senden (indigo), die
 * Anfrage öffnen (grau). Ein PDF lässt sich auch auf die Zeile ziehen. Kennt
 * niemand die Adresse, fragt die Zeile danach.
 */
export const AskRow = ({
    doc,
    state,
    canProcure,
    uploading,
    sending,
    dropping,
    needsEmail,
    onDragState,
    onDropFile,
    onPickFile,
    onSend,
    onOpen,
}: {
    doc: ProcurementDocView;
    state: DispatchState | undefined;
    canProcure: boolean;
    uploading: boolean;
    sending: boolean;
    dropping: boolean;
    /** Keine Adresse bekannt (oder das Senden sagte «keine E-Mail») — die Zeile fragt danach. */
    needsEmail: boolean;
    onDragState: (on: boolean) => void;
    onDropFile: (file: File | null | undefined) => void;
    onPickFile: () => void;
    /** `to` = eine eben eingetippte Adresse. */
    onSend: (resend: boolean, to?: string) => void;
    onOpen: () => void;
}) => {
    const lastMail = state?.mails.find((mail) => mail.kind === 'RFQ') ?? null;
    const reply = state?.replies.find((entry) => entry.kind !== 'ORDER') ?? null;
    const sent = Boolean(lastMail && lastMail.status === 'SENT') || doc.state === 'SENT' || doc.state === 'REPLIED';
    const failed = lastMail?.status === 'FAILED';
    const droppable = canProcure && !uploading;
    const askEmail = canProcure && needsEmail && !sent && !doc.quoteFile && doc.state !== 'CANCELLED';

    const mailLine = (() => {
        if (sending) return <span className="ofi-buy-askmail is-busy"><Send aria-hidden />{t(`${P}.sending`)}</span>;
        if (failed) return <span className="ofi-buy-askmail is-warn" title={lastMail?.error ?? undefined}><MailWarning aria-hidden />{t(`${P}.sendFailed`)}</span>;
        if (lastMail?.status === 'SENT') {
            return (
                <span className="ofi-buy-askmail is-ok" title={lastMail.to.join(', ')}>
                    <MailCheck aria-hidden />
                    {t(lastMail.trigger === 'AUTO' ? `${P}.sentAuto` : `${P}.sentManual`, { when: whenText(lastMail.at), to: lastMail.to[0] ?? '' })}
                </span>
            );
        }
        if (sent) return <span className="ofi-buy-askmail is-ok"><MailCheck aria-hidden />{t(`${P}.sentElsewhere`)}</span>;
        if (askEmail) return <span className="ofi-buy-askmail is-warn"><MailWarning aria-hidden />{t(`${P}.noEmail`)}</span>;
        return (
            <span className="ofi-buy-askmail" title={doc.supplierEmail ?? undefined}>
                <Mail aria-hidden />
                {doc.supplierEmail ? t(`${P}.notSentTo`, { to: doc.supplierEmail }) : t(`${P}.notSent`)}
            </span>
        );
    })();

    return (
        <li
            className={`ofi-buy-askrow${dropping ? ' is-drop' : ''}`}
            onDragOver={droppable ? (event) => { event.preventDefault(); onDragState(true); } : undefined}
            onDragLeave={droppable ? () => onDragState(false) : undefined}
            onDrop={droppable ? (event) => { event.preventDefault(); onDragState(false); onDropFile(event.dataTransfer.files?.[0]); } : undefined}
        >
            <DocToken code={shownPurchaseCode(doc.code)} kind={doc.kind} state={doc.state} />
            <span className="ofi-buy-askrow__who">
                <b>{doc.supplierName || '—'}</b>
                {mailLine}
            </span>
            <span className="ofi-buy-askrow__offer">
                {askEmail && <AskEmail busy={sending} onSend={(email) => onSend(false, email)} />}
                {reply && (
                    <small className="ofi-buy-askreply" title={reply.fromEmail ?? undefined}>
                        <CornerDownLeft aria-hidden />
                        {t(reply.status === 'NO_PDF' ? `${P}.replyNoPdf` : `${P}.replyAuto`, { when: whenText(reply.at), from: reply.fromName || reply.fromEmail || '' })}
                    </small>
                )}
            </span>
            <span className="ofi-buy-docs__state">{docStateLabel(doc.kind, doc.state)}</span>
            <span className="ofi-buy-docs__act">
                {doc.quoteFile && (
                    <IconAction
                        tone="red"
                        icon={uploading ? <span className="ofi-iact__spin" /> : <FileText />}
                        label={t(`${P}.viewOffer`)}
                        title={doc.quoteFile.name}
                        onClick={() => void openQuoteFile(doc.purchaseOrderId)}
                    />
                )}
                {reply?.hasFile && !doc.quoteFile && (
                    <IconAction tone="purple" icon={<CornerDownLeft />} label={t(`${P}.replyOpen`)} onClick={() => void openBlob(() => purchasingApi.file('reply', reply.id))} />
                )}
                {canProcure && (
                    <IconAction
                        tone="teal"
                        icon={doc.quoteFile ? <RefreshCw /> : <Upload />}
                        label={t(doc.quoteFile ? `${P}.replaceOffer` : `${P}.uploadOffer`)}
                        disabled={uploading}
                        onClick={onPickFile}
                    />
                )}
                {canProcure && doc.state !== 'CANCELLED' && !askEmail && (
                    <IconAction
                        tone={sent ? 'indigo' : 'blue'}
                        icon={sent ? <RotateCw /> : <Send />}
                        label={t(sent ? `${P}.resend` : `${P}.send`)}
                        busy={sending}
                        onClick={() => onSend(sent)}
                    />
                )}
                <IconAction tone="gray" icon={<ArrowRight />} label={t(`${P}.openRequest`)} onClick={onOpen} />
            </span>
        </li>
    );
};
