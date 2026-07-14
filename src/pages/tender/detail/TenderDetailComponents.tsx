import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    Camera01 as Camera,
    Hash01 as Hash,
    Scan as ScanBarcode,
} from '@/components/icons/antIconCompat';
import { BarcodeScannerModal } from '../../../components/ui-shared/BarcodeScannerModal';
import { Button } from '../../../components/ui-shared/Button';
import { Field, Input } from '../../../components/ui-shared/Field';
import { Modal } from '../../../components/ui-shared/Modal';
import { RichTextMarkdownEditor } from './TenderRichText';
import { t } from '@/i18n/translate';
import { useLanguageRefresh } from './hooks/useLanguageRefresh';
import { TreeRow } from './components/tree/TreeRow';

export { TreeRow };

export { PositionDetailPanel } from './components/position-detail/PositionDetailPanel';

export const SummaryStat: React.FC<{ label: string; value: string; icon: React.ReactNode; primary?: boolean }> = ({ label, value, icon, primary }) => { useLanguageRefresh(); return (
    <div className={`border rounded-md px-4 py-3 ${primary ?"bg-blue-50/60 border-blue-200/60" :"bg-white border-slate-200/70"}`}>
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            {icon}
            {label}
        </div>
        <div className={`mt-1 text-[16px] font-semibold ${primary ? 'text-blue-900' : 'text-slate-800'}`}>
            {value}
        </div>
    </div>
  );
}

/* ── New Article Modal ── */
export const NewArticleModal: React.FC<{
    open: boolean;
    onClose: () => void;
    onSubmit: (a: { articleCode: string; name: string; baseCost: number; salePrice?: number; unit: string; description?: string; systemBarcode?: string; supplierBarcode?: string }) => Promise<void>;
}> = ({ open, onClose, onSubmit }) => {
    const [form, setForm] = useState({ articleCode: '', name: '', baseCost: 0, salePrice: 0, unit: '', description: '', systemBarcode: '', supplierBarcode: '' });
    const [submitting, setSubmitting] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'serial' | 'general'>('serial');

    useEffect(() => {
        if (open) setForm({ articleCode: '', name: '', baseCost: 0, salePrice: 0, unit: '', description: '', systemBarcode: '', supplierBarcode: '' });
    }, [open]);

    return (
        <Modal
            open={open}
            title={t('tenders.new_product_material')}
            description={t('tenders.add_record_to_erp_product_material_catalog')}
            onClose={onClose}
            width="full"
            closeOnBackdrop={false}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
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
                                await onSubmit({
                                    ...form,
                                    systemBarcode: form.systemBarcode || undefined,
                                    supplierBarcode: form.supplierBarcode || undefined,
                                    description: form.description || undefined,
                                });
                            } finally {
                                setSubmitting(false);
                            }
                        }}
                    >{t('common.create')}</Button>
                </>
            }
        >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm lg:col-span-2">
                    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                        <ScanBarcode size={13} />{t('tenders.barcode_info')}</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label={t('tenders.general_product_code')} hint={t('tenders.optional_category_barcode')}>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('general'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                                <Camera size={16} />{t('tenders.scan_general_code_with_camera')}</button>
                            <div className="flex items-center gap-1.5">
                                <Hash size={13} className="shrink-0 text-muted-foreground" />
                                <Input value={form.systemBarcode} onChange={(e) => setForm({ ...form, systemBarcode: e.target.value })} placeholder={t('tenders.barcode_okutun_veya_yazin')} />
                            </div>
                        </Field>
                        <Field label={t('tenders.product_serial_code')} hint={t('tenders.required_unique_for_each_product')} required>
                            <button
                                type="button"
                                onClick={() => { setScannerMode('serial'); setScannerOpen(true); }}
                                className="mb-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                            >
                                <Camera size={16} />{t('tenders.scan_serial_code_with_camera')}</button>
                            <div className="flex items-center gap-1.5">
                                <ScanBarcode size={13} className="shrink-0 text-blue-600" />
                                <Input value={form.supplierBarcode} onChange={(e) => setForm({ ...form, supplierBarcode: e.target.value })} placeholder={t('tenders.serial_code_okutun_veya_yazin')} />
                            </div>
                        </Field>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 content-start">
                    <Field label={t('tenders.product_code')} required>
                        <Input value={form.articleCode}
                            onChange={(e) => setForm({ ...form, articleCode: e.target.value })} />
                    </Field>
                    <Field label={t('tenders.unit')} required>
                        <Input value={form.unit}
                            onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={t('tenders.m_kg')} />
                    </Field>
                    <Field label={t('tenders.product_adi')} required className="col-span-2">
                        <Input value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <Field label={t('tenders.unit_sales_price_chf')} className="col-span-2">
                        <Input type="number" step="0.01" value={form.salePrice}
                            onChange={(e) => setForm({ ...form, salePrice: parseFloat(e.target.value) || 0 })} />
                    </Field>
                    <Field label={t('tenders.unit_cost_chf')} className="col-span-2">
                        <Input type="number" step="0.01" value={form.baseCost}
                            onChange={(e) => setForm({ ...form, baseCost: parseFloat(e.target.value) || 0 })} />
                    </Field>
                </div>
                <Field label={t('common.description')} hint={t('tenders.pdf_ciktisinda_duz_metin_ve_madde_isaretleri_kor')}>
                    <RichTextMarkdownEditor
                        value={form.description}
                        onChange={(description) => setForm({ ...form, description })}
                        minHeight={260}
                        placeholder={t('tenders.orn_10_bakim_seti_10_lecksuchspray_10_reinigungs')}
                    />
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
