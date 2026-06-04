import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
    AlertTriangle,
    BarChart03 as BarChart3,
    Bold01 as Bold,
    Camera01 as Camera,
    ChevronRight,
    Edit01 as Edit2,
    Hash01 as Hash,
    Image01 as ImageIcon,
    Italic01 as Italic,
    List,
    MarkerPin01 as MapPin,
    Package,
    Plus,
    Scan as ScanBarcode,
    Scan as ScanLine,
    SearchLg as Search,
    Trash01 as Trash2,
    UploadCloud02 as Upload,
    X,
} from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { Skeleton } from '../../components/ui-shared/Skeleton';
import { BarcodeScannerModal } from '../../components/ui-shared/BarcodeScannerModal';

import { useInventoryStore } from '../../store/inventoryStore';
import { useAuthStore } from '../../store/authStore';
import { inventoryApi } from '../../lib/api/inventory';
import type { ArticleStatus, ArticleStockSummary, InventoryArticle } from '../../types/inventory';

const STATUS_LABEL: Record<ArticleStatus, string> = {
    ACTIVE: 'Aktif',
    INACTIVE: 'Pasif',
    IN_SUPPLY: 'Tedarikte',
    IN_PRODUCTION: 'Üretimde',
};

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
    unit: 'Stk',
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
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0
        || permissions.includes('inventory.articles.create')
        || permissions.includes('inventory.articles.update');

    const { articles, articlesLoading, fetchArticlesSummary, createArticle, updateArticle, deleteArticle } = useInventoryStore();

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [editing, setEditing] = useState<Partial<InventoryArticle> | null>(null);
    const [detailView, setDetailView] = useState<ArticleStockSummary | null>(null);
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
            // Serial code is unique — will show exactly one match
            toast.success(`Seri kodu tarandı: ${code}`);
        } else {
            // General code is a category — will show all products in that group
            toast.success(`Genel kod tarandı: ${code} — kategori filtrelendi`);
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
        const totalValue = articles.reduce((s, a) => s + a.totalQuantity * (a.baseCost || 0), 0);
        const critical = articles.filter((a) => a.criticalStockLevel > 0 && a.totalQuantity <= a.criticalStockLevel).length;
        return { total: articles.length, totalQty, totalValue, critical };
    }, [articles]);

    return (
        <div>
            <PageHeader
                breadcrumb="Stok › Ürünler"
                title="Stok Kartları"
                description="Tüm ürünleri, barkodları, görselleri ve minimum/kritik stok seviyelerini buradan yönetin."
                actions={
                    canManage && (
                        <Button variant="primary" icon={<Plus size={13} />} onClick={() => setEditing(emptyArticle())}>
                            Yeni Ürün
                        </Button>
                    )
                }
            />

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatBox label="Toplam Ürün" value={`${stats.total}`} active />
                <StatBox label="Toplam Adet" value={fmtNumber(stats.totalQty)} />
                <StatBox label="Stok Değeri" value={fmtMoney(stats.totalValue)} small />
                <StatBox label="Kritik Seviye" value={`${stats.critical}`} accent={stats.critical > 0 ? 'rose' : undefined} />
            </div>

            <Card
                title="Ürün Listesi"
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
                                placeholder="Ara: kod, ad, barkod"
                                className="pl-6 pr-2.5 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-slate-50/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10 focus:border-blue-400 transition-colors w-[180px] md:w-[220px]"
                            />
                        </div>
                        <button
                            onClick={() => openBarcodeScanner('serial')}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-300 rounded-lg transition-colors"
                            title="Seri kodu ile ürün bul"
                        >
                            <Camera size={12} />
                            <span className="hidden sm:inline">Seri Kod Tara</span>
                        </button>
                        <button
                            onClick={() => openBarcodeScanner('general')}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-300 rounded-lg transition-colors"
                            title="Genel kod ile kategori filtrele"
                        >
                            <ScanLine size={12} />
                            <span className="hidden sm:inline">Genel Kod Tara</span>
                        </button>
                        <Select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-2 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                        >
                            <option value="">Tüm durumlar</option>
                            <option value="ACTIVE">Aktif</option>
                            <option value="INACTIVE">Pasif</option>
                            <option value="IN_SUPPLY">Tedarikte</option>
                            <option value="IN_PRODUCTION">Üretimde</option>
                        </Select>
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-500 border border-slate-200 rounded-lg transition-colors"
                            >
                                <X size={11} />
                                Filtreyi Temizle
                            </button>
                        )}
                    </div>
                }
            >
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-[12.5px]">
                        <thead className="text-[10.5px] text-[#86868B] bg-slate-50/70 border-b border-slate-100 uppercase tracking-[0.08em]">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">Görsel</th>
                                <th className="px-3 py-2 text-left font-semibold">Stok Kodu</th>
                                <th className="px-3 py-2 text-left font-semibold">Ürün Adı</th>
                                <th className="px-3 py-2 text-left font-semibold">Barkod / Seri No</th>
                                <th className="px-3 py-2 text-right font-semibold">Maliyet</th>
                                <th className="px-3 py-2 text-right font-semibold">Mevcut</th>
                                <th className="px-3 py-2 text-right font-semibold">Min/Kritik</th>
                                <th className="px-3 py-2 text-left font-semibold">Sipariş Tarihi</th>
                                <th className="px-3 py-2 text-left font-semibold">Durum</th>
                                <th className="px-3 py-2 text-right font-semibold w-[110px]">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {articlesLoading && Array.from({ length: 6 }).map((_, i) => (
                                <tr key={`article-skeleton-${i}`}>
                                    {Array.from({ length: 10 }).map((__, j) => (
                                        <td key={j} className="px-3 py-2">
                                            <Skeleton className={`${j === 0 ? 'h-9 w-9 rounded' : j === 8 ? 'h-5 w-16 rounded-full' : 'h-4 w-full max-w-[120px]'} ${j >= 4 && j <= 6 ? 'ml-auto' : ''} bg-slate-100`} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {false && articlesLoading && (
                                <tr>
                                    <td colSpan={10} className="px-4 py-8 text-center text-slate-400">Yükleniyor...</td>
                                </tr>
                            )}
                            {!articlesLoading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={10}>
                                        <EmptyState
                                            icon={<Package size={32} />}
                                            title="Ürün yok"
                                            description="İlk ürününüzü ekleyerek başlayın."
                                            action={canManage && (
                                                <Button variant="primary" icon={<Plus size={13} />} onClick={() => setEditing(emptyArticle())}>
                                                    Yeni Ürün
                                                </Button>
                                            )}
                                        />
                                    </td>
                                </tr>
                            )}
                            {!articlesLoading && filtered.map((a) => {
                                const isCritical = a.criticalStockLevel > 0 && a.totalQuantity <= a.criticalStockLevel;
                                const isBelowMin = a.minStockLevel > 0 && a.totalQuantity <= a.minStockLevel;
                                return (
                                    <tr key={a.id} className="hover:bg-slate-50/60 cursor-pointer transition-colors" onClick={() => setDetailView(a)}>
                                        <td className="px-3 py-2 w-[60px]">
                                            {a.imageUrl ? (
                                                <img src={a.imageUrl} alt={a.name} className="w-9 h-9 rounded object-cover border border-slate-200" />
                                            ) : (
                                                <div className="w-9 h-9 rounded bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                                                    <ImageIcon size={14} />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-[11.5px] text-slate-700">{a.articleCode}</td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-slate-800 truncate max-w-[260px]">{a.name}</div>
                                            {a.category && <div className="text-[10.5px] text-slate-400 mt-0.5">{a.category}</div>}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                                            {a.systemBarcode || a.supplierBarcode || '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtMoney(a.baseCost)}/{a.unit}</td>
                                        <td className="px-3 py-2 text-right font-mono">
                                            <span className={isBelowMin ? 'text-rose-700 font-semibold' : isCritical ? 'text-amber-700 font-semibold' : 'text-slate-800'}>
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
                                                {STATUS_LABEL[a.status]}
                                            </StatusChip>
                                        </td>
                                        <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="inline-flex items-center gap-1">
                                                {canManage && (
                                                    <>
                                                        <button
                                                            onClick={() => setEditing(a)}
                                                            className="p-1 rounded text-slate-400 transition-colors"
                                                            title="Düzenle"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (!confirm(`${a.name} silinsin mi?`)) return;
                                                                try {
                                                                    await deleteArticle(a.id);
                                                                    toast.success('Ürün silindi.');
                                                                } catch (e: any) {
                                                                    toast.error(e.response?.data?.error || 'Silinemedi.');
                                                                }
                                                            }}
                                                            className="p-1 rounded text-slate-400 transition-colors"
                                                            title="Sil"
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

            {/* Article Form Modal */}
            {editing && (
                <ArticleFormModal
                    initial={editing}
                    onClose={() => setEditing(null)}
                    onSubmit={async (data) => {
                        try {
                            if (editing.id) {
                                await updateArticle(editing.id, data);
                                if (data.adjustQty && data.adjustQty > 0 && data.adjustLocationId) {
                                    const movType = data.adjustMovementType ?? 'IN';
                                    try {
                                        await inventoryApi.scanMovement({
                                            codeOrBarcode: data.articleCode!,
                                            movementType: movType,
                                            quantity: data.adjustQty,
                                            destLocationId: (movType === 'IN' || movType === 'ADJUSTMENT') ? data.adjustLocationId : null,
                                            sourceLocationId: (movType === 'OUT') ? data.adjustLocationId : null,
                                            description: `Manuel düzeltme — ${movType}`,
                                        });
                                        toast.success(`Ürün güncellendi ve ${data.adjustQty} adet stok hareketi kaydedildi.`);
                                    } catch (e: any) {
                                        toast.warning(`Ürün güncellendi ancak stok hareketi başarısız: ${e.response?.data?.error || e.message}`);
                                    }
                                } else {
                                    toast.success('Ürün güncellendi.');
                                }
                            } else {
                                const created = await createArticle(data);
                                if (data.initialStock && data.initialStock > 0 && data.initialStockLocationId && created) {
                                    try {
                                        await inventoryApi.scanMovement({
                                            codeOrBarcode: created.articleCode,
                                            movementType: 'IN',
                                            quantity: data.initialStock,
                                            destLocationId: data.initialStockLocationId,
                                            description: 'Başlangıç stoğu'
                                        });
                                        toast.success(`Ürün oluşturuldu ve ${data.initialStock} adet stok eklendi.`);
                                    } catch (e: any) {
                                        toast.error(`Ürün oluşturuldu ancak stok eklenemedi: ${e.response?.data?.error || e.message}`);
                                    }
                                } else {
                                    toast.success('Ürün oluşturuldu.');
                                }
                            }
                            await fetchArticlesSummary();
                            setEditing(null);
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Kaydedilemedi.');
                        }
                    }}
                />
            )}

            {/* Detail Modal */}
            {detailView && (
                <ArticleDetailModal article={detailView} onClose={() => setDetailView(null)} onEdit={() => { setEditing(detailView); setDetailView(null); }} canManage={canManage} />
            )}

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

const StatBox: React.FC<{ label: string; value: string; small?: boolean; accent?: 'rose'; active?: boolean }> = ({ label, value, small, accent, active }) => (
    <div className={`rounded-lg border bg-white px-4 py-3 ${active ? 'border-blue-600' : 'border-slate-200'}`}>
        <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-[0.08em]">{label}</div>
        <div className={`mt-1 ${small ? 'text-[14px]' : 'text-[18px]'} font-semibold ${accent === 'rose' ? 'text-rose-700' : 'text-slate-800'}`}>
            {value}
        </div>
    </div>
);

type FormData = Partial<InventoryArticle> & {
    initialStock?: number;
    initialStockLocationId?: string;
    adjustQty?: number;
    adjustMovementType?: 'IN' | 'OUT' | 'ADJUSTMENT';
    adjustLocationId?: string;
};

const ArticleFormModal: React.FC<{
    initial: FormData;
    onClose: () => void;
    onSubmit: (data: FormData) => Promise<void>;
}> = ({ initial, onClose, onSubmit }) => {
    const [form, setForm] = useState<FormData>({ ...initial });
    const [submitting, setSubmitting] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');
    const fileRef = useRef<HTMLInputElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);
    const { locations, fetchLocations } = useInventoryStore();

    useEffect(() => {
        fetchLocations();
    }, [fetchLocations]);

    const isEdit = !!initial.id;
    const currentQty = (initial as any).totalQuantity as number | undefined;

    const handleImage = async (file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Görsel 2 MB sınırını aşıyor.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            setForm((p) => ({ ...p, imageUrl: e.target?.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const insertDescriptionFormat = (before: string, after = '') => {
        const current = form.description ?? '';
        const el = descRef.current;
        const start = el?.selectionStart ?? current.length;
        const end = el?.selectionEnd ?? current.length;
        const selected = current.slice(start, end) || 'metin';
        const next = `${current.slice(0, start)}${before}${selected}${after}${current.slice(end)}`;
        setForm((p) => ({ ...p, description: next }));
        requestAnimationFrame(() => {
            descRef.current?.focus();
            descRef.current?.setSelectionRange(start + before.length, start + before.length + selected.length);
        });
    };

    const insertDescriptionBullet = () => {
        const current = form.description ?? '';
        const el = descRef.current;
        const start = el?.selectionStart ?? current.length;
        const prefix = start === 0 || current[start - 1] === '\n' ? '- ' : '\n- ';
        setForm((p) => ({ ...p, description: `${current.slice(0, start)}${prefix}${current.slice(start)}` }));
        requestAnimationFrame(() => descRef.current?.focus());
    };

    return (
        <Modal
            open
            title={isEdit ? 'Ürünü Düzenle' : 'Yeni Ürün Oluştur'}
            description="Stok kartı bilgilerini tanımlayın. Barkod ile veya manuel olarak ürün bilgilerini girebilirsiniz."
            onClose={onClose}
            width="full"
            closeOnBackdrop={false}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>İptal</Button>
                    <Button
                        variant="primary"
                        loading={submitting}
                        onClick={async () => {
                            if (!form.articleCode || !form.name || !form.unit) {
                                toast.error('Kod, ad ve birim zorunludur.');
                                return;
                            }
                            if (!isEdit && (form.initialStock ?? 0) > 0 && locations.length > 0 && !form.initialStockLocationId) {
                                toast.error('Başlangıç stoğu girildiğinde lokasyon seçimi zorunludur.');
                                return;
                            }
                            if (isEdit && (form.adjustQty ?? 0) > 0 && !form.adjustLocationId) {
                                toast.error('Stok hareketi için lokasyon seçimi zorunludur.');
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
                        }}
                    >
                        {isEdit ? 'Güncelle' : 'Oluştur'}
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-3 items-start gap-3">
                <div className="col-span-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
                    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                        <ScanBarcode size={13} />
                        Barkod Bilgileri
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Genel Ürün Kodu" hint="Kategori barkodu · isteğe bağlı">
                            <button
                                type="button"
                                onClick={() => { setScannerMode('general'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors"
                            >
                                <Camera size={16} />
                                Kamera ile Genel Kod Tara
                            </button>
                            <div className="flex items-center gap-1.5">
                                <Hash size={13} className="shrink-0 text-muted-foreground" />
                                <Input value={form.systemBarcode ?? ''} onChange={(e) => setForm({ ...form, systemBarcode: e.target.value })} placeholder="Barkod okutun veya yazın..." className="flex-1" />
                            </div>
                        </Field>
                        <Field label="Ürün Seri Kodu" hint="Zorunlu · her ürüne özgü" required>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors"
                            >
                                <Camera size={16} />
                                Kamera ile Seri Kod Tara
                            </button>
                            <div className="flex items-center gap-1.5">
                                <ScanBarcode size={13} className="shrink-0 text-blue-600" />
                                <Input value={form.supplierBarcode ?? ''} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder="Seri kodu okutun veya yazın..." className="flex-1" />
                            </div>
                        </Field>
                    </div>
                </div>

                {/* Image upload */}
                <div className="col-span-3 md:col-span-1">
                    <Field label="Ürün Görseli">
                        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-3">
                            {form.imageUrl ? (
                                <div className="relative h-48 w-full overflow-hidden rounded bg-muted md:h-56">
                                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover rounded" />
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, imageUrl: null })}
                                        className="absolute top-1 right-1 p-1 bg-white/90 rounded shadow text-rose-600"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex h-48 w-full items-center justify-center rounded bg-muted text-muted-foreground md:h-56">
                                    <ImageIcon size={34} />
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
                                icon={<Upload size={11} />}
                                onClick={() => fileRef.current?.click()}
                            >
                                {form.imageUrl ? 'Görseli Değiştir' : 'Görsel Yükle'}
                            </Button>
                            <p className="text-[10.5px] text-slate-400 text-center">PNG/JPG, en fazla 2 MB</p>
                        </div>
                    </Field>
                </div>

                <div className="col-span-3 grid grid-cols-2 content-start gap-3 md:col-span-2">
                    <Field label="Stok Kodu" required>
                        <Input value={form.articleCode ?? ''} onChange={(e) => setForm({ ...form, articleCode: e.target.value })} placeholder="ART-2026-001" />
                    </Field>
                    <Field label="Birim" required>
                        <Input value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Stk, m², kg..." />
                    </Field>
                    <Field label="Ürün Adı" required className="col-span-2">
                        <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label="Kategori">
                        <Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Hidrolik, Servis..." />
                    </Field>
                    <Field label="Birim Maliyet (CHF)">
                        <Input type="number" step="1" min={0} value={form.baseCost ?? 0} onChange={(e) => setForm({ ...form, baseCost: Number(e.target.value) || 0 })} />
                    </Field>
                </div>

                <div className="col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label="Minimum Seviye" hint="Varsayılan: 10">
                        <Input type="number" step="1" min={0} value={form.minStockLevel ?? 0} onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Kritik Eşik" hint="Varsayılan: 5">
                        <Input type="number" step="1" min={0} value={form.criticalStockLevel ?? 0} onChange={(e) => setForm({ ...form, criticalStockLevel: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Maksimum (ops.)">
                        <Input
                            type="number"
                            step="1"
                            min={0}
                            value={form.maxStockLevel ?? ''}
                            onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                    </Field>
                    <Field label="Durum">
                        <Select
                            value={form.status ?? 'ACTIVE'}
                            onChange={(e) => setForm({ ...form, status: e.target.value as ArticleStatus })}
                        >
                            <option value="ACTIVE">Aktif</option>
                            <option value="INACTIVE">Pasif</option>
                            <option value="IN_SUPPLY">Tedarikte</option>
                            <option value="IN_PRODUCTION">Üretimde</option>
                        </Select>
                    </Field>
                </div>

                <Field label="Son Sipariş / Alım Tarihi" className="col-span-3 md:col-span-1">
                    <Input
                        type="date"
                        value={form.lastPurchaseDate ? dayjs(form.lastPurchaseDate).format('YYYY-MM-DD') : ''}
                        onChange={(e) => setForm({ ...form, lastPurchaseDate: e.target.value || null })}
                    />
                </Field>

                {isEdit && (
                    <div className="col-span-3">
                        <div className="border border-slate-200 rounded-md p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                                    Stok Hareketi Ekle
                                </span>
                                {currentQty !== undefined && (
                                    <span className="text-[11.5px] text-slate-500">
                                        Mevcut Stok:{' '}
                                        <span className="font-semibold text-slate-800">
                                            {new Intl.NumberFormat('de-CH').format(currentQty)} {form.unit}
                                        </span>
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Hareket Tipi">
                                    <Select
                                        value={form.adjustMovementType ?? 'IN'}
                                        onChange={(e) => setForm({ ...form, adjustMovementType: e.target.value as 'IN' | 'OUT' | 'ADJUSTMENT' })}
                                    >
                                        <option value="IN">Giriş (Stok Artışı)</option>
                                        <option value="OUT">Çıkış (Stok Azalışı)</option>
                                        <option value="ADJUSTMENT">Düzeltme</option>
                                    </Select>
                                </Field>
                                <Field label="Miktar" hint="0 bırakılırsa hareket kaydedilmez">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min={0}
                                        value={form.adjustQty ?? 0}
                                        onChange={(e) => setForm({ ...form, adjustQty: Number(e.target.value) || 0 })}
                                    />
                                </Field>
                                <Field label="Lokasyon" hint={(form.adjustQty ?? 0) > 0 ? 'Zorunlu' : 'Opsiyonel'}>
                                    {locations.length > 0 ? (
                                        <Select
                                            value={form.adjustLocationId ?? ''}
                                            onChange={(e) => setForm({ ...form, adjustLocationId: e.target.value })}
                                        >
                                            <option value="">— Seçin —</option>
                                            {locations.map((l) => (
                                                <option key={l.id} value={l.id}>{l.locationName}</option>
                                            ))}
                                        </Select>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                                            <MapPin size={11} className="shrink-0" />
                                            <Link to="/inventory/locations" className="underline hover:text-amber-900">
                                                Önce lokasyon oluşturun →
                                            </Link>
                                        </div>
                                    )}
                                </Field>
                            </div>
                        </div>
                    </div>
                )}

                {!isEdit && (
                    <>
                        <Field label="Başlangıç Stoğu (Adet)" className="col-span-3 md:col-span-1">
                            <Input
                                type="number"
                                step="0.01"
                                min={0}
                                value={form.initialStock ?? 0}
                                onChange={(e) => setForm({ ...form, initialStock: Number(e.target.value) || 0 })}
                            />
                        </Field>
                        {(form.initialStock ?? 0) > 0 && (
                            locations.length > 0 ? (
                                <Field label="Stoğu Ekle: Lokasyon" className="col-span-3 md:col-span-1" hint="Ürün hangi depoya girecek?">
                                    <Select
                                        value={form.initialStockLocationId ?? ''}
                                        onChange={(e) => setForm({ ...form, initialStockLocationId: e.target.value })}
                                    >
                                        <option value="">— Lokasyon seçin —</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            ) : (
                                <div className="col-span-3 md:col-span-1 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11.5px] text-amber-800">
                                    <MapPin size={13} className="mt-0.5 shrink-0 text-amber-600" />
                                    <span>
                                        Başlangıç stoğu eklemek için önce bir depo/lokasyon oluşturmalısınız.{' '}
                                        <Link to="/inventory/locations" className="font-semibold underline hover:text-amber-900">
                                            Lokasyon Oluştur →
                                        </Link>
                                    </span>
                                </div>
                            )
                        )}
                    </>
                )}

                <Field label="Açıklama" className="col-span-3">
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100 bg-slate-50/70">
                            <button type="button" title="Kalın" onClick={() => insertDescriptionFormat('**', '**')} className="w-7 h-6 rounded flex items-center justify-center border border-transparent">
                                <Bold size={12} />
                            </button>
                            <button type="button" title="İtalik" onClick={() => insertDescriptionFormat('_', '_')} className="w-7 h-6 rounded flex items-center justify-center border border-transparent">
                                <Italic size={12} />
                            </button>
                            <button type="button" title="Madde işareti" onClick={insertDescriptionBullet} className="w-7 h-6 rounded flex items-center justify-center border border-transparent">
                                <List size={12} />
                            </button>
                        </div>
                        <textarea
                            ref={descRef}
                            rows={6}
                            value={form.description ?? ''}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            className="w-full min-h-[150px] px-3 py-2 text-[12.5px] bg-white focus:outline-none resize-y"
                        />
                    </div>
                </Field>
            </div>

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
        </Modal>
    );
};

const ArticleDetailModal: React.FC<{
    article: ArticleStockSummary;
    onClose: () => void;
    onEdit: () => void;
    canManage: boolean;
}> = ({ article, onClose, onEdit, canManage }) => {
    return (
        <Modal
            open
            title={article.name}
            description={`Stok Kodu: ${article.articleCode}`}
            onClose={onClose}
            width="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Kapat</Button>
                    {canManage && (
                        <Button variant="primary" icon={<Edit2 size={13} />} onClick={onEdit}>
                            Düzenle
                        </Button>
                    )}
                </>
            }
        >
            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                    {article.imageUrl ? (
                        <img src={article.imageUrl} alt={article.name} className="w-full aspect-square rounded object-cover border border-slate-200" />
                    ) : (
                        <div className="w-full aspect-square rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300">
                            <ImageIcon size={48} />
                        </div>
                    )}
                </div>
                <div className="col-span-2 space-y-2.5">
                    <DetailRow label="Birim Maliyet" value={`${fmtMoney(article.baseCost)} / ${article.unit}`} />
                    <DetailRow label="Genel Ürün Kodu" value={article.systemBarcode || '—'} mono />
                    <DetailRow label="Ürün Seri Kodu" value={article.supplierBarcode || '—'} mono />
                    <DetailRow label="Kategori" value={article.category || '—'} />
                    <DetailRow label="Durum" value={STATUS_LABEL[article.status]} />
                    <DetailRow label="Son Sipariş" value={article.lastPurchaseDate ? dayjs(article.lastPurchaseDate).format('DD.MM.YYYY') : '—'} />
                    <DetailRow label="Min / Kritik / Max" value={`${fmtNumber(article.minStockLevel)} / ${fmtNumber(article.criticalStockLevel)} / ${article.maxStockLevel != null ? fmtNumber(article.maxStockLevel) : '—'}`} mono />
                    <DetailRow label="Toplam Mevcut" value={`${fmtNumber(article.totalQuantity)} ${article.unit}`} />
                </div>

                <div className="col-span-3">
                    <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                        <BarChart3 size={11} /> Lokasyon Bazlı Bakiyeler
                    </h4>
                    {article.balances.length === 0 ? (
                        <div className="text-[12px] text-slate-400 italic">Henüz hareket girilmemiş.</div>
                    ) : (
                        <table className="w-full text-[12px] border border-slate-200 rounded-md overflow-hidden">
                            <thead className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Lokasyon</th>
                                    <th className="px-3 py-2 text-left font-semibold">Tip</th>
                                    <th className="px-3 py-2 text-right font-semibold">Mevcut</th>
                                    <th className="px-3 py-2 text-right font-semibold">Rezerv</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {article.balances.map((b) => (
                                    <tr key={b.locationId}>
                                        <td className="px-3 py-2 font-medium text-slate-700">{b.locationName}</td>
                                        <td className="px-3 py-2 text-slate-500 text-[11px] uppercase tracking-wider">{b.locationType?.replace('_', ' ')?.toLowerCase()}</td>
                                        <td className="px-3 py-2 text-right font-mono">{fmtNumber(b.currentQuantity)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-500">{fmtNumber(b.reservedQuantity)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {article.description && (
                    <div className="col-span-3">
                        <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Açıklama</h4>
                        <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap">{article.description}</p>
                    </div>
                )}
            </div>
        </Modal>
    );
};

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
    <div className="flex items-center justify-between text-[12.5px] py-1.5 border-b border-slate-100 last:border-0">
        <span className="text-slate-500">{label}</span>
        <span className={`text-slate-800 ${mono ? 'font-mono text-[11.5px]' : ''}`}>{value}</span>
    </div>
);


