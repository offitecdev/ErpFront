import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    AlertTriangle,
    Building02 as Building2,
    CalendarCheck01 as CalendarClock,
    Edit01 as Edit,
    File05 as FileText,
    FilterLines,
    Plus,
    RefreshCcw01 as RefreshCw,
    Save01 as Save,
    SearchLg as Search,
    Trash01 as Trash,
    Truck01 as Truck,
    UploadCloud02 as UploadCloud,
    X as XIcon,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { apiClient } from '../../lib/axios';
import { projectApi } from '../../lib/api/project';
import { logisticsApi } from '../../lib/api/logistics';
import type { ProjectDto } from '../../types/project';
import type { ShipmentDto, ShipmentInput, ShipmentStatus } from '../../types/logistics';

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

const STATUS_VARIANT: Record<ShipmentStatus, 'active' | 'warning' | 'danger' | 'passive'> = {
    UNPAID: 'warning',
    PAID: 'active',
    DELAYED: 'danger',
    CANCELLED: 'passive',
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

const normalizeDate = (value?: string | null) => value ? dayjs(value).format('YYYY-MM-DD') : '';

const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

export const Shipments = () => {
    const navigate = useNavigate();
    const [shipments, setShipments] = useState<ShipmentDto[]>([]);
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<ShipmentStatus | ''>('');
    const [etaFilter, setEtaFilter] = useState<'ALL' | 'WARNING' | 'UPCOMING'>('ALL');
    const [invoiceFilter, setInvoiceFilter] = useState<'ALL' | 'WITH' | 'WITHOUT'>('ALL');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<ShipmentDto | null>(null);
    const [form, setForm] = useState<Partial<ShipmentInput>>(emptyForm);

    const loadShipments = async (next: { status: ShipmentStatus | ''; search: string } = { status, search }) => {
        setLoading(true);
        try {
            setShipments(await logisticsApi.list(next));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.sevkiyat_kayitlari_yuklenemedi'));
        } finally {
            setLoading(false);
        }
    };

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

    useEffect(() => {
        void loadShipments();
        void loadLookups();
    }, []);

    const stats = useMemo(() => {
        const delayed = shipments.filter((s) => s.status === 'DELAYED' || s.etaWarning).length;
        const paid = shipments.filter((s) => s.status === 'PAID').length;
        const unpaid = shipments.filter((s) => s.status === 'UNPAID').length;
        const withInvoice = shipments.filter((s) => Boolean(s.invoiceUrl)).length;
        return { delayed, paid, unpaid, withInvoice };
    }, [shipments]);

    const visibleShipments = useMemo(() => {
        return shipments.filter((shipment) => {
            if (etaFilter === 'WARNING' && !shipment.etaWarning) return false;
            if (etaFilter === 'UPCOMING' && (!shipment.eta || Boolean(shipment.etaWarning))) return false;
            if (invoiceFilter === 'WITH' && !shipment.invoiceUrl) return false;
            if (invoiceFilter === 'WITHOUT' && shipment.invoiceUrl) return false;
            return true;
        });
    }, [etaFilter, invoiceFilter, shipments]);

    const openCreate = () => {
        navigate('/logistics/shipments/new');
    };

    const openEdit = (shipment: ShipmentDto) => {
        setEditing(shipment);
        setForm({
            ...shipment,
            projectId: shipment.projectId || '',
            shipmentDate: normalizeDate(shipment.shipmentDate),
            eta: normalizeDate(shipment.eta),
        });
        setModalOpen(true);
    };

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
            if (editing) {
                await logisticsApi.update(editing.id, payload());
                toast.success(t('auto.sevkiyat_karti_guncellendi'));
            } else {
                await logisticsApi.create(payload());
                toast.success(t('auto.sevkiyat_karti_olusturuldu'));
            }
            setModalOpen(false);
            await loadShipments();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.sevkiyat_kaydedilemedi'));
        } finally {
            setSubmitting(false);
        }
    };

    const runDelayedCheck = async () => {
        try {
            const result = await logisticsApi.checkDelayed();
            toast.success(result.detail || result.message ||t('auto.eta_kontrolu_tamamlandi'));
            await loadShipments();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.eta_kontrolu_calistirilamadi'));
        }
    };

    const clearFilters = () => {
        setSearch('');
        setStatus('');
        setEtaFilter('ALL');
        setInvoiceFilter('ALL');
        void loadShipments({ status: '', search: '' });
    };

    const remove = async (shipment: ShipmentDto) => {
        if (!window.confirm(`${shipment.foNumber || shipment.cmrNumber || shipment.id} kaydi silinsin mi?`)) return;
        try {
            await logisticsApi.delete(shipment.id);
            toast.success(t('auto.sevkiyat_kaydi_silindi'));
            await loadShipments();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.sevkiyat_silinemedi'));
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Lojistik"
                title={t('nav.shipments')}
                description={t('auto.fo_cmr_aw_belgeleri_yuk_bilgileri_eta_uyarilari_')}
                actions={
                    <>
                        <Button variant="secondary" icon={<RefreshCw size={13} />} onClick={runDelayedCheck}>{t('auto.eta_kontrolu')}</Button>
                        <Button variant="primary" icon={<Plus size={13} />} onClick={openCreate}>{t('nav.newShipment')}</Button>
                    </>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('logistics.shipments.statusUnpaid')} value={stats.unpaid} icon={<FileText size={14} />} tone="warning" />
                <Stat label={t('logistics.shipments.statusPaid')} value={stats.paid} icon={<CalendarClock size={14} />} tone="success" />
                <Stat label={t('auto.eta_uyarisi')} value={stats.delayed} icon={<AlertTriangle size={14} />} tone="danger" />
                <Stat label={t('auto.faturali')} value={stats.withInvoice} icon={<UploadCloud size={14} />} tone="brand" />
            </div>

            <Card
                title={t('auto.lojistik_operasyonlari')}
                icon={<Truck size={14} />}
                noPadding
            >
                <form
                    className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-slate-100 px-3 py-3 [scrollbar-width:thin]"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void loadShipments();
                    }}
                >
                    <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                        <FilterLines size={16} />
                    </div>
                    <div className="relative shrink-0">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('auto.fo_cmr_aw_firma_ara')}
                            className="w-[230px] pl-8"
                        />
                    </div>
                    <div className="w-[145px] shrink-0">
                        <Select value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus | '')}>
                            <option value="">{t('auto.tum_durumlar')}</option>
                            {Object.entries(STATUS_LABEL).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="w-[125px] shrink-0">
                        <Select value={etaFilter} onChange={(e) => setEtaFilter(e.target.value as typeof etaFilter)}>
                            <option value="ALL">{t('auto.tum_eta')}</option>
                            <option value="WARNING">{t('auto.eta_uyarisi')}</option>
                            <option value="UPCOMING">{t('auto.yaklasan_eta')}</option>
                        </Select>
                    </div>
                    <div className="w-[135px] shrink-0">
                        <Select value={invoiceFilter} onChange={(e) => setInvoiceFilter(e.target.value as typeof invoiceFilter)}>
                            <option value="ALL">{t('auto.tum_faturalar')}</option>
                            <option value="WITH">{t('auto.faturali')}</option>
                            <option value="WITHOUT">{t('auto.faturasiz')}</option>
                        </Select>
                    </div>
                    <Button type="submit" variant="secondary" size="sm" className="shrink-0">{t('auto.uygula')}</Button>
                    <Button type="button" variant="ghost" size="sm" icon={<XIcon size={13} />} onClick={clearFilters} className="shrink-0">{t('common.clear')}</Button>
                </form>
                {loading ? (
                    <div className="px-6 py-10 animate-pulse space-y-3">
                        {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-md bg-slate-50 border border-slate-100" />)}
                    </div>
                ) : visibleShipments.length === 0 ? (
                    <EmptyState
                        icon={<Truck size={32} />}
                        title={t('auto.sevkiyat_kaydi_yok')}
                        description={t('auto.filtreleri_degistirin_veya_ilk_fo_cmr_aw_kaydini')}
                        action={<Button variant="primary" icon={<Plus size={13} />} onClick={openCreate}>{t('auto.sevkiyat_ekle')}</Button>}
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">{t('auto.belge')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{"Cari / Proje"}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('auto.yuk')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('auto.tarihler')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('auto.fatura')}</th>
                                    <th className="px-3 py-2 text-left font-semibold">{t('common.status')}</th>
                                    <th className="px-3 py-2 text-right font-semibold">{t('auto.islem')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleShipments.map((shipment) => (
                                    <tr key={shipment.id} className={shipment.etaWarning ? 'bg-rose-50/35' : 'hover:bg-slate-50/70'}>
                                        <td className="px-3 py-2 font-mono text-[11.5px] text-slate-700">
                                            <div>FO: {shipment.foNumber || '-'}</div>
                                            <div className="text-slate-500">CMR: {shipment.cmrNumber || '-'}</div>
                                            <div className="text-slate-500">AW: {shipment.awNumber || '-'}</div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-1.5 font-medium text-slate-800">
                                                <Building2 size={12} className="text-slate-400" />
                                                {shipment.customer?.companyName || shipment.customerId}
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-slate-500">{shipment.project?.projectName || '-'}</div>
                                            <div className="text-[11px] text-slate-400">{shipment.carrierCompany || '-'}</div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="max-w-[220px] truncate font-medium text-slate-800">{shipment.productDescription || '-'}</div>
                                            <div className="text-[11px] text-slate-500">
                                                {shipment.quantity ?? '-'} {shipment.unit || ''}{"- Brut"}{shipment.grossWeight ?? '-'}{t('auto.kg')}</div>
                                            <div className="text-[11px] text-slate-400">{shipment.dimensions || '-'}</div>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600">
                                            <div>{t('auto.sevk')}{shipment.shipmentDate ? dayjs(shipment.shipmentDate).format('DD.MM.YYYY') : '-'}</div>
                                            <div className={shipment.etaWarning ?"mt-0.5 flex items-center gap-1 font-semibold text-rose-700" :"mt-0.5 text-slate-500"}>
                                                {shipment.etaWarning && <AlertTriangle size={12} />}
                                                ETA: {shipment.eta ? dayjs(shipment.eta).format('DD.MM.YYYY') : '-'}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            {shipment.invoiceUrl ? (
                                                <a href={shipment.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-blue-700 hover:bg-blue-50">
                                                    <FileText size={12} />{t('auto.ac')}</a>
                                            ) : (
                                                <span className="text-slate-300">{t('auto.yok')}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            <StatusChip variant={STATUS_VARIANT[shipment.status]}>{STATUS_LABEL[shipment.status]}</StatusChip>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="inline-flex items-center gap-1">
                                                <button type="button" onClick={() => openEdit(shipment)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title={t('auto.duzenle')}>
                                                    <Edit size={14} />
                                                </button>
                                                <button type="button" onClick={() => remove(shipment)} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title={t('common.delete')}>
                                                    <Trash size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ?t('auto.sevkiyat_kartini_duzenle') :t('auto.yeni_sevkiyat_karti')}
                description={t('auto.cari_secimi_zorunludur_fo_cmr_ve_aw_numaralari_s')}
                width="xl"
                footer={
                    <>
                        <Button type="button" variant="secondary" icon={<XIcon size={13} />} onClick={() => setModalOpen(false)}>{t('auto.iptal')}</Button>
                        <Button type="submit" form="shipment-form" variant="primary" loading={submitting} icon={<Save size={13} />}>{t('common.save')}</Button>
                    </>
                }
            >
                <ShipmentForm
                    form={form}
                    customers={customers}
                    projects={projects}
                    onChange={setForm}
                    onSubmit={submit}
                    onFile={handleFile}
                />
            </Modal>
        </div>
    );
};

const ShipmentForm = ({
    form,
    customers,
    projects,
    onChange,
    onSubmit,
    onFile,
}: {
    form: Partial<ShipmentInput>;
    customers: CustomerOption[];
    projects: ProjectDto[];
    onChange: React.Dispatch<React.SetStateAction<Partial<ShipmentInput>>>;
    onSubmit: (event: React.FormEvent) => void;
    onFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) => (
    <form id="shipment-form" onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <Field label={t('auto.cari')} required className="md:col-span-3">
            <Select value={form.customerId || ''} onChange={(e) => onChange((p) => ({ ...p, customerId: e.target.value }))}>
                <option value="">{t('auto.cari_seciniz')}</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
            </Select>
        </Field>
        <Field label={t('nav.projects')} className="md:col-span-3">
            <Select value={form.projectId || ''} onChange={(e) => onChange((p) => ({ ...p, projectId: e.target.value }))}>
                <option value="">{t('auto.proje_yok')}</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}
            </Select>
        </Field>

        <Field label={t('auto.fo_no')} className="md:col-span-2">
            <Input value={form.foNumber || ''} onChange={(e) => onChange((p) => ({ ...p, foNumber: e.target.value }))} />
        </Field>
        <Field label={t('auto.cmr_no')} className="md:col-span-2">
            <Input value={form.cmrNumber || ''} onChange={(e) => onChange((p) => ({ ...p, cmrNumber: e.target.value }))} />
        </Field>
        <Field label={t('auto.aw_no')} className="md:col-span-2">
            <Input value={form.awNumber || ''} onChange={(e) => onChange((p) => ({ ...p, awNumber: e.target.value }))} />
        </Field>
        <Field label={t('auto.lojistik_firma')} className="md:col-span-3">
            <Input value={form.carrierCompany || ''} onChange={(e) => onChange((p) => ({ ...p, carrierCompany: e.target.value }))} />
        </Field>
        <Field label={t('common.status')} className="md:col-span-3">
            <Select value={form.status || 'UNPAID'} onChange={(e) => onChange((p) => ({ ...p, status: e.target.value as ShipmentStatus }))}>
                {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
        </Field>

        <Field label= "Urun / Aciklama" className="md:col-span-6">
            <Textarea rows={3} value={form.productDescription || ''} onChange={(e) => onChange((p) => ({ ...p, productDescription: e.target.value }))} />
        </Field>
        <Field label={t('common.quantity')} className="md:col-span-2">
            <Input type="number" value={form.quantity ?? ''} onChange={(e) => onChange((p) => ({ ...p, quantity: numberOrNull(e.target.value) }))} />
        </Field>
        <Field label={t('auto.birim')} className="md:col-span-2">
            <Select value={form.unit || ''} onChange={(e) => onChange((p) => ({ ...p, unit: e.target.value }))}>
                <option value="adet">{t('auto.adet')}</option>
                <option value="kg">{t('auto.kg')}</option>
                <option value="palet">{t('auto.palet')}</option>
                <option value="koli">{t('auto.koli')}</option>
                <option value="m3">{t('auto.m3')}</option>
            </Select>
        </Field>
        <Field label={t('auto.olculer_l_x_w_x_h')} className="md:col-span-2">
            <Input value={form.dimensions || ''} onChange={(e) => onChange((p) => ({ ...p, dimensions: e.target.value }))} placeholder={t('auto.120_x_80_x_60')} />
        </Field>
        <Field label={t('auto.brut_agirlik_kg')} className="md:col-span-3">
            <Input type="number" value={form.grossWeight ?? ''} onChange={(e) => onChange((p) => ({ ...p, grossWeight: numberOrNull(e.target.value) }))} />
        </Field>
        <Field label={t('auto.net_agirlik_kg')} className="md:col-span-3">
            <Input type="number" value={form.netWeight ?? ''} onChange={(e) => onChange((p) => ({ ...p, netWeight: numberOrNull(e.target.value) }))} />
        </Field>
        <Field label={t('auto.sevk_tarihi')} className="md:col-span-3">
            <Input type="date" value={form.shipmentDate || ''} onChange={(e) => onChange((p) => ({ ...p, shipmentDate: e.target.value }))} />
        </Field>
        <Field label="ETA" className="md:col-span-3">
            <Input type="date" value={form.eta || ''} onChange={(e) => onChange((p) => ({ ...p, eta: e.target.value }))} />
        </Field>
        <Field label={t('auto.ek_aciklama')} className="md:col-span-6">
            <Textarea rows={3} value={form.extraNotes || ''} onChange={(e) => onChange((p) => ({ ...p, extraNotes: e.target.value }))} />
        </Field>

        <div className="md:col-span-6 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label={t('auto.fatura')}>
                    <Input type="file" accept="application/pdf,image/*" onChange={onFile} />
                </Field>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={form.autoMarkDelayed || false} onChange={(e) => onChange((p) => ({ ...p, autoMarkDelayed: e.target.checked }))} />{t('auto.eta_gecerse_otomatik_geciktir')}</label>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={form.requireInvoiceForPaid !== false} onChange={(e) => onChange((p) => ({ ...p, requireInvoiceForPaid: e.target.checked }))} />{t('auto.odendi_icin_fatura_zorunlu')}</label>
            </div>
            {form.invoiceUrl && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-medium text-emerald-700">
                    <FileText size={12} />{t('auto.fatura_eklendi')}</div>
            )}
        </div>
    </form>
);

type StatTone = 'brand' | 'success' | 'warning' | 'danger';

const statClass: Record<StatTone, string> = {
    brand:"border-blue-200 bg-blue-50/70 text-blue-900",
    success:"border-emerald-200 bg-emerald-50/70 text-emerald-900",
    warning:"border-amber-200 bg-amber-50/70 text-amber-950",
    danger:"border-rose-200 bg-rose-50/70 text-rose-900",
};

const Stat = ({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: StatTone }) => (
    <div className={`rounded-lg border px-4 py-3 shadow-xs ${statClass[tone]}`}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal opacity-80">
            {icon}
            {label}
        </div>
        <div className="mt-1 text-[21px] font-semibold">{value}</div>
    </div>
);
