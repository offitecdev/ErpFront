import { useEffect, useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowLeft,
    CalendarCheck01 as CalendarClock,
    Package,
    Save01 as Save,
    Truck01 as Truck,
    UploadCloud02 as UploadCloud,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { apiClient } from '../../lib/axios';
import { projectApi } from '../../lib/api/project';
import { logisticsApi } from '../../lib/api/logistics';
import type { ProjectDto } from '../../types/project';
import type { ShipmentInput, ShipmentStatus } from '../../types/logistics';

import { t } from '@/i18n/translate';

interface CustomerOption {
    id: string;
    companyName: string;
}

const STATUS_LABEL: Record<ShipmentStatus, string> = {
    UNPAID:t('logistics.shipments.statusUnpaid'),
    PAID:t('logistics.shipments.statusPaid'),
    DELAYED:t('logistics.shipments.statusLate'),
    CANCELLED:t('logistics.shipments.statusCancelled'),
};

const emptyForm: Partial<ShipmentInput> = {
    customerId: '',
    projectId: '',
    foNumber: '',
    cmrNumber: '',
    awNumber: '',
    carrierCompany: '',
    productDescription: '',
    quantity: null,
    unit: 'adet',
    grossWeight: null,
    netWeight: null,
    dimensions: '',
    extraNotes: '',
    shipmentDate: '',
    eta: '',
    status: 'UNPAID',
    invoiceUrl: '',
    autoMarkDelayed: false,
    requireInvoiceForPaid: true,
};

const numberOrNull = (value: unknown) => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

export const ShipmentCreate = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [form, setForm] = useState<Partial<ShipmentInput>>(emptyForm);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const loadLookups = async () => {
            try {
                const [customerRes, projectRows] = await Promise.all([
                    apiClient.get('/customers?page=1&pageSize=200'),
                    projectApi.list().catch(() => []),
                ]);
                const customerRows = Array.isArray(customerRes.data) ? customerRes.data : customerRes.data.items || [];
                setCustomers(customerRows.map((c: CustomerOption) => ({ id: c.id, companyName: c.companyName })));
                setProjects(projectRows);
            } catch {
                toast.error(t('auto.cari_veya_proje_listesi_yuklenemedi'));
            }
        };

        void loadLookups();
    }, []);

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error(t('auto.fatura_dosyasi_5_mb_altinda_olmalidir'));
            return;
        }
        try {
            const invoiceUrl = await readFileAsDataUrl(file);
            setForm((prev) => ({ ...prev, invoiceUrl }));
            toast.success(t('auto.fatura_forma_eklendi'));
        } catch {
            toast.error(t('auto.fatura_okunamadi'));
        }
    };

    const payload = (): Partial<ShipmentInput> => ({
        ...form,
        customerId: form.customerId || '',
        projectId: form.projectId || null,
        quantity: numberOrNull(form.quantity),
        grossWeight: numberOrNull(form.grossWeight),
        netWeight: numberOrNull(form.netWeight),
        shipmentDate: form.shipmentDate || null,
        eta: form.eta || null,
        foNumber: form.foNumber?.trim() || null,
        cmrNumber: form.cmrNumber?.trim() || null,
        awNumber: form.awNumber?.trim() || null,
        carrierCompany: form.carrierCompany?.trim() || null,
        productDescription: form.productDescription?.trim() || null,
        unit: form.unit?.trim() || null,
        dimensions: form.dimensions?.trim() || null,
        extraNotes: form.extraNotes?.trim() || null,
        invoiceUrl: form.invoiceUrl || null,
        autoMarkDelayed: Boolean(form.autoMarkDelayed),
        requireInvoiceForPaid: form.requireInvoiceForPaid !== false,
    });

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.customerId) {
            toast.error(t('auto.cari_secimi_zorunludur'));
            return;
        }
        try {
            setSubmitting(true);
            await logisticsApi.create(payload());
            toast.success(t('auto.sevkiyat_karti_olusturuldu'));
            navigate('/logistics/shipments');
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.sevkiyat_kaydedilemedi'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Lojistik › Yeni Sevkiyat"
                title={t('nav.newShipment')}
                description={t('auto.sevkiyat_kartini_genel_bilgi_yuk_tarih_ve_finans')}
                actions={
                    <>
                        <Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/logistics/shipments')}>{t('nav.shipments')}</Button>
                        <Button type="submit" form="shipment-create-form" variant="primary" loading={submitting} icon={<Save size={13} />}>{t('common.save')}</Button>
                    </>
                }
            />

            <form id="shipment-create-form" onSubmit={submit} className="space-y-4">
                <Card title={t('auto.genel_bilgiler')} icon={<Truck size={14} />}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                        <Field label={t('auto.cari')} required className="md:col-span-3">
                            <Select value={form.customerId || ''} onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))}>
                                <option value="">{t('auto.cari_seciniz')}</option>
                                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
                            </Select>
                        </Field>
                        <Field label={t('nav.projects')} className="md:col-span-3">
                            <Select value={form.projectId || ''} onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))}>
                                <option value="">{t('auto.proje_yok')}</option>
                                {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}
                            </Select>
                        </Field>
                        <Field label={t('auto.fo_no')} className="md:col-span-2">
                            <Input value={form.foNumber || ''} onChange={(e) => setForm((p) => ({ ...p, foNumber: e.target.value }))} />
                        </Field>
                        <Field label={t('auto.cmr_no')} className="md:col-span-2">
                            <Input value={form.cmrNumber || ''} onChange={(e) => setForm((p) => ({ ...p, cmrNumber: e.target.value }))} />
                        </Field>
                        <Field label={t('auto.aw_no')} className="md:col-span-2">
                            <Input value={form.awNumber || ''} onChange={(e) => setForm((p) => ({ ...p, awNumber: e.target.value }))} />
                        </Field>
                        <Field label={t('auto.lojistik_firma')} className="md:col-span-3">
                            <Input value={form.carrierCompany || ''} onChange={(e) => setForm((p) => ({ ...p, carrierCompany: e.target.value }))} />
                        </Field>
                        <Field label={t('common.status')} className="md:col-span-3">
                            <Select value={form.status || 'UNPAID'} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ShipmentStatus }))}>
                                {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </Select>
                        </Field>
                    </div>
                </Card>

                <Card title={t('auto.urun_ve_yuk_bilgileri')} icon={<Package size={14} />}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                        <Field label={t('auto.urun_aciklama')} className="md:col-span-6">
                            <Textarea rows={3} value={form.productDescription || ''} onChange={(e) => setForm((p) => ({ ...p, productDescription: e.target.value }))} />
                        </Field>
                        <Field label={t('common.quantity')} className="md:col-span-2">
                            <Input type="number" value={form.quantity ?? ''} onChange={(e) => setForm((p) => ({ ...p, quantity: numberOrNull(e.target.value) }))} />
                        </Field>
                        <Field label={t('auto.birim')} className="md:col-span-2">
                            <Select value={form.unit || ''} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}>
                                <option value="adet">{t('auto.adet')}</option>
                                <option value="kg">{t('auto.kg')}</option>
                                <option value="palet">{t('auto.palet')}</option>
                                <option value="koli">{t('auto.koli')}</option>
                                <option value="m3">{t('auto.m3')}</option>
                            </Select>
                        </Field>
                        <Field label={t('auto.olculer_l_x_w_x_h')} className="md:col-span-2">
                            <Input value={form.dimensions || ''} onChange={(e) => setForm((p) => ({ ...p, dimensions: e.target.value }))} placeholder={t('auto.120_x_80_x_60')} />
                        </Field>
                        <Field label={t('auto.brut_agirlik_kg')} className="md:col-span-3">
                            <Input type="number" value={form.grossWeight ?? ''} onChange={(e) => setForm((p) => ({ ...p, grossWeight: numberOrNull(e.target.value) }))} />
                        </Field>
                        <Field label={t('auto.net_agirlik_kg')} className="md:col-span-3">
                            <Input type="number" value={form.netWeight ?? ''} onChange={(e) => setForm((p) => ({ ...p, netWeight: numberOrNull(e.target.value) }))} />
                        </Field>
                        <Field label={t('auto.ek_aciklama')} className="md:col-span-6">
                            <Textarea rows={3} value={form.extraNotes || ''} onChange={(e) => setForm((p) => ({ ...p, extraNotes: e.target.value }))} />
                        </Field>
                    </div>
                </Card>

                <Card title={t('auto.tarih_fatura_ve_kontroller')} icon={<CalendarClock size={14} />}>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                        <Field label={t('auto.sevk_tarihi')} className="md:col-span-2">
                            <Input type="date" value={form.shipmentDate || ''} onChange={(e) => setForm((p) => ({ ...p, shipmentDate: e.target.value }))} />
                        </Field>
                        <Field label="ETA" className="md:col-span-2">
                            <Input type="date" value={form.eta || ''} onChange={(e) => setForm((p) => ({ ...p, eta: e.target.value }))} />
                        </Field>
                        <Field label={t('auto.fatura')} className="md:col-span-2">
                            <Input type="file" accept="application/pdf,image/*" onChange={handleFile} />
                        </Field>
                        <label className="md:col-span-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                            <input type="checkbox" checked={form.autoMarkDelayed || false} onChange={(e) => setForm((p) => ({ ...p, autoMarkDelayed: e.target.checked }))} />{t('auto.eta_gecerse_otomatik_geciktir')}</label>
                        <label className="md:col-span-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                            <input type="checkbox" checked={form.requireInvoiceForPaid !== false} onChange={(e) => setForm((p) => ({ ...p, requireInvoiceForPaid: e.target.checked }))} />{t('auto.odendi_icin_fatura_zorunlu')}</label>
                        {form.invoiceUrl && (
                            <div className="md:col-span-6 inline-flex w-fit items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-medium text-emerald-700">
                                <UploadCloud size={12} />{t('auto.fatura_eklendi')}</div>
                        )}
                    </div>
                </Card>
            </form>
        </div>
    );
};
