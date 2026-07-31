import { useEffect, useRef, useState } from 'react';
import {
    CheckCircle as CheckCircle2,
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
import { useAuthStore } from '../../store/authStore';
import { SignatureEditor } from './SignatureEditor';
import { SIGNATURE_IMAGE_TYPES, SIGNATURE_IMAGE_MAX_BYTES, signatureFileToDataUrl } from './signatureImage';

import { t } from '@/i18n/translate';

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
        signatureHtml: '',
        signatureImage: '',
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

    useEffect(() => {
        mailApi.getSettings().then((settings) => {
            setHasPassword(Boolean(settings.hasPassword));
            setClearPassword(false);
            setForm({
                fromName: settings.fromName ||t('auto.offitec_erp'),
                fromEmail: settings.fromEmail || user?.email || '',
                replyTo: settings.replyTo || '',
                smtpHost: settings.smtpHost || '',
                smtpPort: settings.smtpPort || 587,
                smtpSecure: Boolean(settings.smtpSecure),
                smtpUser: settings.smtpUser || '',
                smtpPassword: '',
                // Eski ayrı "imza görseli" alanı editöre satır içi görsel olarak
                // taşınır; bir sonraki kayıtta her şey tek HTML'de birleşir.
                signatureHtml: `${settings.signatureHtml || ''}${
                    settings.signatureImage
                        ? `<div><img src="${settings.signatureImage}" style="max-width:420px;height:auto" /></div>`
                        : ''
                }`,
                signatureImage: '',
            });
        }).catch(() => undefined);
    }, [user?.email]);

    /** Formu kaydeder. Şifre alanı boşsa anahtar hiç gönderilmez (sunucu
        mevcut şifreyi korur); "sil" seçildiyse açıkça null gider. */
    const persist = async () => {
        const typedPassword = form.smtpPassword.trim();
        const settings = await mailApi.saveSettings({
            ...form,
            smtpPassword: typedPassword ? form.smtpPassword : clearPassword ? null : undefined,
        });
        setHasPassword(Boolean(settings?.hasPassword));
        setClearPassword(false);
        setForm((prev) => ({ ...prev, smtpPassword: '' }));
        return settings;
    };

    const save = async () => {
        setLoading(true);
        setSaved(false);
        try {
            await persist();
            setSaved(true);
            toast.success(t('settings.mail.saveSuccessMsg'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('settings.mail.errorSave'));
        } finally {
            setLoading(false);
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
            toast.success(res.message ||t('settings.mail.testSuccess'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('settings.mail.errorTest'));
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
