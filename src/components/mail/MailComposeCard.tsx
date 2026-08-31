import { useEffect, useMemo, useRef, useState } from 'react';
import { LuPaperclip, LuSend, LuX, LuChevronDown } from 'react-icons/lu';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { isRequestTimeout } from '@/lib/axios';
import { mailApiError, mailMessagesApi, inboxApi, type InboxStatusDto } from '@/lib/api/mail';
import { FloatingCard } from '@/pages/calendar/components/FloatingCard';
import type { FloatAnchor } from '@/pages/calendar/calendarShared';
import type { CrmCustomerOption } from '@/pages/crm/types/crm.types';
import { RecipientCombo, type Recipient } from './RecipientCombo';
import { SendConfirmPopup } from './SendConfirmPopup';
import { blobToBase64, emitMailSent, type ComposeAttachment, type ComposeRequest } from './mailComposeBus';

/* Das Schreiben-Fenster — eine schwebende Karte unten rechts (wie das
   Verfassen-Fenster der Referenz-Mailoberfläche): An / Cc / Betreff / Text /
   Anhänge, ein Senden-Knopf. Den Kunden trägt der Empfänger bei. Der Versand geht über das verbundene
   Outlook-Postfach, sonst SMTP (Server entscheidet); die Fusszeile sagt, welcher
   Weg gerade gilt. Jede gesendete Mail mit Kundenbezug landet in der
   Kundenkommunikation. */

const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv', 'text/plain', 'application/zip',
]);

const formatBytes = (bytes: number) => bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Die Schreiben-Karte öffnet unten rechts — aber NICHT bündig am Rand: rechts
 * bleibt Platz für die Sende-Bestätigung, die sich direkt daneben stellt
 * (Vorgabe 18.08.2026). Ohne diese Reserve klebte die Karte am Bildrand und die
 * Bestätigung müsste nach links ausweichen. Auf schmalen Fenstern gibt es den
 * Platz nicht; dort öffnet die Karte wie bisher und die Bestätigung weicht aus.
 */
const CONFIRM_RESERVE = 470;

const composeAnchor = (): FloatAnchor => {
    const reserve = window.innerWidth >= 1280 ? CONFIRM_RESERVE : 0;
    const right = window.innerWidth - 12 - reserve;
    return {
        left: right,
        right,
        top: Math.max(10, window.innerHeight - 620),
        bottom: window.innerHeight - 12,
    };
};

export const MailComposeCard = ({
    request,
    onClose,
}: {
    request: ComposeRequest | null;
    onClose: () => void;
}) => {
    const open = Boolean(request);
    const [to, setTo] = useState<Recipient[]>([]);
    const [cc, setCc] = useState<Recipient[]>([]);
    const [ccOpen, setCcOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    // Der Kundenbezug wird NICHT mehr von Hand gewählt (Vorgabe 18.08.2026):
    // er folgt dem Empfänger, den man oben einträgt, und steht als Unterzeile
    // im Kopf der Karte. Ein eigenes Feld dafür fragte dieselbe Sache zweimal.
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(null);
    const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
    const [sending, setSending] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Die Bestätigung stellt sich neben die Schreiben-Karte; dafür wird deren
    // Rechteck beim Öffnen gemessen (die Karte lässt sich verschieben).
    const [confirmAnchor, setConfirmAnchor] = useState<DOMRect | null>(null);
    const [status, setStatus] = useState<InboxStatusDto | null>(null);
    const [anchor, setAnchor] = useState<FloatAnchor | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Vorbelegung bei jedem Öffnen.
    useEffect(() => {
        if (!request) return;
        setTo(request.to ? [{ email: request.to }] : []);
        setCc((request.cc || []).map((email) => ({ email })));
        setCcOpen(Boolean(request.cc?.length));
        setSubject(request.subject || '');
        setBody(request.body || '');
        setCustomer(request.customer ? { id: request.customer.id, companyName: request.customer.companyName } : null);
        setAttachments(request.attachments || []);
        setAnchor(composeAnchor());
        setConfirmOpen(false);
        void inboxApi.status().then(setStatus).catch(() => setStatus(null));
    }, [request]);

    const totalBytes = attachments.reduce((sum, a) => sum + (a.size ?? (a.blob?.size ?? Math.floor((a.contentBase64?.length || 0) * 3 / 4))), 0);

    const addFiles = (files: FileList | null) => {
        if (!files) return;
        const next: ComposeAttachment[] = [];
        let total = totalBytes;
        for (const file of Array.from(files)) {
            const type = file.type || 'application/octet-stream';
            if (!ALLOWED_TYPES.has(type)) { toast.error(t('mail.compose.typeNotAllowed', { name: file.name })); continue; }
            total += file.size;
            if (total > MAX_TOTAL_BYTES) { toast.error(t('mail.compose.tooLarge')); break; }
            next.push({ filename: file.name, contentType: type, blob: file, size: file.size });
        }
        if (next.length) setAttachments((current) => [...current, ...next].slice(0, 5));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const transportHint = useMemo(() => {
        if (!status) return '';
        if (!status.smtpConfigured) return t('mail.compose.noTransport');
        return t('mail.compose.viaServer', { host: status.smtpHost || '', from: status.fromEmail || '' });
    }, [status]);

    /** Prüft das Formular und zeigt, WER die Mail bekommt. */
    const review = () => {
        const toList = to.map((recipient) => recipient.email.trim()).filter(Boolean);
        const ccList = cc.map((recipient) => recipient.email.trim()).filter(Boolean);
        if (!toList.length || !toList.every((a) => EMAIL_RE.test(a))) { toast.error(t('mail.compose.invalidTo')); return; }
        if (ccList.some((a) => !EMAIL_RE.test(a))) { toast.error(t('mail.compose.invalidCc')); return; }
        if (!subject.trim()) { toast.error(t('mail.compose.subjectRequired')); return; }
        if (!body.trim()) { toast.error(t('mail.compose.bodyRequired')); return; }
        setConfirmAnchor(document.querySelector('.ofi-float-card')?.getBoundingClientRect() ?? null);
        setConfirmOpen(true);
    };

    const send = async () => {
        const toList = to.map((recipient) => recipient.email.trim()).filter(Boolean);
        const ccList = cc.map((recipient) => recipient.email.trim()).filter(Boolean);
        setSending(true);
        try {
            const encoded = await Promise.all(attachments.map(async (a) => ({
                filename: a.filename,
                contentType: a.contentType,
                contentBase64: a.contentBase64 || (a.blob ? await blobToBase64(a.blob) : ''),
            })));
            // Mehrere An-Adressen: die erste ist der Empfänger, weitere gehen als Cc.
            const [primary, ...rest] = toList;
            const result = await mailMessagesApi.send({
                to: primary!,
                cc: [...rest, ...ccList],
                subject: subject.trim(),
                text: body,
                attachments: encoded.filter((a) => a.contentBase64),
                customerId: customer?.id || null,
                contactId: request?.contactId || null,
                entityType: request?.entity?.type || null,
                entityId: request?.entity?.id || null,
                entityLabel: request?.entity?.label || null,
            });
            toast.success(t('mail.compose.sentSmtp'));
            emitMailSent({ request: request || {}, transport: result.transport, mailMessageId: result.mailMessageId });
            setConfirmOpen(false);
            onClose();
        } catch (error: unknown) {
            const code = mailApiError(error).code;
            const message = isRequestTimeout(error)
                ? t('common.mailTimeout')
                : code === 'no_transport'
                    ? t('mail.compose.noTransport')
                    : (mailApiError(error).message || t('mail.compose.failed'));
            toast.error(message);
        } finally {
            setSending(false);
        }
    };

    if (!request) return null;

    return (
        <FloatingCard
            open={open}
            onClose={onClose}
            title={t('mail.compose.title')}
            subtitle={customer ? customer.companyName : undefined}
            anchor={anchor}
            width={560}
            closeOnEscape={false}
            bodyClassName="ofi-mailc__body"
            footer={
                <div className="ofi-mailc__footer">
                    <button type="button" className="ofi-cal-btn is-primary" onClick={review} disabled={sending}>
                        <LuSend size={14} />
                        {sending ? t('mail.compose.sending') : t('mail.compose.send')}
                    </button>
                    <button type="button" className="ofi-float-card__iconbtn" title={t('mail.compose.attach')} onClick={() => fileInputRef.current?.click()} disabled={sending}>
                        <LuPaperclip size={16} />
                    </button>
                    <input ref={fileInputRef} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.csv,.txt,.zip" onChange={(event) => addFiles(event.target.files)} />
                    <span className="ofi-mailc__hint">{transportHint}</span>
                </div>
            }
        >
            <div className="ofi-mailc">
                <div className="ofi-mailc__row is-recipients">
                    <span className="ofi-mailc__label">{t('mail.compose.to')}</span>
                    <span className="ofi-mailc__control">
                        <RecipientCombo
                            label={t('mail.compose.to')}
                            value={to}
                            onChange={setTo}
                            placeholder={t('mail.compose.toPlaceholder')}
                            autoFocus={!request.to}
                            onCustomerPicked={(id, companyName) => {
                                // Der Kunde des Empfängers wird als Bezug
                                // übernommen, solange keiner gesetzt ist —
                                // damit die Mail in seiner Akte landet.
                                setCustomer((current) => current ?? { id, companyName });
                            }}
                        />
                    </span>
                    {!ccOpen && (
                        <button type="button" className="ofi-mailc__cclink" onClick={() => setCcOpen(true)}>Cc</button>
                    )}
                </div>
                {ccOpen && (
                    <div className="ofi-mailc__row is-recipients">
                        <span className="ofi-mailc__label">Cc</span>
                        <span className="ofi-mailc__control">
                            <RecipientCombo label="Cc" value={cc} onChange={setCc} placeholder={t('mail.compose.ccPlaceholder')} />
                        </span>
                    </div>
                )}
                <label className="ofi-mailc__row">
                    <span className="ofi-mailc__label">{t('mail.compose.subject')}</span>
                    <span className="ofi-mailc__control">
                        <input className="ofi-mailc__input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={t('mail.compose.subjectPlaceholder')} />
                    </span>
                </label>
                {request.entity?.label && (
                    <div className="ofi-mailc__entity">
                        <LuChevronDown size={12} className="opacity-60" />
                        {t('mail.compose.entityHint', { label: request.entity.label })}
                    </div>
                )}
                <textarea
                    className="ofi-mailc__textarea"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={t('mail.compose.bodyPlaceholder')}
                    rows={10}
                />
                {attachments.length > 0 && (
                    <div className="ofi-mailc__attachments">
                        {attachments.map((a, index) => (
                            <span key={`${a.filename}-${index}`} className="ofi-mailc__chip" title={a.filename}>
                                <LuPaperclip size={12} />
                                <span className="ofi-mailc__chip-name">{a.filename}</span>
                                <span className="ofi-mailc__chip-size">{formatBytes(a.size ?? a.blob?.size ?? Math.floor((a.contentBase64?.length || 0) * 3 / 4))}</span>
                                <button type="button" aria-label={t('common.delete')} onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}>
                                    <LuX size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Wer bekommt die Mail? Kunden und Mitarbeitende untereinander. */}
            <SendConfirmPopup
                open={confirmOpen}
                anchorRect={confirmAnchor}
                to={to}
                cc={cc}
                subject={subject}
                sending={sending}
                onCancel={() => setConfirmOpen(false)}
                onConfirm={() => void send()}
            />
        </FloatingCard>
    );
};
