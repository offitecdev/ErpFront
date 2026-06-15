import { useEffect, useState } from 'react';
import { CheckCircle as CheckCircle2, Mail01 as Mail, Send01 as Send } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { Field, Input, Textarea } from '../../components/ui-shared/Field';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { mailApi } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';

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
    });
    const [test, setTest] = useState({
        to: user?.email || '',
        subject:t('settings.mail.testSubject'),
        text:t('settings.mail.testSuccessMsg'),
    });
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [testSent, setTestSent] = useState(false);

    useEffect(() => {
        mailApi.getSettings().then((settings) => {
            setForm({
                fromName: settings.fromName ||t('auto.offitec_erp'),
                fromEmail: settings.fromEmail || user?.email || '',
                replyTo: settings.replyTo || '',
                smtpHost: settings.smtpHost || '',
                smtpPort: settings.smtpPort || 587,
                smtpSecure: Boolean(settings.smtpSecure),
                smtpUser: settings.smtpUser || '',
                smtpPassword: '',
            });
        }).catch(() => undefined);
    }, [user?.email]);

    const save = async () => {
        setLoading(true);
        setSaved(false);
        try {
            await mailApi.saveSettings(form);
            setSaved(true);
            toast.success(t('settings.mail.saveSuccessMsg'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('settings.mail.errorSave'));
        } finally {
            setLoading(false);
        }
    };

    const sendTest = async () => {
        setTestLoading(true);
        setTestSent(false);
        try {
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
                breadcrumb="Ayarlar"
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
                        <Field label={t('iam.roles.colUsers')}><Input value={form.smtpUser} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} /></Field>
                        <Field label={t('auth.password')} hint={t('auto.bos_birakirsaniz_mevcut_sifre_korunur')}><Input type="password" value={form.smtpPassword} onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })} /></Field>
                        <Checkbox
                            label= "SSL/TLS kullan"
                            hint={t('auto.smtp_sunucunuz_guvenli_baglanti_istiyorsa_acin')}
                            size="sm"
                            isSelected={form.smtpSecure}
                            onChange={(checked) => setForm({ ...form, smtpSecure: checked })}
                            className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
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
                        <Field label={t('auto.alici')}><Input value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} /></Field>
                        <Field label={t('auto.konu')}><Input value={test.subject} onChange={(e) => setTest({ ...test, subject: e.target.value })} /></Field>
                        <Field label={t('auto.mesaj')} className="md:col-span-2"><Textarea value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} /></Field>
                    </div>
                </Card>
            </div>
        </div>
    );
};
