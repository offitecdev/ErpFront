import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, ChevronDown, RefreshCcw01, Trash01 } from '@/components/icons/antIconCompat';
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
import { PersonnelSheet } from './PersonnelSheet';
import { GhostButton, Labelled, PrimaryButton } from './primitives';

/**
 * ── MAIL EINER PERSON (Verwaltung, 28.09.2026) ────────────────────────────────
 *
 * Vorgabe Samet: «her personel için mail ayarları, yönetici ekranında bir pop
 * up; mail yapılandırmasını yap, mailini yeniden başlattır ve yüklettir; artık
 * kullanıcının maili sadece o olsun her yerde».
 *
 * Das Fenster richtet das PERSÖNLICHE Postfach ein (Server kommen vom
 * Firmenpostfach vor — meist fehlt nur das Passwort). «Speichern» ist zugleich
 * «neu starten und laden»: der Server setzt den Lesestand zurück und liest das
 * Konto sofort ein; solange das läuft, fragt das Fenster alle 3 s nach.
 * Danach gilt für die Person überall nur noch dieses Konto — Versand wie
 * Postfach. Passwörter kommen nie zurück; leer lassen = unverändert.
 */

const INPUT = 'ofi-cal-input w-full';
const POLL_MS = 3000;

type Form = Omit<PersonnelMailboxInput, 'smtpPassword' | 'imapPassword'> & {
    password: string;
    imapPassword: string;
};

const emptyForm = (): Form => ({
    fromName: '',
    fromEmail: '',
    smtpHost: '',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: '',
    password: '',
    imapHost: '',
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

const formFrom = (detail: PersonnelMailboxDetail): Form => {
    const box = detail.mailbox;
    const d = detail.defaults;
    if (!box) {
        return {
            ...emptyForm(),
            fromName: `${detail.employee.firstName} ${detail.employee.lastName}`.trim(),
            fromEmail: detail.employee.email,
            smtpHost: d.smtpHost || '',
            smtpPort: d.smtpPort || 465,
            smtpSecure: d.smtpSecure,
            imapHost: d.imapHost || '',
            imapPort: d.imapPort || 993,
            imapSecure: d.imapSecure,
        };
    }
    return {
        ...emptyForm(),
        fromName: box.fromName || '',
        fromEmail: box.fromEmail,
        smtpHost: box.smtpHost || '',
        smtpPort: box.smtpPort,
        smtpSecure: box.smtpSecure,
        smtpUser: box.smtpUser && box.smtpUser !== box.fromEmail ? box.smtpUser : '',
        imapHost: box.imapHost || '',
        imapPort: box.imapPort,
        imapSecure: box.imapSecure,
        imapUser: box.imapUser || '',
        sentFolder: box.sentFolder || '',
        imapInboxFolder: box.imapInboxFolder || '',
        imapCaptureEnabled: box.imapCaptureEnabled,
        imapWindowMonths: box.imapWindowMonths,
        isActive: box.isActive,
        useAsAccountEmail: box.fromEmail.toLowerCase() === detail.employee.email.toLowerCase(),
    };
};

const toInput = (form: Form): PersonnelMailboxInput => ({
    fromName: form.fromName.trim(),
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
    <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-slate-700 dark:text-white/80">
        <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-0.5 size-3.5 accent-[#0a7aff]"
        />
        <span>{children}</span>
    </label>
);

const SectionTitle = ({ children }: { children: ReactNode }) => (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">{children}</h3>
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

    const save = async () => {
        if (!form.fromEmail.trim()) { toast.error(t('personnel.mailbox.emailRequired')); return; }
        if (!form.smtpHost.trim() && !form.imapHost.trim()) { toast.error(t('personnel.mailbox.serverRequired')); return; }
        if (!hasPassword && !form.password && !form.imapPassword) { toast.error(t('personnel.mailbox.passwordRequired')); return; }
        setBusy('save');
        try {
            const result = await personnelMailboxApi.save(person.id, toInput(form));
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
            setTestResult(await personnelMailboxApi.test(person.id, toInput(form)));
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
        <PersonnelSheet
            open={open}
            onClose={onClose}
            title={t('personnel.mailbox.title')}
            subtitle={fullName(person)}
            width={640}
            height={760}
            footer={(
                <>
                    <div className="flex items-center gap-2">
                        {exists && (
                            <GhostButton
                                icon={<Trash01 size={14} />}
                                onClick={() => void remove()}
                                disabled={Boolean(busy)}
                                className={confirmRemove ? '!border-red-300 !text-red-600' : ''}
                            >
                                {confirmRemove ? t('personnel.mailbox.removeConfirm') : t('personnel.mailbox.remove')}
                            </GhostButton>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <GhostButton onClick={() => void test()} disabled={Boolean(busy) || loading}>
                            {busy === 'test' ? t('personnel.mailbox.testing') : t('personnel.mailbox.test')}
                        </GhostButton>
                        <PrimaryButton onClick={() => void save()} disabled={Boolean(busy) || loading}>
                            {busy === 'save' ? t('personnel.mailbox.saving') : t('personnel.mailbox.saveAndLoad')}
                        </PrimaryButton>
                    </div>
                </>
            )}
        >
            {loading ? (
                <p className="py-16 text-center text-[13px] text-slate-400">{t('common.loading')}</p>
            ) : (
                <div className="flex flex-col gap-5">
                    <p className="text-[12.5px] leading-relaxed text-slate-500 dark:text-white/60">
                        {t('personnel.mailbox.intro')}
                    </p>

                    {/* ZUSTAND: läuft / geladen / Fehler — und der Neustart. */}
                    {exists && status && (
                        <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-3 dark:border-white/10">
                            <div className="flex min-w-0 items-start gap-2.5">
                                <span className="mt-0.5 shrink-0">
                                    {statusTone === 'error' && <AlertCircle size={16} className="text-red-500" />}
                                    {statusTone === 'ok' && <CheckCircle size={16} className="text-emerald-500" />}
                                    {(statusTone === 'running' || statusTone === 'idle') && (
                                        <RefreshCcw01 size={16} className={`text-[#0a7aff] ${statusTone === 'running' ? 'animate-spin' : ''}`} />
                                    )}
                                </span>
                                <div className="min-w-0 text-[12.5px]">
                                    <p className="font-semibold text-slate-800 dark:text-white">
                                        {statusTone === 'running'
                                            ? t('personnel.mailbox.statusRunning')
                                            : statusTone === 'error'
                                                ? t('personnel.mailbox.statusError')
                                                : statusTone === 'ok'
                                                    ? t('personnel.mailbox.statusOk')
                                                    : t('personnel.mailbox.statusIdle')}
                                    </p>
                                    <p className="text-slate-500 dark:text-white/55">
                                        {t('personnel.mailbox.counts', { inbox: status.inbox, sent: status.sent })}
                                        {' · '}
                                        {t('personnel.mailbox.lastSync', { when: formatWhen(status.lastSyncAt) })}
                                    </p>
                                    {status.lastError && (
                                        <p className="mt-1 break-words text-red-600 dark:text-red-400">{status.lastError}</p>
                                    )}
                                </div>
                            </div>
                            <GhostButton
                                icon={<RefreshCcw01 size={14} />}
                                onClick={() => void restart()}
                                disabled={Boolean(busy) || running}
                                className="shrink-0"
                            >
                                {busy === 'restart' ? t('personnel.mailbox.restarting') : t('personnel.mailbox.restart')}
                            </GhostButton>
                        </div>
                    )}

                    <section>
                        <SectionTitle>{t('personnel.mailbox.account')}</SectionTitle>
                        <div className="grid grid-cols-2 gap-3">
                            <Labelled label={t('personnel.mailbox.email')} required>
                                <input
                                    type="email"
                                    value={form.fromEmail}
                                    onChange={(event) => patch({ fromEmail: event.target.value })}
                                    className={INPUT}
                                    autoComplete="off"
                                />
                            </Labelled>
                            <Labelled label={t('personnel.mailbox.displayName')}>
                                <input
                                    value={form.fromName}
                                    onChange={(event) => patch({ fromName: event.target.value })}
                                    className={INPUT}
                                />
                            </Labelled>
                            <Labelled
                                label={t('personnel.mailbox.password')}
                                required={!hasPassword}
                                hint={hasPassword ? t('personnel.mailbox.passwordKeep') : t('personnel.mailbox.passwordHint')}
                                className="col-span-2"
                            >
                                <input
                                    type="password"
                                    value={form.password}
                                    onChange={(event) => patch({ password: event.target.value })}
                                    className={INPUT}
                                    autoComplete="new-password"
                                    placeholder={hasPassword ? '••••••••' : ''}
                                />
                            </Labelled>
                        </div>
                    </section>

                    <section>
                        <SectionTitle>{t('personnel.mailbox.outgoing')}</SectionTitle>
                        <div className="grid grid-cols-[1fr_96px] gap-3">
                            <Labelled label={t('personnel.mailbox.server')}>
                                <input value={form.smtpHost} onChange={(event) => patch({ smtpHost: event.target.value })} className={INPUT} placeholder="mail.example.com" />
                            </Labelled>
                            <Labelled label={t('personnel.mailbox.port')}>
                                <input type="number" value={form.smtpPort} onChange={(event) => patch({ smtpPort: Number(event.target.value) })} className={INPUT} />
                            </Labelled>
                        </div>
                        <div className="mt-2">
                            <Check checked={form.smtpSecure} onChange={(next) => patch({ smtpSecure: next })}>{t('personnel.mailbox.ssl')}</Check>
                        </div>
                    </section>

                    <section>
                        <SectionTitle>{t('personnel.mailbox.incoming')}</SectionTitle>
                        <div className="grid grid-cols-[1fr_96px] gap-3">
                            <Labelled label={t('personnel.mailbox.server')}>
                                <input value={form.imapHost} onChange={(event) => patch({ imapHost: event.target.value })} className={INPUT} placeholder="mail.example.com" />
                            </Labelled>
                            <Labelled label={t('personnel.mailbox.port')}>
                                <input type="number" value={form.imapPort} onChange={(event) => patch({ imapPort: Number(event.target.value) })} className={INPUT} />
                            </Labelled>
                        </div>
                        <div className="mt-2 flex flex-col gap-1.5">
                            <Check checked={form.imapSecure} onChange={(next) => patch({ imapSecure: next })}>{t('personnel.mailbox.ssl')}</Check>
                            <Check checked={form.imapCaptureEnabled} onChange={(next) => patch({ imapCaptureEnabled: next })}>{t('personnel.mailbox.captureEnabled')}</Check>
                        </div>
                    </section>

                    <section className="flex flex-col gap-1.5">
                        <Check checked={form.useAsAccountEmail} onChange={(next) => patch({ useAsAccountEmail: next })}>
                            {t('personnel.mailbox.useAsAccountEmail')}
                        </Check>
                        {form.useAsAccountEmail && detail && form.fromEmail.trim().toLowerCase() !== detail.employee.email.toLowerCase() && (
                            <p className="pl-5 text-[11.5px] text-amber-600 dark:text-amber-400">
                                {t('personnel.mailbox.loginChanges', { from: detail.employee.email, to: form.fromEmail.trim() })}
                            </p>
                        )}
                        <Check checked={form.isActive} onChange={(next) => patch({ isActive: next })}>
                            {t('personnel.mailbox.active')}
                        </Check>
                    </section>

                    {/* ERWEITERT: eigene Anmeldung für IMAP, Ordner, Zeitraum. */}
                    <section>
                        <button
                            type="button"
                            onClick={() => setAdvanced((value) => !value)}
                            className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 transition-colors hover:text-[#0066e0] dark:text-white/60 dark:hover:text-white"
                        >
                            <ChevronDown size={14} className={`transition-transform ${advanced ? '' : '-rotate-90'}`} />
                            {t('personnel.mailbox.advanced')}
                        </button>
                        {advanced && (
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <Labelled label={t('personnel.mailbox.smtpUser')} hint={t('personnel.mailbox.userHint')}>
                                    <input value={form.smtpUser} onChange={(event) => patch({ smtpUser: event.target.value })} className={INPUT} placeholder={form.fromEmail} />
                                </Labelled>
                                <Labelled label={t('personnel.mailbox.imapUser')} hint={t('personnel.mailbox.userHint')}>
                                    <input value={form.imapUser} onChange={(event) => patch({ imapUser: event.target.value })} className={INPUT} placeholder={form.smtpUser || form.fromEmail} />
                                </Labelled>
                                <Labelled label={t('personnel.mailbox.imapPassword')} hint={t('personnel.mailbox.imapPasswordHint')} className="col-span-2">
                                    <input type="password" value={form.imapPassword} onChange={(event) => patch({ imapPassword: event.target.value })} className={INPUT} autoComplete="new-password" />
                                </Labelled>
                                <Labelled label={t('personnel.mailbox.inboxFolder')}>
                                    <input value={form.imapInboxFolder} onChange={(event) => patch({ imapInboxFolder: event.target.value })} className={INPUT} placeholder="INBOX" />
                                </Labelled>
                                <Labelled label={t('personnel.mailbox.sentFolder')}>
                                    <input value={form.sentFolder} onChange={(event) => patch({ sentFolder: event.target.value })} className={INPUT} placeholder={t('personnel.mailbox.sentFolderAuto')} />
                                </Labelled>
                                <Labelled label={t('personnel.mailbox.window')} className="col-span-2">
                                    <div className="flex gap-2">
                                        {[1, 2].map((months) => (
                                            <button
                                                key={months}
                                                type="button"
                                                onClick={() => patch({ imapWindowMonths: months })}
                                                className={`rounded-md border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${form.imapWindowMonths === months
                                                    ? 'border-[#0a7aff] bg-[#0a7aff]/10 text-[#0066e0] dark:text-white'
                                                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/15 dark:text-white/70'}`}
                                            >
                                                {t('personnel.mailbox.months', { count: months })}
                                            </button>
                                        ))}
                                    </div>
                                </Labelled>
                            </div>
                        )}
                    </section>

                    {testResult && (
                        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 px-3.5 py-3 text-[12.5px] dark:border-white/10">
                            {([['smtp', testResult.smtp], ['imap', testResult.imap]] as const).map(([kind, result]) => result && (
                                <div key={kind} className="flex items-start gap-2">
                                    {result.ok
                                        ? <CheckCircle size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                                        : <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />}
                                    <span className="min-w-0 break-words text-slate-700 dark:text-white/80">
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
                </div>
            )}
        </PersonnelSheet>
    );
};
