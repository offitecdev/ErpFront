import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    ArrowLeft,
    Building02 as Building2,
    CalendarCheck01 as CalendarClock,
    File05 as FileSpreadsheet,
    FilePlus02 as FilePlus2,
    Hash01 as Hash,
    LayersThree01 as Layers,
    Plus,
    Save01 as Save,
    Stars02 as Sparkles,
    Trash01 as Trash2,
} from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { BlockingDialog } from '../../components/ui-shared/BlockingDialog';

import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import { apiClient } from '../../lib/axios';
import type { CustomerLite, TenderFormat } from '../../types/tender';

interface DraftPosition {
    key: string;
    positionNumber: string;
    shortDescription: string;
    longDescription: string;
    quantity: string;
    unit: string;
    npkCode: string;
}

const emptyPosition = (idx: number): DraftPosition => ({
    key: `${Date.now()}-${idx}`,
    positionNumber: '',
    shortDescription: '',
    longDescription: '',
    quantity: '1',
    unit: 'Stk',
    npkCode: '',
});

const hasPositionInput = (position: DraftPosition) =>
    Boolean(
        position.positionNumber.trim() ||
        position.shortDescription.trim() ||
        position.longDescription.trim() ||
        position.npkCode.trim()
    );

const suggestTenderNumber = () => {
    const year = dayjs().year();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `TKF-${year}-${rand}`;
};

export const TenderCreate = () => {
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('tenders.manage');

    const { createTender, addPosition } = useTenderStore();

    const [customers, setCustomers] = useState<CustomerLite[]>([]);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const [form, setForm] = useState({
        customerId: '',
        tenderNumber: suggestTenderNumber(),
        format: 'SIA451' as TenderFormat,
        validUntil: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    });

    const [positions, setPositions] = useState<DraftPosition[]>([emptyPosition(0)]);

    useEffect(() => {
        let cancelled = false;
        setLoadingCustomers(true);
        apiClient.get('/customers')
            .then((r) => {
                if (!cancelled) setCustomers(r.data || []);
            })
            .catch(() => {
                if (!cancelled) setCustomers([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingCustomers(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const selectedCustomer = useMemo(
        () => customers.find((c) => c.id === form.customerId) || null,
        [customers, form.customerId]
    );

    const filledPositions = useMemo(
        () => positions.filter((p) => p.positionNumber.trim() && p.shortDescription.trim()),
        [positions]
    );

    const updatePosition = (idx: number, patch: Partial<DraftPosition>) => {
        setPositions((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    };

    const addRow = () => {
        setPositions((prev) => [...prev, emptyPosition(prev.length)]);
    };

    const removeRow = (idx: number) => {
        setPositions((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
    };

    const regenerateNumber = () => {
        setForm((p) => ({ ...p, tenderNumber: suggestTenderNumber() }));
    };

    const validate = (): string | null => {
        if (!form.customerId) return 'Lütfen bir müşteri seçin.';
        if (!form.tenderNumber.trim()) return 'Teklif numarası zorunludur.';
        if (!form.format) return 'Format seçilmelidir.';
        for (const p of positions) {
            if (hasPositionInput(p)) {
                if (!p.positionNumber.trim()) return 'Eksik pozisyon numarası var.';
                if (!p.shortDescription.trim()) return 'Eksik pozisyon açıklaması var.';
                const q = Number(p.quantity);
                if (Number.isNaN(q) || q < 0) return 'Pozisyon miktarı geçersiz.';
            }
        }
        return null;
    };

    const handleSubmit = async () => {
        if (!canManage) {
            toast.error('Bu işlem için yetkiniz yok.');
            return;
        }
        setSubmitAttempted(true);
        const err = validate();
        if (err) {
            return;
        }

        try {
            setSubmitting(true);
            const created = await createTender({
                customerId: form.customerId,
                tenderNumber: form.tenderNumber.trim(),
                format: form.format,
                validUntil: form.validUntil || null,
            });

            for (const p of filledPositions) {
                await addPosition(created.id, {
                    positionNumber: p.positionNumber.trim(),
                    shortDescription: p.shortDescription.trim(),
                    longDescription: p.longDescription.trim() || null,
                    quantity: Number(p.quantity) || 0,
                    unit: p.unit.trim() || null,
                    npkCode: p.npkCode.trim() || null,
                    hierarchyLevel: 0,
                });
            }

            toast.success(
                filledPositions.length > 0
                    ? `Teklif oluşturuldu (${filledPositions.length} pozisyon eklendi).`
                    : 'Teklif taslağı oluşturuldu.'
            );
            setSubmitAttempted(false);
            navigate(`/crm/tenders/${created.id}`);
        } catch (e: unknown) {
            const err = e as { response?: { data?: { error?: string } } };
            toast.error(err.response?.data?.error || 'Teklif oluşturulamadı.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!canManage) {
        return (
            <div>
                <PageHeader
                    breadcrumb="CRM › Teklif Yönetimi › Teklif Oluştur"
                    title="Teklif Oluştur"
                />
                <Card>
                    <EmptyState
                        icon={<FileSpreadsheet size={32} />}
                        title="Yetkiniz yok"
                        description="Teklif oluşturmak için 'tenders.manage' yetkisine sahip olmanız gerekir."
                        action={
                            <Button variant="secondary" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/tenders')}>
                                Teklif Listesine Dön
                            </Button>
                        }
                    />
                </Card>
            </div>
        );
    }

    return (
        <div>
            <BlockingDialog
                open={submitting}
                title="Teklif oluşturuluyor"
                description="Müşteri, pozisyonlar ve teklif taslağı hazırlanıyor. İşlem bitince detay sayfasına geçilecek."
            />
            <PageHeader
                breadcrumb="CRM › Teklif Yönetimi › Teklif Oluştur"
                title="Yeni Teklif Oluştur"
                description="Müşteri seçin, teklif bilgilerini girin ve isteğe bağlı olarak başlangıç pozisyonlarını ekleyin."
                actions={
                    <>
                        <Button
                            variant="secondary"
                            icon={<ArrowLeft size={13} />}
                            onClick={() => navigate('/crm/tenders')}
                        >
                            Listeye Dön
                        </Button>
                        <Button
                            variant="primary"
                            icon={<Save size={13} />}
                            loading={submitting}
                            onClick={handleSubmit}
                        >
                            Teklifi Oluştur
                        </Button>
                    </>
                }
            />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                {/* Sol: Form */}
                <div className="xl:col-span-2 flex flex-col gap-4 min-w-0">
                    <Card title="Teklif Bilgileri" icon={<FilePlus2 size={13} />}>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Müşteri" required className="col-span-2" error={submitAttempted && !form.customerId ? 'Müşteri seçimi zorunludur.' : null}>
                                <Select
                                    value={form.customerId}
                                    onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                                    disabled={loadingCustomers}
                                >
                                    <option value="">
                                        {loadingCustomers ? 'Müşteriler yükleniyor...' : 'Müşteri seçin'}
                                    </option>
                                    {customers.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.companyName}
                                            {c.segment ? ` · ${c.segment}` : ''}
                                        </option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Teklif Numarası" required error={submitAttempted && !form.tenderNumber.trim() ? 'Teklif numarası zorunludur.' : null}>
                                <div className="flex items-center gap-1.5">
                                    <Input
                                        value={form.tenderNumber}
                                        onChange={(e) => setForm({ ...form, tenderNumber: e.target.value })}
                                        placeholder="TKF-2026-1234"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={<Sparkles size={12} />}
                                        onClick={regenerateNumber}
                                        type="button"
                                        title="Otomatik üret"
                                    >
                                        Üret
                                    </Button>
                                </div>
                            </Field>

                            <Field label="Format" required hint="CRB/SIA standardı">
                                <Select
                                    value={form.format}
                                    onChange={(e) => setForm({ ...form, format: e.target.value as TenderFormat })}
                                >
                                    <option value="SIA451">SIA 451 (İsviçre)</option>
                                    <option value="CRBX">CRBX</option>
                                </Select>
                            </Field>

                            <Field label="Geçerlilik Tarihi" hint="Teklifin geçerli olduğu son tarih" className="col-span-2">
                                <Input
                                    type="date"
                                    value={form.validUntil}
                                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                                />
                            </Field>
                        </div>
                    </Card>

                    <Card
                        title="Başlangıç Pozisyonları"
                        description="İsteğe bağlı — daha sonra detay sayfasından da ekleyebilirsiniz"
                        icon={<Layers size={13} />}
                        actions={
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<Plus size={12} />}
                                onClick={addRow}
                                type="button"
                            >
                                Pozisyon ekle
                            </Button>
                        }
                        noPadding
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-[12.5px]">
                                <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold w-[110px]">Poz. No</th>
                                        <th className="px-3 py-2 text-left font-semibold">Kısa Açıklama</th>
                                        <th className="px-3 py-2 text-left font-semibold w-[110px]">NPK Kodu</th>
                                        <th className="px-3 py-2 text-right font-semibold w-[90px]">Miktar</th>
                                        <th className="px-3 py-2 text-left font-semibold w-[80px]">Birim</th>
                                        <th className="px-3 py-2 w-[40px]" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {positions.map((p, idx) => {
                                        const rowStarted = hasPositionInput(p);
                                        const positionNumberError = submitAttempted && rowStarted && !p.positionNumber.trim();
                                        const shortDescriptionError = submitAttempted && rowStarted && !p.shortDescription.trim();
                                        const quantityError = submitAttempted && rowStarted && (Number.isNaN(Number(p.quantity)) || Number(p.quantity) < 0);

                                        return (
                                        <tr key={p.key} className="align-top">
                                            <td className="px-3 py-2">
                                                <Input
                                                    value={p.positionNumber}
                                                    onChange={(e) => updatePosition(idx, { positionNumber: e.target.value })}
                                                    placeholder="1.1"
                                                />
                                                {positionNumberError && (
                                                    <span className="mt-1 block rounded-md border border-error_subtle bg-error-primary px-2 py-1 text-xs font-medium text-error-primary">
                                                        Pozisyon numarası zorunludur.
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <Input
                                                    value={p.shortDescription}
                                                    onChange={(e) => updatePosition(idx, { shortDescription: e.target.value })}
                                                    placeholder="Pozisyon başlığı"
                                                />
                                                {shortDescriptionError && (
                                                    <span className="mt-1 block rounded-md border border-error_subtle bg-error-primary px-2 py-1 text-xs font-medium text-error-primary">
                                                        Açıklama zorunludur.
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <Input
                                                    value={p.npkCode}
                                                    onChange={(e) => updatePosition(idx, { npkCode: e.target.value })}
                                                    placeholder="221.310"
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min={0}
                                                    value={p.quantity}
                                                    onChange={(e) => updatePosition(idx, { quantity: e.target.value })}
                                                    className="text-right"
                                                />
                                                {quantityError && (
                                                    <span className="mt-1 block rounded-md border border-error_subtle bg-error-primary px-2 py-1 text-xs font-medium text-error-primary">
                                                        Miktar geçerli olmalıdır.
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <Input
                                                    value={p.unit}
                                                    onChange={(e) => updatePosition(idx, { unit: e.target.value })}
                                                    placeholder="Stk"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => removeRow(idx)}
                                                    disabled={positions.length === 1}
                                                    className="p-1 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                                    title="Satırı sil"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-4 py-2.5 border-t border-slate-100 text-[11.5px] text-slate-500 bg-slate-50/40">
                            {filledPositions.length === 0
                                ? 'Pozisyon eklemeden de teklif oluşturabilirsiniz (taslak olarak kaydedilir).'
                                : `${filledPositions.length} adet pozisyon teklif ile birlikte eklenecek.`}
                        </div>
                    </Card>
                </div>

                {/* Sağ: Önizleme */}
                <div className="xl:col-span-1 flex flex-col gap-4 min-w-0">
                    <Card title="Önizleme" icon={<FileSpreadsheet size={13} />}>
                        <dl className="space-y-3 text-[12.5px]">
                            <div className="flex items-start gap-2.5">
                                <Building2 size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">
                                        Müşteri
                                    </dt>
                                    <dd className="text-slate-900 font-medium truncate">
                                        {selectedCustomer?.companyName || (
                                            <span className="text-slate-400 font-normal italic">Seçilmedi</span>
                                        )}
                                    </dd>
                                    {selectedCustomer?.segment && (
                                        <dd className="text-[11px] text-slate-500 mt-0.5">
                                            {selectedCustomer.segment}
                                        </dd>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5">
                                <Hash size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">
                                        Teklif Numarası
                                    </dt>
                                    <dd className="text-slate-900 font-mono">
                                        {form.tenderNumber || '—'}
                                    </dd>
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5">
                                <FileSpreadsheet size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">
                                        Format
                                    </dt>
                                    <dd className="text-slate-900">
                                        <span className="font-mono text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                                            {form.format}
                                        </span>
                                    </dd>
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5">
                                <CalendarClock size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">
                                        Geçerlilik
                                    </dt>
                                    <dd className="text-slate-900">
                                        {form.validUntil
                                            ? dayjs(form.validUntil).format('DD.MM.YYYY')
                                            : <span className="text-slate-400 italic">—</span>}
                                    </dd>
                                </div>
                            </div>

                            <div className="flex items-start gap-2.5">
                                <Layers size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                    <dt className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider">
                                        Pozisyonlar
                                    </dt>
                                    <dd className="text-slate-900">
                                        {filledPositions.length === 0
                                            ? <span className="text-slate-400 italic">Boş taslak</span>
                                            : `${filledPositions.length} pozisyon`}
                                    </dd>
                                </div>
                            </div>
                        </dl>
                    </Card>

                    <Card title="Yardım" icon={<Sparkles size={13} />}>
                        <ul className="text-[12px] text-slate-600 space-y-1.5 leading-relaxed list-disc pl-4">
                            <li>Önce müşteri seçin; müşteri sistemde yoksa CRM'den ekleyin.</li>
                            <li>Teklif numarası benzersiz olmalıdır. "Üret" butonuyla otomatik üretebilirsiniz.</li>
                            <li>Format genelde Türk projelerinde SIA 451, dış projelerde CRBX olarak seçilir.</li>
                            <li>Pozisyon eklemeden de taslak oluşturabilirsiniz; sonradan eklenebilir.</li>
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
};
