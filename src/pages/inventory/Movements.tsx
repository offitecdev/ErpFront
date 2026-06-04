import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import {
    AlertTriangle,
    ArrowDown as ArrowDownToLine,
    ArrowUp as ArrowUpFromLine,
    ClockRewind as History,
    Package,
    RefreshCcw01 as RotateCcw,
    Scan as ScanLine,
    Sliders02 as SlidersHorizontal,
    SwitchHorizontal01 as ArrowRightLeft,
} from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';

import { useInventoryStore } from '../../store/inventoryStore';
import { articleApi } from '../../lib/api/inventory';
import type { MovementType, InventoryArticle } from '../../types/inventory';

const MOVEMENT_LABEL: Record<MovementType, string> = {
    IN: 'Giriş',
    OUT: 'Çıkış',
    TRANSFER: 'Transfer',
    RETURN: 'İade',
    ADJUSTMENT: 'Düzeltme',
};

const MOVEMENT_VARIANT: Record<MovementType, 'active' | 'danger' | 'info' | 'warning' | 'neutral'> = {
    IN: 'active',
    OUT: 'danger',
    TRANSFER: 'info',
    RETURN: 'warning',
    ADJUSTMENT: 'neutral',
};

const MOVEMENT_ICON: Record<MovementType, React.ReactNode> = {
    IN: <ArrowDownToLine size={12} />,
    OUT: <ArrowUpFromLine size={12} />,
    TRANSFER: <ArrowRightLeft size={12} />,
    RETURN: <RotateCcw size={12} />,
    ADJUSTMENT: <SlidersHorizontal size={12} />,
};

const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);

export const Movements = () => {
    const { locations, fetchLocations, movements, fetchMovements, scanMovement } = useInventoryStore();

    const [form, setForm] = useState<{
        codeOrBarcode: string;
        movementType: MovementType;
        quantity: number;
        sourceLocationId: string;
        destLocationId: string;
        description: string;
    }>({
        codeOrBarcode: '',
        movementType: 'IN',
        quantity: 1,
        sourceLocationId: '',
        destLocationId: '',
        description: '',
    });

    const [resolvedArticle, setResolvedArticle] = useState<InventoryArticle | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchLocations();
    }, [fetchLocations]);

    const lookupArticle = async (code: string) => {
        if (!code.trim()) {
            setResolvedArticle(null);
            return;
        }
        const article = await articleApi.lookupByCode(code.trim());
        setResolvedArticle(article);
        if (article) fetchMovements(article.id);
    };

    const handleSubmit = async () => {
        if (!form.codeOrBarcode.trim()) {
            toast.error('Barkod veya stok kodu girin.');
            return;
        }
        if (form.quantity <= 0) {
            toast.error('Miktar 0\'dan büyük olmalı.');
            return;
        }

        const movementType = form.movementType;
        if ((movementType === 'IN' || movementType === 'RETURN') && !form.destLocationId) {
            toast.error('Giriş/İade için hedef lokasyon zorunludur.');
            return;
        }
        if (movementType === 'OUT' && !form.sourceLocationId) {
            toast.error('Çıkış için kaynak lokasyon zorunludur.');
            return;
        }
        if (movementType === 'TRANSFER' && (!form.sourceLocationId || !form.destLocationId)) {
            toast.error('Transfer için kaynak ve hedef lokasyon zorunludur.');
            return;
        }

        setSubmitting(true);
        try {
            await scanMovement({
                codeOrBarcode: form.codeOrBarcode.trim(),
                movementType: form.movementType,
                quantity: form.quantity,
                sourceLocationId: form.sourceLocationId || null,
                destLocationId: form.destLocationId || null,
                description: form.description || null,
            });
            toast.success('Stok hareketi kaydedildi.');
            if (resolvedArticle) fetchMovements(resolvedArticle.id);
            setForm((p) => ({ ...p, quantity: 1, description: '' }));
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Hareket başarısız.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Stok › Hareketler"
                title="Stok Hareketleri"
                description="Barkod tarayarak veya manuel olarak giriş, çıkış, transfer kaydı oluşturun. Negatif stok ve yetkisiz hareket engellenir."
            />

            {locations.length === 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                    <div className="flex-1 text-[12.5px] text-amber-800">
                        <span className="font-semibold">Önce bir depo / lokasyon oluşturmanız gerekiyor.</span>
                        {' '}Stok hareketi (giriş, çıkış, transfer) kaydetmek için sistemde en az bir lokasyon tanımlanmış olmalıdır.
                        <Link to="/inventory/locations" className="ml-2 underline font-semibold text-amber-900 hover:text-amber-700">
                            Lokasyon Oluştur →
                        </Link>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Scan Form */}
                <div className="lg:col-span-5">
                    <Card title="Yeni Stok Hareketi" icon={<ScanLine size={13} />}>
                        <div className="space-y-3">
                            <Field label="Barkod / Stok Kodu" required>
                                <Input
                                    value={form.codeOrBarcode}
                                    onChange={(e) => setForm({ ...form, codeOrBarcode: e.target.value })}
                                    onBlur={(e) => lookupArticle(e.target.value)}
                                    placeholder="EAN-13 veya ART-001"
                                    autoFocus
                                />
                            </Field>

                            {resolvedArticle && (
                                <div className="flex items-center gap-3 bg-emerald-50/60 border border-emerald-200/60 rounded p-2.5">
                                    {resolvedArticle.imageUrl ? (
                                        <img src={resolvedArticle.imageUrl} alt="" className="w-10 h-10 rounded object-cover border border-white" />
                                    ) : (
                                        <div className="w-10 h-10 rounded bg-white/70 border border-emerald-200 flex items-center justify-center text-emerald-700">
                                            <Package size={14} />
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[12.5px] font-semibold text-emerald-900 truncate">{resolvedArticle.name}</div>
                                        <div className="text-[10.5px] font-mono text-emerald-700/80">{resolvedArticle.articleCode} · {resolvedArticle.unit}</div>
                                    </div>
                                </div>
                            )}

                            <Field label="Hareket Tipi" required>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {(['IN', 'OUT', 'TRANSFER', 'RETURN', 'ADJUSTMENT'] as MovementType[]).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setForm({ ...form, movementType: t })}
                                            className={`flex flex-col items-center gap-1 py-2 rounded text-[10.5px] font-medium border ${
                                                form.movementType === t
                                                    ? 'border-blue-700 bg-blue-50 text-blue-800'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {MOVEMENT_ICON[t]}
                                            {MOVEMENT_LABEL[t]}
                                        </button>
                                    ))}
                                </div>
                            </Field>

                            <Field label="Miktar" required>
                                <Input
                                    type="number"
                                    step="1"
                                    min={1}
                                    value={form.quantity}
                                    onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })}
                                />
                            </Field>

                            {(form.movementType === 'OUT' || form.movementType === 'TRANSFER') && (
                                <Field label="Kaynak Lokasyon (Nereden)" required>
                                    <Select
                                        value={form.sourceLocationId}
                                        onChange={(e) => setForm({ ...form, sourceLocationId: e.target.value })}
                                    >
                                        <option value="">— Seçin —</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            {form.movementType === 'ADJUSTMENT' && (
                                <Field label="Kaynak Lokasyon (Düşüş için — opsiyonel)" hint="Stok düşüşü ise doldurun">
                                    <Select
                                        value={form.sourceLocationId}
                                        onChange={(e) => setForm({ ...form, sourceLocationId: e.target.value })}
                                    >
                                        <option value="">— Seçilmedi —</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}

                            {(form.movementType === 'IN' || form.movementType === 'TRANSFER' || form.movementType === 'RETURN') && (
                                <Field label="Hedef Lokasyon (Nereye)" required>
                                    <Select
                                        value={form.destLocationId}
                                        onChange={(e) => setForm({ ...form, destLocationId: e.target.value })}
                                    >
                                        <option value="">— Seçin —</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            {form.movementType === 'ADJUSTMENT' && (
                                <Field label="Hedef Lokasyon (Artış için — opsiyonel)" hint="Stok artışı ise doldurun">
                                    <Select
                                        value={form.destLocationId}
                                        onChange={(e) => setForm({ ...form, destLocationId: e.target.value })}
                                    >
                                        <option value="">— Seçilmedi —</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}

                            <Field label="Not / Açıklama">
                                <Textarea
                                    rows={2}
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder="Opsiyonel — neden, atıf, vb."
                                />
                            </Field>

                            <Button
                                variant="primary"
                                icon={<ScanLine size={13} />}
                                loading={submitting}
                                onClick={handleSubmit}
                                className="w-full"
                            >
                                Hareketi Kaydet
                            </Button>
                        </div>
                    </Card>
                </div>

                {/* History */}
                <div className="lg:col-span-7">
                    <Card
                        title={resolvedArticle ? `Hareket Geçmişi — ${resolvedArticle.name}` : 'Hareket Geçmişi'}
                        description={resolvedArticle ? 'Bu ürünün tüm hareketleri ve denetim izi' : 'Soldaki formdan bir ürün seçin'}
                        icon={<History size={13} />}
                        noPadding
                    >
                        {!resolvedArticle ? (
                            <EmptyState
                                icon={<History size={28} />}
                                title="Önce bir ürün seçin"
                                description="Barkod veya stok kodunu girip Tab'a basın; geçmiş otomatik yüklenir."
                            />
                        ) : movements.length === 0 ? (
                            <EmptyState
                                icon={<History size={28} />}
                                title="Henüz hareket yok"
                                description="Yeni hareket kaydedince burada görünecek."
                            />
                        ) : (
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">Tarih</th>
                                            <th className="px-3 py-2 text-left font-semibold">Tip</th>
                                            <th className="px-3 py-2 text-right font-semibold">Miktar</th>
                                            <th className="px-3 py-2 text-left font-semibold">Kullanıcı</th>
                                            <th className="px-3 py-2 text-left font-semibold">Atıf</th>
                                            <th className="px-3 py-2 text-left font-semibold">Açıklama</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {movements.map((m) => (
                                            <tr key={m.id}>
                                                <td className="px-3 py-2 text-slate-500 text-[11.5px] whitespace-nowrap">
                                                    {dayjs(m.transactionDate).format('DD.MM.YYYY HH:mm')}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <StatusChip variant={MOVEMENT_VARIANT[m.movementType]}>
                                                        <span className="inline-flex items-center gap-1">
                                                            {MOVEMENT_ICON[m.movementType]}
                                                            {MOVEMENT_LABEL[m.movementType]}
                                                        </span>
                                                    </StatusChip>
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">
                                                    {fmtNumber(m.quantity)}
                                                </td>
                                                <td className="px-3 py-2 text-slate-700 text-[11.5px]">
                                                    {m.employee ? `${m.employee.firstName} ${m.employee.lastName}` : m.employeeId}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-[10.5px] text-slate-500">
                                                    {m.referenceId || '—'}
                                                </td>
                                                <td className="px-3 py-2 text-slate-600 text-[11.5px] max-w-[260px] truncate">
                                                    {m.description || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};
