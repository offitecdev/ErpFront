import { useRef } from 'react';
import { toast } from 'sonner';
import { File02 as FileText, FileCheck02 as FileCheck2, Image01 as ImageIcon, RefreshCcw01 as RotateCcw, UploadCloud02 as Upload, X } from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Textarea, Select } from '../../components/ui-shared/Field';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { usePdfSettings, usePdfSettingsStore } from '../../store/pdfSettingsStore';

import { t } from '@/i18n/translate';

export const PdfSettings = () => {
    const { settings, setSettings, resetSettings } = usePdfSettingsStore();
    // Gedruckt wird der Name des aktiven Mandanten, nicht der gespeicherte —
    // deshalb steht hier genau das im Feld, was auf dem PDF landet.
    const printed = usePdfSettings();
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    const onUploadImage = (file: File, target: 'logoBase64') => {
        if (file.size > 4 * 1024 * 1024) {
            toast.error(t('settings.pdf.errorImageSize'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const value = e.target?.result as string;
            setSettings({ [target]: value } as any);
            toast.success(t('settings.pdf.successImageSave'));
        };
        reader.readAsDataURL(file);
    };

    const onUploadPdf = (file: File) => {
        if (file.type !== 'application/pdf') {
            toast.error(t('settings.pdf.errorPdfOnly'));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error(t('settings.pdf.errorPdfSize'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const value = e.target?.result as string;
            setSettings({ letterheadBackgroundPdf: value, useBundledLetterhead: false });
            toast.success(t('settings.pdf.successPdfSave'));
        };
        reader.readAsDataURL(file);
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Ayarlar › PDF & Teklif Şablonu"
                title={t('settings.pdf.title')}
                description={t('settings.pdf.description')}
                actions={
                    <Button variant="ghost" icon={<RotateCcw size={13} />} onClick={() => { if (confirm(t('auto.tum_ayarlar_varsayilana_dondurulecek_onayliyor_m'))) resetSettings(); }}>{t('settings.pdf.resetDefault')}</Button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-8 flex flex-col gap-4">
                    <Card title={t('settings.pdf.companyInfo')} icon={<FileText size={13} />}>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('crm.customers.companyName')} required className="col-span-2" hint={t('settings.pdf.companyNameHint')}>
                                <Input value={printed.companyName} readOnly />
                            </Field>
                            <Field label={t('settings.pdf.addressLine1')}>
                                <Input value={settings.addressLine1} onChange={(e) => setSettings({ addressLine1: e.target.value })} />
                            </Field>
                            <Field label={t('settings.pdf.addressLine2')}>
                                <Input value={settings.addressLine2} onChange={(e) => setSettings({ addressLine2: e.target.value })} />
                            </Field>
                            <Field label={t('settings.pdf.postalCode')}>
                                <Input value={settings.postalCode} onChange={(e) => setSettings({ postalCode: e.target.value })} />
                            </Field>
                            <Field label={t('settings.pdf.city')}>
                                <Input value={settings.city} onChange={(e) => setSettings({ city: e.target.value })} />
                            </Field>
                            <Field label={t('settings.pdf.country')}>
                                <Input value={settings.country} onChange={(e) => setSettings({ country: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
                            </Field>
                            <Field label={t('common.phone')}>
                                <Input value={settings.phone ?? ''} onChange={(e) => setSettings({ phone: e.target.value })} />
                            </Field>
                            <Field label={t('crm.customers.activityEmail')}>
                                <Input type="email" value={settings.email ?? ''} onChange={(e) => setSettings({ email: e.target.value })} />
                            </Field>
                            <Field label={t('common.website')}>
                                <Input value={settings.website ?? ''} onChange={(e) => setSettings({ website: e.target.value })} />
                            </Field>
                            <Field label={t('settings.pdf.taxId')} className="col-span-2">
                                <Input value={settings.taxId ?? ''} onChange={(e) => setSettings({ taxId: e.target.value })} placeholder={t('settings.pdf.taxIdPlaceholder')} />
                            </Field>
                        </div>
                    </Card>

                    <Card title={t('settings.pdf.bankInfo')} icon={<FileText size={13} />}>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="IBAN" required className="col-span-2" hint={t('auto.swiss_qr_bill_icin_bosluksuz_veya_4_lu_gruplar_h')}>
                                <Input value={settings.iban} onChange={(e) => setSettings({ iban: e.target.value })} placeholder={t('auto.ch00_0000_0000_0000_0000_0')} />
                            </Field>
                            <Field label={t('auto.banka_adi')}>
                                <Input value={settings.bankName ?? ''} onChange={(e) => setSettings({ bankName: e.target.value })} />
                            </Field>
                            <Field label= "BIC / SWIFT">
                                <Input value={settings.bic ?? ''} onChange={(e) => setSettings({ bic: e.target.value })} />
                            </Field>
                            <Field label={t('auto.para_birimi')}>
                                <Select value={settings.currency} onChange={(e) => setSettings({ currency: e.target.value as 'CHF' | 'EUR' })}>
                                    <option value="CHF">{t('auto.chf_isvicre_frangi')}</option>
                                    <option value="EUR">{t('auto.eur_euro')}</option>
                                </Select>
                            </Field>
                            <Field label={t('auto.kdv_mwst_orani')}>
                                <Input type="number" step="0.1" min={0} max={100} value={settings.vatRate} onChange={(e) => setSettings({ vatRate: Number(e.target.value) || 0 })} />
                            </Field>
                            <Field label={t('auto.odeme_kosullari')} className="col-span-2">
                                <Input value={settings.paymentTerms} onChange={(e) => setSettings({ paymentTerms: e.target.value })} />
                            </Field>
                            <Field label={t('auto.alt_bilgi_notu')} className="col-span-2">
                                <Textarea rows={2} value={settings.footerNote} onChange={(e) => setSettings({ footerNote: e.target.value })} />
                            </Field>
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-4">
                    <Card title={t('auto.antetli_kagit_pdf_sablonu')} icon={<FileCheck2 size={13} />}>
                        <p className="text-[11.5px] text-slate-500 mb-2">{t('auto.a4_pdf_yukleyin_sayfa_1_kapak_icin_sayfa_2_ise_t')}</p>

                        <Checkbox
                            label={t('auto.varsayilan_offitec_sablonunu_kullan')}
                            hint={t('auto.ozel_pdf_yukluyse_bu_secenek_otomatik_kilitlenir')}
                            size="sm"
                            isSelected={settings.useBundledLetterhead !== false}
                            isDisabled={!!settings.letterheadBackgroundPdf}
                            onChange={(checked) => setSettings({ useBundledLetterhead: checked })}
                            className="mb-2 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                        />

                        {settings.letterheadBackgroundPdf ? (
                            <div className="relative border border-slate-200 rounded mb-2 p-3 bg-blue-50/30 flex items-center gap-2">
                                <FileCheck2 size={20} className="text-blue-700" />
                                <div className="flex-1">
                                    <div className="text-[12.5px] font-medium text-slate-800">{t('auto.ozel_pdf_yuklu')}</div>
                                    <div className="text-[11px] text-slate-500">{t('auto.tum_teklif_ve_saha_raporu_ciktilari_bu_sablonu_k')}</div>
                                </div>
                                <button
                                    onClick={() => setSettings({ letterheadBackgroundPdf: null, useBundledLetterhead: true })}
                                    className="p-1 bg-white/90 rounded shadow text-rose-600 hover:bg-rose-50"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ) : (
                            <div className="border border-dashed border-slate-300 rounded p-4 text-center text-slate-400 mb-2">
                                <FileText size={32} className="mx-auto mb-1 text-slate-300" />
                                <div className="text-[11.5px]">
                                    {settings.useBundledLetterhead !== false
                                        ?t('auto.varsayilan_offitec_sablonu_aktif')
                                        :t('auto.sablon_secili_degil_bos_arka_plan')}
                                </div>
                            </div>
                        )}
                        <input
                            ref={pdfInputRef}
                            type="file"
                            accept="application/pdf"
                            hidden
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onUploadPdf(f);
                            }}
                        />
                        <Button variant="primary" icon={<Upload size={13} />} onClick={() => pdfInputRef.current?.click()} className="w-full">{t('auto.ozel_pdf_yukle')}</Button>
                    </Card>

                    <Card title={t('auto.logo_yedek')} icon={<ImageIcon size={13} />}>
                        <p className="text-[11.5px] text-slate-500 mb-2">{t('auto.arka_plan_yokken_kullanilir_genelde_60_60_px_log')}</p>
                        {settings.logoBase64 ? (
                            <div className="relative border border-slate-200 rounded mb-2 inline-block">
                                <img src={settings.logoBase64} alt="" className="h-16" />
                                <button
                                    onClick={() => setSettings({ logoBase64: null })}
                                    className="absolute top-0.5 right-0.5 p-0.5 bg-white/90 rounded text-rose-600 hover:bg-rose-50"
                                >
                                    <X size={11} />
                                </button>
                            </div>
                        ) : null}
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg"
                            hidden
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) onUploadImage(f, 'logoBase64');
                            }}
                        />
                        <Button variant="secondary" size="sm" icon={<Upload size={11} />} onClick={() => logoInputRef.current?.click()} className="w-full">{t('auto.logo_yukle')}</Button>
                    </Card>
                </div>
            </div>
        </div>
    );
};
