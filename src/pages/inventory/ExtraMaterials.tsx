import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Image01 as ImageIcon, PackagePlus, Save01 as Save, Trash01 as Trash2, UploadCloud02 as Upload, X } from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Input } from '../../components/ui-shared/Field';
import { projectApi } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';
import type { ProjectMaterial } from '../../types/project';

import { t } from '@/i18n/translate';

type MaterialForm = Pick<ProjectMaterial, 'name' | 'serialId' | 'stockQuantity' | 'unitCost'> & {
    imageUrl?: string | null;
};

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);

const emptyMaterial = (): MaterialForm => ({
    name: '',
    serialId: `MAT-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`,
    stockQuantity: 0,
    unitCost: 0,
    imageUrl: '',
});

const canManageMaterials = (permissions: string[]) =>
    permissions.length === 0
    || permissions.includes('inventory.articles.create')
    || permissions.includes('inventory.articles.update');

const materialInputClass = t('auto.h_8_px_2_5_py_1_text_12_5px');

export const ExtraMaterials = () => {
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canManage = canManageMaterials(permissions);

    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            setMaterials(await projectApi.materials());
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.malzemeler_yuklenemedi'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    return (
        <div>
            <PageHeader
                breadcrumb={t('auto.breadcrumb_materials')}
                title={t('nav.materials')}
                description={t('auto.projeye_sonradan_eklenebilen_malzemelerin_gorsel')}
                actions={
                    canManage && (
                        <Button variant="primary" icon={<PackagePlus size={13} />} onClick={() => navigate('/inventory/extra-materials/new')}>{t('auto.yeni_malzeme')}</Button>
                    )
                }
            />

            <Card title={t('auto.malzeme_listesi')} icon={<PackagePlus size={14} />} noPadding>
                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.gorsel')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.malzeme')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.kod')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.mevcut_miktar')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.birim_fiyat')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{t('common.loading')}</td></tr>}
                            {!loading && materials.length === 0 && (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="flex min-h-[150px] flex-col items-center justify-center px-4 py-6 text-center">
                                            <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                                                <PackagePlus size={22} />
                                            </div>
                                            <div className="text-[13px] font-semibold text-slate-900">{t('auto.malzeme_yok')}</div>
                                            <div className="mt-1 text-[12px] text-slate-500">{t('auto.ilk_malzemeyi_ekleyerek_baslayin')}</div>
                                            {canManage && (
                                                <Button className="mt-3" variant="primary" size="sm" icon={<PackagePlus size={13} />} onClick={() => navigate('/inventory/extra-materials/new')}>{t('auto.yeni_malzeme')}</Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && materials.map((material) => (
                                <tr key={material.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => navigate(`/inventory/extra-materials/${material.id}/edit`)}>
                                    <td className="px-3 py-2 w-[60px]">
                                        {material.imageUrl ? (
                                            <img src={material.imageUrl} alt={material.name} className="h-9 w-9 rounded object-cover border border-slate-200" />
                                        ) : (
                                            <div className="flex h-9 w-9 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400">
                                                <ImageIcon size={14} />
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 font-medium text-slate-800">{material.name}</td>
                                    <td className="px-3 py-2 font-mono text-[11.5px] text-slate-500">{material.serialId}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmtNumber(material.stockQuantity)}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmtMoney(material.unitCost)}</td>
                                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                                title={t('common.delete')}
                                                disabled={!canManage}
                                                onClick={async () => {
                                                    if (!confirm(t('auto.delete_material_confirm', { name: material.name }))) return;
                                                    try {
                                                        await projectApi.deleteMaterial(material.id);
                                                        toast.success(t('auto.malzeme_silindi'));
                                                        await load();
                                                    } catch (e: any) {
                                                        toast.error(e.response?.data?.error ||t('auto.malzeme_silinemedi'));
                                                    }
                                                }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
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

export const ExtraMaterialCreate = () => <ExtraMaterialFormPage mode="create" />;

export const ExtraMaterialEdit = () => <ExtraMaterialFormPage mode="edit" />;

const MaterialInfoRow = ({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) => (
    <label className="grid grid-cols-1 gap-1 md:grid-cols-[118px_minmax(0,1fr)] md:items-center">
        <span className="text-[12px] font-semibold text-slate-700">
            {label}
            {required && <span className="ml-0.5 text-rose-600">*</span>}
        </span>
        {children}
    </label>
);

const ExtraMaterialFormPage = ({ mode }: { mode: 'create' | 'edit' }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canManage = canManageMaterials(permissions);
    const fileRef = useRef<HTMLInputElement>(null);

    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [form, setForm] = useState<MaterialForm>(emptyMaterial());
    const [initialForm, setInitialForm] = useState<MaterialForm | null>(null);
    const [loading, setLoading] = useState(mode === 'edit');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (mode === 'create') setInitialForm((current) => current || form);
    }, [form, mode]);

    useEffect(() => {
        if (mode !== 'edit') return;
        const load = async () => {
            setLoading(true);
            try {
                const data = await projectApi.materials();
                setMaterials(data);
                const material = data.find((item) => item.id === id);
                if (material) {
                    const next = {
                        name: material.name,
                        serialId: material.serialId,
                        stockQuantity: material.stockQuantity,
                        unitCost: material.unitCost,
                        imageUrl: material.imageUrl || '',
                    };
                    setForm(next);
                    setInitialForm(next);
                }
            } catch (e: any) {
                toast.error(e.response?.data?.error ||t('auto.malzeme_yuklenemedi'));
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [id, mode]);

    const editingMaterial = materials.find((item) => item.id === id);
    const normalizeForm = (value: MaterialForm) => JSON.stringify({
        name: value.name || '',
        serialId: value.serialId || '',
        stockQuantity: Number(value.stockQuantity || 0),
        unitCost: Number(value.unitCost || 0),
        imageUrl: value.imageUrl || '',
    });
    const isDirty = initialForm ? normalizeForm(form) !== normalizeForm(initialForm) : false;

    const handleImage = (file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error(t('auto.gorsel_2_mb_sinirini_asiyor'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => setForm((current) => ({ ...current, imageUrl: event.target?.result as string }));
        reader.readAsDataURL(file);
    };

    const save = async () => {
        if (!canManage) return;
        if (!form.name.trim()) return toast.error(t('auto.malzeme_adi_zorunludur'));
        if (!form.serialId.trim()) return toast.error(t('auto.kod_zorunludur'));
        if (form.stockQuantity < 0 || form.unitCost < 0) return toast.error(t('auto.miktar_ve_fiyat_negatif_olamaz'));

        setSaving(true);
        try {
            const payload = { ...form, imageUrl: form.imageUrl || null };
            if (mode === 'edit' && id) {
                await projectApi.updateMaterial(id, payload);
                toast.success(t('auto.malzeme_guncellendi'));
            } else {
                await projectApi.createMaterial(payload);
                toast.success(t('auto.malzeme_kaydedildi'));
            }
            navigate('/inventory/extra-materials');
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.malzeme_kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    if (mode === 'edit' && loading) {
        return <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />;
    }

    if (mode === 'edit' && !editingMaterial) {
        return (
            <EmptyState
                icon={<PackagePlus size={32} />}
                title={t('auto.malzeme_bulunamadi')}
                description={t('auto.duzenlemek_istediginiz_malzeme_silinmis_olabilir')}
                action={<Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/inventory/extra-materials')}>{t('auto.listeye_don')}</Button>}
            />
        );
    }

    return (
        <div>
            <PageHeader
                breadcrumb={t('auto.breadcrumb_materials')}
                title={mode === 'edit' ?t('auto.malzeme_bilgileri') :t('auto.yeni_malzeme')}
                description={mode === 'edit' ? form.name :t('auto.yeni_malzeme_karti_olusturun')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/inventory/extra-materials')}>{t('auto.listeye_don')}</Button>
                        <Button variant="primary" loading={saving} disabled={!canManage || !isDirty} icon={<Save size={13} />} onClick={save}>{t('common.save')}</Button>
                    </div>
                }
            />

            <div className="max-w-5xl space-y-3">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                    <section className="rounded-md border border-slate-200 bg-white p-3 shadow-xs">
                        <div className="mb-3 text-[11px] font-semibold uppercase text-slate-500">{t('auto.tanim')}</div>
                        <div className="max-w-xl space-y-2">
                            <MaterialInfoRow label={t('auto.malzeme_adi')} required>
                                <div className="max-w-[340px]">
                                    <Input size="sm" className={materialInputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('auto.montaj_seti')} />
                                </div>
                            </MaterialInfoRow>
                            <MaterialInfoRow label={t('auto.kod')} required>
                                <div className="max-w-[220px]">
                                    <Input size="sm" className={materialInputClass} value={form.serialId} onChange={(e) => setForm({ ...form, serialId: e.target.value })} />
                                </div>
                            </MaterialInfoRow>
                        </div>
                    </section>

                    <section className="rounded-md border border-slate-200 bg-white p-3 shadow-xs">
                        <div className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{t('auto.gorsel')}</div>
                        <div className="space-y-2">
                            {form.imageUrl ? (
                                <div className="relative h-20 w-20 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                                    <img src={form.imageUrl} alt={form.name ||t('auto.malzeme_gorseli')} className="h-full w-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, imageUrl: null })}
                                        className="absolute right-1 top-1 rounded bg-white/90 p-1 text-rose-600 shadow"
                                        title={t('auto.gorseli_kaldir')}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-300">
                                    <ImageIcon size={20} />
                                </div>
                            )}
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleImage(file);
                                }}
                            />
                            <Button type="button" variant="secondary" size="sm" icon={<Upload size={12} />} onClick={() => fileRef.current?.click()}>
                                {form.imageUrl ?t('auto.degistir') :t('common.upload')}
                            </Button>
                            <div className="text-[10px] leading-4 text-slate-400">{t('auto.opsiyonel')}</div>
                        </div>
                    </section>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <section className="rounded-md border border-slate-200 bg-white p-3 shadow-xs">
                        <div className="mb-3 text-[11px] font-semibold uppercase text-slate-500">{t('auto.stok_ve_fiyat')}</div>
                        <div className="max-w-lg space-y-2">
                            <MaterialInfoRow label={t('auto.mevcut_miktar')}>
                                <div className="max-w-[150px]">
                                    <Input size="sm" className={materialInputClass} type="number" min={0} value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: Number(e.target.value) || 0 })} />
                                </div>
                            </MaterialInfoRow>
                            <MaterialInfoRow label={t('auto.birim_fiyat')}>
                                <div className="max-w-[150px]">
                                    <Input size="sm" className={materialInputClass} type="number" min={0} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) || 0 })} />
                                </div>
                            </MaterialInfoRow>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
