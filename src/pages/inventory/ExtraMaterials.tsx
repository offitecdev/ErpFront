import { useEffect, useState } from 'react';
import { Edit01 as Edit2, PackagePlus, Save01 as Save, Trash01 as Trash2, X } from '@untitledui/icons';
import { toast } from 'sonner';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';
import { projectApi } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';
import type { ProjectMaterial } from '../../types/project';

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(v);

const emptyMaterial = () => ({
    name: '',
    serialId: `MAT-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000) + 1000}`,
    stockQuantity: 0,
    unitCost: 0,
});

export const ExtraMaterials = () => {
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0
        || permissions.includes('inventory.articles.create')
        || permissions.includes('inventory.articles.update');

    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [form, setForm] = useState(emptyMaterial());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            setMaterials(await projectApi.materials());
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Malzemeler yüklenemedi.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const save = async () => {
        if (!form.name.trim()) return toast.error('Malzeme adı zorunludur.');
        if (!form.serialId.trim()) return toast.error('Kod zorunludur.');
        if (form.stockQuantity < 0 || form.unitCost < 0) return toast.error('Miktar ve fiyat negatif olamaz.');

        setSaving(true);
        try {
            if (editingId) {
                await projectApi.updateMaterial(editingId, form);
                toast.success('Malzeme güncellendi.');
            } else {
                await projectApi.createMaterial(form);
                toast.success('Malzeme eklendi.');
            }
            setForm(emptyMaterial());
            setEditingId(null);
            await load();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Malzeme kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Stok › Malzemeler"
                title="Malzemeler"
                description="Projeye sonradan eklenebilen malzemelerin adını, fiyatını ve mevcut miktarını yönetin."
            />

            <Card title="Malzeme Listesi" icon={<PackagePlus size={14} />} noPadding>
                <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 lg:grid-cols-12">
                    <Field label="Malzeme adı" className="lg:col-span-3">
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Montaj seti" />
                    </Field>
                    <Field label="Kod" className="lg:col-span-3">
                        <Input value={form.serialId} onChange={(e) => setForm({ ...form, serialId: e.target.value })} />
                    </Field>
                    <Field label="Mevcut miktar" className="lg:col-span-2">
                        <Input type="number" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Birim fiyat" className="lg:col-span-2">
                        <Input type="number" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) || 0 })} />
                    </Field>
                    <div className="flex items-end gap-2 lg:col-span-2">
                        <Button className="flex-1" variant="primary" loading={saving} icon={<Save size={12} />} onClick={save} disabled={!canManage}>
                            {editingId ? 'Güncelle' : 'Ekle'}
                        </Button>
                        {editingId && (
                            <Button variant="secondary" icon={<X size={12} />} onClick={() => { setEditingId(null); setForm(emptyMaterial()); }}>
                                İptal
                            </Button>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                        <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">Malzeme</th>
                                <th className="px-3 py-2 text-left font-semibold">Kod</th>
                                <th className="px-3 py-2 text-right font-semibold">Mevcut miktar</th>
                                <th className="px-3 py-2 text-right font-semibold">Birim fiyat</th>
                                <th className="px-3 py-2 text-right font-semibold">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Yükleniyor...</td></tr>}
                            {!loading && materials.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Malzeme yok.</td></tr>}
                            {!loading && materials.map((material) => (
                                <tr key={material.id} className="hover:bg-slate-50/60">
                                    <td className="px-3 py-2 font-medium text-slate-800">{material.name}</td>
                                    <td className="px-3 py-2 font-mono text-[11.5px] text-slate-500">{material.serialId}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmtNumber(material.stockQuantity)}</td>
                                    <td className="px-3 py-2 text-right font-mono">{fmtMoney(material.unitCost)}</td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                className="rounded p-1 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"
                                                title="Düzenle"
                                                disabled={!canManage}
                                                onClick={() => {
                                                    setEditingId(material.id);
                                                    setForm({
                                                        name: material.name,
                                                        serialId: material.serialId,
                                                        stockQuantity: material.stockQuantity,
                                                        unitCost: material.unitCost,
                                                    });
                                                }}
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <button
                                                className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                                title="Sil"
                                                disabled={!canManage}
                                                onClick={async () => {
                                                    if (!confirm(`${material.name} silinsin mi?`)) return;
                                                    try {
                                                        await projectApi.deleteMaterial(material.id);
                                                        toast.success('Malzeme silindi.');
                                                        await load();
                                                    } catch (e: any) {
                                                        toast.error(e.response?.data?.error || 'Malzeme silinemedi.');
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
