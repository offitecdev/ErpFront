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
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';

import { useInventoryStore } from '../../store/inventoryStore';
import { articleApi } from '../../lib/api/inventory';
import type { MovementType, InventoryArticle } from '../../types/inventory';

import { t } from '@/i18n/translate';

const MOVEMENT_LABEL: Record<MovementType, string> = {
    IN:t('dashboard.colCheckIn'),
    OUT:t('dashboard.colCheckOut'),
    TRANSFER:t('auto.transfer'),
    RETURN:t('auto.iade'),
    ADJUSTMENT:t('auto.duzeltme'),
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

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', minimumFractionDigits: 2 }).format(v || 0);

// Stok girişi yapan (maliyet taşıyabilen) hareket tipleri.
const INBOUND_MOVEMENT_TYPES: MovementType[] = ['IN', 'RETURN', 'ADJUSTMENT'];

const articleAvgCost = (a?: InventoryArticle | null) => {
    if (!a) return 0;
    const weighted = Number(a.weightedAverageCost ?? 0);
    return weighted > 0 ? weighted : Number(a.baseCost || 0);
};

export const Movements = () => {
    const { locations, fetchLocations, movements, fetchMovements, scanMovement } = useInventoryStore();

    const [form, setForm] = useState<{
        codeOrBarcode: string;
        movementType: MovementType;
        quantity: number;
        unitCost: string;
        sourceLocationId: string;
        destLocationId: string;
        description: string;
    }>({
        codeOrBarcode: '',
        movementType: 'IN',
        quantity: 1,
        unitCost: '',
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
            toast.error(t('auto.barkod_veya_stok_kodu_girin'));
            return;
        }
        if (form.quantity <= 0) {
            toast.error(t('auto.miktar_0_dan_buyuk_olmali'));
            return;
        }

        const movementType = form.movementType;
        if ((movementType === 'IN' || movementType === 'RETURN') && !form.destLocationId) {
            toast.error(t('auto.giris_iade_icin_hedef_lokasyon_zorunludur'));
            return;
        }
        if (movementType === 'OUT' && !form.sourceLocationId) {
            toast.error(t('auto.cikis_icin_kaynak_lokasyon_zorunludur'));
            return;
        }
        if (movementType === 'TRANSFER' && (!form.sourceLocationId || !form.destLocationId)) {
            toast.error(t('auto.transfer_icin_kaynak_ve_hedef_lokasyon_zorunludu'));
            return;
        }

        const isInbound = INBOUND_MOVEMENT_TYPES.includes(movementType);
        const parsedUnitCost = Number(form.unitCost.replace(',', '.'));
        const unitCost = isInbound && form.unitCost.trim() !== '' && Number.isFinite(parsedUnitCost) && parsedUnitCost > 0
            ? parsedUnitCost
            : null;

        setSubmitting(true);
        try {
            await scanMovement({
                codeOrBarcode: form.codeOrBarcode.trim(),
                movementType: form.movementType,
                quantity: form.quantity,
                unitCost,
                sourceLocationId: form.sourceLocationId || null,
                destLocationId: form.destLocationId || null,
                description: form.description || null,
            });
            toast.success(t('auto.stok_hareketi_kaydedildi'));
            if (resolvedArticle) {
                fetchMovements(resolvedArticle.id);
                // Ortalama maliyet değişmiş olabilir; güncel kartı tekrar çek.
                articleApi.lookupByCode(form.codeOrBarcode.trim()).then(setResolvedArticle).catch(() => {});
            }
            setForm((p) => ({ ...p, quantity: 1, unitCost: '', description: '' }));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.hareket_basarisiz'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('auto.breadcrumb_movements')}
                title={t('auto.stok_hareketleri')}
                description={t('auto.barkod_tarayarak_veya_manuel_olarak_giris_cikis_')}
            />

            {locations.length === 0 && (
                <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                    <div className="flex-1 text-[12.5px] text-amber-800">
                        <span className="font-semibold">{t('auto.once_bir_depo_lokasyon_olusturmaniz_gerekiyor')}</span>
                        {' '}{t('auto.stok_hareketi_giris_cikis_transfer_kaydetmek_ici')}<Link to="/inventory/locations" className="ml-2 underline font-semibold text-amber-900 hover:text-amber-700">{t('auto.lokasyon_olustur')}</Link>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Scan Form */}
                <div className="lg:col-span-5">
                    <Card title={t('auto.yeni_stok_hareketi')} icon={<ScanLine size={13} />}>
                        <div className="space-y-3">
                            <Field label={t('auto.barkod_stok_kodu')} required>
                                <Input
                                    value={form.codeOrBarcode}
                                    onChange={(e) => setForm({ ...form, codeOrBarcode: e.target.value })}
                                    onBlur={(e) => lookupArticle(e.target.value)}
                                    placeholder={t('auto.ean_or_article_placeholder')}
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

                            <Field label={t('auto.hareket_tipi')} required>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {(['IN', 'OUT', 'TRANSFER', 'RETURN', 'ADJUSTMENT'] as MovementType[]).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setForm({ ...form, movementType: t })}
                                            className={`flex flex-col items-center gap-1 py-2 rounded text-[10.5px] font-medium border ${
                                                form.movementType === t
                                                    ?"border-blue-700 bg-blue-50 text-blue-800"
                                                    :"border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                            }`}
                                        >
                                            {MOVEMENT_ICON[t]}
                                            {MOVEMENT_LABEL[t]}
                                        </button>
                                    ))}
                                </div>
                            </Field>

                            <Field label={t('common.quantity')} required>
                                <Input
                                    type="number"
                                    step="1"
                                    min={1}
                                    value={form.quantity}
                                    onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })}
                                />
                            </Field>

                            {INBOUND_MOVEMENT_TYPES.includes(form.movementType) && (
                                <Field
                                    label={t('auto.birim_maliyet_chf')}
                                    hint={t('auto.bu_partinin_alis_birim_maliyeti_agirlikli_ortala')}
                                >
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min={0}
                                        value={form.unitCost}
                                        onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                                        placeholder={resolvedArticle ? t('auto.current_average_cost', { amount: fmtMoney(articleAvgCost(resolvedArticle)) }) :t('auto.orn_12_50')}
                                    />
                                </Field>
                            )}

                            {(form.movementType === 'OUT' || form.movementType === 'TRANSFER') && (
                                <Field label={t('auto.kaynak_lokasyon_nereden')} required>
                                    <Select
                                        value={form.sourceLocationId}
                                        onChange={(e) => setForm({ ...form, sourceLocationId: e.target.value })}
                                    >
                                        <option value="">{t('auto.secin')}</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            {form.movementType === 'ADJUSTMENT' && (
                                <Field label={t('auto.kaynak_lokasyon_dusus_icin_opsiyonel')} hint={t('auto.stok_dususu_ise_doldurun')}>
                                    <Select
                                        value={form.sourceLocationId}
                                        onChange={(e) => setForm({ ...form, sourceLocationId: e.target.value })}
                                    >
                                        <option value="">{t('auto.secilmedi')}</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}

                            {(form.movementType === 'IN' || form.movementType === 'TRANSFER' || form.movementType === 'RETURN') && (
                                <Field label={t('auto.hedef_lokasyon_nereye')} required>
                                    <Select
                                        value={form.destLocationId}
                                        onChange={(e) => setForm({ ...form, destLocationId: e.target.value })}
                                    >
                                        <option value="">{t('auto.secin')}</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            {form.movementType === 'ADJUSTMENT' && (
                                <Field label={t('auto.hedef_lokasyon_artis_icin_opsiyonel')} hint={t('auto.stok_artisi_ise_doldurun')}>
                                    <Select
                                        value={form.destLocationId}
                                        onChange={(e) => setForm({ ...form, destLocationId: e.target.value })}
                                    >
                                        <option value="">{t('auto.secilmedi')}</option>
                                        {locations.map((l) => (
                                            <option key={l.id} value={l.id}>{l.locationName}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}

                            <Field label={t('auto.not_aciklama')}>
                                <Textarea
                                    rows={2}
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    placeholder={t('auto.opsiyonel_neden_atif_vb')}
                                />
                            </Field>

                            <Button
                                variant="primary"
                                icon={<ScanLine size={13} />}
                                loading={submitting}
                                onClick={handleSubmit}
                                className="w-full"
                            >{t('auto.hareketi_kaydet')}</Button>
                        </div>
                    </Card>
                </div>

                {/* History */}
                <div className="lg:col-span-7">
                    <Card
                        title={resolvedArticle ? t('auto.movement_history_for', { name: resolvedArticle.name }) :t('auto.hareket_gecmisi')}
                        description={resolvedArticle ?t('auto.bu_urunun_tum_hareketleri_ve_denetim_izi') :t('auto.soldaki_formdan_bir_urun_secin')}
                        icon={<History size={13} />}
                        noPadding
                    >
                        {!resolvedArticle ? (
                            <EmptyState
                                icon={<History size={28} />}
                                title={t('auto.once_bir_urun_secin')}
                                description={t('auto.barkod_veya_stok_kodunu_girip_tab_a_basin_gecmis')}
                            />
                        ) : movements.length === 0 ? (
                            <EmptyState
                                icon={<History size={28} />}
                                title={t('auto.henuz_hareket_yok')}
                                description={t('auto.yeni_hareket_kaydedince_burada_gorunecek')}
                            />
                        ) : (
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                                <table className="w-full text-[12.5px]">
                                    <thead className="text-[10.5px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold">{t('common.date')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('auto.tip')}</th>
                                            <th className="px-3 py-2 text-right font-semibold">{t('common.quantity')}</th>
                                            <th className="px-3 py-2 text-right font-semibold">{t('auto.birim_maliyet')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('iam.roles.colUsers')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('auto.atif')}</th>
                                            <th className="px-3 py-2 text-left font-semibold">{t('common.description')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {movements.map((m) => (
                                            <tr key={m.id}>
                                                <td className="px-3 py-2 text-slate-500 text-[11.5px] whitespace-nowrap">
                                                    {dayjs(m.transactionDate).format("DD.MM.YYYY HH:mm")}
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
                                                <td className="px-3 py-2 text-right font-mono text-[11.5px] text-slate-600">
                                                    {m.unitCost != null && m.unitCost > 0 ? fmtMoney(m.unitCost) : '—'}
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
