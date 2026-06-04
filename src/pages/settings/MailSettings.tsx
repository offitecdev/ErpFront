import { useEffect, useState } from 'react';
import { CheckCircle as CheckCircle2, Mail01 as Mail, Send01 as Send } from '@untitledui/icons';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { Field, Input, Textarea } from '../../components/ui-shared/Field';
import { Checkbox } from '../../components/base/checkbox/checkbox';
import { mailApi } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';

export const MailSettings = () => {
    const { user } = useAuthStore();
    const [form, setForm] = useState({
        fromName: 'Offitec ERP',
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
        subject: 'Offitec ERP test maili',
        text: 'Mail ayarları çalışıyor.',
    });
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [saved, setSaved] = useState(false);
    const [testSent, setTestSent] = useState(false);

    useEffect(() => {
        mailApi.getSettings().then((settings) => {
            setForm({
                fromName: settings.fromName || 'Offitec ERP',
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
            toast.success('Mail ayarları kaydedildi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Mail ayarları kaydedilemedi.');
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
            toast.success(res.message || 'Mail gönderildi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Test maili gönderilemedi.');
        } finally {
            setTestLoading(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Ayarlar"
                title="Mail Ayarları"
                description="Varsayılan gönderici ve SMTP bilgilerini tanımlayın. Proje randevu mailinde alıcı ve gönderici yine elle değiştirilebilir."
                actions={<Button icon={saved ? <CheckCircle2 size={13} /> : <Mail size={13} />} loading={loading} onClick={save} className={saved ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>{saved ? 'Kaydedildi' : 'Kaydet'}</Button>}
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card title="Gönderici" className="xl:col-span-1">
                    <div className="space-y-3">
                        <Field label="Gönderici adı"><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                        <Field label="Gönderici e-posta"><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                        <Field label="Reply-To"><Input value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} /></Field>
                    </div>
                </Card>

                <Card title="SMTP" className="xl:col-span-2">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Host"><Input value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} placeholder="smtp.example.com" /></Field>
                        <Field label="Port"><Input type="number" value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) || 587 })} /></Field>
                        <Field label="Kullanıcı"><Input value={form.smtpUser} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} /></Field>
                        <Field label="Şifre" hint="Boş bırakırsanız mevcut şifre korunur."><Input type="password" value={form.smtpPassword} onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })} /></Field>
                        <Checkbox
                            label="SSL/TLS kullan"
                            hint="SMTP sunucunuz güvenli bağlantı istiyorsa açın."
                            size="sm"
                            isSelected={form.smtpSecure}
                            onChange={(checked) => setForm({ ...form, smtpSecure: checked })}
                            className="rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                        />
                    </div>
                </Card>

                <Card
                    title="Test Maili"
                    icon={<Send size={14} />}
                    className="xl:col-span-3"
                    actions={<Button variant="secondary" icon={testSent ? <CheckCircle2 size={13} /> : <Send size={13} />} loading={testLoading} onClick={sendTest}>{testSent ? 'Gönderildi' : 'Test Gönder'}</Button>}
                >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Alıcı"><Input value={test.to} onChange={(e) => setTest({ ...test, to: e.target.value })} /></Field>
                        <Field label="Konu"><Input value={test.subject} onChange={(e) => setTest({ ...test, subject: e.target.value })} /></Field>
                        <Field label="Mesaj" className="md:col-span-2"><Textarea value={test.text} onChange={(e) => setTest({ ...test, text: e.target.value })} /></Field>
                    </div>
                </Card>
            </div>
        </div>
    );
};
