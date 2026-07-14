import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Building05 as Building,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Package,
    Plus,
    Save01 as Save,
    SearchLg as Search,
    X,
} from '@/components/icons/antIconCompat';
import { toast } from 'sonner';
import dayjs from 'dayjs';

import { StockModuleHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { inventoryApi } from '../../lib/api/inventory';
import type { SupplierRow } from '../../types/inventory';

import { t } from '@/i18n/translate';

const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

const number = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(value || 0);

export const Suppliers = () => {
    const navigate = useNavigate();
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ companyName: '', contactName: '', email: '', phone: '', address: '' });
    const [saving, setSaving] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 50;

    const load = async () => {
        setLoading(true);
        try {
            setSuppliers(await inventoryApi.listSuppliers());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return suppliers.filter((supplier) => {
            if (statusFilter === 'ACTIVE' && !supplier.isActive) return false;
            if (statusFilter === 'INACTIVE' && supplier.isActive) return false;
            if (!q) return true;
            return (
                supplier.companyName.toLowerCase().includes(q) ||
                (supplier.contactName || '').toLowerCase().includes(q) ||
                (supplier.email || '').toLowerCase().includes(q) ||
                (supplier.phone || '').toLowerCase().includes(q) ||
                (supplier.address || '').toLowerCase().includes(q)
            );
        });
    }, [search, statusFilter, suppliers]);

    useEffect(() => {
        setPage(1);
    }, [search, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = useMemo(
        () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
        [filtered, pageSafe],
    );
    const rangeFrom = filtered.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
    const rangeTo = Math.min(pageSafe * PAGE_SIZE, filtered.length);

    const create = async () => {
        if (!form.companyName.trim()) return toast.error(t('auto.tedarikci_sirket_adi_zorunludur'));
        setSaving(true);
        try {
            const supplier = await inventoryApi.createSupplier(form);
            setForm({ companyName: '', contactName: '', email: '', phone: '', address: '' });
            setAddOpen(false);
            await load();
            navigate(`/inventory/suppliers/${supplier.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.tedarikci_kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            {/* Aşağı doğru açılan "Yeni Tedarikçi" bölümü — liste her zaman görünür kalır. */}
            {addOpen && (
                <section className="mb-4 rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                        <Building size={13} />{t('auto.yeni_tedarikci')}</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Field label={t('auto.sirket_adi')} required><Input size="sm" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></Field>
                        <Field label="Yetkili"><Input size="sm" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
                        <Field label="E-posta"><Input size="sm" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="tedarikci@ornek.com" /></Field>
                        <Field label={t('common.phone')}><Input size="sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                        <Field label={t('common.address')}><Input size="sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                    </div>
                    <div className="mt-3 flex justify-end">
                        <Button size="sm" icon={<Save size={13} />} loading={saving} onClick={create}>{t('common.save')}</Button>
                    </div>
                </section>
            )}

            <Card className="border-0 rounded-none" noPadding>
                <div className="shrink-0 overflow-x-auto pb-2">
                    <div className="flex min-w-max w-full flex-nowrap items-center gap-3 px-3 py-2">
                        <div className="flex shrink-0 items-center gap-2 pr-1">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#272f67]">
                                <Building size={13} />
                            </span>
                            <h3 className="whitespace-nowrap text-[14px] font-semibold text-slate-900">{t('auto.genel_liste')}</h3>
                        </div>
                        <div className="flex shrink-0 flex-nowrap items-center gap-2">
                            <div className="relative shrink-0">
                                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={t('auto.ara_kod_ad_barkod')}
                                    className="h-8 w-[260px] rounded-lg border border-slate-200 bg-white py-1.5 pl-6 pr-7 text-[12px] transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        aria-label={t('common.clear')}
                                        title={t('common.clear')}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                            <div className="relative w-[148px] shrink-0">
                                <Select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                                >
                                    <option value="">{t('auto.tum_durumlar')}</option>
                                    <option value="ACTIVE">{t('common.active')}</option>
                                    <option value="INACTIVE">{t('common.inactive')}</option>
                                </Select>
                            </div>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-3">
                            <span className="font-mono text-[11.5px] text-slate-500">
                                {rangeFrom}-{rangeTo} / {filtered.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={pageSafe <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.back')}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="px-1 font-mono text-[11.5px] tabular-nums text-slate-500">{pageSafe} / {totalPages}</span>
                                <button
                                    type="button"
                                    disabled={pageSafe >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.next')}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                            <Button
                                variant="primary"
                                size="lg"
                                icon={addOpen ? <ChevronDown size={16} /> : <Plus size={16} />}
                                onClick={() => setAddOpen((o) => !o)}
                                className="!h-9 !px-4 !text-[13px] !font-semibold"
                            >
                                {t('auto.yeni_tedarikci')}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="bg-white">
                    <table className="min-w-[1220px] w-full table-fixed text-[12.5px]">
                        <colgroup>
                            <col style={{ width: 210 }} />
                            <col style={{ width: 150 }} />
                            <col style={{ width: 260 }} />
                            <col style={{ width: 92 }} />
                            <col style={{ width: 118 }} />
                            <col style={{ width: 130 }} />
                            <col style={{ width: 120 }} />
                            <col style={{ width: 112 }} />
                            <col style={{ width: 72 }} />
                        </colgroup>
                        <thead className="sticky top-0 z-10 whitespace-nowrap text-[10.5px] text-[#86868B] bg-slate-50 border-b border-slate-200 uppercase tracking-[0.08em] shadow-[0_1px_0_0_rgb(226_232_240)]">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.sirket')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('common.phone')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('common.address')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.urun')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.alim_adedi')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.alisveris')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.son_alim')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('common.status')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && <tr><td colSpan={9} className="px-4 py-6 text-center text-slate-400">{t('common.loading')}</td></tr>}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={9}>
                                        <EmptyState icon={<Building size={28} />} title={t('auto.tedarikci_yok')} description={t('auto.ilk_tedarikciyi_soldaki_formdan_ekleyin')} />
                                    </td>
                                </tr>
                            )}
                            {!loading && paged.map((supplier) => (
                                <tr key={supplier.id} className="cursor-pointer transition-colors hover:bg-slate-50/60" onClick={() => navigate(`/inventory/suppliers/${supplier.id}`)}>
                                    <td className="truncate px-3 py-2 font-semibold text-slate-900">{supplier.companyName}</td>
                                    <td className="truncate px-3 py-2 text-slate-600">{supplier.phone || '-'}</td>
                                    <td className="truncate px-3 py-2 text-slate-600">{supplier.address || '-'}</td>
                                    <td className="px-3 py-2 text-right font-mono">{supplier.articleCount || 0}</td>
                                    <td className="px-3 py-2 text-right font-mono">{number(supplier.totalPurchaseQuantity)}</td>
                                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{money(supplier.totalPurchaseAmount)}</td>
                                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{supplier.latestPurchaseDate ? dayjs(supplier.latestPurchaseDate).format('DD.MM.YYYY') : '-'}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <StatusChip variant={supplier.isActive ? 'active' : 'passive'}>
                                            {supplier.isActive ? t('common.active') : t('common.inactive')}
                                        </StatusChip>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <ChevronRight size={13} className="ml-auto text-slate-400" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export const SupplierDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [supplier, setSupplier] = useState<SupplierRow | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ companyName: '', contactName: '', email: '', phone: '', address: '', isActive: true });
    const [saving, setSaving] = useState(false);

    const load = async () => {
        if (!id) return;
        try {
            const data = await inventoryApi.getSupplier(id);
            setSupplier(data);
            setEditForm({
                companyName: data.companyName || '',
                contactName: data.contactName || '',
                email: data.email || '',
                phone: data.phone || '',
                address: data.address || '',
                isActive: data.isActive,
            });
        } catch {
            toast.error(t('auto.tedarikci_yuklenemedi'));
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const save = async () => {
        if (!id) return;
        if (!editForm.companyName.trim()) return toast.error(t('auto.tedarikci_sirket_adi_zorunludur'));
        setSaving(true);
        try {
            await inventoryApi.updateSupplier(id, editForm);
            toast.success('Tedarikçi güncellendi.');
            setEditOpen(false);
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Tedarikçi güncellenemedi.');
        } finally {
            setSaving(false);
        }
    };

    if (!supplier) return <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />;

    return (
        <div>
            <StockModuleHeader
                label={`Stock › Suppliers › ${supplier.companyName}`}
                actions={
                    <>
                        <Button variant="secondary" icon={<Save size={13} />} onClick={() => setEditOpen((o) => !o)}>Düzenle</Button>
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/inventory/suppliers')}>{t('auto.listeye_don')}</Button>
                    </>
                }
            />

            {/* İletişim bilgileri / düzenleme */}
            <section className="mb-4 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                        <Building size={13} /> İletişim Bilgileri
                    </div>
                    {editOpen && (
                        <button type="button" onClick={() => { setEditOpen(false); void load(); }} className="text-slate-400 hover:text-slate-600" aria-label={t('common.clear')}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                {editOpen ? (
                    <div className="p-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <Field label={t('auto.sirket_adi')} required><Input size="sm" value={editForm.companyName} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} /></Field>
                            <Field label="Yetkili"><Input size="sm" value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} /></Field>
                            <Field label="E-posta"><Input size="sm" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="tedarikci@ornek.com" /></Field>
                            <Field label={t('common.phone')}><Input size="sm" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
                            <Field label={t('common.address')}><Input size="sm" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></Field>
                            <Field label={t('common.status')}>
                                <Select size="sm" value={editForm.isActive ? 'ACTIVE' : 'INACTIVE'} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'ACTIVE' })}>
                                    <option value="ACTIVE">{t('common.active')}</option>
                                    <option value="INACTIVE">{t('common.inactive')}</option>
                                </Select>
                            </Field>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                            <Button variant="secondary" size="sm" onClick={() => { setEditOpen(false); void load(); }} disabled={saving}>{t('common.cancel')}</Button>
                            <Button size="sm" icon={<Save size={13} />} loading={saving} onClick={save}>{t('common.save')}</Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-4 text-[12.5px] sm:grid-cols-2">
                        <InfoLine label="Yetkili" value={supplier.contactName} />
                        <InfoLine label="E-posta" value={supplier.email} />
                        <InfoLine label={t('common.phone')} value={supplier.phone} />
                        <InfoLine label={t('common.address')} value={supplier.address} />
                    </div>
                )}
            </section>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Metric label={t('auto.urun')} value={String(supplier.articleCount || 0)} />
                <Metric label={t('auto.alim_kaydi')} value={String(supplier.purchaseCount || 0)} />
                <Metric label={t('auto.toplam_adet')} value={number(supplier.totalPurchaseQuantity)} />
                <Metric label={t('auto.toplam_alis')} value={money(supplier.totalPurchaseAmount)} />
            </div>

            <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-xs">
                <div className="border-b border-slate-100 px-4 py-3 text-[11px] font-semibold uppercase text-slate-500">{t('auto.alinan_urunler')}</div>
                {(supplier.articleSuppliers || []).length === 0 ? (
                    <EmptyState icon={<Package size={28} />} title={t('auto.urun_kaydi_yok')} description={t('auto.bu_tedarikciye_bagli_urun_henuz_eklenmemis')} />
                ) : (
                    <div className="divide-y divide-slate-100">
                        {(supplier.articleSuppliers || []).map((row) => (
                                <button
                                    key={row.id}
                                    type="button"
                                    className="grid w-full grid-cols-[minmax(0,1fr)_120px_110px_120px_120px_110px] items-center gap-4 px-4 py-3 text-left text-[12.5px] hover:bg-slate-50"
                                    onClick={() => navigate(`/inventory/articles/${row.articleId}`)}
                                >
                                    <span className="min-w-0">
                                        <span className="block truncate font-semibold text-slate-900">{row.article?.name || row.articleId}</span>
                                        <span className="text-[11px] text-slate-500">{row.article?.articleCode || '-'} · {row.supplierSku || '-'}</span>
                                    </span>
                                    <span className="truncate text-slate-600">{row.location?.locationName || '-'}</span>
                                    <span className="text-right font-mono">{number(row.quantity)} {row.article?.unit || ''}</span>
                                    <span className="text-right font-mono">{money(row.purchasePrice)}</span>
                                    <span className="text-right font-mono">{money(Number(row.quantity || 0) * Number(row.purchasePrice || 0))}</span>
                                    <span className="text-slate-600">{row.lastPurchaseDate ? dayjs(row.lastPurchaseDate).format('DD.MM.YYYY') : '-'}</span>
                                </button>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div>
        <div className="mt-1 font-semibold text-slate-950">{value}</div>
    </div>
);

const InfoLine = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="flex items-baseline gap-2">
        <span className="w-20 shrink-0 text-[11px] font-semibold uppercase text-slate-400">{label}</span>
        <span className="min-w-0 truncate text-slate-700">{value || '—'}</span>
    </div>
);
