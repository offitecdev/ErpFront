import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { File05, Link02, Send01 } from '@/components/icons/antIconCompat';
import { usePurchaseLang } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { isRequestTimeout } from '@/lib/axios';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { PurchaseForwardInfo, PurchaseForwarding, PurchaseOrderRow } from '@/types/inventory';
import { localizePurchaseCode } from '@/utils/purchaseCode';
import { fmtDateTime } from '../utils/format';
import { internalRequestView } from '../utils/requestSuppliers';
import '@/styles/orderDetails.css';

// PDF-Bytes → base64 (Mailanhang). `btoa` verträgt kein grosses Feld auf einmal.
const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
};

const errorOf = (err: unknown): { status?: number; code?: string; text: string } => {
    const response = (err as { response?: { status?: number; data?: { error?: string; code?: string } } })?.response;
    return {
        status: response?.status,
        code: response?.data?.code,
        text: response?.data?.error || (err as Error)?.message || '',
    };
};

/**
 * ══ DIE ANFRAGE AN DEN EINKAUF (29.09.2026, Vorgabe Samet) ══════════════════
 *
 * «Purser veya admin dışında … diğerlerinin de mail ve PDF gönderme şansı
 *  olacak … mail gönderecek ve orada fiyat talebinin linki olacak ve ‹fiyat
 *  talebi oluşturuldu› diye bildirim olacak masaüstünde muhasebecinin ve
 *  adminin … kullanıcı tedarikçiden haberi olmayacak.»
 *
 * Der Reiter «E-posta» für alle OHNE Einkaufsrolle: dasselbe Fenster wie
 * Mail.app (`.ofi-mail`), aber die Mail geht nicht an einen Lieferanten,
 * sondern an den Einkauf (Purser) — die Administration in Kopie. Die
 * Empfänger bestimmt der Server; hier stehen sie nur als feste Kapseln. Im
 * Anhang das Blatt ohne Lieferanten, in der Mail der Link zur Anfrage; bei
 * denselben Personen erscheint rechts oben «Fiyat talebi oluşturuldu». Links
 * stehen die bisherigen Sendungen.
 */
export const ForwardPanel = ({ order, requesterName, onBeforeSend, onForwarded }: {
    order: PurchaseOrderRow;
    /** Wer anfragt — im Anschriftfeld des Blattes und als erste Zeile der Mail. */
    requesterName: string;
    /** Vor dem Senden: offene Änderungen speichern; liefert den gespeicherten Stand (null = abbrechen). */
    onBeforeSend: () => Promise<PurchaseOrderRow | null>;
    onForwarded: (forwarding: PurchaseForwarding) => void;
}) => {
    const settings = usePdfSettings();
    // Blatt, Code und Wörter der Mail in der Sprache der Oberfläche — die Post bleibt im Haus.
    const lang = usePurchaseLang();
    const code = localizePurchaseCode(order.referenceNumber, lang);
    const fileName = `${code}.pdf`;
    const [info, setInfo] = useState<PurchaseForwardInfo | null>(null);
    const [infoState, setInfoState] = useState<'loading' | 'idle' | 'error'>('loading');
    /* Betreff und Text entstehen EINMAL je Vorgang (der Aufrufer hängt das
       Fenster mit `key={order.id}` ein) — ein eigener Text bleibt stehen. */
    const [subject, setSubject] = useState(() => t('inv.orders.forward.subject', { number: code, name: requesterName }));
    const [message, setMessage] = useState(() => t('inv.orders.forward.defaultMessage', { name: requesterName }));
    const [busy, setBusy] = useState(false);
    const recipients = info?.recipients ?? [];
    const purchasers = recipients.filter((person) => person.kind === 'PURCHASER');
    const admins = recipients.filter((person) => person.kind === 'ADMIN');
    // Ohne Einkauf steht die Administration im «An».
    const toPeople = purchasers.length ? purchasers : admins;
    const ccPeople = purchasers.length ? admins : [];
    const forwarding = order.forwarding ?? null;

    /* Empfänger und Verlauf erst mit diesem Reiter. */
    useEffect(() => {
        let cancelled = false;
        queueMicrotask(() => { if (!cancelled) setInfoState('loading'); });
        purchaseOrdersApi.forwardInfo(order.id)
            .then((next) => { if (!cancelled) { setInfo(next); setInfoState('idle'); } })
            .catch(() => { if (!cancelled) setInfoState('error'); });
        return () => { cancelled = true; };
    }, [order.id]);

    const send = async () => {
        setBusy(true);
        try {
            // Der Einkauf bekommt, was hier steht — nicht einen älteren gespeicherten Stand.
            const fresh = await onBeforeSend();
            if (!fresh) return;
            const bytes = await (await import('@/utils/pdf/priceRequestPdf'))
                .buildPriceRequestPdfBytes(internalRequestView(fresh, requesterName, lang), settings, lang);
            const result = await purchaseOrdersApi.forward(order.id, {
                subject: subject.trim(),
                message,
                lang: (i18n.resolvedLanguage || i18n.language || 'de').split('-')[0],
                attachments: [{
                    filename: `${localizePurchaseCode(fresh.referenceNumber, lang)}.pdf`,
                    contentType: 'application/pdf',
                    contentBase64: bytesToBase64(bytes),
                }],
            });
            onForwarded(result.forwarding);
            setInfo((current) => ({
                recipients: result.recipients,
                history: [
                    { id: `local-${result.forwarding.at}`, ...result.forwarding, mailed: result.mailed, subject: subject.trim() },
                    ...(current?.history ?? []),
                ],
            }));
            if (result.mailed) toast.success(t('inv.orders.forward.sentToast', { count: result.notified }));
            else toast.warning(t('inv.orders.forward.notifiedOnlyToast', { count: result.notified }));
        } catch (err) {
            const failure = errorOf(err);
            if (isRequestTimeout(err)) toast.error(t('common.mailTimeout'));
            else if (failure.code === 'NO_PURCHASING') toast.error(t('inv.orders.forward.noRecipients'));
            else if (failure.code === 'TOO_SOON') toast.error(t('inv.orders.forward.tooSoon'));
            else toast.error(failure.text || t('inv.orders.forward.failedToast'));
        } finally {
            setBusy(false);
        }
    };

    const chip = (person: PurchaseForwardInfo['recipients'][number]) => (
        <span
            key={person.id}
            className={`ofi-mail-chip is-fixed${person.hasEmail ? '' : ' is-muted'}`}
            title={person.hasEmail ? undefined : t('inv.orders.forward.noEmail')}
        >
            {person.name}
        </span>
    );

    const history = info?.history ?? [];

    return (
        <div className="ofi-mail ofi-fwd">
            <aside className="ofi-mail-side">
                <div className="ofi-fwd-intro">
                    <span className="ofi-fwd-intro__icon" aria-hidden="true"><Send01 size={15} /></span>
                    <b>{t('inv.orders.forward.title')}</b>
                    <p>{t('inv.orders.forward.intro')}</p>
                </div>
                <span className="ofi-mail-cap">
                    {t('inv.orders.forward.history')}
                    {history.length > 0 && <em>{history.length}</em>}
                </span>
                <div className="ofi-mail-list">
                    {infoState === 'loading' && !history.length && (
                        <span className="ofi-mail-empty">{t('common.loadingData')}</span>
                    )}
                    {infoState === 'error' && (
                        <span className="ofi-mail-empty">{t('inv.orders.forward.infoUnavailable')}</span>
                    )}
                    {infoState === 'idle' && !history.length && (
                        <span className="ofi-mail-empty">{t('inv.orders.forward.historyEmpty')}</span>
                    )}
                    {history.map((entry) => (
                        <div key={entry.id} className="ofi-fwd-entry">
                            <b>{fmtDateTime(entry.at)}</b>
                            {entry.byName && <small>{entry.byName}</small>}
                            <span>
                                {entry.recipients.join(', ')}
                                {!entry.mailed && ` · ${t('inv.orders.forward.notifiedOnly')}`}
                            </span>
                        </div>
                    ))}
                </div>
            </aside>

            <section className="ofi-mail-compose">
                <header className="ofi-mail-bar">
                    <b>{subject.trim() || t('inv.orders.forward.title')}</b>
                    <span className="ofi-mail-bar-actions">
                        <button
                            type="button"
                            className="ofi-mail-send"
                            disabled={busy || !subject.trim() || infoState !== 'idle' || !recipients.length}
                            onClick={() => void send()}
                            title={infoState === 'idle' && !recipients.length ? t('inv.orders.forward.noRecipients') : undefined}
                        >
                            {busy
                                ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                : <Send01 size={15} />}
                            <span>{forwarding ? t('inv.orders.forward.sendAgain') : t('inv.orders.forward.send')}</span>
                        </button>
                    </span>
                </header>

                <div className="ofi-mail-fields">
                    <div className="ofi-mail-field">
                        <span>{t('inv.orders.mail.to')}</span>
                        <span className="ofi-mail-chips">
                            {toPeople.map(chip)}
                            {infoState === 'loading' && <span className="ofi-mail-hint">{t('common.loadingData')}</span>}
                            {infoState === 'idle' && !recipients.length && (
                                <span className="ofi-mail-hint">{t('inv.orders.forward.noRecipients')}</span>
                            )}
                        </span>
                        {toPeople.length > 0 && (
                            <span className="ofi-fwd-role">
                                {t(purchasers.length ? 'inv.orders.forward.purchasing' : 'inv.orders.forward.admins')}
                            </span>
                        )}
                    </div>
                    {ccPeople.length > 0 && (
                        <div className="ofi-mail-field">
                            <span>{t('inv.orders.mail.cc')}</span>
                            <span className="ofi-mail-chips">{ccPeople.map(chip)}</span>
                            <span className="ofi-fwd-role">{t('inv.orders.forward.admins')}</span>
                        </div>
                    )}
                    <label className="ofi-mail-field">
                        <span>{t('inv.orders.mail.subjectLabel')}</span>
                        <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className="is-subject" />
                    </label>
                </div>

                <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={5000}
                    className="ofi-mail-body"
                    aria-label={t('inv.orders.mail.message')}
                />

                <div className="ofi-mail-attach ofi-fwd-attach">
                    <span className="ofi-mail-file">
                        <File05 size={16} />
                        <span>{fileName}</span>
                    </span>
                    <span className="ofi-mail-file is-link" title={t('inv.orders.forward.linkHint')}>
                        <Link02 size={16} />
                        <span>{t('inv.orders.forward.linkTile')}</span>
                    </span>
                </div>

                <footer className="ofi-mail-foot">
                    <span className="ofi-mail-hint">{t('inv.orders.forward.footHint')}</span>
                    <span className="ofi-mail-state">
                        <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                                forwarding
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                            }`}
                        >
                            {forwarding ? t('inv.orders.forward.forwardedBadge') : t('inv.orders.forward.notForwardedBadge')}
                            {forwarding && <span className="font-normal opacity-80">· {fmtDateTime(forwarding.at)}</span>}
                        </span>
                    </span>
                </footer>
            </section>
        </div>
    );
};
