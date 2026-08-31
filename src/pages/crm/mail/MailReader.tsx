import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { LuDownload, LuForward, LuLink2, LuMailOpen, LuPaperclip, LuReply, LuTrash2, LuUndo2, LuUnlink, LuX } from 'react-icons/lu';

import { LoadingPanel } from '@/components/ui-shared/Loader';
import { openMailCompose } from '@/components/mail/mailComposeBus';
import { t } from '@/i18n/translate';
import { mailApiError, mailMessagesApi, type MailAttachmentMeta, type MailMessageDetail } from '@/lib/api/mail';
import { MailBodyView } from './MailBodyView';
import { CustomerComboCell } from '@/pages/crm/components/CustomerComboCell';
import type { CrmCustomerOption } from '@/pages/crm/types/crm.types';
import {
    avatarColor, counterpartOf, forwardSubject, formatBytes, initialOf, longDate, partyFull, partyLabel, quoteMessage, replySubject,
} from './mailShared';

/* Lesebereich rechts: Betreff, Absender-Zeile mit Initiale, Empfänger,
   Kundenzuordnung (Chip → Zuordnen-Panel), Rumpf (MailBodyView: Formatierung,
   Signatur und Verlauf zugeklappt), Anhänge (Namen + Download direkt vom
   Mailserver, nichts wird gespeichert). Aktionen: Antworten, Weiterleiten,
   ungelesen, löschen (in den Papierkorb) — und im Papierkorb: zurücklegen. */

const LinkPanel = ({ detail, onLinked, onClose }: { detail: MailMessageDetail; onLinked: (next: MailMessageDetail) => void; onClose: () => void }) => {
    // NUR der Kunde (Vorgabe 18.08.2026): der Ansprechpartner steckt schon in
    // der Adresse, mit der die Nachricht hereinkam — ihn hier ein zweites Mal
    // zu wählen, brachte nichts als eine weitere Entscheidung.
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(detail.customer ? { id: detail.customer.id, companyName: detail.customer.companyName } : null);
    const [customerText, setCustomerText] = useState(detail.customer?.companyName ?? '');
    const [applyToSender, setApplyToSender] = useState(true);
    const [suggestions, setSuggestions] = useState<Array<{ id: string; companyName: string; mainEmail: string | null; city: string | null }>>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        mailMessagesApi.suggestions(detail.id).then((r) => { if (!cancelled) setSuggestions(r.customers); }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [detail.id]);

    const save = async (customerId: string | null, contactId: string | null) => {
        setBusy(true);
        try {
            const next = await mailMessagesApi.link(detail.id, { customerId, contactId, applyToSender: Boolean(customerId) && applyToSender });
            onLinked(next);
            if (customerId) toast.success(next.alsoLinked ? t('mail.link.savedMany', { count: next.alsoLinked }) : t('mail.link.saved'));
            else toast.success(t('mail.link.removed'));
            onClose();
        } catch (error: unknown) {
            toast.error(mailApiError(error).message || t('mail.link.failed'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="ofi-mail-linkpanel">
            <div className="ofi-mail-linkpanel__title">{t('mail.link.title')}</div>
            <div className="ofi-mail-linkpanel__combo">
                <CustomerComboCell
                    value={customerText}
                    linked={Boolean(customer)}
                    onChange={(next) => { setCustomerText(next); if (customer) setCustomer(null); }}
                    onPick={(picked) => { setCustomer(picked); setCustomerText(picked.companyName); }}
                    pickerZ={170}
                />
            </div>
            {suggestions.length > 0 && !customer && (
                <div className="ofi-mail-linkpanel__suggest">
                    <span>{t('mail.link.suggestions')}</span>
                    {suggestions.map((s) => (
                        <button key={s.id} type="button" className="ofi-mail-tag is-customer is-click" onClick={() => { setCustomer({ id: s.id, companyName: s.companyName }); setCustomerText(s.companyName); }}>
                            {s.companyName}{s.city ? ` · ${s.city}` : ''}
                        </button>
                    ))}
                </div>
            )}
            <label className="ofi-mail-linkpanel__check">
                <input type="checkbox" checked={applyToSender} onChange={(event) => setApplyToSender(event.target.checked)} />
                <span>{t('mail.link.applyToSender', { address: counterpartOf(detail).address })}</span>
            </label>
            <div className="ofi-mail-linkpanel__actions">
                <button type="button" className="ofi-cal-btn is-primary" disabled={!customer || busy} onClick={() => void save(customer!.id, null)}>
                    <LuLink2 size={14} />
                    {t('mail.link.save')}
                </button>
                {detail.customer && (
                    <button type="button" className="ofi-cal-btn" disabled={busy} onClick={() => void save(null, null)}>
                        <LuUnlink size={14} />
                        {t('mail.link.remove')}
                    </button>
                )}
                <button type="button" className="ofi-cal-btn" onClick={onClose}>{t('common.cancel')}</button>
            </div>
        </div>
    );
};

const AttachmentList = ({ detail }: { detail: MailMessageDetail }) => {
    const [items, setItems] = useState<MailAttachmentMeta[] | null>(detail.attachments);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setItems(detail.attachments);
        setError(null);
        if (!detail.hasAttachments || (detail.attachments && detail.attachments.length) || !detail.canFetchAttachments) return;
        let cancelled = false;
        setLoading(true);
        mailMessagesApi.attachments(detail.id)
            .then((r) => { if (!cancelled) setItems(r.attachments); })
            .catch((e) => { if (!cancelled) setError(mailApiError(e).message || t('mail.reader.attachmentsFailed')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [detail]);

    if (!detail.hasAttachments) return null;

    const download = async (item: MailAttachmentMeta) => {
        if (!item.id) return;
        try {
            const blob = await mailMessagesApi.downloadAttachment(detail.id, item.id);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = item.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e: unknown) {
            toast.error(mailApiError(e).message || t('mail.reader.attachmentsFailed'));
        }
    };

    return (
        <div className="ofi-mail-attachments">
            <div className="ofi-mail-attachments__title">
                <LuPaperclip size={13} />
                {t('mail.reader.attachments')}
                <span className="ofi-mail-attachments__hint">{t('mail.reader.attachmentsHint')}</span>
            </div>
            {loading && <div className="ofi-mail-attachments__loading">{t('common.loading')}</div>}
            {error && <div className="ofi-mail-attachments__error">{error}</div>}
            {items && items.length > 0 && (
                <div className="ofi-mail-attachments__list">
                    {items.map((item, index) => (
                        <div key={`${item.id || item.name}-${index}`} className="ofi-mail-attachment">
                            <span className="ofi-mail-attachment__name" title={item.name}>{item.name}</span>
                            <span className="ofi-mail-attachment__size">{formatBytes(item.size)}</span>
                            {item.id && detail.canFetchAttachments && (
                                <button type="button" className="ofi-float-card__iconbtn" title={t('mail.reader.download')} onClick={() => void download(item)}>
                                    <LuDownload size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {items && items.length === 0 && !loading && !error && (
                <div className="ofi-mail-attachments__loading">{t('mail.reader.attachmentsUnavailable')}</div>
            )}
        </div>
    );
};

export const MailReader = ({
    detail,
    loading,
    onClose,
    onLinked,
    onDelete,
    onRestore,
    onUnassignCategory,
}: {
    detail: MailMessageDetail | null;
    loading: boolean;
    onClose: () => void;
    onLinked: (next: MailMessageDetail) => void;
    onDelete: (item: MailMessageDetail) => void;
    /** Nur im Papierkorb gesetzt: Nachricht zurücklegen. */
    onRestore?: (item: MailMessageDetail) => void;
    /** Die offene Nachricht aus ihrer Kategorie nehmen (Kreuz am Chip). */
    onUnassignCategory?: () => void;
}) => {
    const [linkOpen, setLinkOpen] = useState(false);
    useEffect(() => { setLinkOpen(false); }, [detail?.id]);

    if (!detail && !loading) {
        return (
            <div className="ofi-mail-reader is-empty">
                <LuMailOpen size={40} strokeWidth={1.2} className="ofi-mail-reader__emptyicon" />
                <div>{t('mail.reader.pick')}</div>
            </div>
        );
    }
    if (!detail) return <div className="ofi-mail-reader"><LoadingPanel rows={5} /></div>;

    const from = detail.direction === 'IN'
        ? { name: detail.fromName, address: detail.fromAddress || '' }
        : { name: detail.fromName, address: detail.fromAddress || '' };
    const counterpart = counterpartOf(detail);
    const fromLabel = partyLabel(from) || t('mail.page.unknownSender');

    const reply = () => openMailCompose({
        to: counterpart.address,
        subject: replySubject(detail.subject),
        body: quoteMessage(detail, t('mail.reader.quoteHeader', { date: longDate(detail.sentAt), from: partyFull(from) })),
        customer: detail.customer,
        contactId: detail.contact?.id || null,
        replyToMessageId: detail.id,
    });
    const forward = () => openMailCompose({
        subject: forwardSubject(detail.subject),
        body: quoteMessage(detail, t('mail.reader.forwardHeader', { date: longDate(detail.sentAt), from: partyFull(from), to: detail.toRecipients.map(partyFull).join(', ') })),
        customer: detail.customer,
    });
    const markUnread = async () => {
        try { onLinked(await mailMessagesApi.markRead(detail.id, false)); toast.success(t('mail.reader.markedUnread')); } catch { toast.error(t('mail.page.loadError')); }
    };

    return (
        <article className={`ofi-mail-reader ${loading ? 'is-loading' : ''}`}>
            <header className="ofi-mail-reader__bar">
                <div className="ofi-mail-reader__actions">
                    <button type="button" className="ofi-cal-btn" onClick={reply}><LuReply size={14} />{t('mail.reader.reply')}</button>
                    <button type="button" className="ofi-cal-btn" onClick={forward}><LuForward size={14} />{t('mail.reader.forward')}</button>
                </div>
                <div className="ofi-mail-reader__icons">
                    {detail.deleted && onRestore && (
                        <button type="button" className="ofi-float-card__iconbtn" title={t('mail.reader.restore')} onClick={() => onRestore(detail)}><LuUndo2 size={16} /></button>
                    )}
                    {detail.mine && detail.direction === 'IN' && (
                        <button type="button" className="ofi-float-card__iconbtn" title={t('mail.reader.markUnread')} onClick={() => void markUnread()}><LuMailOpen size={16} /></button>
                    )}
                    <button type="button" className="ofi-float-card__iconbtn" title={t('common.delete')} onClick={() => onDelete(detail)}><LuTrash2 size={16} /></button>
                    <button type="button" className="ofi-float-card__iconbtn" title={t('common.close')} onClick={onClose}><LuX size={16} /></button>
                </div>
            </header>

            <h1 className="ofi-mail-reader__subject">{detail.subject || t('mail.page.noSubject')}</h1>

            <div className="ofi-mail-reader__from">
                <span className="ofi-mail-row__avatar is-large" style={{ background: avatarColor(from.address || fromLabel) }}>{initialOf(fromLabel)}</span>
                <div className="ofi-mail-reader__fromtext">
                    <div className="ofi-mail-reader__fromline">
                        <span className="ofi-mail-reader__fromname">{fromLabel}</span>
                        {from.address && from.address !== fromLabel && <span className="ofi-mail-reader__fromaddr">&lt;{from.address}&gt;</span>}
                        <span className="ofi-mail-reader__date">{longDate(detail.sentAt)}</span>
                    </div>
                    <div className="ofi-mail-reader__to">
                        <span>{t('mail.reader.to')} {detail.toRecipients.map(partyFull).join(', ') || '—'}</span>
                        {detail.ccRecipients.length > 0 && <span> · Cc {detail.ccRecipients.map(partyFull).join(', ')}</span>}
                    </div>
                    <div className="ofi-mail-reader__chips">
                        {detail.category && (
                            /* Zugeordnet wird in der Liste (Ziehen, Sammelmodus) — HERAUS
                               kommt die Nachricht auch hier, direkt an ihrem Chip: wer die
                               Mail offen hat, sieht die falsche Kategorie und will sie
                               nicht erst in der Liste wiederfinden. */
                            <span className="ofi-mail-tag is-category" title={detail.category.name}>
                                <span className="ofi-mail-tag__catdot" style={{ background: detail.category.color }} />
                                {detail.category.name}
                                {onUnassignCategory && (
                                    <button
                                        type="button"
                                        className="ofi-mail-tag__x"
                                        title={t('mail.categories.unassign', { name: detail.category.name })}
                                        aria-label={t('mail.categories.unassign', { name: detail.category.name })}
                                        onClick={onUnassignCategory}
                                    >
                                        <LuX size={11} />
                                    </button>
                                )}
                            </span>
                        )}
                        {detail.customer ? (
                            <>
                                <Link to={`/crm/customers/${detail.customer.id}`} className="ofi-mail-tag is-customer is-click" title={t('mail.reader.openCustomer')}>
                                    {detail.customer.companyName}
                                    {detail.contact && <span className="ofi-mail-tag__sub"> · {detail.contact.firstName} {detail.contact.lastName}</span>}
                                </Link>
                                <button type="button" className="ofi-mail-tag is-ghost" onClick={() => setLinkOpen((v) => !v)}>
                                    <LuLink2 size={11} />
                                    {t('mail.link.change')}
                                </button>
                            </>
                        ) : (
                            <button type="button" className="ofi-mail-tag is-none is-click" onClick={() => setLinkOpen((v) => !v)}>
                                <LuLink2 size={11} />
                                {t('mail.link.assign')}
                            </button>
                        )}
                        {detail.entity?.label && <span className="ofi-mail-tag is-entity">{detail.entity.label}</span>}
                        {detail.matchSource && detail.matchSource !== 'MANUAL' && detail.customer && (
                            <span className="ofi-mail-reader__matchhint">{t(`mail.match.${detail.matchSource}`)}</span>
                        )}
                        {detail.owner && !detail.mine && (
                            <span className="ofi-mail-tag is-owner">{t('mail.reader.mailboxOf', { name: `${detail.owner.firstName} ${detail.owner.lastName}` })}</span>
                        )}
                    </div>
                </div>
            </div>

            {linkOpen && <LinkPanel detail={detail} onLinked={onLinked} onClose={() => setLinkOpen(false)} />}

            <MailBodyView html={detail.bodyHtml} text={detail.bodyText || detail.bodyPreview} />

            <AttachmentList detail={detail} />
        </article>
    );
};
