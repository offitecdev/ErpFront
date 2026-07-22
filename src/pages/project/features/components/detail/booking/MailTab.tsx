import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CheckCircle as CheckCircle2, Mail01 as Mail, Send01 as Send } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Card } from '@/components/ui-shared/Card';
import { Field, Input, Textarea } from '@/components/ui-shared/Field';
import { projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { MailSettingDto, ProjectDto, ProjectSalesOrder } from '@/types/project';

import { orderPayloadId } from '../../../utils/projectOrderScope';

// Booking-mail composer: sends the customer the self-service slot picker mail.
export const MailTab = ({ project, order, settings, userEmail }: { project: ProjectDto; order: ProjectSalesOrder | null; settings: MailSettingDto | null; userEmail: string }) => {
    const [form, setForm] = useState({
        fromName: settings?.fromName || t('auto.offitec_erp'),
        fromEmail: settings?.fromEmail || userEmail,
        to: project.customer?.mainEmail || '',
        subject: `${order?.orderNumber || project.projectName} - Montaj randevusu`,
        message: t('auto.lutfen_size_uygun_montaj_saatini_secin'),
    });
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        setSent(false);
        setForm({
            fromName: settings?.fromName || t('auto.offitec_erp'),
            fromEmail: settings?.fromEmail || userEmail,
            to: project.customer?.mainEmail || '',
            subject: `${order?.orderNumber || project.projectName} - Montaj randevusu`,
            message: t('auto.lutfen_size_uygun_montaj_saatini_secin'),
        });
    }, [project.id, order?.id, settings, userEmail]);

    return (
        <div>
            <Card title={t('auto.randevu_maili')} icon={<Mail size={13} />}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label={t('settings.mail.senderName')}><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                    <Field label={t('settings.mail.senderEmail')}><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                    <Field label={t('auto.alici')}><Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
                    <Field label={t('auto.konu')}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                    <Field label={t('auto.mesaj')} className="md:col-span-2"><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                </div>
                <Button
                    className="mt-3"
                    variant="primary"
                    icon={sent ? <CheckCircle2 size={13} /> : <Send size={13} />}
                    loading={loading}
                    disabled={sent}
                    onClick={async () => {
                        setLoading(true);
                        try {
                            const res = await projectApi.sendBookingMail(project.id, { ...form, salesOrderId: orderPayloadId(order) });
                            setSent(true);
                            toast.success(res.message || t('auto.mail_hazirlandi'));
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || t('auto.mail_gonderilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {sent ? t('auto.gonderildi') : t('common.send')}
                </Button>
            </Card>
        </div>
    );
};
