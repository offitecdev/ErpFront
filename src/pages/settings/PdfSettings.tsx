import { useRef } from 'react';
import { toast } from 'sonner';
import { File02 as FileText, FileCheck02 as FileCheck2, Image01 as ImageIcon, RefreshCcw01 as RotateCcw, UploadCloud02 as Upload, X } from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Textarea, Select } from '../../components/ui-shared/Field';
import { Checkbox } from '../../components/base/checkbox/checkbox';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';

export const PdfSettings = () => {
    const { settings, setSettings, resetSettings } = usePdfSettingsStore();
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    const onUploadImage = (file: File, target: 'logoBase64') => {
        if (file.size > 4 * 1024 * 1024) {
            toast.error('Görsel 4 MB sınırını aşıyor.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const value = e.target?.result as string;
            setSettings({ [target]: value } as any);
            toast.success('Görsel kaydedildi.');
        };
        reader.readAsDataURL(file);
    };

    const onUploadPdf = (file: File) => {
        if (file.type !== 'application/pdf') {
            toast.error('Sadece PDF dosyası yükleyebilirsiniz.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('PDF 5 MB sınırını aşıyor.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const value = e.target?.result as string;
            setSettings({ letterheadBackgroundPdf: value, useBundledLetterhead: false });
            toast.success('Antetli kağıt PDF kaydedildi.');
        };
        reader.readAsDataURL(file);
    };

    return (
        <div>
            <PageHeader
                breadcrumb="Ayarlar › PDF & Teklif Şablonu"
                title="PDF Şablonu Ayarları"
                description="Antetli kağıt arka planı, IBAN, KDV ve banka bilgilerini buradan yönetin. Tüm teklif ve saha raporu PDF çıktıları bu ayarları kullanır."
                actions={
                    <Button variant="ghost" icon={<RotateCcw size={13} />} onClick={() => { if (confirm('Tüm ayarlar varsayılana döndürülecek. Onaylıyor musunuz?')) resetSettings(); }}>
                        Varsayılana dön
                    </Button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-8 flex flex-col gap-4">
                    <Card title="Firma Bilgileri" icon={<FileText size={13} />}>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Firma Adı" required className="col-span-2">
                                <Input value={settings.companyName} onChange={(e) => setSettings({ companyName: e.target.value })} />
                            </Field>
                            <Field label="Adres Satırı 1">
                                <Input value={settings.addressLine1} onChange={(e) => setSettings({ addressLine1: e.target.value })} />
                            </Field>
                            <Field label="Adres Satırı 2 / Numara">
                                <Input value={settings.addressLine2} onChange={(e) => setSettings({ addressLine2: e.target.value })} />
                            </Field>
                            <Field label="Posta Kodu">
                                <Input value={settings.postalCode} onChange={(e) => setSettings({ postalCode: e.target.value })} />
                            </Field>
                            <Field label="Şehir">
                                <Input value={settings.city} onChange={(e) => setSettings({ city: e.target.value })} />
                            </Field>
                            <Field label="Ülke (ISO 2)">
                                <Input value={settings.country} onChange={(e) => setSettings({ country: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} />
                            </Field>
                            <Field label="Telefon">
                                <Input value={settings.phone ?? ''} onChange={(e) => setSettings({ phone: e.target.value })} />
                            </Field>
                            <Field label="E-Posta">
                                <Input type="email" value={settings.email ?? ''} onChange={(e) => setSettings({ email: e.target.value })} />
                            </Field>
                            <Field label="Web Sitesi">
                                <Input value={settings.website ?? ''} onChange={(e) => setSettings({ website: e.target.value })} />
                            </Field>
                            <Field label="UID / Vergi No" className="col-span-2">
                                <Input value={settings.taxId ?? ''} onChange={(e) => setSettings({ taxId: e.target.value })} placeholder="CHE-123.456.789 MWST" />
                            </Field>
                        </div>
                    </Card>

                    <Card title="Banka & Ödeme Bilgileri" icon={<FileText size={13} />}>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="IBAN" required className="col-span-2" hint="Swiss QR-Bill için; boşluksuz veya 4'lü gruplar halinde girebilirsiniz">
                                <Input value={settings.iban} onChange={(e) => setSettings({ iban: e.target.value })} placeholder="CH00 0000 0000 0000 0000 0" />
                            </Field>
                            <Field label="Banka Adı">
                                <Input value={settings.bankName ?? ''} onChange={(e) => setSettings({ bankName: e.target.value })} />
                            </Field>
                            <Field label="BIC / SWIFT">
                                <Input value={settings.bic ?? ''} onChange={(e) => setSettings({ bic: e.target.value })} />
                            </Field>
                            <Field label="Para Birimi">
                                <Select value={settings.currency} onChange={(e) => setSettings({ currency: e.target.value as 'CHF' | 'EUR' })}>
                                    <option value="CHF">CHF (İsviçre Frangı)</option>
                                    <option value="EUR">EUR (Euro)</option>
                                </Select>
                            </Field>
                            <Field label="KDV / MwSt Oranı (%)">
                                <Input type="number" step="0.1" min={0} max={100} value={settings.vatRate} onChange={(e) => setSettings({ vatRate: Number(e.target.value) || 0 })} />
                            </Field>
                            <Field label="Ödeme Koşulları" className="col-span-2">
                                <Input value={settings.paymentTerms} onChange={(e) => setSettings({ paymentTerms: e.target.value })} />
                            </Field>
                            <Field label="Alt Bilgi Notu" className="col-span-2">
                                <Textarea rows={2} value={settings.footerNote} onChange={(e) => setSettings({ footerNote: e.target.value })} />
                            </Field>
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-4 flex flex-col gap-4">
                    <Card title="Antetli Kağıt (PDF Şablonu)" icon={<FileCheck2 size={13} />}>
                        <p className="text-[11.5px] text-slate-500 mb-2">
                            A4 PDF yükleyin. Sayfa 1 kapak için, sayfa 2 ise tüm devam sayfaları için kullanılır.
                            Boş bırakırsanız sistemde yüklü OffiTec şablonu kullanılır.
                        </p>

                        <Checkbox
                            label="Varsayılan OffiTec şablonunu kullan"
                            hint="Özel PDF yüklüyse bu seçenek otomatik kilitlenir."
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
                                    <div className="text-[12.5px] font-medium text-slate-800">Özel PDF yüklü</div>
                                    <div className="text-[11px] text-slate-500">Tüm teklif ve saha raporu çıktıları bu şablonu kullanacak.</div>
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
                                        ? 'Varsayılan OffiTec şablonu aktif'
                                        : 'Şablon seçili değil (boş arka plan)'}
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
                        <Button variant="primary" icon={<Upload size={13} />} onClick={() => pdfInputRef.current?.click()} className="w-full">
                            Özel PDF yükle
                        </Button>
                    </Card>

                    <Card title="Logo (Yedek)" icon={<ImageIcon size={13} />}>
                        <p className="text-[11.5px] text-slate-500 mb-2">
                            Arka plan yokken kullanılır. Genelde 60×60 px logosu yeterlidir.
                        </p>
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
                        <Button variant="secondary" size="sm" icon={<Upload size={11} />} onClick={() => logoInputRef.current?.click()} className="w-full">
                            Logo yükle
                        </Button>
                    </Card>
                </div>
            </div>
        </div>
    );
};
