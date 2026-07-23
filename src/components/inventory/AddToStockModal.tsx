import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Package, SearchLg as Search } from '@/components/icons/antIconCompat';

import { Modal } from '../ui-shared/Modal';
import { Button } from '../ui-shared/Button';
import { Field, Input, Select } from '../ui-shared/Field';

import { inventoryApi } from '../../lib/api/inventory';
import { useInventoryStore } from '../../store/inventoryStore';
import type { SupplierRow } from '../../types/inventory';

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);

type SourceMode = 'supplier' | 'manual';

interface AddToStockModalProps {
    open: boolean;
    onClose: () => void;
    /** Modal açıldığında önceden seçili kalem (opsiyonel). */
    presetArticleId?: string | null;
    /** Önceden doldurulacak miktar (tedarik talebinden gelen). */
    presetQuantity?: number | null;
    /** Önceden seçili tedarikçi (tedarik talebinden gelen). */
    presetSupplierId?: string | null;
    /** Stoğa ekleme başarılı olduğunda çağrılır. */
    onDone?: () => void;
}

/**
 * Envanter "Stoğa Ekle" akışı: kalem (ürün/malzeme) seç, tedarikçiden ya da manuel
 * olarak alış maliyetiyle birlikte stoğa ekle. Lokasyon seçimi yoktur; arka uçta tek
 * global ana depo kullanılır. Ağırlıklı ortalama maliyet mevcut mantıkla hesaplanır.
 */
export const AddToStockModal = ({ open, onClose, presetArticleId, presetQuantity, presetSupplierId, onDone }: AddToStockModalProps) => {
    const { articles, fetchArticlesSummary } = useInventoryStore();

    const [articleId, setArticleId] = useState('');
    const [search, setSearch] = useState('');
    const [mode, setMode] = useState<SourceMode>('supplier');
    const [quantity, setQuantity] = useState(0);
    const [unitCost, setUnitCost] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [newSupplierName, setNewSupplierName] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [lastPurchaseDate, setLastPurchaseDate] = useState('');
    const [notes, setNotes] = useState('');
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        if (!articles.length) void fetchArticlesSummary();
        void inventoryApi.listSuppliers().then(setSuppliers).catch(() => undefined);
    }, [open, articles.length, fetchArticlesSummary]);

    useEffect(() => {
        if (!open) return;
        setArticleId(presetArticleId ?? '');
        setSearch('');
        setMode('supplier');
        setQuantity(presetQuantity ?? 0);
        setUnitCost('');
        setSupplierId(presetSupplierId ?? '');
        setNewSupplierName('');
        setSupplierPhone('');
        setLastPurchaseDate('');
        setNotes('');
    }, [open, presetArticleId, presetQuantity, presetSupplierId]);

    const selected = articles.find((a) => a.id === articleId) || null;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q
            ? articles.filter(
                (a) =>
                    a.name.toLowerCase().includes(q) ||
                    a.articleCode.toLowerCase().includes(q) ||
                    (a.supplierBarcode || '').toLowerCase().includes(q),
            )
            : articles;
        return list.slice(0, 40);
    }, [articles, search]);

    const submit = async () => {
        if (!selected) {
            toast.error('Önce bir kalem seçin.');
            return;
        }
        if (!(quantity > 0)) {
            toast.error('Miktar sıfırdan büyük olmalı.');
            return;
        }
        const cost = unitCost.trim() === '' ? 0 : Number(unitCost.replace(',', '.'));
        if (!Number.isFinite(cost) || cost < 0) {
            toast.error('Geçerli bir alış maliyeti girin.');
            return;
        }
        if (mode === 'supplier' && !supplierId && !newSupplierName.trim()) {
            toast.error('Tedarikçi seçin veya yeni tedarikçi adı girin.');
            return;
        }
        setSaving(true);
        try {
            if (mode === 'supplier') {
                await inventoryApi.saveArticleSupplier(selected.id, {
                    supplierId: supplierId || undefined,
                    companyName: newSupplierName || undefined,
                    phone: supplierPhone || undefined,
                    purchasePrice: cost,
                    quantity,
                    lastPurchaseDate: lastPurchaseDate || undefined,
                    notes: notes || undefined,
                    isPreferred: true,
                });
            } else {
                await inventoryApi.scanMovement({
                    codeOrBarcode: selected.articleCode,
                    movementType: 'IN',
                    quantity,
                    unitCost: cost > 0 ? cost : null,
                    description: notes || 'Manuel stok girişi',
                });
            }
            toast.success(`${fmtNumber(quantity)} ${selected.unit} stoğa eklendi.`);
            await fetchArticlesSummary();
            onDone?.();
            onClose();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Stoğa eklenemedi.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Stoğa Ekle"
            description="Bir kalem seçin, tedarikçiden ya da manuel olarak alış maliyetiyle stoğa ekleyin."
            width="lg"
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Vazgeç</Button>
                    <Button variant="primary" size="sm" loading={saving} onClick={submit}>Stoğa Ekle</Button>
                </>
            }
        >
            <div className="space-y-4">
                {/* Kalem seçimi */}
                <div>
                    <div className="mb-1.5 text-[12px] font-semibold text-slate-700">Kalem (ürün / malzeme)</div>
                    {selected ? (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                                {selected.imageUrl ? (
                                    <img src={selected.imageUrl} alt="" className="h-9 w-9 rounded-md border border-slate-200 object-cover" />
                                ) : (
                                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white text-slate-400 ring-1 ring-slate-200">
                                        <Package size={15} />
                                    </span>
                                )}
                                <div className="min-w-0">
                                    <div className="truncate text-[13px] font-medium text-slate-800">{selected.name}</div>
                                    <div className="font-mono text-[11px] text-slate-500">
                                        {selected.articleCode} · {fmtNumber(selected.totalQuantity)} {selected.unit} mevcut
                                    </div>
                                </div>
                            </div>
                            <button type="button" className="shrink-0 text-[12px] font-semibold text-blue-700 hover:text-blue-900" onClick={() => setArticleId('')}>
                                Değiştir
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-md border border-slate-200 bg-white">
                            <div className="relative border-b border-slate-100">
                                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Ara: kod, ad veya seri no"
                                    className="w-full bg-transparent py-2 pl-7 pr-3 text-[12.5px] focus:outline-none"
                                    autoFocus
                                />
                            </div>
                            <div className="max-h-56 overflow-y-auto">
                                {filtered.length === 0 ? (
                                    <div className="px-3 py-6 text-center text-[12px] text-slate-400">Kalem bulunamadı.</div>
                                ) : (
                                    filtered.map((a) => (
                                        <button
                                            key={a.id}
                                            type="button"
                                            onClick={() => { setArticleId(a.id); setSearch(''); }}
                                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-100"
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate text-[12.5px] font-medium text-slate-800">{a.name}</div>
                                                <div className="font-mono text-[10.5px] text-slate-500">{a.articleCode}</div>
                                            </div>
                                            <span className="shrink-0 font-mono text-[11px] text-slate-500">{fmtNumber(a.totalQuantity)} {a.unit}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Kaynak: tedarikçi / manuel */}
                <div>
                    <div className="mb-1.5 text-[12px] font-semibold text-slate-700">Stoğa ekleme şekli</div>
                    <div className="inline-flex w-full items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
                        {([['supplier', 'Tedarikçiden'], ['manual', 'Manuel']] as const).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setMode(key)}
                                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                                    mode === key ? 'bg-white text-[#272f67] shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Miktar + maliyet */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Eklenecek miktar" required>
                        <Input size="sm" type="number" min={0} step="0.01" value={quantity} onChange={(e) => setQuantity(Number(e.target.value) || 0)} />
                    </Field>
                    <Field label="Birim alış maliyeti (CHF)" hint="Ağırlıklı ortalama maliyete katılır">
                        <Input size="sm" type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="örn. 12.50" />
                    </Field>
                </div>

                {mode === 'supplier' && (
                    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/50 p-3">
                        <Field label="Tedarikçi">
                            <Select size="sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                                <option value="">Yeni tedarikçi…</option>
                                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                            </Select>
                        </Field>
                        {!supplierId && (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Field label="Şirket adı" required>
                                    <Input size="sm" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
                                </Field>
                                <Field label="Telefon">
                                    <Input size="sm" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
                                </Field>
                            </div>
                        )}
                        <Field label="Son alım tarihi">
                            <Input size="sm" type="date" value={lastPurchaseDate} onChange={(e) => setLastPurchaseDate(e.target.value)} />
                        </Field>
                    </div>
                )}

                <Field label="Not">
                    <Input size="sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsiyonel" />
                </Field>

                {selected && quantity > 0 && (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
                        <span className="font-semibold text-slate-900">{fmtNumber(quantity)} {selected.unit}</span>
                        {unitCost.trim() !== '' && Number(unitCost.replace(',', '.')) > 0 && (
                            <> · toplam {fmtMoney(quantity * Number(unitCost.replace(',', '.')))}</>
                        )}
                        {' '}stoğa eklenecek.
                    </div>
                )}
            </div>
        </Modal>
    );
};
