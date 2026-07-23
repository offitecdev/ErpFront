import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Image01 as ImageIcon,
    PackagePlus,
    Save01 as Save,
    SearchLg as Search,
    Trash01 as Trash2,
    UploadCloud02 as Upload,
    X,
} from '@/components/icons/antIconCompat';
import { toast } from 'sonner';

import { StockModuleHeader } from '../../components/layout/PageHeader';
import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Input, Select } from '../../components/ui-shared/Field';
import { Skeleton } from '../../components/ui-shared/Skeleton';
import { projectApi } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';
import type { ProjectMaterial } from '../../types/project';

import { t } from '@/i18n/translate';

type MaterialForm = Pick<ProjectMaterial, 'name' | 'serialId' | 'stockQuantity' | 'unitCost'> & {
    minStockLevel: number;
    criticalStockLevel: number;
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
    minStockLevel: 0,
    criticalStockLevel: 0,
    imageUrl: '',
});

const canManageMaterials = (permissions: string[]) =>
    permissions.length === 0
    || permissions.includes('inventory.articles.create')
    || permissions.includes('inventory.articles.update');

const materialInputClass = t('auto.h_8_px_2_5_py_1_text_12_5px');
const MATERIAL_FILTER_CONTROL =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 placeholder:text-slate-400 transition-colors hover:bg-slate-100 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10';

export const ExtraMaterials = () => {
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canManage = canManageMaterials(permissions);

    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [codeFilter, setCodeFilter] = useState('');
    const [nameFilter, setNameFilter] = useState('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 50;

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

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const codeQuery = codeFilter.trim().toLowerCase();
        const nameQuery = nameFilter.trim().toLowerCase();
        const matches = materials.filter((m) => {
            if (codeQuery && !(m.serialId || '').toLowerCase().includes(codeQuery)) return false;
            if (nameQuery && !m.name.toLowerCase().includes(nameQuery)) return false;
            if (!q) return true;
            return m.name.toLowerCase().includes(q) || (m.serialId || '').toLowerCase().includes(q);
        });
        // Newest ↔ oldest by real creation date (createdAt added to the Material table).
        const directionFactor = sortDirection === 'asc' ? 1 : -1;
        return matches.sort((left, right) => {
            const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
            const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
            const comparison = leftTime - rightTime;
            return comparison === 0 ? left.id.localeCompare(right.id) : comparison * directionFactor;
        });
    }, [codeFilter, materials, nameFilter, search, sortDirection]);

    useEffect(() => {
        setPage(1);
    }, [codeFilter, nameFilter, search, sortDirection]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = useMemo(
        () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
        [filtered, pageSafe],
    );
    const rangeFrom = filtered.length === 0 ? 0 : (pageSafe - 1) * PAGE_SIZE + 1;
    const rangeTo = Math.min(pageSafe * PAGE_SIZE, filtered.length);

    return (
        <div>
            <InventoryListHeader
                title={t('nav.materials')}
                action={canManage && (
                    <Button
                        variant="primary"
                        size="lg"
                        icon={<PackagePlus size={16} />}
                        onClick={() => navigate('/inventory/extra-materials/new')}
                        className="!h-10 !px-4 !text-[13px] !font-semibold"
                    >
                        {t('auto.yeni_malzeme')}
                    </Button>
                )}
            />
            <Card className="border-0 rounded-none" noPadding>
                {/* Filtre + sayfalama — tek satır, tam genişlik, yatay kaydırma yok. */}
                <div className="px-3 py-3">
                    <div className="flex w-full flex-nowrap items-center gap-3">
                        <div className="relative w-[240px] min-w-0 shrink">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('auto.ara_kod_ad_barkod')}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[13px] transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
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
                        <div className="w-[200px] shrink-0">
                            <Select
                                value={sortDirection}
                                onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                                aria-label={t('inventory.articles.sortOrder')}
                            >
                                <option value="desc">{t('inventory.articles.newestFirst')}</option>
                                <option value="asc">{t('inventory.articles.oldestFirst')}</option>
                            </Select>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center gap-3">
                            <span className="font-mono text-[12px] text-slate-500">
                                {rangeFrom}-{rangeTo} / {filtered.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={pageSafe <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.back')}
                                >
                                    <ChevronLeft size={14} />
                                </button>
                                <span className="px-1 font-mono text-[12px] tabular-nums text-slate-500">{pageSafe} / {totalPages}</span>
                                <button
                                    type="button"
                                    disabled={pageSafe >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={t('common.next')}
                                >
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white">
                    <table className="w-full table-fixed text-[12.5px] [&_th]:border-r [&_th]:border-slate-200 [&_td]:border-r [&_td]:border-slate-200 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                        <colgroup>
                            <col style={{ width: '7%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '34%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '13%' }} />
                            <col style={{ width: '10%' }} />
                        </colgroup>
                        <thead className="sticky top-0 z-10 whitespace-nowrap text-[11.5px] text-[#86868B] bg-slate-50 uppercase tracking-[0.08em]">
                            <tr>
                                <th className="px-3 py-2.5 text-left font-semibold">{t('auto.gorsel')}</th>
                                <th className="px-3 py-2.5 text-left font-semibold">{t('auto.stok_kodu')}</th>
                                <th className="px-3 py-2.5 text-left font-semibold">{t('auto.malzeme')}</th>
                                <th className="px-3 py-2.5 text-right font-semibold">{t('auto.satis_fiyati')}</th>
                                <th className="px-3 py-2.5 text-right font-semibold">{t('auto.mevcut')}</th>
                                <th className="px-3 py-2.5 text-right font-semibold">{t('common.actions')}</th>
                            </tr>
                            <tr data-filter-row>
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2 font-normal">
                                    <input
                                        value={codeFilter}
                                        onChange={(event) => setCodeFilter(event.target.value)}
                                        placeholder={`${t('common.filter')}...`}
                                        className={MATERIAL_FILTER_CONTROL}
                                    />
                                </th>
                                <th className="px-2 py-2 font-normal">
                                    <input
                                        value={nameFilter}
                                        onChange={(event) => setNameFilter(event.target.value)}
                                        placeholder={`${t('common.filter')}...`}
                                        className={MATERIAL_FILTER_CONTROL}
                                    />
                                </th>
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                                <th className="px-2 py-2" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && Array.from({ length: 6 }).map((_, i) => (
                                <tr key={`material-skeleton-${i}`}>
                                    {Array.from({ length: 6 }).map((__, j) => (
                                        <td key={j} className="px-3 py-2">
                                            {j === 0
                                                ? <Skeleton className="h-10 w-10 rounded-lg bg-slate-100" />
                                                : <Skeleton className={`h-4 w-full max-w-[120px] ${j >= 3 ? 'ml-auto' : ''} bg-slate-100`} />}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="flex min-h-[150px] flex-col items-center justify-center px-4 py-6 text-center">
                                            <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                                                <PackagePlus size={22} />
                                            </div>
                                            <div className="text-[13px] font-semibold text-slate-900">{search ? t('auto.arama_sonucu_yok') : t('auto.malzeme_yok')}</div>
                                            {!search && <div className="mt-1 text-[12px] text-slate-500">{t('auto.ilk_malzemeyi_ekleyerek_baslayin')}</div>}
                                            {!search && canManage && (
                                                <Button className="mt-3" variant="primary" size="sm" icon={<PackagePlus size={13} />} onClick={() => navigate('/inventory/extra-materials/new')}>{t('auto.yeni_malzeme')}</Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && paged.map((material) => (
                                <tr key={material.id} className="group cursor-pointer transition-colors hover:bg-slate-100" onClick={() => navigate(`/inventory/extra-materials/${material.id}/edit`)}>
                                    <td className="px-3 py-2">
                                        {material.imageUrl ? (
                                            <img src={material.imageUrl} alt={material.name} className="h-10 w-10 rounded-lg object-cover border border-slate-200" />
                                        ) : (
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400">
                                                <ImageIcon size={15} />
                                            </div>
                                        )}
                                    </td>
                                    <td className="truncate px-3 py-2 font-mono text-[11.5px] text-slate-700">{material.serialId}</td>
                                    <td className="truncate px-3 py-2 font-medium text-slate-800 group-hover:text-[#272f67]">{material.name}</td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">{fmtMoney(material.unitCost)}</td>
                                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtNumber(material.stockQuantity)}</td>
                                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40"
                                                title={t('common.delete')}
                                                disabled={!canManage}
                                                onClick={async () => {
                                                    if (!confirm(t('auto.delete_material_confirm', { name: material.name }))) return;
                                                    try {
                                                        await projectApi.deleteMaterial(material.id);
                                                        // Remove just this row from local state — no full-list reload.
                                                        setMaterials((prev) => prev.filter((m) => m.id !== material.id));
                                                        toast.success(t('auto.malzeme_silindi'));
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
                        minStockLevel: material.minStockLevel ?? 0,
                        criticalStockLevel: material.criticalStockLevel ?? 0,
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
        minStockLevel: Number(value.minStockLevel || 0),
        criticalStockLevel: Number(value.criticalStockLevel || 0),
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
        if (form.minStockLevel < 0 || form.criticalStockLevel < 0) return toast.error('Minimum ve kritik seviye negatif olamaz.');

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
            <StockModuleHeader
                label=""
                actions={
                    <>
                        <Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/inventory/extra-materials')}>{t('auto.listeye_don')}</Button>
                        <Button variant="primary" loading={saving} disabled={!canManage || !isDirty} icon={<Save size={13} />} onClick={save}>{t('common.save')}</Button>
                    </>
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
                        <div className="mb-3 text-[11px] font-semibold uppercase text-slate-500">{t('auto.satis_fiyati')}</div>
                        <div className="max-w-lg space-y-2">
                            {/* Malzemelerde yalnızca satış fiyatı girilir (unitCost alanında saklanır). */}
                            <MaterialInfoRow label={t('auto.satis_fiyati')}>
                                <div className="max-w-[150px]">
                                    <Input size="sm" className={materialInputClass} type="number" min={0} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) || 0 })} />
                                </div>
                            </MaterialInfoRow>
                        </div>
                    </section>

                    <section className="rounded-md border border-slate-200 bg-white p-3 shadow-xs">
                        <div className="mb-3 text-[11px] font-semibold uppercase text-slate-500">Stok Seviyeleri</div>
                        <div className="max-w-lg space-y-2">
                            {/* Tedarik Talepleri ekranı bu eşiklere göre minimum/kritik listeler üretir. */}
                            <MaterialInfoRow label="Minimum Seviye">
                                <div className="max-w-[150px]">
                                    <Input size="sm" className={materialInputClass} type="number" min={0} value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) || 0 })} />
                                </div>
                            </MaterialInfoRow>
                            <MaterialInfoRow label="Kritik Seviye">
                                <div className="max-w-[150px]">
                                    <Input size="sm" className={materialInputClass} type="number" min={0} value={form.criticalStockLevel} onChange={(e) => setForm({ ...form, criticalStockLevel: Number(e.target.value) || 0 })} />
                                </div>
                            </MaterialInfoRow>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
