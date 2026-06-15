import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building05 as Building, Package, Save01 as Save } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';
import dayjs from 'dayjs';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
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
    const [form, setForm] = useState({ companyName: '', phone: '', address: '' });
    const [saving, setSaving] = useState(false);

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

    const create = async () => {
        if (!form.companyName.trim()) return toast.error(t('auto.tedarikci_sirket_adi_zorunludur'));
        setSaving(true);
        try {
            const supplier = await inventoryApi.createSupplier(form);
            setForm({ companyName: '', phone: '', address: '' });
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
            <PageHeader
                breadcrumb={t('auto.breadcrumb_suppliers')}
                title={t('nav.suppliers')}
                description={t('auto.tedarikci_bilgileri_urun_baglantilari_ve_alisver')}
            />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                        <Building size={13} />{t('auto.yeni_tedarikci')}</div>
                    <div className="space-y-3">
                        <Field label={t('auto.sirket_adi')} required><Input size="sm" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></Field>
                        <Field label={t('common.phone')}><Input size="sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                        <Field label={t('common.address')}><Input size="sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                        <Button size="sm" className="w-full" icon={<Save size={13} />} loading={saving} onClick={create}>{t('common.save')}</Button>
                    </div>
                </section>

                <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-xs">
                    <div className="border-b border-slate-100 px-4 py-3 text-[11px] font-semibold uppercase text-slate-500">{t('auto.genel_liste')}</div>
                    {loading ? (
                        <div className="p-4 text-[12px] text-slate-500">{t('common.loading')}</div>
                    ) : suppliers.length === 0 ? (
                        <EmptyState icon={<Building size={28} />} title={t('auto.tedarikci_yok')} description={t('auto.ilk_tedarikciyi_soldaki_formdan_ekleyin')} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px]">
                                <thead className="border-b border-slate-100 bg-slate-50 text-[10.5px] uppercase text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2 text-left">{t('auto.sirket')}</th>
                                        <th className="px-4 py-2 text-left">{t('common.phone')}</th>
                                        <th className="px-4 py-2 text-left">{t('common.address')}</th>
                                        <th className="px-4 py-2 text-right">{t('auto.urun')}</th>
                                        <th className="px-4 py-2 text-right">{t('auto.alim_adedi')}</th>
                                        <th className="px-4 py-2 text-right">{t('auto.alisveris')}</th>
                                        <th className="px-4 py-2 text-left">{t('auto.son_alim')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {suppliers.map((supplier) => (
                                        <tr key={supplier.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/inventory/suppliers/${supplier.id}`)}>
                                            <td className="px-4 py-3 font-semibold text-slate-900">{supplier.companyName}</td>
                                            <td className="px-4 py-3 text-slate-600">{supplier.phone || '-'}</td>
                                            <td className="px-4 py-3 text-slate-600">{supplier.address || '-'}</td>
                                            <td className="px-4 py-3 text-right font-mono">{supplier.articleCount || 0}</td>
                                            <td className="px-4 py-3 text-right font-mono">{number(supplier.totalPurchaseQuantity)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{money(supplier.totalPurchaseAmount)}</td>
                                            <td className="px-4 py-3 text-slate-600">{supplier.latestPurchaseDate ? dayjs(supplier.latestPurchaseDate).format('DD.MM.YYYY') : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};

export const SupplierDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [supplier, setSupplier] = useState<SupplierRow | null>(null);

    useEffect(() => {
        if (!id) return;
        void inventoryApi.getSupplier(id).then(setSupplier).catch(() => toast.error(t('auto.tedarikci_yuklenemedi')));
    }, [id]);

    if (!supplier) return <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />;

    return (
        <div>
            <PageHeader
                breadcrumb={t('auto.breadcrumb_suppliers')}
                title={supplier.companyName}
                description={[supplier.phone, supplier.address].filter(Boolean).join(' · ') ||t('auto.tedarikci_detayi')}
                actions={<Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/inventory/suppliers')}>{t('auto.listeye_don')}</Button>}
            />

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
