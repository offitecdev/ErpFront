import React, { useState } from 'react';
import { toast } from 'sonner';
import {
    DownloadCloud02 as Download,
    File05 as FileText,
} from '@/components/icons/antIconCompat';

import { Button } from '@/components/ui-shared/Button';
import { Field } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { PdfGeneratingOverlay } from '@/components/pdf/PdfGeneratingOverlay';
import { tenderApi } from '@/lib/api/tender';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import { useTenderStore } from '@/store/tenderStore';
import { t } from '@/i18n/translate';
import { toCurrencyCode } from '@/utils/currency';
import { localizeTenderNumber } from '@/utils/tenderNumber';
import { flattenTenderTreeForPdf } from '../../tenderDetailUtils';
import type { TenderPdfTotals } from '@/utils/pdf/tenderPdf';

type ExportFormat = 'PDF' | 'CRBX' | 'SIA451';
type PdfLanguage = 'tr' | 'de' | 'en';

type ExportModalProps = {
    open: boolean;
    onClose: () => void;
    tenderId: string;
    tenderNumber: string;
    tree: any[];
    grandTotal: number;
    /** Belge düzeyi indirim özeti (PDF toplamlarında indirim satırı için). */
    pdfTotals?: TenderPdfTotals | null;
};

export const ExportModal: React.FC<ExportModalProps> = ({ open, onClose, tenderId, tenderNumber, tree, grandTotal, pdfTotals }) => {
    const [format, setFormat] = useState<ExportFormat>('PDF');
    const [loading, setLoading] = useState(false);
    // Shows the "Generating PDF…" overlay while the doc is assembled (incl. the
    // image-fetch stage). Holds the current sub-line, or null when idle.
    const [pdfStage, setPdfStage] = useState<string | null>(null);
    // 0–100 across the whole pipeline (images → layout → finalize → download),
    // so the overlay tracks the download status until it's finished.
    const [pdfProgress, setPdfProgress] = useState<number | null>(null);
    const [pdfLang, setPdfLang] = useState<PdfLanguage>('de');
    const { detail, activities } = useTenderStore();
    const { settings } = usePdfSettingsStore();

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
                setPdfProgress(5);
                const articleIds = [...new Set(
                    flatPositions.map((p: any) => p.sourceArticleId).filter(Boolean) as string[],
                )];
                // Rows without a source article may carry their own uploaded image
                // (manual products, description rows) — those are stored on the
                // position and, like article images, only ever fetched for the PDF.
                const positionIds = flatPositions
                    .filter((p: any) => !p.sourceArticleId && p.id)
                    .map((p: any) => p.id as string);
                const imageById = new Map<string, string>();
                if (articleIds.length > 0 || positionIds.length > 0) {
                    try {
                        const images = await tenderApi.getProductImages(tenderId, articleIds, positionIds);
                        images.forEach((row) => {
                            if (row.imageUrl) imageById.set(row.id, row.imageUrl);
                        });
                    } catch {
                        /* fall back to an image-less PDF if the image fetch fails */
                    }
                }
                setPdfStage(t('tenders.pdf_olusturuluyor'));
                setPdfProgress(10);
                const positions = flatPositions.map((p: any) => ({
                    ...p,
                    imageUrl: (p.sourceArticleId && imageById.get(p.sourceArticleId))
                        || imageById.get(p.id)
                        || p.imageUrl
                        || null,
                }));
                const { exportTenderPdf } = await import('@/utils/pdf/tenderPdf');
                // The offer's own currency wins over the company default so the
                // exported PDF matches what's shown on screen.
                const pdfSettings = {
                    ...settings,
                    currency: toCurrencyCode((detail.tender as { currency?: string | null }).currency),
                };
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
                        totals: pdfTotals ?? null,
                        lang: pdfLang,
                    },
                    pdfSettings,
                    // Map pipeline stages onto one 0–100 bar: images ≤10 %,
                    // position layout 10–80 %, finalize (QR/background merge)
                    // 90 %, browser download hand-off 100 %.
                    (p) => {
                        if (p.stage === 'positions') {
                            setPdfStage(t('tenders.pdf_positions_progress', { done: p.done, total: p.total }));
                            setPdfProgress(10 + Math.round((p.done / Math.max(1, p.total)) * 70));
                        } else if (p.stage === 'finalize') {
                            setPdfStage(t('tenders.pdf_finalizing'));
                            setPdfProgress(90);
                        } else {
                            setPdfStage(t('tenders.pdf_downloading'));
                            setPdfProgress(100);
                        }
                    }
                );
                toast.success(t('tenders.pdf_indirildi'));
                onClose();
            } else {
                const res = await tenderApi.exportFile(tenderId, format);
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${localizeTenderNumber(tenderNumber)}-${format}.json`;
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
            setPdfProgress(null);
        }
    };

    return (
        <>
        <PdfGeneratingOverlay open={pdfStage !== null} detail={pdfStage} progress={pdfProgress} />
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
                    </>
                )}
            </div>
        </Modal>
        </>
    );
};
