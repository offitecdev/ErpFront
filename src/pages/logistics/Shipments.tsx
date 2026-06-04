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
} from '@untitledui/icons';

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

interface CustomerOption {
    id: string;
    companyName: string;
}

const STATUS_LABEL: Record<ShipmentStatus, string> = {
    UNPAID: 'Ödenmedi',
    PAID: 'Ödendi',
    DELAYED: 'Gecikti',
    CANCELLED: 'İptal Edildi',
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
            toast.error(e.response?.data?.error || 'Sevkiyat kayitlari yuklenemedi.');
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
            toast.error('Cari veya proje listesi yuklenemedi.');
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
            toast.error('Fatura dosyasi 5 MB altinda olmalidir.');
            return;
        }
        try {
            const invoiceUrl = await readFileAsDataUrl(file);
            setForm((prev) => ({ ...prev, invoiceUrl }));
            toast.success('Fatura forma eklendi.');
        } catch {
            toast.error('Fatura okunamadi.');
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
            toast.error('Cari secimi zorunludur.');
            return;
        }
        try {
            setSubmitting(true);
            if (editing) {
                await logisticsApi.update(editing.id, payload());
                toast.success('Sevkiyat karti guncellendi.');
            } else {
                await logisticsApi.create(payload());
                toast.success('Sevkiyat karti olusturuldu.');
            }
            setModalOpen(false);
            await loadShipments();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Sevkiyat kaydedilemedi.');
        } finally {
            setSubmitting(false);
        }
    };

    const runDelayedCheck = async () => {
        try {
            const result = await logisticsApi.checkDelayed();
            toast.success(result.detail || result.message || 'ETA kontrolu tamamlandi.');
            await loadShipments();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'ETA kontrolu calistirilamadi.');
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
            toast.success('Sevkiyat kaydi silindi.');
            await loadShipments();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Sevkiyat silinemedi.');
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Lojistik"
                title="Sevkiyat Kartları"
                description="FO, CMR, AW belgeleri, yük bilgileri, ETA uyarıları ve fatura durumunu tek ekrandan yönetin."
                actions={
                    <>
                        <Button variant="secondary" icon={<RefreshCw size={13} />} onClick={runDelayedCheck}>
                            ETA Kontrolü
                        </Button>
                        <Button variant="primary" icon={<Plus size={13} />} onClick={openCreate}>
                            Yeni Sevkiyat
                        </Button>
                    </>
                }
            />

            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Ödenmedi" value={stats.unpaid} icon={<FileText size={14} />} tone="warning" />
                <Stat label="Ödendi" value={stats.paid} icon={<CalendarClock size={14} />} tone="success" />
                <Stat label="ETA Uyarısı" value={stats.delayed} icon={<AlertTriangle size={14} />} tone="danger" />
                <Stat label="Faturalı" value={stats.withInvoice} icon={<UploadCloud size={14} />} tone="brand" />
            </div>

            <Card
                title="Lojistik Operasyonları"
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
                            placeholder="FO, CMR, AW, firma ara"
                            className="w-[230px] pl-8"
                        />
                    </div>
                    <div className="w-[145px] shrink-0">
                        <Select value={status} onChange={(e) => setStatus(e.target.value as ShipmentStatus | '')}>
                            <option value="">Tüm durumlar</option>
                            {Object.entries(STATUS_LABEL).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </Select>
                    </div>
                    <div className="w-[125px] shrink-0">
                        <Select value={etaFilter} onChange={(e) => setEtaFilter(e.target.value as typeof etaFilter)}>
                            <option value="ALL">Tüm ETA</option>
                            <option value="WARNING">ETA uyarısı</option>
                            <option value="UPCOMING">Yaklaşan ETA</option>
                        </Select>
                    </div>
                    <div className="w-[135px] shrink-0">
                        <Select value={invoiceFilter} onChange={(e) => setInvoiceFilter(e.target.value as typeof invoiceFilter)}>
                            <option value="ALL">Tüm faturalar</option>
                            <option value="WITH">Faturalı</option>
                            <option value="WITHOUT">Faturasız</option>
                        </Select>
                    </div>
                    <Button type="submit" variant="secondary" size="sm" className="shrink-0">
                        Uygula
                    </Button>
                    <Button type="button" variant="ghost" size="sm" icon={<XIcon size={13} />} onClick={clearFilters} className="shrink-0">
                        Temizle
                    </Button>
                </form>
                {loading ? (
                    <div className="px-6 py-10 animate-pulse space-y-3">
                        {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-md bg-slate-50 border border-slate-100" />)}
                    </div>
                ) : visibleShipments.length === 0 ? (
                    <EmptyState
                        icon={<Truck size={32} />}
                        title="Sevkiyat kaydı yok"
                        description="Filtreleri değiştirin veya ilk FO/CMR/AW kaydını oluşturun."
                        action={<Button variant="primary" icon={<Plus size={13} />} onClick={openCreate}>Sevkiyat Ekle</Button>}
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[12.5px]">
                            <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Belge</th>
                                    <th className="px-3 py-2 text-left font-semibold">Cari / Proje</th>
                                    <th className="px-3 py-2 text-left font-semibold">Yuk</th>
                                    <th className="px-3 py-2 text-left font-semibold">Tarihler</th>
                                    <th className="px-3 py-2 text-left font-semibold">Fatura</th>
                                    <th className="px-3 py-2 text-left font-semibold">Durum</th>
                                    <th className="px-3 py-2 text-right font-semibold">Islem</th>
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
                                                {shipment.quantity ?? '-'} {shipment.unit || ''} - Brut {shipment.grossWeight ?? '-'} kg
                                            </div>
                                            <div className="text-[11px] text-slate-400">{shipment.dimensions || '-'}</div>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600">
                                            <div>Sevk: {shipment.shipmentDate ? dayjs(shipment.shipmentDate).format('DD.MM.YYYY') : '-'}</div>
                                            <div className={shipment.etaWarning ? 'mt-0.5 flex items-center gap-1 font-semibold text-rose-700' : 'mt-0.5 text-slate-500'}>
                                                {shipment.etaWarning && <AlertTriangle size={12} />}
                                                ETA: {shipment.eta ? dayjs(shipment.eta).format('DD.MM.YYYY') : '-'}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            {shipment.invoiceUrl ? (
                                                <a href={shipment.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-blue-700 hover:bg-blue-50">
                                                    <FileText size={12} /> Ac
                                                </a>
                                            ) : (
                                                <span className="text-slate-300">Yok</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            <StatusChip variant={STATUS_VARIANT[shipment.status]}>{STATUS_LABEL[shipment.status]}</StatusChip>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="inline-flex items-center gap-1">
                                                <button type="button" onClick={() => openEdit(shipment)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Duzenle">
                                                    <Edit size={14} />
                                                </button>
                                                <button type="button" onClick={() => remove(shipment)} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Sil">
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
                title={editing ? 'Sevkiyat Kartını Düzenle' : 'Yeni Sevkiyat Kartı'}
                description="Cari seçimi zorunludur; FO, CMR ve AW numaraları sistem genelinde benzersiz tutulur."
                width="xl"
                footer={
                    <>
                        <Button type="button" variant="secondary" icon={<XIcon size={13} />} onClick={() => setModalOpen(false)}>
                            Iptal
                        </Button>
                        <Button type="submit" form="shipment-form" variant="primary" loading={submitting} icon={<Save size={13} />}>
                            Kaydet
                        </Button>
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
        <Field label="Cari" required className="md:col-span-3">
            <Select value={form.customerId || ''} onChange={(e) => onChange((p) => ({ ...p, customerId: e.target.value }))}>
                <option value="">Cari seciniz</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName}</option>)}
            </Select>
        </Field>
        <Field label="Proje" className="md:col-span-3">
            <Select value={form.projectId || ''} onChange={(e) => onChange((p) => ({ ...p, projectId: e.target.value }))}>
                <option value="">Proje yok</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.projectName}</option>)}
            </Select>
        </Field>

        <Field label="FO No" className="md:col-span-2">
            <Input value={form.foNumber || ''} onChange={(e) => onChange((p) => ({ ...p, foNumber: e.target.value }))} />
        </Field>
        <Field label="CMR No" className="md:col-span-2">
            <Input value={form.cmrNumber || ''} onChange={(e) => onChange((p) => ({ ...p, cmrNumber: e.target.value }))} />
        </Field>
        <Field label="AW No" className="md:col-span-2">
            <Input value={form.awNumber || ''} onChange={(e) => onChange((p) => ({ ...p, awNumber: e.target.value }))} />
        </Field>
        <Field label="Lojistik Firma" className="md:col-span-3">
            <Input value={form.carrierCompany || ''} onChange={(e) => onChange((p) => ({ ...p, carrierCompany: e.target.value }))} />
        </Field>
        <Field label="Durum" className="md:col-span-3">
            <Select value={form.status || 'UNPAID'} onChange={(e) => onChange((p) => ({ ...p, status: e.target.value as ShipmentStatus }))}>
                {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
        </Field>

        <Field label="Urun / Aciklama" className="md:col-span-6">
            <Textarea rows={3} value={form.productDescription || ''} onChange={(e) => onChange((p) => ({ ...p, productDescription: e.target.value }))} />
        </Field>
        <Field label="Miktar" className="md:col-span-2">
            <Input type="number" value={form.quantity ?? ''} onChange={(e) => onChange((p) => ({ ...p, quantity: numberOrNull(e.target.value) }))} />
        </Field>
        <Field label="Birim" className="md:col-span-2">
            <Select value={form.unit || ''} onChange={(e) => onChange((p) => ({ ...p, unit: e.target.value }))}>
                <option value="adet">adet</option>
                <option value="kg">kg</option>
                <option value="palet">palet</option>
                <option value="koli">koli</option>
                <option value="m3">m3</option>
            </Select>
        </Field>
        <Field label="Olculer (L x W x H)" className="md:col-span-2">
            <Input value={form.dimensions || ''} onChange={(e) => onChange((p) => ({ ...p, dimensions: e.target.value }))} placeholder="120 x 80 x 60" />
        </Field>
        <Field label="Brut Agirlik (KG)" className="md:col-span-3">
            <Input type="number" value={form.grossWeight ?? ''} onChange={(e) => onChange((p) => ({ ...p, grossWeight: numberOrNull(e.target.value) }))} />
        </Field>
        <Field label="Net Agirlik (KG)" className="md:col-span-3">
            <Input type="number" value={form.netWeight ?? ''} onChange={(e) => onChange((p) => ({ ...p, netWeight: numberOrNull(e.target.value) }))} />
        </Field>
        <Field label="Sevk Tarihi" className="md:col-span-3">
            <Input type="date" value={form.shipmentDate || ''} onChange={(e) => onChange((p) => ({ ...p, shipmentDate: e.target.value }))} />
        </Field>
        <Field label="ETA" className="md:col-span-3">
            <Input type="date" value={form.eta || ''} onChange={(e) => onChange((p) => ({ ...p, eta: e.target.value }))} />
        </Field>
        <Field label="Ek Aciklama" className="md:col-span-6">
            <Textarea rows={3} value={form.extraNotes || ''} onChange={(e) => onChange((p) => ({ ...p, extraNotes: e.target.value }))} />
        </Field>

        <div className="md:col-span-6 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Fatura">
                    <Input type="file" accept="application/pdf,image/*" onChange={onFile} />
                </Field>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={form.autoMarkDelayed || false} onChange={(e) => onChange((p) => ({ ...p, autoMarkDelayed: e.target.checked }))} />
                    ETA gecerse otomatik geciktir
                </label>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={form.requireInvoiceForPaid !== false} onChange={(e) => onChange((p) => ({ ...p, requireInvoiceForPaid: e.target.checked }))} />
                    Odendi icin fatura zorunlu
                </label>
            </div>
            {form.invoiceUrl && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-medium text-emerald-700">
                    <FileText size={12} /> Fatura eklendi
                </div>
            )}
        </div>
    </form>
);

type StatTone = 'brand' | 'success' | 'warning' | 'danger';

const statClass: Record<StatTone, string> = {
    brand: 'border-blue-200 bg-blue-50/70 text-blue-900',
    success: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50/70 text-amber-950',
    danger: 'border-rose-200 bg-rose-50/70 text-rose-900',
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
