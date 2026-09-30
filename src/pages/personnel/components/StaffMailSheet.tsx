import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, ChevronDown, Mail01, RefreshCcw01, Trash01 } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { mailApiError } from '@/lib/api/mail';
import {
    personnelMailboxApi,
    type PersonnelMailboxDetail,
    type PersonnelMailboxInput,
    type PersonnelMailboxStatus,
    type PersonnelMailboxTestResult,
} from '@/lib/api/personnelMailbox';
import type { StaffRow } from '../types/personnel';
import { fullName } from '../utils/format';

/**
 * ── MAIL EINER PERSON (Verwaltung, 28.09.2026; vereinfacht 29.09.2026) ─────────
 *
 * Vorgabe Samet: «her personel için mail ayarları, yönetici ekranında bir pop
 * up; mail yapılandırmasını yap, mailini yeniden başlattır ve yüklettir; artık
 * kullanıcının maili sadece o olsun her yerde».
 *
 * 29.09.2026: «personel listesinden e-posta yanında bir yıldız ikonu … gelen
 * giden 465 993, mail.cyon mail.cyon girili gelsin, mail ve şifre girelim
 * sadece, SSL/TLS seçili olsun». Geöffnet wird das Fenster über den Stern neben
 * der Adresse in der Personalliste; es ist ein ZENTRIERTER Dialog. Oben die
 * zwei Felder, die man tippt (Adresse, Passwort); darunter stehen die Server
 * SICHTBAR und schon ausgefüllt — Eingang mail.cyon.ch : 993, Ausgang
 * mail.cyon.ch : 465, SSL/TLS angehakt. Alles Seltene (Anzeigename, eigene
 * Benutzer, Ordner, Zeitraum) liegt unter «Erweitert».
 *
 * «Speichern» ist zugleich «neu starten und laden»: der Server setzt den
 * Lesestand zurück und liest das Konto sofort ein; solange das läuft, fragt das
 * Fenster alle 3 s nach. Danach gilt für die Person überall nur noch dieses
 * Konto — Versand wie Postfach, mit ihrem Namen als Absender. Passwörter kommen
 * nie zurück; leer lassen = unverändert.
 */

const INPUT = 'ofi-cal-input w-full';
const POLL_MS = 3000;
/* Der Mailserver des Hauses — gilt, wenn weder das Postfach noch die Firma
   einen nennt (der Server liefert denselben Wert als Vorgabe). */
const HOUSE_HOST = 'mail.cyon.ch';

type Form = Omit<PersonnelMailboxInput, 'smtpPassword' | 'imapPassword'> & {
    password: string;
    imapPassword: string;
};

const emptyForm = (): Form => ({
    fromName: '',
    fromEmail: '',
    smtpHost: HOUSE_HOST,
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    password: '',
    imapHost: HOUSE_HOST,
    imapPort: 993,
    imapSecure: true,
    imapUser: '',
    imapPassword: '',
    sentFolder: '',
    imapInboxFolder: '',
    imapCaptureEnabled: true,
    imapWindowMonths: 2,
    isActive: true,
    useAsAccountEmail: true,
});

const personName = (detail: PersonnelMailboxDetail) =>
    `${detail.employee.firstName} ${detail.employee.lastName}`.trim();

const formFrom = (detail: PersonnelMailboxDetail): Form => {
    const box = detail.mailbox;
    const d = detail.defaults;
    if (!box) {
        return {
            ...emptyForm(),
            fromName: personName(detail),
            fromEmail: detail.employee.email,
            smtpHost: d.smtpHost || HOUSE_HOST,
            smtpPort: d.smtpPort || 465,
            imapHost: d.imapHost || HOUSE_HOST,
            imapPort: d.imapPort || 993,
            // Neu eingerichtet: SSL/TLS ist immer angehakt (Vorgabe) — auch
            // wenn das Firmenpostfach etwas anderes führt.
            smtpSecure: true,
            imapSecure: true,
        };
    }
    return {
        ...emptyForm(),
        fromName: box.fromName || personName(detail),
        fromEmail: box.fromEmail,
        smtpHost: box.smtpHost || HOUSE_HOST,
        smtpPort: box.smtpPort,
        smtpSecure: box.smtpSecure,
        smtpUser: box.smtpUser && box.smtpUser !== box.fromEmail ? box.smtpUser : '',
        imapHost: box.imapHost || HOUSE_HOST,
        imapPort: box.imapPort,
        imapSecure: box.imapSecure,
        imapUser: box.imapUser && box.imapUser !== box.fromEmail ? box.imapUser : '',
        sentFolder: box.sentFolder || '',
        imapInboxFolder: box.imapInboxFolder || '',
        imapCaptureEnabled: box.imapCaptureEnabled,
        imapWindowMonths: box.imapWindowMonths,
        isActive: box.isActive,
        useAsAccountEmail: box.fromEmail.toLowerCase() === detail.employee.email.toLowerCase(),
    };
};

const toInput = (form: Form, fallbackName: string): PersonnelMailboxInput => ({
    // Der Absender trägt IMMER einen Namen — ohne Eingabe den der Person.
    fromName: form.fromName.trim() || fallbackName,
    fromEmail: form.fromEmail.trim(),
    smtpHost: form.smtpHost.trim(),
    smtpPort: Number(form.smtpPort) || 465,
    smtpSecure: form.smtpSecure,
    smtpUser: form.smtpUser.trim(),
    smtpPassword: form.password || undefined,
    imapHost: form.imapHost.trim(),
    imapPort: Number(form.imapPort) || 993,
    imapSecure: form.imapSecure,
    imapUser: form.imapUser.trim(),
    imapPassword: form.imapPassword || undefined,
    sentFolder: form.sentFolder.trim(),
    imapInboxFolder: form.imapInboxFolder.trim(),
    imapCaptureEnabled: form.imapCaptureEnabled,
    imapWindowMonths: form.imapWindowMonths,
    isActive: form.isActive,
    useAsAccountEmail: form.useAsAccountEmail,
});

const formatWhen = (value: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

/** Ein Kästchen mit Beschriftung — schlicht, wie im macOS-Einstellungsfenster. */
const Check = ({ checked, onChange, children }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode }) => (
    <label className="ofi-staffmail__check">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span>{children}</span>
    </label>
);

export const StaffMailSheet = ({
    open,
    person,
    onClose,
    onChanged,
}: {
    open: boolean;
    person: StaffRow | null;
    onClose: () => void;
    /** Die Liste neu laden — die Adresse der Person kann sich geändert haben. */
    onChanged?: () => void;
}) => {
    const [detail, setDetail] = useState<PersonnelMailboxDetail | null>(null);
    const [form, setForm] = useState<Form>(emptyForm);
    const [status, setStatus] = useState<PersonnelMailboxStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<'save' | 'test' | 'restart' | 'remove' | null>(null);
    const [advanced, setAdvanced] = useState(false);
    const [testResult, setTestResult] = useState<PersonnelMailboxTestResult | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const personId = person?.id ?? null;
    const pollRef = useRef<number | null>(null);

    const patch = (next: Partial<Form>) => {
        setForm((current) => ({ ...current, ...next }));
        setTestResult(null);
    };

    const load = useCallback(async (id: string, quiet = false) => {
        if (!quiet) setLoading(true);
        try {
            const result = await personnelMailboxApi.get(id);
            setDetail(result);
            setStatus(result.status);
            if (!quiet) setForm(formFrom(result));
        } catch (error) {
            if (!quiet) toast.error(mailApiError(error).message || t('personnel.mailbox.loadFailed'));
        } finally {
            if (!quiet) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open || !personId) {
            setDetail(null);
            setStatus(null);
            setTestResult(null);
            setConfirmRemove(false);
            setAdvanced(false);
            setForm(emptyForm());
            return;
        }
        void load(personId);
    }, [open, personId, load]);

    /* Läuft das Laden noch im Hintergrund, fragt das Fenster nach, bis es fertig
       ist — so sieht die Verwaltung, dass die Post tatsächlich ankommt. */
    const running = Boolean(status?.running);
    useEffect(() => {
        if (!open || !personId || !running) return undefined;
        pollRef.current = window.setInterval(() => { void load(personId, true); }, POLL_MS);
        return () => {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
        };
    }, [open, personId, running, load]);

    if (!person) return null;
    const exists = Boolean(detail?.mailbox);
    const hasPassword = Boolean(detail?.mailbox?.hasSmtpPassword || detail?.mailbox?.hasImapPassword);
    const fallbackName = detail ? personName(detail) : fullName(person);

    const save = async () => {
        if (!form.fromEmail.trim()) { toast.error(t('personnel.mailbox.emailRequired')); return; }
        if (!form.smtpHost.trim() && !form.imapHost.trim()) { toast.error(t('personnel.mailbox.serverRequired')); return; }
        if (!hasPassword && !form.password && !form.imapPassword) { toast.error(t('personnel.mailbox.passwordRequired')); return; }
        setBusy('save');
        try {
            const result = await personnelMailboxApi.save(person.id, toInput(form, fallbackName));
            setStatus(result.status);
            setForm((current) => ({ ...current, password: '', imapPassword: '' }));
            if (result.summary?.error) toast.error(t('personnel.mailbox.savedWithError', { error: result.summary.error }));
            else toast.success(t('personnel.mailbox.saved'));
            if (result.purgedMessages) toast.message(t('personnel.mailbox.purged', { count: result.purgedMessages }));
            await load(person.id, true);
            onChanged?.();
        } catch (error) {
            toast.error(mailApiError(error).message || t('personnel.mailbox.saveFailed'));
        } finally {
            setBusy(null);
        }
    };

    const test = async () => {
        setBusy('test');
        setTestResult(null);
        try {
            setTestResult(await personnelMailboxApi.test(person.id, toInput(form, fallbackName)));
        } catch (error) {
            toast.error(mailApiError(error).message || t('personnel.mailbox.testFailed'));
        } finally {
            setBusy(null);
        }
    };

    const restart = async () => {
        setBusy('restart');
        try {
            const result = await personnelMailboxApi.restart(person.id);
            setStatus(result.status);
            if (result.summary?.error) toast.error(result.summary.error);
            else toast.success(t('personnel.mailbox.restarted'));
        } catch (error) {
            toast.error(mailApiError(error).message || t('personnel.mailbox.restartFailed'));
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        if (!confirmRemove) { setConfirmRemove(true); return; }
        setBusy('remove');
        try {
            await personnelMailboxApi.remove(person.id);
            toast.success(t('personnel.mailbox.removed'));
            onChanged?.();
            onClose();
        } catch (error) {
            toast.error(mailApiError(error).message || t('personnel.mailbox.removeFailed'));
        } finally {
            setBusy(null);
            setConfirmRemove(false);
        }
    };

    const statusTone = !status
        ? null
        : status.running
            ? 'running'
            : status.lastError
                ? 'error'
                : status.lastSyncAt ? 'ok' : 'idle';

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            closeOnBackdrop={false}
            icon={<Mail01 size={18} />}
            title={t('personnel.mailbox.title')}
            subtitle={fullName(person)}
            width={480}
            footer={(
                <PopupActions
                    start={exists ? (
                        <PopupButton
                            variant={confirmRemove ? 'danger' : 'text'}
                            icon={<Trash01 size={14} />}
                            onClick={() => void remove()}
                            disabled={Boolean(busy)}
                            loading={busy === 'remove'}
                        >
                            {confirmRemove ? t('personnel.mailbox.removeConfirm') : t('personnel.mailbox.remove')}
                        </PopupButton>
                    ) : null}
                >
                    <PopupButton onClick={() => void test()} disabled={Boolean(busy) || loading} loading={busy === 'test'}>
                        {t('personnel.mailbox.test')}
                    </PopupButton>
                    <PopupButton variant="primary" onClick={() => void save()} disabled={Boolean(busy) || loading} loading={busy === 'save'}>
                        {t('personnel.mailbox.saveAndLoad')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            {loading ? (
                <p className="ofi-staffmail__loading">{t('common.loading')}</p>
            ) : (
                <form
                    className="ofi-staffmail"
                    autoComplete="off"
                    onSubmit={(event) => { event.preventDefault(); void save(); }}
                >
                    <p className="ofi-staffmail__intro">{t('personnel.mailbox.introShort')}</p>

                    {/* ZUSTAND: läuft / geladen / Fehler — und der Neustart. */}
                    {exists && status && (
                        <div className={`ofi-staffmail__status is-${statusTone}`}>
                            <span className="ofi-staffmail__statusicon">
                                {statusTone === 'error' && <AlertCircle size={16} />}
                                {statusTone === 'ok' && <CheckCircle size={16} />}
                                {(statusTone === 'running' || statusTone === 'idle') && (
                                    <RefreshCcw01 size={16} className={statusTone === 'running' ? 'animate-spin' : ''} />
                                )}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="ofi-staffmail__statustitle">
                                    {statusTone === 'running'
                                        ? t('personnel.mailbox.statusRunning')
                                        : statusTone === 'error'
                                            ? t('personnel.mailbox.statusError')
                                            : statusTone === 'ok'
                                                ? t('personnel.mailbox.statusOk')
                                                : t('personnel.mailbox.statusIdle')}
                                </p>
                                <p className="ofi-staffmail__statusmeta">
                                    {t('personnel.mailbox.counts', { inbox: status.inbox, sent: status.sent })}
                                    {' · '}
                                    {t('personnel.mailbox.lastSync', { when: formatWhen(status.lastSyncAt) })}
                                </p>
                                {status.lastError && <p className="ofi-staffmail__statuserror">{status.lastError}</p>}
                            </div>
                            <PopupButton
                                icon={<RefreshCcw01 size={14} />}
                                onClick={() => void restart()}
                                disabled={Boolean(busy) || running}
                                loading={busy === 'restart'}
                            >
                                {t('personnel.mailbox.restart')}
                            </PopupButton>
                        </div>
                    )}

                    {/* DIE ZWEI FELDER, DIE MAN TIPPT. */}
                    <PopupField label={t('personnel.mailbox.email')} required>
                        <input
                            type="email"
                            value={form.fromEmail}
                            onChange={(event) => patch({ fromEmail: event.target.value })}
                            className={INPUT}
                            autoComplete="off"
                            placeholder="name@offitec.ch"
                        />
                    </PopupField>
                    <PopupField
                        label={t('personnel.mailbox.password')}
                        required={!hasPassword}
                        hint={hasPassword ? t('personnel.mailbox.passwordKeep') : undefined}
                    >
                        <input
                            type="password"
                            value={form.password}
                            onChange={(event) => patch({ password: event.target.value })}
                            className={INPUT}
                            autoComplete="new-password"
                            placeholder={hasPassword ? '••••••••' : ''}
                            // Die Adresse steht meist schon da — dann gleich ins Passwort.
                            autoFocus={Boolean(form.fromEmail)}
                        />
                    </PopupField>

                    {form.useAsAccountEmail && detail && form.fromEmail.trim()
                        && form.fromEmail.trim().toLowerCase() !== detail.employee.email.toLowerCase() && (
                        <PopupNote tone="warning">
                            {t('personnel.mailbox.loginChanges', { from: detail.employee.email, to: form.fromEmail.trim() })}
                        </PopupNote>
                    )}

                    {/* DIE SERVER — sichtbar und schon ausgefüllt (mail.cyon.ch,
                        Eingang 993, Ausgang 465, SSL/TLS an). Ändern darf man sie,
                        tippen muss man sie nicht. */}
                    <div className="ofi-staffmail__servers">
                        <div className="ofi-staffmail__pair">
                            <PopupField label={`${t('personnel.mailbox.incoming')} · ${t('personnel.mailbox.server')}`}>
                                <input value={form.imapHost} onChange={(event) => patch({ imapHost: event.target.value })} className={INPUT} placeholder={HOUSE_HOST} />
                            </PopupField>
                            <PopupField label={t('personnel.mailbox.port')}>
                                <input type="number" value={form.imapPort} onChange={(event) => patch({ imapPort: Number(event.target.value) })} className={INPUT} />
                            </PopupField>
                        </div>
                        <div className="ofi-staffmail__pair">
                            <PopupField label={`${t('personnel.mailbox.outgoing')} · ${t('personnel.mailbox.server')}`}>
                                <input value={form.smtpHost} onChange={(event) => patch({ smtpHost: event.target.value })} className={INPUT} placeholder={HOUSE_HOST} />
                            </PopupField>
                            <PopupField label={t('personnel.mailbox.port')}>
                                <input type="number" value={form.smtpPort} onChange={(event) => patch({ smtpPort: Number(event.target.value) })} className={INPUT} />
                            </PopupField>
                        </div>
                        <Check checked={form.smtpSecure && form.imapSecure} onChange={(next) => patch({ smtpSecure: next, imapSecure: next })}>
                            {t('personnel.mailbox.ssl')}
                        </Check>
                    </div>

                    {/* ERWEITERT: Name, eigene Benutzer, Ordner, Zeitraum, Schalter. */}
                    <button type="button" className="ofi-staffmail__toggle" onClick={() => setAdvanced((value) => !value)}>
                        <ChevronDown size={13} className={advanced ? '' : '-rotate-90'} />
                        {t('personnel.mailbox.advanced')}
                    </button>
                    {advanced && (
                        <div className="ofi-staffmail__advanced">
                            <PopupField label={t('personnel.mailbox.displayName')}>
                                <input value={form.fromName} onChange={(event) => patch({ fromName: event.target.value })} className={INPUT} placeholder={fallbackName} />
                            </PopupField>
                            <div className="ofi-staffmail__pair is-even">
                                <PopupField label={t('personnel.mailbox.smtpUser')} hint={t('personnel.mailbox.userHint')}>
                                    <input value={form.smtpUser} onChange={(event) => patch({ smtpUser: event.target.value })} className={INPUT} placeholder={form.fromEmail} />
                                </PopupField>
                                <PopupField label={t('personnel.mailbox.imapUser')} hint={t('personnel.mailbox.userHint')}>
                                    <input value={form.imapUser} onChange={(event) => patch({ imapUser: event.target.value })} className={INPUT} placeholder={form.smtpUser || form.fromEmail} />
                                </PopupField>
                            </div>
                            <PopupField label={t('personnel.mailbox.imapPassword')} hint={t('personnel.mailbox.imapPasswordHint')}>
                                <input type="password" value={form.imapPassword} onChange={(event) => patch({ imapPassword: event.target.value })} className={INPUT} autoComplete="new-password" />
                            </PopupField>
                            <div className="ofi-staffmail__pair is-even">
                                <PopupField label={t('personnel.mailbox.inboxFolder')}>
                                    <input value={form.imapInboxFolder} onChange={(event) => patch({ imapInboxFolder: event.target.value })} className={INPUT} placeholder="INBOX" />
                                </PopupField>
                                <PopupField label={t('personnel.mailbox.sentFolder')}>
                                    <input value={form.sentFolder} onChange={(event) => patch({ sentFolder: event.target.value })} className={INPUT} placeholder={t('personnel.mailbox.sentFolderAuto')} />
                                </PopupField>
                            </div>
                            <PopupField label={t('personnel.mailbox.window')}>
                                <div className="ofi-staffmail__seg">
                                    {[1, 2].map((months) => (
                                        <button
                                            key={months}
                                            type="button"
                                            className={form.imapWindowMonths === months ? 'is-active' : ''}
                                            onClick={() => patch({ imapWindowMonths: months })}
                                        >
                                            {t('personnel.mailbox.months', { count: months })}
                                        </button>
                                    ))}
                                </div>
                            </PopupField>
                            <div className="ofi-staffmail__checks">
                                <Check checked={form.imapCaptureEnabled} onChange={(next) => patch({ imapCaptureEnabled: next })}>{t('personnel.mailbox.captureEnabled')}</Check>
                                <Check checked={form.useAsAccountEmail} onChange={(next) => patch({ useAsAccountEmail: next })}>{t('personnel.mailbox.useAsAccountEmail')}</Check>
                                <Check checked={form.isActive} onChange={(next) => patch({ isActive: next })}>{t('personnel.mailbox.active')}</Check>
                            </div>
                        </div>
                    )}

                    {testResult && (
                        <div className="ofi-staffmail__test">
                            {([['smtp', testResult.smtp], ['imap', testResult.imap]] as const).map(([kind, result]) => result && (
                                <div key={kind} className={`ofi-staffmail__testrow ${result.ok ? 'is-ok' : 'is-bad'}`}>
                                    {result.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                                    <span>
                                        <strong>{kind === 'smtp' ? t('personnel.mailbox.outgoing') : t('personnel.mailbox.incoming')}</strong>
                                        {': '}
                                        {result.ok
                                            ? (kind === 'imap' && 'messages' in result && result.messages !== undefined
                                                ? t('personnel.mailbox.testImapOk', { count: result.messages })
                                                : t('personnel.mailbox.testOk'))
                                            : result.error}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Enter im Passwortfeld speichert — ein unsichtbarer Absender. */}
                    <button type="submit" hidden aria-hidden tabIndex={-1} />
                </form>
            )}
        </PopupDialog>
    );
};
