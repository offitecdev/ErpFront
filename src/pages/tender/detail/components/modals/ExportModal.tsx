import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    AlertTriangle,
    DownloadCloud02 as Download,
    File05 as FileText,
} from '@/components/icons/antIconCompat';

import { Button } from '@/components/ui-shared/Button';
import { Checkbox } from '@/components/ui-shared/Checkbox';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { PdfGeneratingOverlay } from '@/components/pdf/PdfGeneratingOverlay';
import { tenderApi } from '@/lib/api/tender';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import { useTenderStore } from '@/store/tenderStore';
import { t } from '@/i18n/translate';
import { flattenTenderTreeForPdf } from '../../tenderDetailUtils';

type ExportFormat = 'PDF' | 'CRBX' | 'SIA451';
type PdfLanguage = 'tr' | 'de' | 'en';

type ExportModalProps = {
    open: boolean;
    onClose: () => void;
    tenderId: string;
    tenderNumber: string;
    tree: any[];
    grandTotal: number;
};

export const ExportModal: React.FC<ExportModalProps> = ({ open, onClose, tenderId, tenderNumber, tree, grandTotal }) => {
    const [format, setFormat] = useState<ExportFormat>('PDF');
    const [loading, setLoading] = useState(false);
    // Shows the "Generating PDF…" overlay while the doc is assembled (incl. the
    // image-fetch stage). Holds the current sub-line, or null when idle.
    const [pdfStage, setPdfStage] = useState<string | null>(null);
    const [includeQrBill, setIncludeQrBill] = useState(false);
    const [reference, setReference] = useState('');
    const [pdfLang, setPdfLang] = useState<PdfLanguage>('de');
    const { detail, activities } = useTenderStore();
    const { settings } = usePdfSettingsStore();
    const navigate = useNavigate();

    const handleExport = async () => {
        if (!detail) return;
        setLoading(true);
        try {
            if (format === 'PDF') {
                const flatPositions = flattenTenderTreeForPdf(tree);
                // Fetch ONLY the images we actually need: the distinct product ids
                // used in this tender (not the whole detail, not duplicates). This
                // is the single biggest cost of generating the PDF.
                setPdfStage(t('tenders.pdf_gorseller_yukleniyor'));
                const articleIds = [...new Set(
                    flatPositions.map((p: any) => p.sourceArticleId).filter(Boolean) as string[],
                )];
                const imageById = new Map<string, string>();
                if (articleIds.length > 0) {
                    try {
                        const images = await tenderApi.getProductImages(tenderId, articleIds);
                        images.forEach((row) => {
                            if (row.imageUrl) imageById.set(row.id, row.imageUrl);
                        });
                    } catch {
                        /* fall back to an image-less PDF if the image fetch fails */
                    }
                }
                setPdfStage(t('tenders.pdf_olusturuluyor'));
                const positions = flatPositions.map((p: any) => ({
                    ...p,
                    imageUrl: (p.sourceArticleId && imageById.get(p.sourceArticleId)) || p.imageUrl || null,
                }));
                const { exportTenderPdf } = await import('@/utils/pdf/tenderPdf');
                await exportTenderPdf(
                    {
                        tenderNumber: detail.tender.tenderNumber,
                        version: detail.tender.version,
                        createdAt: detail.tender.createdAt,
                        validUntil: detail.tender.validUntil,
                        customerName: detail.tender.customerName || '',
                        customerAddress: detail.tender.customerAddress,
                        customerEmail: detail.tender.customerEmail,
                        customerPhone: detail.tender.customerPhone,
                        createdByName: detail.tender.createdByName,
                        activities,
                        positions,
                        grandTotal,
                        referenceNumber: reference || undefined,
                        qrBillEnabled: includeQrBill,
                        lang: pdfLang,
                    },
                    settings
                );
                toast.success(t('tenders.pdf_indirildi'));
                onClose();
            } else {
                const res = await tenderApi.exportFile(tenderId, format);
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${tenderNumber}-${format}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(t('tenders.verisi_indirildi', { format }));
                onClose();
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || e.message || t('tenders.export_aktarim_basarisiz'));
        } finally {
            setLoading(false);
            setPdfStage(null);
        }
    };

    return (
        <>
        <PdfGeneratingOverlay open={pdfStage !== null} detail={pdfStage} />
        <Modal
            open={open}
            title={t('tenders.tender_export')}
            description={t('tenders.isvicre_standartlarinda_pdf_veya_makine_okunur_c')}
            onClose={onClose}
            width="md"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" loading={loading} icon={<Download size={13} />} onClick={handleExport}>{t('common.download')}</Button>
                </>
            }
        >
            <div className="space-y-3">
                <Field label={t('tenders.output_formati')}>
                    <div className="grid grid-cols-3 gap-2">
                        {(['PDF', 'CRBX', 'SIA451'] as const).map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFormat(f)}
                                className={`px-3 py-3 border rounded text-[12.5px] font-medium transition-colors flex flex-col items-center gap-1 ${format === f
                                        ? 'border-blue-700 bg-blue-50 text-blue-800'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                <FileText size={14} />
                                {f}
                            </button>
                        ))}
                    </div>
                </Field>

                {format === 'PDF' && (
                    <>
                        <Field label="PDF Dili / Sprache / Language">
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { code: 'tr' as const, label: 'T\u00fcrk\u00e7e' },
                                    { code: 'de' as const, label: 'Deutsch' },
                                    { code: 'en' as const, label: 'English' },
                                ]).map((l) => (
                                    <button
                                        key={l.code}
                                        type="button"
                                        onClick={() => setPdfLang(l.code)}
                                        className={`px-3 py-2 border rounded text-[12.5px] font-medium transition-colors ${pdfLang === l.code
                                                ? 'border-blue-700 bg-blue-50 text-blue-800'
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        {l.label}
                                    </button>
                                ))}
                            </div>
                        </Field>
                        <Field label={t('tenders.reference_numarasi')} hint={t('tenders.qr_bill_reference_skipped_when_empty')}>
                            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('tenders.rf18_5390_0754_7034')} />
                        </Field>
                        <Checkbox
                            label={t('tenders.sayfanin_altina_isvicre_qr_bill_empfangsschein_z')}
                            size="sm"
                            isSelected={includeQrBill}
                            onChange={setIncludeQrBill}
                            className="rounded-lg bg-brand-primary_alt px-3 py-2 ring-1 ring-utility-brand-200 ring-inset"
                        />

                        {!settings.letterheadBackground && (
                            <div className="text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200/70 rounded p-2 flex items-start gap-2">
                                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                                <span>{t('tenders.antetli_kagit_arka_plani_yuklenmemis_pdf_varsayi')}<button
                                        type="button"
                                        className="text-blue-700 underline ml-1"
                                        onClick={() => { onClose(); navigate('/settings/pdf'); }}
                                    >{t('tenders.simdi_add')}</button>
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
        </>
    );
};
