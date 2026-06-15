import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/tr';
import 'dayjs/locale/de';
import { AlertTriangle, CheckCircle, Package, Plus, Trash01 as Trash } from '@/components/icons/antIconCompat';

import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import type { InventoryArticle, InventoryLocation } from '../../types/inventory';
import type { MaintenancePeriod, MaterialInput, TaskStatus } from '../../types/maintenance';

import { t } from '@/i18n/translate';
import i18n from '@/i18n';

const dayjsLocale = () => {
    const lang = (i18n.language || 'tr').split('-')[0];
    return lang === 'de' ? 'de' : lang === 'en' ? 'en' : 'tr';
};

export const ensureMaintenanceLocale = () => {
    dayjs.locale(dayjsLocale());
};

export const PERIOD_LABEL: Record<MaintenancePeriod, string> = {
    MONTHLY:t('maintenance.shared.periodMonthly'),
    QUARTERLY:t('auto.3_aylik'),
    BIANNUAL:t('auto.6_aylik'),
    YEARLY:t('maintenance.shared.periodAnnual'),
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
    PENDING:t('maintenance.shared.statusPlanned'),
    IN_PROGRESS:t('auto.imza_bekliyor'),
    COMPLETED:t('common.completed'),
    CANCELLED:t('common.cancel'),
};

export const STATUS_VARIANT: Record<TaskStatus, 'warning' | 'active' | 'passive' | 'info'> = {
    PENDING: 'warning',
    IN_PROGRESS: 'info',
    COMPLETED: 'active',
    CANCELLED: 'passive',
};

export const money = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

export const fmtDate = (value?: string | null, format = 'DD.MM.YYYY') =>
    value ? dayjs(value).locale(dayjsLocale()).format(format) : '-';

export const personName = (person?: { firstName?: string; lastName?: string } | null) =>
    person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() || '-' : '-';

export const arrayFromUnknown = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
};

export const splitLines = (value: string) =>
    value.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);

export const StatusPill = ({ status }: { status: TaskStatus }) => (
    <StatusChip variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</StatusChip>
);

export const StatCard = ({
    label,
    value,
    icon,
    tone = 'brand',
    sub,
}: {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
    sub?: string;
}) => {
    const styles = {
        brand:"border-brand-200 bg-brand-primary_alt text-brand-secondary",
        success:"border-emerald-200 bg-emerald-50 text-emerald-900",
        warning:"border-amber-200 bg-amber-50 text-amber-950",
        danger:"border-rose-200 bg-rose-50 text-rose-900",
        neutral:"border-slate-200 bg-white text-slate-900",
    }[tone];

    return (
        <div className={`rounded-lg border px-4 py-3 shadow-xs ${styles}`}>
            <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium opacity-85">
                {icon}
                <span className="truncate">{label}</span>
            </div>
            <div className="mt-1 text-[21px] font-semibold leading-tight">{value}</div>
            {sub && <div className="mt-0.5 text-[11px] opacity-70">{sub}</div>}
        </div>
    );
};

export const MaterialsEditor = ({
    rows,
    setRows,
    articles,
    locations,
}: {
    rows: MaterialInput[];
    setRows: (rows: MaterialInput[]) => void;
    articles: InventoryArticle[];
    locations: InventoryLocation[];
}) => {
    const update = (index: number, patch: Partial<MaterialInput>) => {
        setRows(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
    };

    return (
        <div className="rounded-lg border border-slate-200/80">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                    <Package size={13} />{t('auto.ek_is_ve_malzeme')}</div>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<Plus size={12} />}
                    onClick={() => setRows([...rows, { articleId: '', quantity: 1, unitCost: 0, sourceLocationId: '' }])}
                >{t('auto.satir')}</Button>
            </div>
            {rows.length === 0 ? (
                <div className="flex items-start gap-2 px-3 py-3 text-[12px] text-slate-500">
                    <AlertTriangle size={14} className="mt-0.5 text-slate-400" />{t('auto.malzeme_yoksa_stok_hareketi_olusmaz')}</div>
            ) : (
                <div className="space-y-3 p-3">
                    {rows.map((row, index) => (
                        <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                            <Field label={t('auto.urun')} className="md:col-span-4">
                                <Select
                                    value={row.articleId}
                                    onChange={(e) => {
                                        const article = articles.find((a) => a.id === e.target.value);
                                        update(index, { articleId: e.target.value, unitCost: article?.baseCost ?? row.unitCost });
                                    }}
                                >
                                    <option value="">{t('common.select')}</option>
                                    {articles.map((article) => (
                                        <option key={article.id} value={article.id}>
                                            {article.articleCode} - {article.name}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label={t('auto.depo')} className="md:col-span-3">
                                <Select value={row.sourceLocationId} onChange={(e) => update(index, { sourceLocationId: e.target.value })}>
                                    <option value="">{t('common.select')}</option>
                                    {locations.map((location) => (
                                        <option key={location.id} value={location.id}>{location.locationName}</option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label={t('common.quantity')} className="md:col-span-2">
                                <Input type="number" min="0" step="0.01" value={row.quantity} onChange={(e) => update(index, { quantity: Number(e.target.value) })} />
                            </Field>
                            <Field label={t('auto.birim_chf')} className="md:col-span-2">
                                <Input type="number" min="0" step="0.01" value={row.unitCost} onChange={(e) => update(index, { unitCost: Number(e.target.value) })} />
                            </Field>
                            <div className="flex items-end md:col-span-1">
                                <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} onClick={() => setRows(rows.filter((_, i) => i !== index))} />
                            </div>
                        </div>
                    ))}
                    <div className="border-t border-slate-100 pt-2 text-right text-[12px] font-semibold text-slate-700">{t('auto.toplam')}{money(rows.reduce((sum, row) => sum + row.quantity * row.unitCost, 0))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const SignatureModal = ({
    open,
    title,
    onClose,
    onSign,
    loading,
}: {
    open: boolean;
    title: string;
    onClose: () => void;
    onSign: (signatureBase64: string) => Promise<void>;
    loading?: boolean;
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hasInk, setHasInk] = useState(false);
    const drawing = useRef(false);

    useEffect(() => {
        if (!open) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        setHasInk(false);
    }, [open]);

    const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * canvas.width,
            y: ((event.clientY - rect.top) / rect.height) * canvas.height,
        };
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasInk(false);
    };

    const submit = async () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasInk) return;
        await onSign(canvas.toDataURL('image/png'));
    };

    return (
        <Modal
            open={open}
            title={title}
            description={t('auto.musteri_imzasi_alindiktan_sonra_rapor_kilitlenir')}
            onClose={onClose}
            width="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={clear}>{t('common.clear')}</Button>
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" icon={<CheckCircle size={13} />} loading={loading} disabled={!hasInk} onClick={submit}>{t('auto.imzala')}</Button>
                </>
            }
        >
            <canvas
                ref={canvasRef}
                width={900}
                height={260}
                className="h-[220px] w-full touch-none rounded-lg border border-slate-200 bg-white"
                onPointerDown={(event) => {
                    drawing.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const ctx = event.currentTarget.getContext('2d');
                    const p = point(event);
                    ctx?.beginPath();
                    ctx?.moveTo(p.x, p.y);
                }}
                onPointerMove={(event) => {
                    if (!drawing.current) return;
                    const ctx = event.currentTarget.getContext('2d');
                    const p = point(event);
                    ctx?.lineTo(p.x, p.y);
                    ctx?.stroke();
                    setHasInk(true);
                }}
                onPointerUp={() => {
                    drawing.current = false;
                }}
                onPointerCancel={() => {
                    drawing.current = false;
                }}
            />
        </Modal>
    );
};
