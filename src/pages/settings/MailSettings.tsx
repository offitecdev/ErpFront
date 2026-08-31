import { useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle as CheckCircle2,
    Calendar as CalendarIcon,
    Image01 as ImageIcon,
    Mail01 as Mail,
    Send01 as Send,
} from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { Field, Input, Textarea } from '../../components/ui-shared/Field';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { mailApi } from '../../lib/api/project';
import { isRequestTimeout } from '../../lib/axios';
import type { SentCopyResultDto } from '../../types/project';
import { useAuthStore } from '../../store/authStore';
import { SignatureEditor } from './SignatureEditor';
import { SIGNATURE_IMAGE_TYPES, SIGNATURE_IMAGE_MAX_BYTES, signatureFileToDataUrl } from './signatureImage';

import { t } from '@/i18n/translate';

/** Server + Postfachadresse, nach derselben Regel wie im Server
    (`mailboxIdentity` in MailController): IMAP-Benutzer, sonst SMTP-Benutzer,
    sonst die Absenderadresse. */
const mailboxIdentity = (host: unknown, imapUser: unknown, smtpUser: unknown, fromEmail: unknown) => {
    const clean = (value: unknown) => String(value || '').trim().toLowerCase();
    const box = clean(imapUser) || clean(smtpUser) || clean(fromEmail);
    return box ? `${clean(host)}|${box}` : '';
};

export const MailSettings = () => {
    const { user } = useAuthStore();
    const [form, setForm] = useState({
        fromName:t('auto.offitec_erp'),
        fromEmail: user?.email || '',
        replyTo: '',
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPassword: '',
        // Gönderilenler kopyası (IMAP) — boş sunucu adı = kapalı.
        imapHost: '',
        imapPort: 993,
        imapSecure: true,
        imapUser: '',
        imapPassword: '',
        sentFolder: '',
        saveToSent: true,
        signatureHtml: '',
        signatureImage: '',
        // Posteingang des eigenen Servers: der Abruf holt nur Kundenbezogenes.
        imapCaptureEnabled: false,
        imapInboxFolder: '',
        imapCaptureRepliesOnly: false,
        // Wie weit das Postfach zurückreicht: 1 oder 2 Monate.
        imapWindowMonths: 2,
        /* DER KALENDER DESSELBEN KONTOS (CalDAV). Leere Felder erben vom
           IMAP-Zugang — es ist ein Postfach, kein zweites System. */
        caldavEnabled: false,
        caldavUrl: '',
        caldavUser: '',
        caldavPassword: '',
    });
    const signatureFileRef = useRef<HTMLInputElement>(null);
    const [test, setTest] = useState({
        to: user?.email || '',
        subject:t('settings.mail.testSubject'),
        text:t('settings.mail.testSuccessMsg'),
    });
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [testSent, setTestSent] = useState(false);
    // Kayıtlı şifre asla geri gösterilmez; kullanıcı yalnızca kayıtlı OLUP
    // olmadığını görür ve isterse siler (null gönderilir).
    const [hasPassword, setHasPassword] = useState(false);
    const [clearPassword, setClearPassword] = useState(false);
    const [hasImapPassword, setHasImapPassword] = useState(false);
    const [clearImapPassword, setClearImapPassword] = useState(false);
    const [hasCaldavPassword, setHasCaldavPassword] = useState(false);
    const [clearCaldavPassword, setClearCaldavPassword] = useState(false);
    /* Was die letzte Prüfung gefunden hat. Der Server merkt sich die Kalender;
       hier stehen sie, damit sichtbar ist, WORAUS der Kalender gespeist wird —
       «es läuft» ohne Namen wäre keine Auskunft. */
    const [caldavCalendars, setCaldavCalendars] = useState<Array<{ href: string; displayName: string }>>([]);
    const [caldavError, setCaldavError] = useState('');
    const [caldavLoading, setCaldavLoading] = useState(false);
    /* DAS GELADENE POSTFACH — Server plus Adresse, so wie der Server sie
       vergleicht. Weicht das Formular davon ab, ist es ein ANDERES Konto: beim
       Speichern verschwinden die Nachrichten des alten mit ihm. Das darf man
       nicht erst hinterher erfahren, darum steht der Hinweis über «Speichern». */
    const [savedMailbox, setSavedMailbox] = useState('');

    useEffect(() => {
        mailApi.getSettings().then((settings) => {
            setSavedMailbox(mailboxIdentity(settings.imapHost, settings.imapUser, settings.smtpUser, settings.fromEmail));
            setHasPassword(Boolean(settings.hasPassword));
            setClearPassword(false);
            setHasImapPassword(Boolean(settings.hasImapPassword));
            setClearImapPassword(false);
            setHasCaldavPassword(Boolean(settings.hasCaldavPassword));
            setClearCaldavPassword(false);
            setCaldavCalendars(Array.isArray(settings.caldavCalendars) ? settings.caldavCalendars : []);
            setCaldavError(settings.caldavLastError || '');
            setForm({
                fromName: settings.fromName ||t('auto.offitec_erp'),
                fromEmail: settings.fromEmail || user?.email || '',
                replyTo: settings.replyTo || '',
                smtpHost: settings.smtpHost || '',
                smtpPort: settings.smtpPort || 587,
                smtpSecure: Boolean(settings.smtpSecure),
                smtpUser: settings.smtpUser || '',
                smtpPassword: '',
                imapHost: settings.imapHost || '',
                imapPort: settings.imapPort || 993,
                imapSecure: settings.imapSecure ?? true,
                imapUser: settings.imapUser || '',
                imapPassword: '',
                sentFolder: settings.sentFolder || '',
                saveToSent: settings.saveToSent ?? true,
                // Eski ayrı "imza görseli" alanı editöre satır içi görsel olarak
                // taşınır; bir sonraki kayıtta her şey tek HTML'de birleşir.
                signatureHtml: `${settings.signatureHtml || ''}${
                    settings.signatureImage
                        ? `<div><img src="${settings.signatureImage}" style="max-width:420px;height:auto" /></div>`
                        : ''
                }`,
                signatureImage: '',
                imapCaptureEnabled: Boolean(settings.imapCaptureEnabled),
                imapInboxFolder: settings.imapInboxFolder || '',
                imapCaptureRepliesOnly: Boolean(settings.imapCaptureRepliesOnly),
                imapWindowMonths: Number(settings.imapWindowMonths) === 1 ? 1 : 2,
                caldavEnabled: Boolean(settings.caldavEnabled),
                caldavUrl: settings.caldavUrl || '',
                caldavUser: settings.caldavUser || '',
                caldavPassword: '',
            });
        }).catch(() => undefined);
    }, [user?.email]);

    /** Formu kaydeder. Şifre alanı boşsa anahtar hiç gönderilmez (sunucu
        mevcut şifreyi korur); "sil" seçildiyse açıkça null gider. */
    const persist = async () => {
        const typedPassword = form.smtpPassword.trim();
        const typedImapPassword = form.imapPassword.trim();
        const typedCaldavPassword = form.caldavPassword.trim();
        const settings = await mailApi.saveSettings({
            ...form,
            smtpPassword: typedPassword ? form.smtpPassword : clearPassword ? null : undefined,
            imapPassword: typedImapPassword ? form.imapPassword : clearImapPassword ? null : undefined,
            caldavPassword: typedCaldavPassword ? form.caldavPassword : clearCaldavPassword ? null : undefined,
        });
        setHasPassword(Boolean(settings?.hasPassword));
        setClearPassword(false);
        setHasImapPassword(Boolean(settings?.hasImapPassword));
        setClearImapPassword(false);
        setHasCaldavPassword(Boolean(settings?.hasCaldavPassword));
        setClearCaldavPassword(false);
        setForm((prev) => ({ ...prev, smtpPassword: '', imapPassword: '', caldavPassword: '' }));
        setSavedMailbox(mailboxIdentity(settings?.imapHost, settings?.imapUser, settings?.smtpUser, settings?.fromEmail));
        return settings;
    };

    /* Zeigt das Formular auf ein anderes Postfach als das gespeicherte? Erst
       dann ist das Speichern der Wechsel, der aufräumt. Vor dem ersten
       Einrichten (noch nichts gespeichert) gibt es nichts wegzuwerfen. */
    const mailboxWillChange = Boolean(savedMailbox)
        && savedMailbox !== mailboxIdentity(form.imapHost, form.imapUser, form.smtpUser, form.fromEmail);

    const save = async () => {
        setLoading(true);
        setSaved(false);
        try {
            const settings = await persist();
            setSaved(true);
            const result = settings as { purgedMessages?: number; purgedMeetings?: number } | undefined;
            const purged = Number(result?.purgedMessages || 0);
            /* Was der Wechsel gekostet hat, wird benannt — eine stille Löschung
               wäre eine böse Überraschung. Der Kalender wird EIGENS genannt:
               dass mit dem Postfach auch die daraus übernommenen Termine gehen,
               erwartet niemand von einer Mail-Einstellung. */
            const purgedMeetings = Number(result?.purgedMeetings || 0);
            if (purged > 0) toast.warning(t('settings.mail.mailboxSwitchedPurged', { count: purged }));
            else if (!purgedMeetings) toast.success(t('settings.mail.saveSuccessMsg'));
            if (purgedMeetings > 0) toast.warning(t('settings.mail.mailboxSwitchedPurgedMeetings', { count: purgedMeetings }));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('settings.mail.errorSave'));
        } finally {
            setLoading(false);
        }
    };

    /* KALENDER PRÜFEN. Erst speichern, dann suchen: der Server sucht mit den
       GESPEICHERTEN Zugangsdaten, und wer eben ein Passwort getippt hat, will
       genau das geprüft haben — sonst prüft der Knopf den vorherigen Stand und
       meldet einen Fehler, den es auf dem Bildschirm längst nicht mehr gibt. */
    const checkCalendar = async () => {
        setCaldavLoading(true);
        try {
            await persist();
            const result = await mailApi.testCaldav();
            setCaldavCalendars(result.calendars || []);
            setCaldavError(result.error || '');
            if (result.ok) toast.success(t('settings.mail.caldavFound', { count: result.calendars.length }));
            else toast.error(result.error || t('settings.mail.caldavNotFound'));
        } catch (e: any) {
            const message = e.response?.data?.error || t('settings.mail.caldavNotFound');
            setCaldavError(message);
            toast.error(message);
        } finally {
            setCaldavLoading(false);
        }
    };

    // Dosyadan yükleme: görsel, imza HTML'inin sonuna satır içi <img> olarak
    // eklenir — yanına metin yazılabilir, silinebilir (kalıcılık Kaydet'e bağlı).
    const addSignatureImage = async (file: File | null | undefined) => {
        if (!file) return;
        if (!SIGNATURE_IMAGE_TYPES.includes(file.type)) {
            toast.error(t('settings.mail.signatureImageInvalid'));
            return;
        }
        if (file.size > SIGNATURE_IMAGE_MAX_BYTES) {
            toast.error(t('settings.mail.signatureImageTooLarge'));
            return;
        }
        const dataUrl = await signatureFileToDataUrl(file);
        setForm((prev) => ({
            ...prev,
            signatureHtml: `${prev.signatureHtml}<div><img src="${dataUrl}" style="max-width:420px;height:auto" /></div>`,
        }));
        toast.success(t('settings.mail.signatureImageAdded'));
    };

    // Editör dışına (kartın herhangi bir yerine) yapıştırılan görseller de
    // imzanın sonuna eklenir; editörün kendi paste'i propagation'ı keser.
    const handleSignaturePaste = (event: React.ClipboardEvent) => {
        const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith('image/'));
        if (!item) return;
        event.preventDefault();
        void addSignatureImage(item.getAsFile());
    };

    const sendTest = async () => {
        if (!form.smtpHost.trim()) {
            toast.error(t('settings.mail.smtpRequired'));
            return;
        }
        if (!test.to.trim()) {
            toast.error(t('settings.mail.recipientRequired'));
            return;
        }
        setTestLoading(true);
        setTestSent(false);
        try {
            // Sunucu gönderimde KAYITLI ayarları kullanır: test her zaman
            // ekrandaki bilgilerle (yeni girilen şifre dâhil) gitsin diye
            // önce kaydedilir.
            await persist();
            const res = await mailApi.send({ ...test, fromEmail: form.fromEmail, fromName: form.fromName });
            setTestSent(true);
            // Onay metni sözlükten okunur; sunucunun `res.message` alanı tek
            // dilde yazılıdır ve seçili dilin ortasında yabancı görünürdü.
            toast.success(t('settings.mail.testSuccess'));
            // Gönderilenler kopyası gönderimden BAĞIMSIZDIR: mail gitmiş ama
            // kopya yazılamamış olabilir — sessizce yutulmaz, ayrı bildirilir.
            const sentCopy = res.sentCopy as SentCopyResultDto | undefined;
            if (sentCopy?.status === 'saved') {
                toast.success(t('settings.mail.sentCopySaved', { folder: sentCopy.folder || '' }));
            } else if (sentCopy?.status === 'failed') {
                toast.warning(t('settings.mail.sentCopyFailed', { error: sentCopy.error || '' }));
            }
        } catch (e: any) {
            toast.error(
                isRequestTimeout(e)
                    ? t('common.mailTimeout')
                    : e.response?.data?.error || t('settings.mail.errorTest'),
            );
        } finally {
            setTestLoading(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('nav.settings')}
                title={t('nav.mailSettings')}
                description={t('settings.mail.description')}
                actions={<Button icon={saved ? <CheckCircle2 size={13} /> : <Mail size={13} />} loading={loading} onClick={save} className={saved ?"bg-emerald-600 hover:bg-emerald-600" : ''}>{saved ?t('settings.mail.saveSuccess') :t('common.save')}</Button>}
            />

            {mailboxWillChange && (
                /* Diese Zeile steht zwischen dem Speichern-Knopf und dem
                   Formular, weil das Speichern hier mehr tut als speichern:
                   es wirft die Post des alten Kontos weg. */
                <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900 ring-1 ring-amber-200 ring-inset dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/30">
                    <AlertTriangle size={15} className="mt-[1px] shrink-0" />
                    <span>{t('settings.mail.mailboxSwitchWarnPlain')}</span>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card title={t('settings.mail.sender')} className="xl:col-span-1">
                    <div className="space-y-3">
                        <Field label={t('settings.mail.senderName')}><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                        <Field label={t('settings.mail.senderEmail')}><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                        <Field label={t('settings.mail.replyTo')}><Input value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} /></Field>
                    </div>
                </Card>

                <Card title="SMTP" className="xl:col-span-2">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label={t('settings.mail.smtpHost')}><Input value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} placeholder="smtp.example.com" /></Field>
                        <Field label={t('settings.mail.smtpPort')}><Input type="number" value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) || 587 })} /></Field>
                        <Field label={t('settings.mail.smtpUser')}><Input value={form.smtpUser} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} autoComplete="off" /></Field>
                        <Field
                            label={t('auth.password')}
                            hint={clearPassword
                                ? t('settings.mail.passwordClearPending')
                                : hasPassword
                                    ? t('settings.mail.passwordKeepHint')
                                    : t('settings.mail.passwordMissing')}
                        >
                            <div className="flex items-center gap-2">
                                <Input
                                    type="password"
                                    className="flex-1"
                                    value={form.smtpPassword}
                                    autoComplete="new-password"
                                    placeholder={hasPassword && !clearPassword ? '••••••••' : ''}
                                    onChange={(e) => { setForm({ ...form, smtpPassword: e.target.value }); setClearPassword(false); }}
                                />
                                {hasPassword && !clearPassword && !form.smtpPassword && (
                                    <Button variant="ghost" size="sm" onClick={() => setClearPassword(true)}>
                                        {t('settings.mail.passwordClear')}
                                    </Button>
                                )}
                            </div>
                        </Field>
                        <Checkbox
                            label={t('settings.mail.smtpSecure')}
                            hint={t('settings.mail.smtpSecureHint')}
                            size="sm"
                            isSelected={form.smtpSecure}
                            onChange={(checked) => setForm({ ...form, smtpSecure: checked })}
                            className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                        />
                    </div>
                </Card>

                {/* GÖNDERİLENLER KOPYASI — SMTP yalnızca teslim eder; mailin
                    Outlook'un "Gönderilmiş Öğeler" klasöründe görünmesi için
                    gönderimden sonra IMAP ile kutuya kopyalanması gerekir.
                    Sunucu adı boşsa özellik kapalıdır. */}
                <Card title={t('settings.mail.sentCopyTitle')} className="xl:col-span-3">
                    <div className="space-y-3">
                        <p className="text-[12px] text-slate-500">{t('settings.mail.sentCopyHint')}</p>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Field label={t('settings.mail.imapHost')} hint={t('settings.mail.imapHostHint')}>
                                <Input
                                    value={form.imapHost}
                                    onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                                    placeholder="imap.example.com"
                                />
                            </Field>
                            <Field label={t('settings.mail.imapPort')}>
                                <Input
                                    type="number"
                                    value={form.imapPort}
                                    onChange={(e) => setForm({ ...form, imapPort: Number(e.target.value) || 993 })}
                                />
                            </Field>
                            <Field label={t('settings.mail.imapUser')} hint={t('settings.mail.imapCredentialsHint')}>
                                <Input
                                    value={form.imapUser}
                                    onChange={(e) => setForm({ ...form, imapUser: e.target.value })}
                                    autoComplete="off"
                                    placeholder={form.smtpUser || ''}
                                />
                            </Field>
                            <Field
                                label={t('auth.password')}
                                hint={clearImapPassword
                                    ? t('settings.mail.passwordClearPending')
                                    : hasImapPassword
                                        ? t('settings.mail.passwordKeepHint')
                                        : t('settings.mail.imapPasswordMissing')}
                            >
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="password"
                                        className="flex-1"
                                        value={form.imapPassword}
                                        autoComplete="new-password"
                                        placeholder={hasImapPassword && !clearImapPassword ? '••••••••' : ''}
                                        onChange={(e) => { setForm({ ...form, imapPassword: e.target.value }); setClearImapPassword(false); }}
                                    />
                                    {hasImapPassword && !clearImapPassword && !form.imapPassword && (
                                        <Button variant="ghost" size="sm" onClick={() => setClearImapPassword(true)}>
                                            {t('settings.mail.passwordClear')}
                                        </Button>
                                    )}
                                </div>
                            </Field>
                            <Field label={t('settings.mail.sentFolder')} hint={t('settings.mail.sentFolderHint')}>
                                <Input
                                    value={form.sentFolder}
                                    onChange={(e) => setForm({ ...form, sentFolder: e.target.value })}
                                    placeholder={t('settings.mail.sentFolderAuto')}
                                />
                            </Field>
                            <div className="space-y-2 md:col-span-2">
                                <div className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset">
                                    <div className="mb-1 text-sm font-semibold text-secondary">{t('settings.mail.captureTitle')}</div>
                                    <p className="mb-2 text-[12px] text-slate-500">{t('settings.mail.captureHint')}</p>
                                    <Checkbox
                                        label={t('settings.mail.captureEnabled')}
                                        hint={t('settings.mail.captureEnabledHint')}
                                        size="sm"
                                        isSelected={form.imapCaptureEnabled}
                                        onChange={(checked) => setForm({ ...form, imapCaptureEnabled: checked })}
                                    />
                                    {/* Der Schalter «nur Antworten» ist WEG (08.09.2026):
                                        der Abruf übernimmt die gesamte Post des Fensters —
                                        das Feld bleibt nur im Datensatz stehen. */}
                                    {/* WIE WEIT DAS POSTFACH ZURÜCKREICHT. Der Wert steuert
                                        BEIDES: wie weit der Abruf im Postfach
                                        zurücksieht und welchen Zeitraum die
                                        Postfach-Seite aufschlägt — was man sieht, ist
                                        damit das, was das ERP führt. */}
                                    <div className="mt-3">
                                        <Field label={t('settings.mail.windowMonths')} hint={t('settings.mail.windowMonthsHint')}>
                                            <div className="ofi-mail-windowpick">
                                                {[1, 2].map((months) => (
                                                    <button
                                                        key={months}
                                                        type="button"
                                                        className={form.imapWindowMonths === months ? 'is-active' : ''}
                                                        onClick={() => setForm({ ...form, imapWindowMonths: months })}
                                                    >
                                                        {t('settings.mail.windowMonthsOption', { months })}
                                                    </button>
                                                ))}
                                            </div>
                                        </Field>
                                    </div>
                                    <div className="mt-3">
                                        <Field label={t('settings.mail.inboxFolder')} hint={t('settings.mail.inboxFolderHint')}>
                                            <Input
                                                value={form.imapInboxFolder}
                                                onChange={(e) => setForm({ ...form, imapInboxFolder: e.target.value })}
                                                placeholder="INBOX"
                                            />
                                        </Field>
                                    </div>
                                </div>
                                <Checkbox
                                    label={t('settings.mail.imapSecure')}
                                    hint={t('settings.mail.imapSecureHint')}
                                    size="sm"
                                    isSelected={form.imapSecure}
                                    onChange={(checked) => setForm({ ...form, imapSecure: checked })}
                                    className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                                />
                                <Checkbox
                                    label={t('settings.mail.saveToSent')}
                                    hint={t('settings.mail.saveToSentHint')}
                                    size="sm"
                                    isSelected={form.saveToSent}
                                    onChange={(checked) => setForm({ ...form, saveToSent: checked })}
                                    className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                                />
                            </div>
                        </div>
                    </div>
                </Card>

                {/* DER KALENDER DESSELBEN KONTOS (CalDAV, 31.08.2026).

                    Vorgabe Samet: «es soll nicht nur aus den Mails ziehen,
                    sondern auch aus dem Outlook-Kalender — aber nur aus dem
                    eigenen Konto.» Der Postfachabruf bringt nur, wozu jemand
                    dieses Postfach EINGELADEN hat; was sich jemand selbst in den
                    Kalender schreibt, erzeugt keine Mail und kam bis hierher
                    nirgends an.

                    Benutzer, Passwort und Adresse bleiben in aller Regel leer:
                    dann gilt das IMAP-Konto, und «nur das eigene Konto» ist
                    nicht bloss zugesagt, sondern bauartbedingt wahr. */}
                <Card title={t('settings.mail.caldavTitle')} icon={<CalendarIcon size={14} />} className="xl:col-span-3">
                    <div className="space-y-3">
                        <p className="text-[12px] text-slate-500">{t('settings.mail.caldavHint')}</p>
                        <Checkbox
                            label={t('settings.mail.caldavEnabled')}
                            hint={t('settings.mail.caldavEnabledHint')}
                            size="sm"
                            isSelected={form.caldavEnabled}
                            onChange={(checked) => setForm({ ...form, caldavEnabled: checked })}
                            className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                        />
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <Field label={t('settings.mail.caldavUrl')} hint={t('settings.mail.caldavUrlHint')}>
                                <Input
                                    value={form.caldavUrl}
                                    onChange={(e) => setForm({ ...form, caldavUrl: e.target.value })}
                                    placeholder={form.imapHost ? `https://${form.imapHost}` : 'https://mail.example.com'}
                                />
                            </Field>
                            <Field label={t('settings.mail.caldavUser')} hint={t('settings.mail.caldavUserHint')}>
                                <Input
                                    value={form.caldavUser}
                                    onChange={(e) => setForm({ ...form, caldavUser: e.target.value })}
                                    placeholder={form.imapUser || form.smtpUser}
                                    autoComplete="off"
                                />
                            </Field>
                            <Field
                                label={t('settings.mail.caldavPassword')}
                                hint={clearCaldavPassword
                                    ? t('settings.mail.passwordClearPending')
                                    : hasCaldavPassword
                                        ? t('settings.mail.passwordKeepHint')
                                        : t('settings.mail.caldavPasswordHint')}
                            >
                                <div className="space-y-1">
                                    <Input
                                        type="password"
                                        value={form.caldavPassword}
                                        onChange={(e) => setForm({ ...form, caldavPassword: e.target.value })}
                                        autoComplete="new-password"
                                    />
                                    {hasCaldavPassword && !form.caldavPassword.trim() && (
                                        <button
                                            type="button"
                                            className="text-[11px] text-rose-600 hover:underline"
                                            onClick={() => setClearCaldavPassword((value) => !value)}
                                        >
                                            {t('settings.mail.passwordClear')}
                                        </button>
                                    )}
                                </div>
                            </Field>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="secondary" loading={caldavLoading} onClick={checkCalendar}>
                                {t('settings.mail.caldavCheck')}
                            </Button>
                            {caldavCalendars.length > 0 && (
                                <span className="text-[12px] text-slate-500">
                                    {t('settings.mail.caldavFound', { count: caldavCalendars.length })}
                                    {': '}
                                    {caldavCalendars.map((calendar) => calendar.displayName).join(', ')}
                                </span>
                            )}
                        </div>
                        {caldavError && (
                            <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                                <AlertTriangle size={14} className="mt-[1px] shrink-0" />
                                <span>{caldavError}</span>
                            </div>
                        )}
                        {/* Was dieser Weg NICHT kann — geradeheraus, weil sonst
                            genau danach gefragt wird. */}
                        <p className="text-[11px] text-slate-400">{t('settings.mail.caldavLimitHint')}</p>
                    </div>
                </Card>

                {/* E-posta imzası — tek zengin alan: Outlook/Word'den Ctrl+V ile
                    yapıştırılan imza biçimi ve görselleriyle düzenlenebilir olarak
                    gelir; dosyadan görsel de eklenebilir. Gönderimde imza mail
                    gövdesinin sonuna eklenir, görseller CID'li inline ek olur. */}
                <Card title={t('settings.mail.signatureTitle')} icon={<ImageIcon size={14} />} className="xl:col-span-3">
                    <div className="space-y-3" onPaste={handleSignaturePaste}>
                        <p className="text-[12px] text-slate-500">{t('settings.mail.signatureHint')}</p>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-sm font-medium text-secondary">{t('settings.mail.signatureTextLabel')}</span>
                            <SignatureEditor
                                value={form.signatureHtml}
                                onChange={(signatureHtml) => setForm((prev) => ({ ...prev, signatureHtml }))}
                                minHeight={150}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                variant="secondary"
                                icon={<ImageIcon size={13} />}
                                onClick={() => signatureFileRef.current?.click()}
                            >
                                {t('settings.mail.signatureUpload')}
                            </Button>
                            <p className="text-[11.5px] text-slate-400">{t('settings.mail.signaturePasteHint')}</p>
                        </div>
                        <input
                            ref={signatureFileRef}
                            type="file"
                            accept={SIGNATURE_IMAGE_TYPES.join(',')}
                            className="hidden"
                            onChange={(event) => {
                                void addSignatureImage(event.target.files?.[0]);
                                // Aynı dosya tekrar seçilirse change yine tetiklensin.
                                event.target.value = '';
                            }}
                        />
                    </div>
                </Card>

                <Card
                    title={t('auto.test_maili')}
                    icon={<Send size={14} />}
                    className="xl:col-span-3"
                    actions={<Button variant="secondary" icon={testSent ? <CheckCircle2 size={13} /> : <Send size={13} />} loading={testLoading} onClick={sendTest}>{testSent ?t('auto.gonderildi') :t('auto.test_gonder')}</Button>}
                >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <p className="text-[11.5px] text-slate-500 md:col-span-2">{t('settings.mail.testHint')}</p>
                        <Field label={t('auto.alici')}><Input value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} /></Field>
                        <Field label={t('auto.konu')}><Input value={test.subject} onChange={(e) => setTest({ ...test, subject: e.target.value })} /></Field>
                        <Field label={t('auto.mesaj')} className="md:col-span-2"><Textarea value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} /></Field>
                    </div>
                </Card>
            </div>
        </div>
    );
};
