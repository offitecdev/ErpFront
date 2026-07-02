import React, { useRef, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    Camera01 as Camera,
    Hash01 as Hash,
    Image01 as ImageIcon,
    Scan as ScanBarcode,
    UploadCloud02 as Upload,
    XClose as X,
} from '@/components/icons/antIconCompat';

import { BarcodeScannerModal } from '@/components/ui-shared/BarcodeScannerModal';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input, Select } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import type { ArticleStatus, InventoryArticle } from '@/types/inventory';
import { t } from '@/i18n/translate';
import { RichTextMarkdownEditor } from '../../TenderRichText';

export type TenderArticleFormData = Partial<InventoryArticle> & {
    adjustQty?: number;
    adjustMovementType?: 'IN' | 'OUT' | 'ADJUSTMENT';
    adjustLocationId?: string;
    adjustGeneralBarcode?: string;
    adjustSerialBarcode?: string;
    totalQuantity?: number;
};

export const TenderArticleFormModal: React.FC<{
    initial: TenderArticleFormData;
    onClose: () => void;
    onSubmit: (data: TenderArticleFormData) => Promise<void>;
}> = ({ initial, onClose, onSubmit }) => {
    const [form, setForm] = useState<TenderArticleFormData>({
        status: 'ACTIVE',
        isActive: true,
        minStockLevel: 0,
        criticalStockLevel: 0,
        ...initial,
    });
    const [submitting, setSubmitting] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');
    const fileRef = useRef<HTMLInputElement>(null);

    const handleImage = (file: File) => {
        if (file.size > 2 * 1024 * 1024) {
            toast.error(t('tenders.gorsel_2_mb_sinirini_asiyor'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => setForm((p) => ({ ...p, imageUrl: e.target?.result as string }));
        reader.readAsDataURL(file);
    };

    return (
        <Modal
            open
            title={initial.id ?t('tenders.productu_edit') :t('tenders.create_new_product')}
            description={initial.id ?t('tenders.update_product_card_for_stock_management') :t('tenders.productler_screen_stock_karti_formu_with_new_ur')}
            onClose={onClose}
            width="full"
            closeOnBackdrop={false}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>{t('tenders.iptal')}</Button>
                    <Button
                        variant="primary"
                        loading={submitting}
                        onClick={async () => {
                            if (!form.articleCode || !form.name || !form.unit) {
                                toast.error(t('tenders.code_ad_ve_unit_zorunludur'));
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
                        {initial.id ?t('common.update') :t('common.create')}
                    </Button>
                </>
            }
        >
            <div className="grid grid-cols-3 items-start gap-3">
                <div className="col-span-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
                    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                        <ScanBarcode size={13} />{t('tenders.barcode_info')}</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label={t('tenders.general_product_code')} hint={t('tenders.optional_category_barcode_manual_or_camera')}>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('general'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                                <Camera size={16} />{t('tenders.scan_general_code_with_camera')}</button>
                            <div className="flex items-center gap-1.5">
                                <Hash size={13} className="shrink-0 text-muted-foreground" />
                                <Input value={form.systemBarcode ?? ''} onChange={(e) => setForm({ ...form, systemBarcode: e.target.value })} placeholder={t('tenders.barcode_okutun_veya_yazin')} />
                            </div>
                        </Field>
                        <Field label={t('tenders.product_serial_code')} hint={t('tenders.required_unique_for_each_product_manual_or_camera')} required>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                            >
                                <Camera size={16} />{t('tenders.scan_serial_code_with_camera')}</button>
                            <div className="flex items-center gap-1.5">
                                <ScanBarcode size={13} className="shrink-0 text-blue-600" />
                                <Input value={form.supplierBarcode ?? ''} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder={t('tenders.serial_code_okutun_veya_yazin')} />
                            </div>
                        </Field>
                    </div>
                </div>

                <div className="col-span-3 md:col-span-1">
                    <Field label={t('tenders.product_gorseli')}>
                        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-3">
                            {form.imageUrl ? (
                                <div className="relative h-48 w-full overflow-hidden rounded bg-muted md:h-56">
                                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover rounded" />
                                    <button
                                        type="button"
                                        onClick={() => setForm({ ...form, imageUrl: null })}
                                        className="absolute top-1 right-1 p-1 bg-white/90 rounded shadow text-rose-600 hover:bg-rose-50"
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
                            <Button type="button" variant="secondary" size="sm" icon={<Upload size={11} />} onClick={() => fileRef.current?.click()}>
                                {form.imageUrl ?t('tenders.gorseli_degistir') :t('tenders.gorsel_yukle')}
                            </Button>
                            <p className="text-[10.5px] text-slate-400 text-center">{"PNG/JPG, en fazla 2 MB"}</p>
                        </div>
                    </Field>
                </div>

                <div className="col-span-3 grid grid-cols-2 content-start gap-3 md:col-span-2">
                    <Field label={t('tenders.stock_code')} required>
                        <Input value={form.articleCode ?? ''} onChange={(e) => setForm({ ...form, articleCode: e.target.value })} />
                    </Field>
                    <Field label={t('tenders.unit')} required>
                        <Input value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                    </Field>
                    <Field label={t('tenders.product_adi')} required className="col-span-2">
                        <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label={t('common.category')}>
                        <Input value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t('tenders.hydraulic_service')} />
                    </Field>
                    <Field label={t('tenders.unit_sales_price_chf')}>
                        <Input type="number" step="0.01" min={0} value={form.salePrice ?? 0} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label={t('tenders.unit_cost_chf')}>
                        <Input type="number" step="0.01" min={0} value={form.baseCost ?? 0} onChange={(e) => setForm({ ...form, baseCost: Number(e.target.value) || 0 })} />
                    </Field>
                </div>

                <div className="col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Field label={t('tenders.minimum_seviye')}>
                        <Input type="number" step="1" min={0} value={form.minStockLevel ?? 0} onChange={(e) => setForm({ ...form, minStockLevel: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label={t('tenders.critical_threshold')}>
                        <Input type="number" step="1" min={0} value={form.criticalStockLevel ?? 0} onChange={(e) => setForm({ ...form, criticalStockLevel: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label={t('tenders.maksimum')}>
                        <Input type="number" step="1" min={0} value={form.maxStockLevel ?? ''} onChange={(e) => setForm({ ...form, maxStockLevel: e.target.value === '' ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label={t('common.status')}>
                        <Select value={form.status ?? 'ACTIVE'} onChange={(e) => setForm({ ...form, status: e.target.value as ArticleStatus })}>
                            <option value="ACTIVE">{t('common.active')}</option>
                            <option value="INACTIVE">{t('common.inactive')}</option>
                            <option value="IN_SUPPLY">{t('inventory.articles.statusSupply')}</option>
                            <option value="IN_PRODUCTION">{t('tenders.uretimde')}</option>
                        </Select>
                    </Field>
                </div>

                <Field label= "Son Siparis / Alim Tarihi" className="col-span-3 md:col-span-1">
                    <Input
                        type="date"
                        value={form.lastPurchaseDate ? dayjs(form.lastPurchaseDate).format('YYYY-MM-DD') : ''}
                        onChange={(e) => setForm({ ...form, lastPurchaseDate: e.target.value || null })}
                    />
                </Field>


                <Field label={t('tenders.description')} className="col-span-3">
                    <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                        <RichTextMarkdownEditor
                            value={form.description ?? ''}
                            onChange={(description) => setForm({ ...form, description })}
                            minHeight={150}
                            className="border-0"
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
