import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save01 as Save } from '@untitledui/icons';
import { apiClient } from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';

export const AttendanceSettings: React.FC = () => {
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
                if (!cancelled) toast.error('Ayarlar yüklenemedi.');
            });
        return () => { cancelled = true; };
    }, []);

    const save = async () => {
        if (!user?.tenantId) {
            toast.error('Tenant bilgisi yok.');
            return;
        }
        setLoading(true);
        try {
            const body: Record<string, unknown> = { workScheduleJson: {} };
            if (form.checkInQrSecret.trim()) body.checkInQrSecret = form.checkInQrSecret.trim();
            if (form.checkOutQrSecret.trim()) body.checkOutQrSecret = form.checkOutQrSecret.trim();
            await apiClient.patch(`/tenants/${user.tenantId}`, body);
            setForm({ checkInQrSecret: '', checkOutQrSecret: '' });
            toast.success('QR anahtarları kaydedildi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Kayıt başarısız.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[820px]">
            <PageHeader
                breadcrumb="Personel"
                title="Mesai & QR Yönetimi"
                description="İstasyon QR anahtarlarını yönetin. Boş bırakılan alanlar mevcut anahtarı değiştirmez."
            />

            <Card title="QR ayarları">
                <div className="space-y-3">
                    <Field label="İstasyon giriş QR metni" hint="İlk ve tekrar okutma bu anahtarla yapılır.">
                        <Input
                            type="password"
                            autoComplete="off"
                            value={form.checkInQrSecret}
                            onChange={(e) => setForm({ ...form, checkInQrSecret: e.target.value })}
                            placeholder="Değiştirmek için yazın (boş = dokunma)"
                        />
                    </Field>
                    <Field label="Çıkış QR metni" hint="Ayrı bir çıkış kodu kullanmak isterseniz.">
                        <Input
                            type="password"
                            autoComplete="off"
                            value={form.checkOutQrSecret}
                            onChange={(e) => setForm({ ...form, checkOutQrSecret: e.target.value })}
                            placeholder="Değiştirmek için yazın (boş = dokunma)"
                        />
                    </Field>
                    <Button variant="primary" icon={<Save size={13} />} loading={loading} onClick={save}>
                        Kaydet
                    </Button>
                </div>
            </Card>
        </div>
    );
};
