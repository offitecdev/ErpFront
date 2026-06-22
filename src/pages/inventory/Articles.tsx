import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
    AlertTriangle,
    ArrowLeft,
    Camera01 as Camera,
    ChevronRight,
    Coins01 as Coins,
    Hash01 as Hash,
    Image01 as ImageIcon,
    List,
    MarkerPin01 as MapPin,
    Package,
    Plus,
    Save01 as Save,
    Scan as ScanBarcode,
    Scan as ScanLine,
    SearchLg as Search,
    Trash01 as Trash2,
    UploadCloud02 as Upload,
    X,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { Skeleton } from '../../components/ui-shared/Skeleton';
import { BarcodeScannerModal } from '../../components/ui-shared/BarcodeScannerModal';

import { useInventoryStore } from '../../store/inventoryStore';
import { useAuthStore } from '../../store/authStore';
import { inventoryApi } from '../../lib/api/inventory';
import type { ArticleStatus, ArticleSupplierRow, InventoryArticle, SupplierRow } from '../../types/inventory';

import { t } from '@/i18n/translate';
import { useTranslation } from 'react-i18next';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((tick) => tick + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};

const getStatusLabel = (): Record<ArticleStatus, string> => ({
    ACTIVE:t('common.active'),
    INACTIVE:t('common.inactive'),
    IN_SUPPLY:t('inventory.articles.statusSupply'),
    IN_PRODUCTION:t('inventory.articles.statusProduction'),
});

const STATUS_VARIANT: Record<ArticleStatus, 'active' | 'passive' | 'info' | 'warning'> = {
    ACTIVE: 'active',
    INACTIVE: 'passive',
    IN_SUPPLY: 'warning',
    IN_PRODUCTION: 'info',
};

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);

const articleUnitCost = (article: { baseCost?: number | null; weightedAverageCost?: number | null }) => {
    const weightedAverageCost = Number(article.weightedAverageCost ?? 0);
    return weightedAverageCost > 0 ? weightedAverageCost : Number(article.baseCost || 0);
};

type ArticleCostFields = {
    baseCost?: number | null;
    weightedAverageCost?: number | null;
    costBasisQuantity?: number | null;
    costBasisValue?: number | null;
    supplierCostQuantity?: number | null;
    supplierCostValue?: number | null;
    manualCostQuantity?: number | null;
    manualCostValue?: number | null;
};

// Ağırlıklı ortalama birim maliyetin hesap dökümü: tedarik + manuel stok girişlerinin
// (adet × birim maliyet) toplamı, toplam adede bölünerek birim maliyeti verir.
const articleCostBreakdown = (a: ArticleCostFields) => {
    const supplierQty = Number(a.supplierCostQuantity || 0);
    const supplierValue = Number(a.supplierCostValue || 0);
    const manualQty = Number(a.manualCostQuantity || 0);
    const manualValue = Number(a.manualCostValue || 0);
    const basisQty = Number(a.costBasisQuantity || 0) || supplierQty + manualQty;
    const basisValue = Number(a.costBasisValue || 0) || supplierValue + manualValue;
    return { supplierQty, supplierValue, manualQty, manualValue, basisQty, basisValue, unitCost: articleUnitCost(a) };
};

// Stok girişi yapan (maliyet taşıyabilen) hareket tipleri — birim maliyet yalnızca bunlarda istenir.
const COST_BEARING_MOVEMENTS = ['IN', 'ADJUSTMENT'];

const suggestCode = () => {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `ART-${year}-${rand}`;
};

const emptyArticle = (): Partial<InventoryArticle> => ({
    articleCode: suggestCode(),
    name: '',
    description: '',
    baseCost: 0,
    salePrice: 0,
    unit:t('auto.stk'),
    systemBarcode: '',
    supplierBarcode: '',
    imageUrl: '',
    category: '',
    status: 'ACTIVE',
    isActive: true,
    minStockLevel: 10,
    criticalStockLevel: 5,
    maxStockLevel: 100,
    lastPurchaseDate: null,
});

export const Articles = () => {
    useLanguageRefresh();
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0
        || permissions.includes('inventory.articles.create')
        || permissions.includes('inventory.articles.update');

    const { articles, articlesLoading, fetchArticlesSummary, deleteArticle } = useInventoryStore();

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');

    useEffect(() => {
        fetchArticlesSummary();
    }, [fetchArticlesSummary]);

    const openBarcodeScanner = (mode: 'serial' | 'general') => {
        setScannerMode(mode);
        setScannerOpen(true);
    };

    const handleScanResult = (code: string) => {
        setScannerOpen(false);
        setSearch(code);
        if (scannerMode === 'serial') {
            toast.success(t('inventory.articles.serialScanned', { code }));
        } else {
            toast.success(t('inventory.articles.generalScanned', { code }));
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return articles.filter((a) => {
            if (statusFilter && a.status !== statusFilter) return false;
            if (!q) return true;
            return (
                a.articleCode.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q) ||
                (a.systemBarcode || '').toLowerCase().includes(q) ||
                (a.supplierBarcode || '').toLowerCase().includes(q)
            );
        });
    }, [articles, search, statusFilter]);

    const stats = useMemo(() => {
        const totalQty = articles.reduce((s, a) => s + a.totalQuantity, 0);
        const totalValue = articles.reduce((s, a) => s + a.totalQuantity * articleUnitCost(a), 0);
        const critical = articles.filter((a) => a.criticalStockLevel > 0 && a.totalQuantity <= a.criticalStockLevel).length;
        return { total: articles.length, totalQty, totalValue, critical };
    }, [articles]);

    return (
        <div>
            <PageHeader
                breadcrumb={t('inventory.articles.breadcrumb')}
                title={t('auto.stok_kartlari')}
                description={t('auto.tum_urunleri_barkodlari_gorselleri_ve_minimum_kr')}
                actions={
                    canManage && (
                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/inventory/articles/new')}>{t('auto.yeni_urun')}</Button>
                    )
                }
            />

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatBox label={t('inventory.dashboard.totalProducts')} value={`${stats.total}`} icon={<Package size={16} />} tone="indigo" active />
                <StatBox label={t('auto.toplam_adet')} value={fmtNumber(stats.totalQty)} icon={<Hash size={16} />} tone="sky" />
                <StatBox label={t('inventory.dashboard.stockValue')} value={fmtMoney(stats.totalValue)} icon={<Coins size={16} />} tone="emerald" small />
                <StatBox label={t('auto.kritik_seviye')} value={`${stats.critical}`} icon={<AlertTriangle size={16} />} tone="rose" accent={stats.critical > 0 ? 'rose' : undefined} />
            </div>

            <Card
                title={t('auto.urun_listesi')}
                icon={<Package size={13} />}
                className="border-0 rounded-none"
                noPadding
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('auto.ara_kod_ad_barkod')}
                                className="pl-6 pr-2.5 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-slate-50/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10 focus:border-blue-400 transition-colors w-[180px] md:w-[220px]"
                            />
                        </div>
                        <button
                            onClick={() => openBarcodeScanner('serial')}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-300 rounded-lg transition-colors"
                            title={t('auto.seri_kodu_ile_urun_bul')}
                        >
                            <Camera size={12} />
                            <span className="hidden sm:inline">{t('auto.seri_kod_tara')}</span>
                        </button>
                        <button
                            onClick={() => openBarcodeScanner('general')}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-300 rounded-lg transition-colors"
                            title={t('auto.genel_kod_ile_kategori_filtrele')}
                        >
                            <ScanLine size={12} />
                            <span className="hidden sm:inline">{t('auto.genel_kod_tara')}</span>
                        </button>
                        <Select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-2 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                        >
                            <option value="">{t('auto.tum_durumlar')}</option>
                            <option value="ACTIVE">{t('common.active')}</option>
                            <option value="INACTIVE">{t('common.inactive')}</option>
                            <option value="IN_SUPPLY">{t('inventory.articles.statusSupply')}</option>
                            <option value="IN_PRODUCTION">{t('inventory.articles.statusProduction')}</option>
                        </Select>
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-500 border border-slate-200 rounded-lg transition-colors"
                            >
                                <X size={11} />{t('auto.filtreyi_temizle')}</button>
                        )}
                    </div>
                }
            >
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-[12.5px]">
                        <thead className="text-[10.5px] text-[#86868B] bg-slate-50/70 border-b border-slate-100 uppercase tracking-[0.08em]">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.gorsel')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.stok_kodu')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.urun_adi')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.barkod_seri_no')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.satis_fiyati')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.mevcut')}</th>
                                <th className="px-3 py-2 text-right font-semibold">{t('auto.min_kritik')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('auto.siparis_tarihi')}</th>
                                <th className="px-3 py-2 text-left font-semibold">{t('common.status')}</th>
                                <th className="px-3 py-2 text-right font-semibold w-[110px]">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {articlesLoading && Array.from({ length: 6 }).map((_, i) => (
                                <tr key={`article-skeleton-${i}`}>
                                    {Array.from({ length: 10 }).map((__, j) => (
                                        <td key={j} className="px-3 py-2">
                                            <Skeleton className={`${j === 0 ?"h-9 w-9 rounded" : j === 8 ?"h-5 w-16 rounded-full" :"h-4 w-full max-w-[120px]"} ${j >= 4 && j <= 6 ? 'ml-auto' : ''} bg-slate-100`} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {false && articlesLoading && (
                                <tr>
                                    <td colSpan={10} className="px-4 py-8 text-center text-slate-400">{t('common.loading')}</td>
                                </tr>
                            )}
                            {!articlesLoading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={10}>
                                        <EmptyState
                                            icon={<Package size={32} />}
                                            title={t('auto.urun_yok')}
                                            description={t('auto.ilk_urununuzu_ekleyerek_baslayin')}
                                            action={canManage && (
                                                <Button variant="primary" icon={<Plus size={13} />} onClick={() => navigate('/inventory/articles/new')}>{t('auto.yeni_urun')}</Button>
                                            )}
                                        />
                                    </td>
                                </tr>
                            )}
                            {!articlesLoading && filtered.map((a) => {
                                const isCritical = a.criticalStockLevel > 0 && a.totalQuantity <= a.criticalStockLevel;
                                const isBelowMin = a.minStockLevel > 0 && a.totalQuantity <= a.minStockLevel;
                                return (
                                    <tr key={a.id} className="group hover:bg-slate-50/60 cursor-pointer transition-colors" onClick={() => navigate(`/inventory/articles/${a.id}`)}>
                                        <td className="px-3 py-2 w-[60px]">
                                            {a.imageUrl ? (
                                                <img src={a.imageUrl} alt={a.name} className="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                                                    <ImageIcon size={15} />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-[11.5px] text-slate-700">{a.articleCode}</td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-slate-800 truncate max-w-[260px] group-hover:text-[#272f67]">{a.name}</div>
                                            {a.category && <div className="text-[10.5px] text-slate-400 mt-0.5">{a.category}</div>}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                                            {a.systemBarcode || a.supplierBarcode || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-700">
                                            <div className="font-mono">{fmtMoney(Number(a.salePrice || 0))}/{a.unit}</div>
                                            <div className="mt-0.5 text-[10.5px] text-slate-400">{t('auto.ort_maliyet')}{fmtMoney(articleUnitCost(a))}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono">
                                            <span className={isBelowMin ?"text-rose-700 font-semibold" : isCritical ?"text-amber-700 font-semibold" : 'text-slate-800'}>
                                                {fmtNumber(a.totalQuantity)} {a.unit}
                                            </span>
                                            {(isCritical || isBelowMin) && (
                                                <AlertTriangle size={11} className="inline ml-1 text-amber-600" />
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-[11.5px] text-slate-500">
                                            {fmtNumber(a.minStockLevel)} / {fmtNumber(a.criticalStockLevel)}
                                        </td>
                                        <td className="px-3 py-2 text-[12px] text-slate-500">
                                            {a.lastPurchaseDate ? dayjs(a.lastPurchaseDate).format('DD.MM.YYYY') : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <StatusChip variant={STATUS_VARIANT[a.status]}>
                                                {getStatusLabel()[a.status]}
                                            </StatusChip>
                                        </td>
                                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="inline-flex items-center gap-1">
                                                {canManage && (
                                                    <>
                                                        <button
                                                            onClick={async () => {
                                                                if (!confirm(t('auto.delete_article_confirm', { name: a.name }))) return;
                                                                try {
                                                                    await deleteArticle(a.id);
                                                                    toast.success(t('auto.urun_silindi'));
                                                                } catch (e: any) {
                                                                    toast.error(e.response?.data?.error ||t('auto.silinemedi'));
                                                                }
                                                            }}
                                                            className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                                            title={t('common.delete')}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </>
                                                )}
                                                <ChevronRight size={13} className="text-slate-400" />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Barcode Scanner Modal */}
            {scannerOpen && (
                <BarcodeScannerModal
                    mode={scannerMode}
                    onClose={() => setScannerOpen(false)}
                    onScan={handleScanResult}
                />
            )}
        </div>
    );
};

export const ArticleCreate = () => <ArticleFormPage mode="create" />;

export const ArticleEdit = () => <ArticleFormPage mode="edit" />;

export const ArticleDetail = () => <ArticleFormPage mode="edit" />;

const ArticleFormPage = ({ mode }: { mode: 'create' | 'edit' }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { articles, articlesLoading, fetchArticlesSummary, createArticle, updateArticle } = useInventoryStore();
    const [loaded, setLoaded] = useState(mode === 'create');

    useEffect(() => {
        if (mode !== 'edit') return;
        let cancelled = false;
        const load = async () => {
            if (!articles.length) await fetchArticlesSummary();
            if (!cancelled) setLoaded(true);
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [articles.length, fetchArticlesSummary, mode]);

    const editing = mode === 'edit' ? articles.find((item) => item.id === id) : null;

    const submit = async (data: FormData) => {
        try {
            if (mode === 'edit' && editing?.id) {
                await updateArticle(editing.id, data);
                if (data.adjustQty && data.adjustQty > 0 && data.adjustLocationId) {
                    const movType = data.adjustMovementType ?? 'IN';
                    const unitCost = COST_BEARING_MOVEMENTS.includes(movType) && data.adjustUnitCost && data.adjustUnitCost > 0
                        ? data.adjustUnitCost
                        : null;
                    try {
                        await inventoryApi.scanMovement({
                            codeOrBarcode: data.articleCode!,
                            movementType: movType,
                            quantity: data.adjustQty,
                            unitCost,
                            destLocationId: (movType === 'IN' || movType === 'ADJUSTMENT') ? data.adjustLocationId : null,
                            sourceLocationId: movType === 'OUT' ? data.adjustLocationId : null,
                            description: `Manuel düzeltme - ${movType}`,
                        });
                        toast.success(t('auto.article_updated_with_stock_movement', { count: data.adjustQty }));
                    } catch (e: any) {
                        toast.warning(`Ürün güncellendi ancak stok hareketi başarısız: ${e.response?.data?.error || e.message}`);
                    }
                } else {
                    toast.success(t('auto.urun_guncellendi'));
                }
            } else {
                const created = await createArticle(data);
                if (data.initialStock && data.initialStock > 0 && data.initialStockLocationId && created) {
                    try {
                        await inventoryApi.scanMovement({
                            codeOrBarcode: created.articleCode,
                            movementType: 'IN',
                            quantity: data.initialStock,
                            unitCost: data.initialStockUnitCost && data.initialStockUnitCost > 0 ? data.initialStockUnitCost : null,
                            destLocationId: data.initialStockLocationId,
                            description:t('auto.baslangic_stogu'),
                        });
                        toast.success(t('auto.article_created_with_initial_stock', { count: data.initialStock }));
                    } catch (e: any) {
                        toast.error(`Ürün oluşturuldu ancak stok eklenemedi: ${e.response?.data?.error || e.message}`);
                    }
                } else {
                    toast.success(t('auto.urun_olusturuldu'));
                }
            }
            await fetchArticlesSummary();
            navigate('/inventory/articles');
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.kaydedilemedi'));
        }
    };

    if (mode === 'edit' && !editing && (!loaded || articlesLoading)) {
        return <div className="h-96 animate-pulse rounded-md border border-slate-100 bg-slate-50" />;
    }

    if (mode === 'edit' && !editing) {
        return (
            <EmptyState
                icon={<Package size={32} />}
                title={t('auto.urun_bulunamadi')}
                description={t('auto.duzenlemek_istediginiz_urun_bulunamadi')}
                action={<Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/inventory/articles')}>{t('auto.listeye_don')}</Button>}
            />
        );
    }

    return (
        <ArticleFormCard
            mode={mode}
            initial={mode === 'edit' && editing ? editing : emptyArticle()}
            onClose={() => navigate('/inventory/articles')}
            onSubmit={submit}
        />
    );
};

const STAT_ACCENT: Record<'indigo' | 'sky' | 'emerald' | 'rose', string> = {
    indigo: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100',
    sky: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
};

const StatBox: React.FC<{ label: string; value: string; small?: boolean; accent?: 'rose'; active?: boolean; icon?: React.ReactNode; tone?: 'indigo' | 'sky' | 'emerald' | 'rose' }> = ({ label, value, small, accent, icon, tone = 'indigo' }) => (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-shadow hover:shadow-sm">
        {icon && <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${STAT_ACCENT[tone]}`}>{icon}</span>}
        <div className="min-w-0">
            <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-[0.08em]">{label}</div>
            <div className={`mt-0.5 truncate ${small ? 'text-[15px]' : 'text-[18px]'} font-semibold ${accent === 'rose' ? 'text-rose-700' : 'text-slate-800'}`}>
                {value}
            </div>
        </div>
    </div>
);

type FormData = Partial<InventoryArticle> & {
    initialStock?: number;
    initialStockLocationId?: string;
    initialStockUnitCost?: number;
    adjustQty?: number;
    adjustMovementType?: 'IN' | 'OUT' | 'ADJUSTMENT';
    adjustLocationId?: string;
    adjustUnitCost?: number;
};

type ArticleFormTab = 'details' | 'stock' | 'suppliers';

const articleInputClass = t('auto.h_8_px_2_5_py_1_text_12_5px');

const ArticleInfoRow = ({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) => (
    <label className="grid grid-cols-1 gap-1 md:grid-cols-[118px_minmax(0,1fr)] md:items-center">
        <span className="text-[12px] font-semibold text-slate-700">
            {label}
            {required && <span className="ml-0.5 text-rose-600">*</span>}
        </span>
        {children}
    </label>
);

const ArticleFormCard: React.FC<{
    mode: 'create' | 'edit';
    initial: FormData;
    onClose: () => void;
    onSubmit: (data: FormData) => Promise<void>;
}> = ({ mode, initial, onClose, onSubmit }) => {
    const [form, setForm] = useState<FormData>({ ...initial });
    const [submitting, setSubmitting] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');
    const [activeTab, setActiveTab] = useState<ArticleFormTab>('details');
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
    const [articleSuppliers, setArticleSuppliers] = useState<ArticleSupplierRow[]>([]);
    const [supplierSaving, setSupplierSaving] = useState(false);
    const [editingSupplierLinkId, setEditingSupplierLinkId] = useState<string | null>(null);
    const [supplierForm, setSupplierForm] = useState({
        supplierId: '',
        companyName: '',
        contactName: '',
        phone: '',
        address: '',
        supplierSku: '',
        purchasePrice: Number(initial.baseCost || 0),
        quantity: 0,
        locationId: '',
        lastPurchaseDate: initial.lastPurchaseDate ? dayjs(initial.lastPurchaseDate).format('YYYY-MM-DD') : '',
        notes: '',
    });
    const fileRef = useRef<HTMLInputElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);
    const { locations, fetchLocations } = useInventoryStore();

    useEffect(() => {
        fetchLocations();
    }, [fetchLocations]);

    const isEdit = !!initial.id;
    const currentQty = (initial as any).totalQuantity as number | undefined;
    const loadSupplierData = async () => {
        const list = await inventoryApi.listSuppliers();
        setSuppliers(list);
        if (isEdit && initial.id) {
            const rows = await inventoryApi.listArticleSuppliers(initial.id);
            setArticleSuppliers(rows);
        }
    };

    useEffect(() => {
        void loadSupplierData().catch(() => undefined);
    }, [initial.id]);

    useEffect(() => {
        setSupplierForm((current) => ({
            ...current,
            purchasePrice: Number(form.baseCost || 0),
            lastPurchaseDate: form.lastPurchaseDate ? dayjs(form.lastPurchaseDate).format('YYYY-MM-DD') : current.lastPurchaseDate,
        }));
    }, [form.baseCost, form.lastPurchaseDate]);
    const normalizeForm = (value: FormData) => JSON.stringify({
        articleCode: value.articleCode || '',
        name: value.name || '',
        description: value.description || '',
        baseCost: Number(value.baseCost || 0),
        salePrice: Number(value.salePrice || 0),
        defaultSupplierId: value.defaultSupplierId || '',
        unit: value.unit || '',
        systemBarcode: value.systemBarcode || '',
        supplierBarcode: value.supplierBarcode || '',
        imageUrl: value.imageUrl || '',
        category: value.category || '',
        status: value.status || 'ACTIVE',
        minStockLevel: Number(value.minStockLevel || 0),
        criticalStockLevel: Number(value.criticalStockLevel || 0),
        maxStockLevel: value.maxStockLevel == null ? '' : Number(value.maxStockLevel),
        lastPurchaseDate: value.lastPurchaseDate || '',
        initialStock: Number(value.initialStock || 0),
        initialStockLocationId: value.initialStockLocationId || '',
        initialStockUnitCost: Number(value.initialStockUnitCost || 0),
        adjustQty: Number(value.adjustQty || 0),
        adjustMovementType: value.adjustMovementType || '',
        adjustLocationId: value.adjustLocationId || '',
        adjustUnitCost: Number(value.adjustUnitCost || 0),
    });
    const isDirty = useMemo(() => normalizeForm(initial) !== normalizeForm(form), [form, initial]);

    const handleImage = async (file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error(t('auto.gorsel_2_mb_sinirini_asiyor'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            setForm((p) => ({ ...p, imageUrl: e.target?.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const insertDescriptionBullet = () => {
        const current = form.description ?? '';
        const el = descRef.current;
        const start = el?.selectionStart ?? current.length;
        const end = el?.selectionEnd ?? start;
        const blockStart = current.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        const nextLineBreak = current.indexOf('\n', end);
        const blockEnd = nextLineBreak === -1 ? current.length : nextLineBreak;
        const block = current.slice(blockStart, blockEnd);
        const nextBlock = block
            .split('\n')
            .map((line) => (/^\s*[-*]\s+/.test(line) ? line : `- ${line}`))
            .join('\n');
        const next = `${current.slice(0, blockStart)}${nextBlock}${current.slice(blockEnd)}`;

        setForm((p) => ({ ...p, description: next }));
        requestAnimationFrame(() => {
            descRef.current?.focus();
            descRef.current?.setSelectionRange(blockStart, blockStart + nextBlock.length);
        });
    };

    const submit = async () => {
        if (!form.articleCode || !form.name || !form.unit) {
            toast.error(t('auto.kod_ad_ve_birim_zorunludur'));
            return;
        }
        if (!isEdit && (form.initialStock ?? 0) > 0 && locations.length > 0 && !form.initialStockLocationId) {
            toast.error(t('auto.baslangic_stogu_girildiginde_lokasyon_secimi_zor'));
            return;
        }
        if (isEdit && (form.adjustQty ?? 0) > 0 && !form.adjustLocationId) {
            toast.error(t('auto.stok_hareketi_icin_lokasyon_secimi_zorunludur'));
            return;
        }
        setSubmitting(true);
        try {
            const payload = { ...form };
            if (payload.systemBarcode === '') payload.systemBarcode = undefined;
            if (payload.supplierBarcode === '') payload.supplierBarcode = undefined;
            if (payload.description === '') payload.description = undefined;
            if (payload.category === '') payload.category = undefined;

            await onSubmit(payload);
        } finally {
            setSubmitting(false);
        }
    };

    const saveSupplier = async () => {
        if (!isEdit || !initial.id) {
            toast.error(t('auto.tedarikci_bilgisi_eklemek_icin_once_urunu_kayded'));
            return;
        }
        if (!editingSupplierLinkId && !supplierForm.supplierId && !supplierForm.companyName.trim()) {
            toast.error(t('auto.tedarikci_secin_veya_yeni_tedarikci_adi_girin'));
            return;
        }
        if (!supplierForm.locationId) {
            toast.error(t('auto.stoga_eklenecek_depoyu_secin'));
            return;
        }
        if (Number(supplierForm.quantity || 0) <= 0) {
            toast.error(t('auto.eklenecek_miktar_0_dan_buyuk_olmalidir'));
            return;
        }
        setSupplierSaving(true);
        try {
            const payload = {
                supplierSku: supplierForm.supplierSku || undefined,
                purchasePrice: Number(supplierForm.purchasePrice || 0),
                quantity: Number(supplierForm.quantity || 0),
                locationId: supplierForm.locationId,
                lastPurchaseDate: supplierForm.lastPurchaseDate || undefined,
                notes: supplierForm.notes || undefined,
                isPreferred: true,
            };
            const saved = editingSupplierLinkId
                ? await inventoryApi.updateArticleSupplier(initial.id, editingSupplierLinkId, payload)
                : await inventoryApi.saveArticleSupplier(initial.id, {
                    ...payload,
                    supplierId: supplierForm.supplierId || undefined,
                    companyName: supplierForm.companyName || undefined,
                    contactName: supplierForm.contactName || undefined,
                    phone: supplierForm.phone || undefined,
                    address: supplierForm.address || undefined,
                });
            setForm((current) => ({
                ...current,
                baseCost: saved.purchasePrice,
                defaultSupplierId: saved.supplierId,
                lastPurchaseDate: saved.lastPurchaseDate || current.lastPurchaseDate,
            }));
            setSupplierForm({
                supplierId: '',
                companyName: '',
                contactName: '',
                phone: '',
                address: '',
                supplierSku: '',
                purchasePrice: saved.purchasePrice,
                quantity: 0,
                locationId: '',
                lastPurchaseDate: saved.lastPurchaseDate ? dayjs(saved.lastPurchaseDate).format('YYYY-MM-DD') : '',
                notes: '',
            });
            setEditingSupplierLinkId(null);
            await loadSupplierData();
            toast.success(editingSupplierLinkId ?t('auto.tedarik_kaydi_guncellendi') :t('auto.tedarik_kaydi_eklendi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.tedarikci_bilgisi_kaydedilemedi'));
        } finally {
            setSupplierSaving(false);
        }
    };

    const removeSupplierLink = async (linkId: string) => {
        if (!initial.id) return;
        await inventoryApi.deleteArticleSupplier(initial.id, linkId);
        await loadSupplierData();
        toast.success(t('auto.tedarikci_kaydi_kaldirildi'));
    };

    const latestSupply = articleSuppliers.find((row) => row.isPreferred) || articleSuppliers[0];
    const totalSupplyQuantity = articleSuppliers.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalSupplyValue = articleSuppliers.reduce((sum, row) => sum + (Number(row.quantity || 0) * Number(row.purchasePrice || 0)), 0);
    const startEditSupplierLink = (row: ArticleSupplierRow) => {
        setEditingSupplierLinkId(row.id);
        setSupplierForm({
            supplierId: row.supplierId,
            companyName: '',
            contactName: '',
            phone: '',
            address: '',
            supplierSku: row.supplierSku || '',
            purchasePrice: Number(row.purchasePrice || 0),
            quantity: Number(row.quantity || 0),
            locationId: row.locationId || '',
            lastPurchaseDate: row.lastPurchaseDate ? dayjs(row.lastPurchaseDate).format('YYYY-MM-DD') : '',
            notes: row.notes || '',
        });
    };
    const resetSupplierForm = () => {
        setEditingSupplierLinkId(null);
        setSupplierForm({
            supplierId: '',
            companyName: '',
            contactName: '',
            phone: '',
            address: '',
            supplierSku: '',
            purchasePrice: Number(form.baseCost || 0),
            quantity: 0,
            locationId: '',
            lastPurchaseDate: form.lastPurchaseDate ? dayjs(form.lastPurchaseDate).format('YYYY-MM-DD') : '',
            notes: '',
        });
    };

   return (
        <>
            <PageHeader
                breadcrumb={t('inventory.articles.breadcrumb')}
                title={mode === 'edit' ?t('auto.urun_bilgileri') :t('auto.yeni_urun')}
                description={mode === 'edit' ? initial.name :t('auto.yeni_stok_karti_olusturun')}
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 items-center gap-1.5 rounded px-1 text-[13px] font-semibold text-slate-700 transition-colors hover:text-slate-950"
                        >
                            <ArrowLeft size={15} className="text-slate-400" />{t('auto.listeye_don')}</button>
                        <Button
                            variant="primary"
                            size="sm"
                            loading={submitting}
                            disabled={!isDirty}
                            icon={<Save size={13} />}
                            onClick={submit}
                        >{t('common.save')}</Button>
                    </div>
                }
            />

            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200">
                {[
                    ['details',t('')],
                    ['stock',t('auto.stok_ayarlari')],
                    ['suppliers',t('auto.urun_tedarik_bilgisi')],
                ].map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setActiveTab(key as ArticleFormTab)}
                        className={`relative px-1 pb-2 text-[13px] font-semibold transition-colors ${
                            activeTab === key
                                ?t('auto.text_1f2654_after_absolute_after_inset_x_0_after')
                                :t('auto.text_slate_500_hover_text_slate_900')
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Form Yapısı */}
            {activeTab === 'details' && (
            <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:items-start">
                <div className="min-w-0 space-y-3">
                    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="mb-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                            <Package size={13} />{t('auto.temel_bilgiler')}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            <ArticleInfoRow label={t('auto.urun_adi')} required>
                                <Input size="sm" className={articleInputClass} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </ArticleInfoRow>
                            <ArticleInfoRow label={t('auto.stok_kodu')} required>
                                <Input size="sm" className={articleInputClass} value={form.articleCode ?? ''} onChange={(e) => setForm({ ...form, articleCode: e.target.value })} placeholder="ART-2026-001" />
                            </ArticleInfoRow>
                            <ArticleInfoRow label={t('auto.birim')} required>
                                <Input size="sm" className={articleInputClass} value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={t('auto.stk_m2_kg')} />
                            </ArticleInfoRow>
                            <ArticleInfoRow label={t('auto.birim_satis_fiyati')}>
                                <Input size="sm" className={articleInputClass} type="number" step="1" min={0} value={form.salePrice ?? 0} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) || 0 })} />
                            </ArticleInfoRow>
                            <ArticleInfoRow label={t('common.category')}>
                                <Input size="sm" className={articleInputClass} value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('auto.hidrolik_servis')} />
                            </ArticleInfoRow>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
                        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                                <List size={13} />{t('common.description')}</div>
                            <div className="overflow-hidden rounded-md border border-slate-200 bg-white flex flex-col">
                                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100 bg-slate-50/70">
                                    <button type="button" title={t('auto.madde_isareti')} onClick={insertDescriptionBullet} className="w-7 h-6 rounded flex items-center justify-center border border-transparent hover:bg-slate-200 transition-colors">
                                        <List size={12} />
                                    </button>
                                </div>
                                <textarea
                                    ref={descRef}
                                    rows={8}
                                    value={form.description ?? ''}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="w-full p-3 text-[12.5px] bg-white focus:outline-none resize-y min-h-[260px]"
                                    placeholder={t('auto.urun_ile_ilgili_detayli_aciklamalari_buraya_yaza')}
                                />
                            </div>
                        </section>

                        <div className="space-y-3">
                            <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                                <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                                    <ScanBarcode size={13} />{t('auto.barkod_bilgileri')}</div>
                                <div className="flex flex-col gap-4">
                                    <Field label={t('auto.genel_urun_kodu')} hint={t('auto.kategori_barkodu_istege_bagli')}>
                                        <div className="flex items-center gap-2">
                                            <Input size="sm" value={form.systemBarcode ?? ''} onChange={(e) => setForm({ ...form, systemBarcode: e.target.value })} placeholder={t('auto.okutun_veya_yazin')} className={`${articleInputClass} flex-1`} />
                                            <button
                                                type="button"
                                                onClick={() => { setScannerMode('general'); setScannerOpen(true); }}
                                                className="flex h-8 w-8 items-center justify-center shrink-0 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                                title={t('auto.kamera_ile_genel_kod_tara')}
                                            >
                                                <Camera size={14} />
                                            </button>
                                        </div>
                                    </Field>
                                    <Field label={t('auto.urun_seri_kodu')} hint={t('auto.zorunlu_her_urune_ozgu')} required>
                                        <div className="flex items-center gap-2">
                                            <Input size="sm" value={form.supplierBarcode ?? ''} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder={t('auto.okutun_veya_yazin')} className={`${articleInputClass} flex-1`} />
                                            <button
                                                type="button"
                                                onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
                                                className="flex h-8 w-8 items-center justify-center shrink-0 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                                title={t('auto.kamera_ile_seri_kod_tara')}
                                            >
                                                <Camera size={14} />
                                            </button>
                                        </div>
                                    </Field>
                                </div>
                            </section>

                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                            <ImageIcon size={13} />{t('auto.urun_gorseli')}</div>
                        <div className="flex flex-col items-center gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-4">
                            {form.imageUrl ? (
                                <div className="relative h-32 w-32 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, imageUrl: null })}
                                        className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded shadow-sm text-rose-600 hover:bg-rose-50 transition-colors"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex h-32 w-32 items-center justify-center rounded-md bg-white border border-dashed border-slate-300 text-slate-400">
                                    <ImageIcon size={28} />
                                </div>
                            )}
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleImage(f);
                                }}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon={<Upload size={13} />}
                                onClick={() => fileRef.current?.click()}
                                className="w-full justify-center"
                            >
                                {form.imageUrl ?t('auto.gorseli_degistir') :t('auto.gorsel_yukle')}
                            </Button>
                        </div>
                    </section>

                </div>
            </div>
            )}

            {activeTab === 'stock' && (
                <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-2 xl:items-start">
                    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                            <AlertTriangle size={13} />{t('auto.stok_ayarlari')}</div>
                        <div className="flex flex-col gap-3">
                            <ArticleInfoRow label={t('auto.minimum')}>
                                <Input className={articleInputClass} size="sm" type="number" step="1" min={0} value={form.minStockLevel ?? 0} onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) || 0 })} />
                            </ArticleInfoRow>
                            <ArticleInfoRow label={t('auto.kritik_esik')}>
                                <Input className={articleInputClass} size="sm" type="number" step="1" min={0} value={form.criticalStockLevel ?? 0} onChange={(e) => setForm({ ...form, criticalStockLevel: Number(e.target.value) || 0 })} />
                            </ArticleInfoRow>
                            <ArticleInfoRow label={t('auto.maksimum')}>
                                <Input className={articleInputClass} size="sm" type="number" step="1" min={0} value={form.maxStockLevel ?? ''} onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value === '' ? null : Number(e.target.value) })} />
                            </ArticleInfoRow>
                            <ArticleInfoRow label={t('common.status')}>
                                <Select className="w-full" size="sm" value={form.status ?? 'ACTIVE'} onChange={(e) => setForm({ ...form, status: e.target.value as ArticleStatus })}>
                                    <option value="ACTIVE">{t('common.active')}</option>
                                    <option value="INACTIVE">{t('common.inactive')}</option>
                                    <option value="IN_SUPPLY">{t('inventory.articles.statusSupply')}</option>
                                    <option value="IN_PRODUCTION">{t('inventory.articles.statusProduction')}</option>
                                </Select>
                            </ArticleInfoRow>
                            <ArticleInfoRow label={t('auto.son_alim')}>
                                <Input className={articleInputClass} size="sm" type="date" value={form.lastPurchaseDate ? dayjs(form.lastPurchaseDate).format('YYYY-MM-DD') : ''} onChange={(e) => setForm({ ...form, lastPurchaseDate: e.target.value || null })} />
                            </ArticleInfoRow>
                        </div>
                    </section>

                    {isEdit ? (
                        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <Package size={13} />{t('auto.stok_hareketi_ekle')}</span>
                            </div>
                            {currentQty !== undefined && (
                                <div className="mb-3 rounded-md bg-slate-50 border border-slate-200 p-2 text-center text-[11.5px] text-slate-600">{"Mevcut Stok:"}<span className="font-semibold text-slate-900 text-[13px]">{new Intl.NumberFormat('de-CH').format(currentQty)} {form.unit}</span>
                                </div>
                            )}
                            <div className="flex flex-col gap-3">
                                <Field label={t('auto.hareket_tipi')}>
                                    <Select size="sm" value={form.adjustMovementType ?? 'IN'} onChange={(e) => setForm({ ...form, adjustMovementType: e.target.value as 'IN' | 'OUT' | 'ADJUSTMENT' })}>
                                        <option value="IN">{t('auto.giris_stok_artisi')}</option>
                                        <option value="OUT">{t('auto.cikis_stok_azalisi')}</option>
                                        <option value="ADJUSTMENT">{t('auto.duzeltme')}</option>
                                    </Select>
                                </Field>
                                <Field label={t('common.quantity')} hint={t('auto.0_ise_hareket_yok')}>
                                    <Input className={articleInputClass} size="sm" type="number" step="0.01" min={0} value={form.adjustQty ?? 0} onChange={(e) => setForm({ ...form, adjustQty: Number(e.target.value) || 0 })} />
                                </Field>
                                {COST_BEARING_MOVEMENTS.includes(form.adjustMovementType ?? 'IN') && (
                                    <Field
                                        label={t('auto.birim_maliyet_chf')}
                                        hint={t('auto.bu_partinin_alis_birim_maliyeti_agirlikli_ortala')}
                                    >
                                        <Input
                                            className={articleInputClass}
                                            size="sm"
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            value={form.adjustUnitCost ?? ''}
                                            onChange={(e) => setForm({ ...form, adjustUnitCost: e.target.value === '' ? undefined : Number(e.target.value) || 0 })}
                                            placeholder={t('auto.current_average_cost', { amount: fmtMoney(articleUnitCost(form)) })}
                                        />
                                    </Field>
                                )}
                                <Field label={t('common.location')} hint={(form.adjustQty ?? 0) > 0 ?t('auto.zorunlu') :t('auto.opsiyonel')}>
                                    {locations.length > 0 ? (
                                        <Select size="sm" value={form.adjustLocationId ?? ''} onChange={(e) => setForm({ ...form, adjustLocationId: e.target.value })}>
                                            <option value="">{t('auto.secin')}</option>
                                            {locations.map((l) => <option key={l.id} value={l.id}>{l.locationName}</option>)}
                                        </Select>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                                            <MapPin size={11} className="shrink-0" />
                                            <Link to="/inventory/locations" className="underline hover:text-amber-900">{t('auto.once_lokasyon_olusturun')}</Link>
                                        </div>
                                    )}
                                </Field>
                            </div>
                        </section>
                    ) : (
                        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                                <Plus size={13} />{t('auto.baslangic_stoku')}</div>
                            <div className="flex flex-col gap-3">
                                <Field label={t('auto.baslangic_stogu')}>
                                    <Input className={articleInputClass} size="sm" type="number" step="0.01" min={0} value={form.initialStock ?? 0} onChange={(e) => setForm({ ...form, initialStock: Number(e.target.value) || 0 })} />
                                </Field>
                                {(form.initialStock ?? 0) > 0 && (
                                    <Field
                                        label={t('auto.birim_maliyet_chf')}
                                        hint={t('auto.baslangic_stogunun_alis_birim_maliyeti_agirlikli')}
                                    >
                                        <Input
                                            className={articleInputClass}
                                            size="sm"
                                            type="number"
                                            step="0.01"
                                            min={0}
                                            value={form.initialStockUnitCost ?? ''}
                                            onChange={(e) => setForm({ ...form, initialStockUnitCost: e.target.value === '' ? undefined : Number(e.target.value) || 0 })}
                                            placeholder={t('auto.orn_12_50')}
                                        />
                                    </Field>
                                )}
                                {(form.initialStock ?? 0) > 0 && (
                                    locations.length > 0 ? (
                                        <Field label={t('common.location')} hint={t('auto.urun_hangi_depoya_girecek')}>
                                            <Select size="sm" value={form.initialStockLocationId ?? ''} onChange={(e) => setForm({ ...form, initialStockLocationId: e.target.value })}>
                                                <option value="">{t('auto.lokasyon_secin')}</option>
                                                {locations.map((l) => <option key={l.id} value={l.id}>{l.locationName}</option>)}
                                            </Select>
                                        </Field>
                                    ) : (
                                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                                            <MapPin size={13} className="mt-0.5 shrink-0 text-amber-600" />
                                            <span>{t('auto.baslangic_stogu_icin_once_depo_lokasyon_olusturu')}<Link to="/inventory/locations" className="font-semibold underline hover:text-amber-900">{t('auto.lokasyon_olustur')}</Link></span>
                                        </div>
                                    )
                                )}
                            </div>
                        </section>
                    )}

                    {isEdit && (() => {
                        const breakdown = articleCostBreakdown(initial);
                        const stockQty = Number(currentQty ?? breakdown.basisQty);
                        return (
                            <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs xl:col-span-2">
                                <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
                                    <Package size={13} />{t('auto.agirlikli_ortalama_birim_maliyet')}</div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[12.5px]">
                                        <thead className="border-b border-slate-100 text-[10.5px] uppercase text-slate-500">
                                            <tr>
                                                <th className="py-2 pr-3 text-left font-semibold">{t('auto.kaynak')}</th>
                                                <th className="px-3 py-2 text-right font-semibold">{t('auto.adet')}</th>
                                                <th className="px-3 py-2 text-right font-semibold">{t('auto.toplam_deger')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            <tr>
                                                <td className="py-2 pr-3 text-slate-600">{t('auto.tedarikten_gelen')}</td>
                                                <td className="px-3 py-2 text-right font-mono">{fmtNumber(breakdown.supplierQty)} {form.unit}</td>
                                                <td className="px-3 py-2 text-right font-mono">{fmtMoney(breakdown.supplierValue)}</td>
                                            </tr>
                                            <tr>
                                                <td className="py-2 pr-3 text-slate-600">{t('auto.manuel_stok_girisi')}</td>
                                                <td className="px-3 py-2 text-right font-mono">{fmtNumber(breakdown.manualQty)} {form.unit}</td>
                                                <td className="px-3 py-2 text-right font-mono">{fmtMoney(breakdown.manualValue)}</td>
                                            </tr>
                                            <tr className="bg-slate-50/70 font-semibold text-slate-800">
                                                <td className="py-2 pr-3">{t('common.total')}</td>
                                                <td className="px-3 py-2 text-right font-mono">{fmtNumber(breakdown.basisQty)} {form.unit}</td>
                                                <td className="px-3 py-2 text-right font-mono">{fmtMoney(breakdown.basisValue)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600">
                                    <div className="font-mono text-slate-700">
                                        {fmtMoney(breakdown.basisValue)} ÷ {fmtNumber(breakdown.basisQty)} {form.unit} ={' '}
                                        <span className="font-semibold text-slate-900">{fmtMoney(breakdown.unitCost)}</span> / {form.unit}
                                    </div>
                                    <div className="mt-1.5 flex items-baseline justify-between gap-2">
                                        <span className="text-[11px] uppercase tracking-wider text-slate-400">{t('auto.birim_maliyet')}</span>
                                        <span className="font-mono text-[15px] font-semibold text-slate-900">{fmtMoney(breakdown.unitCost)}</span>
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-400">{t('auto.mevcut_stok')}{fmtNumber(stockQty)} {form.unit}{t('auto.bu_birim_maliyet_teklif_ekranindaki_kar_zarar_he')}</div>
                                </div>
                            </section>
                        );
                    })()}
                </div>
            )}

            {activeTab === 'suppliers' && (
                <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start">
                    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase text-slate-500">
                                {editingSupplierLinkId ?t('auto.tedarik_kaydini_duzenle') :t('auto.manuel_tedarik_ekle')}
                            </span>
                            {editingSupplierLinkId && (
                                <button type="button" className="text-[11px] font-semibold text-slate-500 hover:text-slate-900" onClick={resetSupplierForm}>{t('auto.yeni_kayit')}</button>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[12px]">
                            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                <div className="text-slate-500">{t('auto.guncel_alis')}</div>
                                <div className="mt-1 font-semibold text-slate-900">{fmtMoney(Number(latestSupply?.purchasePrice || form.baseCost || 0))}</div>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                <div className="text-slate-500">{t('auto.toplam_adet')}</div>
                                <div className="mt-1 font-semibold text-slate-900">{fmtNumber(totalSupplyQuantity)} {form.unit}</div>
                            </div>
                            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                <div className="text-slate-500">{t('auto.toplam_alis')}</div>
                                <div className="mt-1 font-semibold text-slate-900">{fmtMoney(totalSupplyValue)}</div>
                            </div>
                        </div>
                        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px] text-slate-600">{t('auto.agirlikli_ortalama_maliyet')}<span className="font-mono font-semibold text-slate-900">{fmtMoney(articleUnitCost(form))}</span>
                        </div>
                        <div className="mt-4 space-y-3">
                            <Field label={t('auto.tedarikci')}>
                                <Select size="sm" value={supplierForm.supplierId} disabled={!!editingSupplierLinkId} onChange={(e) => setSupplierForm({ ...supplierForm, supplierId: e.target.value })}>
                                    <option value="">{t('auto.yeni_tedarikci')}</option>
                                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.companyName}</option>)}
                                </Select>
                            </Field>
                            {!supplierForm.supplierId && !editingSupplierLinkId && (
                                <>
                                    <Field label={t('auto.sirket_adi')}><Input size="sm" value={supplierForm.companyName} onChange={(e) => setSupplierForm({ ...supplierForm, companyName: e.target.value })} /></Field>
                                    <Field label={t('common.phone')}><Input size="sm" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></Field>
                                    <Field label={t('common.address')}><Input size="sm" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></Field>
                                </>
                            )}
                            <Field label={t('auto.tedarikci_kodu')}><Input size="sm" value={supplierForm.supplierSku} onChange={(e) => setSupplierForm({ ...supplierForm, supplierSku: e.target.value })} /></Field>
                            <Field label={t('auto.depo')} required>
                                {locations.length > 0 ? (
                                    <Select size="sm" value={supplierForm.locationId} onChange={(e) => setSupplierForm({ ...supplierForm, locationId: e.target.value })}>
                                        <option value="">{t('auto.depo_secin')}</option>
                                        {locations.map((location) => <option key={location.id} value={location.id}>{location.locationName}</option>)}
                                    </Select>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                                        <MapPin size={11} className="shrink-0" />
                                        <Link to="/inventory/locations" className="underline hover:text-amber-900">{t('auto.once_depo_lokasyon_olusturun')}</Link>
                                    </div>
                                )}
                            </Field>
                            <Field label={t('auto.eklenecek_adet')} required><Input size="sm" type="number" min={0} step="0.01" value={supplierForm.quantity} onChange={(e) => setSupplierForm({ ...supplierForm, quantity: Number(e.target.value) || 0 })} /></Field>
                            <Field label={t('auto.birim_alis_fiyati')}><Input size="sm" type="number" min={0} step="0.01" value={supplierForm.purchasePrice} onChange={(e) => setSupplierForm({ ...supplierForm, purchasePrice: Number(e.target.value) || 0 })} /></Field>
                            <Field label={t('auto.son_alim')}><Input size="sm" type="date" value={supplierForm.lastPurchaseDate} onChange={(e) => setSupplierForm({ ...supplierForm, lastPurchaseDate: e.target.value })} /></Field>
                            <Field label={t('auto.not')}><Input size="sm" value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></Field>
                            <Button className="w-full" size="sm" loading={supplierSaving} disabled={!isEdit} onClick={saveSupplier}>
                                {editingSupplierLinkId ?t('auto.tedarik_kaydini_guncelle') :t('auto.tedarik_kaydini_kaydet')}
                            </Button>
                            {!isEdit && <div className="text-[12px] text-slate-500">{t('auto.tedarikci_eklemek_icin_once_urunu_kaydedin')}</div>}
                        </div>
                    </section>

                    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="mb-3 text-[11px] font-semibold uppercase text-slate-500">{t('auto.urun_tedarik_kayitlari')}</div>
                        {articleSuppliers.length === 0 ? (
                            <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-[12px] text-slate-500">{t('auto.tedarik_bilgisi_yok_soldaki_formdan_manuel_ekley')}</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead className="border-b border-slate-100 text-[10.5px] uppercase text-slate-500">
                                        <tr>
                                            <th className="py-2 pr-3 text-left">{t('auto.tedarikci')}</th>
                                            <th className="px-3 py-2 text-left">{t('auto.depo')}</th>
                                            <th className="px-3 py-2 text-right">{t('auto.adet')}</th>
                                            <th className="px-3 py-2 text-right">{t('auto.birim_alis')}</th>
                                            <th className="px-3 py-2 text-right">{t('common.total')}</th>
                                            <th className="px-3 py-2 text-left">{t('auto.son_alim')}</th>
                                            <th className="py-2 pl-3 text-right">{t('common.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {articleSuppliers.map((row) => (
                                            <tr key={row.id} className={editingSupplierLinkId === row.id ? 'bg-blue-50/40' : ''}>
                                                <td className="py-3 pr-3">
                                                    <div className="truncate font-semibold text-slate-900">{row.supplier?.companyName || row.supplierId}</div>
                                                    <div className="text-[11px] text-slate-500">{row.supplierSku || '-'} {row.isPreferred ?t('auto.guncel_alis') : ''}</div>
                                                </td>
                                                <td className="px-3 py-3 text-slate-600">{row.location?.locationName || '-'}</td>
                                                <td className="px-3 py-3 text-right font-mono">{fmtNumber(Number(row.quantity || 0))} {form.unit}</td>
                                                <td className="px-3 py-3 text-right font-mono">{fmtMoney(row.purchasePrice)}</td>
                                                <td className="px-3 py-3 text-right font-mono">{fmtMoney(Number(row.quantity || 0) * Number(row.purchasePrice || 0))}</td>
                                                <td className="px-3 py-3 text-slate-600">{row.lastPurchaseDate ? dayjs(row.lastPurchaseDate).format('DD.MM.YYYY') : '-'}</td>
                                                <td className="py-3 pl-3 text-right">
                                                    <button type="button" className="mr-1 rounded px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => startEditSupplierLink(row)}>{t('common.edit')}</button>
                                                    <button type="button" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => void removeSupplierLink(row.id)}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {scannerOpen && (
                <BarcodeScannerModal
                    mode={scannerMode}
                    onClose={() => setScannerOpen(false)}
                    onScan={(code) => {
                        if (scannerMode === 'serial') {
                            setForm((prev) => ({ ...prev, supplierBarcode: code }));
                        } else {
                            setForm((prev) => ({ ...prev, systemBarcode: code }));
                        }
                        setScannerOpen(false);
                    }}
                />
            )}
        </>
    );
};
