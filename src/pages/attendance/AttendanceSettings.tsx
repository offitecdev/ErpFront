import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save01 as Save } from '@/components/icons/antIconCompat';
import { apiClient } from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';

export const AttendanceSettings: React.FC = () => {
    const { t } = useTranslation();
    const user = useAuthStore((s) => s.user);
    const [form, setForm] = useState({ checkInQrSecret: '', checkOutQrSecret: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        apiClient.get('/attendance/work-schedule')
            .then(() => {
                if (!cancelled) setForm({ checkInQrSecret: '', checkOutQrSecret: '' });
            })
            .catch(() => {
                if (!cancelled) toast.error(t('attendance.settings.errorLoad'));
            });
        return () => { cancelled = true; };
    }, [t]);

    const save = async () => {
        if (!user?.tenantId) {
            toast.error(t('attendance.settings.errorNoTenant'));
            return;
        }
        setLoading(true);
        try {
            const body: Record<string, unknown> = { workScheduleJson: {} };
            if (form.checkInQrSecret.trim()) body.checkInQrSecret = form.checkInQrSecret.trim();
            if (form.checkOutQrSecret.trim()) body.checkOutQrSecret = form.checkOutQrSecret.trim();
            await apiClient.patch(`/tenants/${user.tenantId}`, body);
            setForm({ checkInQrSecret: '', checkOutQrSecret: '' });
            toast.success(t('attendance.settings.successSave'));
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('attendance.settings.errorSave'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[820px]">
            <PageHeader
                breadcrumb={t('attendance.breadcrumb')}
                title={t('attendance.settings.title')}
                description={t('attendance.settings.description')}
            />

            <Card title={t('attendance.settings.cardTitle')}>
                <div className="space-y-3">
                    <Field label={t('attendance.settings.checkInQr')} hint={t('attendance.settings.checkInQrHint')}>
                        <Input
                            type="password"
                            autoComplete="off"
                            value={form.checkInQrSecret}
                            onChange={(e) => setForm({ ...form, checkInQrSecret: e.target.value })}
                            placeholder={t('attendance.settings.placeholder')}
                        />
                    </Field>
                    <Field label={t('attendance.settings.checkOutQr')} hint={t('attendance.settings.checkOutQrHint')}>
                        <Input
                            type="password"
                            autoComplete="off"
                            value={form.checkOutQrSecret}
                            onChange={(e) => setForm({ ...form, checkOutQrSecret: e.target.value })}
                            placeholder={t('attendance.settings.placeholder')}
                        />
                    </Field>
                    <Button variant="primary" icon={<Save size={13} />} loading={loading} onClick={save}>
                        {t('attendance.settings.save')}
                    </Button>
                </div>
            </Card>
        </div>
    );
};
