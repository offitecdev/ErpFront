import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { File05, Plus, Save01, Send01, Trash01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { isRequestTimeout } from '@/lib/axios';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { PurchaseOrderMailDraft, PurchaseOrderRow } from '@/types/inventory';
import { PeoplePickerModal } from '@/pages/calendar/components/PeoplePickerModal';
import { personKey, type PickedPerson } from '@/pages/calendar/calendarShared';
import { localizePurchaseCode } from '@/utils/purchaseCode';
import { fmtDateTime } from '../utils/format';
import { stageMailState } from '../utils/orderStatus';
import '@/styles/orderDetails.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PDF-Bytes → base64 (Mailanhang). `btoa` verträgt kein grosses Feld auf einmal.
const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
};

const errorText = (err: unknown): string =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    || (err as Error)?.message
    || 'error';

/**
 * ══ DAS MAILFENSTER ALS REITER (22.09.2026) ════════════════════════════════
 *
 * Unverändert das Fenster im Stil von Mail.app (Vorgabe Samet, 14.09.2026):
 * links die Entwürfe, rechts die Nachricht, unten das Häkchen «manuell
 * gesendet». Neu ist nur, WO es steht — als eigener Reiter derselben Seite,
 * und seine Entwürfe werden ERST GEHOLT, wenn man ihn öffnet.
 */
export const MailPanel = ({ order, priceRequest, onOrderChanged }: {
    order: PurchaseOrderRow;
    priceRequest: boolean;
    onOrderChanged: (next: PurchaseOrderRow) => void;
}) => {
    const settings = usePdfSettings();
    const [busy, setBusy] = useState<string | null>(null);
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [cc, setCc] = useState<PickedPerson[]>([]);
    const [ccDraft, setCcDraft] = useState('');
    const [ccPickerOpen, setCcPickerOpen] = useState(false);
    const [drafts, setDrafts] = useState<PurchaseOrderMailDraft[]>([]);
    const [draftsState, setDraftsState] = useState<'idle' | 'loading' | 'error'>('loading');
    const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

    const pdfLang = 'de' as const;
    const fileName = `${localizePurchaseCode(order.referenceNumber, pdfLang)}.pdf`;
    const mailState = stageMailState(order);
    const isResend = Boolean(order.emailSentAt);
    const canSend = Boolean(to.trim() || order.supplierEmail);

    /* Die Felder werden EINMAL je Vorgang und Belegart gefüllt, damit ein selbst
       geschriebener Text nicht bei jeder Antwort des Servers verschwindet. */
    const seededFor = useRef<string>('');
    const seed = () => {
        const number = localizePurchaseCode(order.referenceNumber, pdfLang);
        const base = priceRequest
            ? t('inv.orders.mail.subjectPriceRequest', { number })
            : t('inv.orders.mail.subject', { number });
        setTo(order.supplierEmail ?? '');
        setSubject(order.revision > 0 && order.emailSentAt ? `${base} (${t('inv.orders.updatedTag')})` : base);
        setMessage(t(priceRequest ? 'inv.orders.mail.defaultMessagePriceRequest' : 'inv.orders.mail.defaultMessage'));
        const supplierMail = (order.supplierEmail ?? '').trim();
        setCc(supplierMail
            ? [{
                key: personKey('EMAIL', supplierMail.toLowerCase()),
                type: 'EMAIL',
                name: order.supplierName || supplierMail,
                email: supplierMail,
            }]
            : []);
        setCcDraft('');
    };
    useEffect(() => {
        const key = `${order.id}:${priceRequest ? 'REQ' : 'ORD'}`;
        if (seededFor.current === key) return;
        seededFor.current = key;
        seed();
    }, [order, priceRequest]); // eslint-disable-line react-hooks/exhaustive-deps

    /* Die Entwürfe kommen erst mit diesem Reiter — nicht mit der Seite. */
    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => { if (!cancelled) setDraftsState('loading'); });
        purchaseOrdersApi.listMailDrafts(order.id)
            .then((items) => { if (!cancelled) { setDrafts(items); setDraftsState('idle'); } })
            .catch(() => { if (!cancelled) setDraftsState('error'); });
        return () => { cancelled = true; };
    }, [order.id]);

    const addCcDraft = () => {
        const email = ccDraft.trim();
        if (!email) return;
        if (!EMAIL_RE.test(email)) { toast.error(t('inv.orders.mail.ccInvalid')); return; }
        const key = personKey('EMAIL', email.toLowerCase());
        setCc((current) => (current.some((person) => person.key === key)
            ? current
            : [...current, { key, type: 'EMAIL', name: email, email }]));
        setCcDraft('');
    };

    const draftInput = () => ({
        toEmail: to.trim() || null,
        ccEmails: cc.map((person) => person.email).filter((email): email is string => Boolean(email)),
        subject: subject.trim(),
        message,
    });

    const saveDraft = async () => {
        setBusy('draft');
        try {
            const saved = activeDraftId
                ? await purchaseOrdersApi.updateMailDraft(order.id, activeDraftId, draftInput())
                : await purchaseOrdersApi.createMailDraft(order.id, draftInput());
            setActiveDraftId(saved.id);
            setDrafts((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)]);
            setDraftsState('idle');
            toast.success(t('inv.orders.mail.draftSaved'));
        } catch (err) {
            toast.error(errorText(err));
        } finally {
            setBusy(null);
        }
    };

    const openDraft = (draft: PurchaseOrderMailDraft) => {
        setActiveDraftId(draft.id);
        setTo(draft.toEmail ?? '');
        setSubject(draft.subject);
        setMessage(draft.message ?? '');
        setCc(draft.ccEmails.map((email) => ({
            key: personKey('EMAIL', email.toLowerCase()),
            type: 'EMAIL',
            name: email,
            email,
        })));
        setCcDraft('');
    };

    const deleteDraft = async (draft: PurchaseOrderMailDraft) => {
        try {
            await purchaseOrdersApi.deleteMailDraft(order.id, draft.id);
            setDrafts((current) => current.filter((entry) => entry.id !== draft.id));
            if (activeDraftId === draft.id) setActiveDraftId(null);
        } catch (err) {
            toast.error(errorText(err));
        }
    };

    /* «Mail manuell gesendet» — der Server schaltet denselben Status wie eine
       echte Sendung; das Etikett «gesendet» gilt damit genauso. */
    const toggleManualSent = async (next: boolean) => {
        setBusy('manual');
        try {
            const updated = await purchaseOrdersApi.setMailManual(order.id, next, to.trim() || order.supplierEmail || null);
            onOrderChanged(updated);
            toast.success(t(next ? 'inv.orders.mail.manualMarked' : 'inv.orders.mail.manualCleared'));
        } catch (err) {
            toast.error(errorText(err));
        } finally {
            setBusy(null);
        }
    };

    const send = async () => {
        setBusy('send');
        try {
            const bytes = priceRequest
                ? await (await import('@/utils/pdf/priceRequestPdf')).buildPriceRequestPdfBytes(order, settings, pdfLang)
                : await (await import('@/utils/pdf/orderPdf')).buildOrderPdfBytes(order, settings, pdfLang);
            const result = await purchaseOrdersApi.sendMail(order.id, {
                to: to.trim() || undefined,
                ccEmails: cc.map((person) => person.email).filter((email): email is string => Boolean(email)),
                subject: subject.trim(),
                message,
                attachments: [{
                    filename: fileName,
                    contentType: 'application/pdf',
                    contentBase64: bytesToBase64(bytes),
                }],
            });
            onOrderChanged(result.order);
            // `preview` = ohne SMTP-Einstellung: die Mail ist NICHT hinausgegangen.
            if (result.preview) {
                toast.warning(t('inv.orders.mail.previewToast'));
            } else {
                toast.success(t(priceRequest ? 'inv.orders.mail.sentToastPriceRequest' : 'inv.orders.mail.sentToast'));
                if (activeDraftId) {
                    const sentId = activeDraftId;
                    setActiveDraftId(null);
                    setDrafts((current) => current.filter((entry) => entry.id !== sentId));
                    void purchaseOrdersApi.deleteMailDraft(order.id, sentId).catch(() => undefined);
                }
            }
        } catch (err) {
            toast.error(isRequestTimeout(err) ? t('common.mailTimeout') : (errorText(err) || t('inv.orders.mail.failedToast')));
        } finally {
            setBusy(null);
        }
    };

    const mailBadge = (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                mailState === 'SENT'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : mailState === 'LAST_KNOWN'
                        ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
            }`}
        >
            {mailState === 'SENT'
                ? t('inv.orders.flow.mailSent')
                : mailState === 'LAST_KNOWN'
                    ? t('inv.orders.flow.mailLastSent')
                    : t('inv.orders.mailNotSent')}
            {mailState !== 'NOT_SENT' && order.emailSentAt && (
                <span className="font-normal opacity-80">· {fmtDateTime(order.emailSentAt)}</span>
            )}
        </span>
    );

    return (
        <div className="ofi-mail">
            <aside className="ofi-mail-side">
                <button type="button" className="ofi-mail-new" onClick={() => { setActiveDraftId(null); seed(); }}>
                    <Plus size={14} />
                    {t('inv.orders.mail.newMail')}
                </button>
                <span className="ofi-mail-cap">
                    {t('inv.orders.mail.drafts')}
                    {drafts.length > 0 && <em>{drafts.length}</em>}
                </span>
                <div className="ofi-mail-list">
                    {draftsState === 'loading' && !drafts.length && (
                        <span className="ofi-mail-empty">{t('common.loadingData')}</span>
                    )}
                    {draftsState === 'error' && (
                        <span className="ofi-mail-empty">{t('inv.orders.mail.draftsUnavailable')}</span>
                    )}
                    {draftsState === 'idle' && !drafts.length && (
                        <span className="ofi-mail-empty">{t('inv.orders.mail.draftsEmpty')}</span>
                    )}
                    {drafts.map((draft) => (
                        <div key={draft.id} className={`ofi-mail-item${draft.id === activeDraftId ? ' is-on' : ''}`}>
                            <button type="button" onClick={() => openDraft(draft)}>
                                <b>{draft.subject || t('inv.orders.mail.noSubject')}</b>
                                <small>{fmtDateTime(draft.updatedAt)}</small>
                                <span>{(draft.message ?? '').replace(/\s+/g, ' ').slice(0, 90)}</span>
                            </button>
                            <button
                                type="button"
                                className="ofi-mail-item-x"
                                onClick={() => void deleteDraft(draft)}
                                aria-label={t('inv.orders.mail.deleteDraft')}
                                title={t('inv.orders.mail.deleteDraft')}
                            >
                                <Trash01 size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            </aside>

            <section className="ofi-mail-compose">
                <header className="ofi-mail-bar">
                    <b>{subject.trim() || t('inv.orders.mail.newMail')}</b>
                    <span className="ofi-mail-bar-actions">
                        <button
                            type="button"
                            className="ofi-mail-tool"
                            disabled={busy !== null || (!subject.trim() && !message.trim())}
                            onClick={() => void saveDraft()}
                            title={t('inv.orders.mail.saveDraft')}
                        >
                            {busy === 'draft'
                                ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                : <Save01 size={15} />}
                            <span>{t('inv.orders.mail.saveDraft')}</span>
                        </button>
                        <button
                            type="button"
                            className="ofi-mail-send"
                            disabled={busy !== null || !subject.trim() || !canSend}
                            onClick={() => void send()}
                            title={canSend ? undefined : t('inv.orders.flow.mailNoAddress')}
                        >
                            {busy === 'send'
                                ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                : <Send01 size={15} />}
                            <span>{isResend ? t('inv.orders.actions.sendUpdated') : t('inv.orders.actions.send')}</span>
                        </button>
                    </span>
                </header>

                <div className="ofi-mail-fields">
                    <label className="ofi-mail-field">
                        <span>{t('inv.orders.mail.to')}</span>
                        <input
                            value={to}
                            onChange={(event) => setTo(event.target.value)}
                            placeholder={canSend ? undefined : t('inv.orders.flow.mailNoAddress')}
                        />
                    </label>
                    <div className="ofi-mail-field">
                        <span>{t('inv.orders.mail.cc')}</span>
                        <span className="ofi-mail-chips">
                            {cc.map((person) => (
                                <span key={person.key} className="ofi-mail-chip" title={person.email ?? undefined}>
                                    {person.email || person.name}
                                    <button
                                        type="button"
                                        onClick={() => setCc((current) => current.filter((entry) => entry.key !== person.key))}
                                        aria-label={t('common.delete')}
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                            <input
                                value={ccDraft}
                                onChange={(event) => setCcDraft(event.target.value)}
                                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCcDraft(); } }}
                                onBlur={addCcDraft}
                                placeholder={t('inv.orders.mail.ccPlaceholder')}
                            />
                        </span>
                        <button type="button" className="ofi-mail-plus" onClick={() => setCcPickerOpen(true)} title={t('inv.orders.mail.ccFromDirectory')} aria-label={t('inv.orders.mail.ccFromDirectory')}>
                            <Plus size={13} />
                        </button>
                    </div>
                    <label className="ofi-mail-field">
                        <span>{t('inv.orders.mail.subjectLabel')}</span>
                        <input value={subject} onChange={(event) => setSubject(event.target.value)} className="is-subject" />
                    </label>
                </div>

                <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    className="ofi-mail-body"
                    aria-label={t('inv.orders.mail.message')}
                />

                <div className="ofi-mail-attach">
                    <span className="ofi-mail-file">
                        <File05 size={16} />
                        <span>{fileName}</span>
                    </span>
                </div>

                <footer className="ofi-mail-foot">
                    <label className="ofi-mail-switch">
                        <input
                            type="checkbox"
                            checked={mailState === 'SENT'}
                            disabled={busy !== null}
                            onChange={(event) => void toggleManualSent(event.target.checked)}
                        />
                        <i aria-hidden="true" />
                        <span>{t('inv.orders.mail.manualSent')}</span>
                    </label>
                    <span className="ofi-mail-state">{mailBadge}</span>
                </footer>
            </section>

            <PeoplePickerModal
                open={ccPickerOpen}
                onClose={() => setCcPickerOpen(false)}
                mode="cc"
                initial={cc}
                title={t('inv.orders.mail.ccTitle')}
                onConfirm={(picked) => { setCc(picked); setCcPickerOpen(false); }}
            />
        </div>
    );
};
