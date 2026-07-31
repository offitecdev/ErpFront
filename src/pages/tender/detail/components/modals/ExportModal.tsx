import React, { useState } from 'react';
import { toast } from 'sonner';
import {
    DownloadCloud02 as Download,
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
import { parseClosingImages } from '../../utils/tenderProduct.utils';
import { flattenTenderTreeForPdf } from '../../tenderDetailUtils';
// Eski (klasik, sablon.pdf antetli) şablon — geri dönmek için bu satırı aç:
// import type { TenderPdfTotals } from '@/utils/pdf/tenderPdf';
import type { TenderPdfTotals } from '@/utils/pdf/tenderPdfModern';

type PdfLanguage = 'tr' | 'de' | 'en';

// Language names stay in their own language (never translated) — that is the
// point of the picker, and it matches how the app's own language switcher reads.
const PDF_LANGS: ReadonlyArray<{ code: PdfLanguage; label: string }> = [
    { code: 'tr', label: 'Türkçe' },
    { code: 'de', label: 'Deutsch' },
    { code: 'en', label: 'English' },
];

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

export const ExportModal: React.FC<ExportModalProps> = ({ open, onClose, tenderId, tree, grandTotal, pdfTotals }) => {
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
            // Eski (klasik) şablon — geri dönmek için bu satırı aç:
            // const { exportTenderPdf } = await import('@/utils/pdf/tenderPdf');
            const { exportTenderPdf } = await import('@/utils/pdf/tenderPdfModern');
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
                    // Optional content blocks — the PDF skips any that are empty.
                    coverLetter: detail.tender.coverLetter,
                    closingNote: detail.tender.closingNote,
                    closingImages: parseClosingImages(detail.tender.closingImages),
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
            description={t('tenders.export_pdf_description')}
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
                <Field label={t('tenders.pdf_dili')}>
                    {/* Sliding glass pill over a 3-up track — same idiom as the
                        project/delivery address toggle (`ofi-addr-toggle`). */}
                    <div className="ofi-addr-toggle relative inline-grid w-full grid-cols-3 rounded-full border border-slate-200/80 bg-slate-100/70 p-0.5">
                        <span
                            aria-hidden
                            className="ofi-addr-toggle-thumb pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(33.333%-1.33px)] rounded-full border border-white/70 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.10)] ring-1 ring-slate-900/5 backdrop-blur-md backdrop-saturate-150 transition-transform duration-300 ease-out"
                            style={{ transform: `translateX(${PDF_LANGS.findIndex((l) => l.code === pdfLang) * 100}%)` }}
                        />
                        {PDF_LANGS.map((l) => (
                            <button
                                key={l.code}
                                type="button"
                                onClick={() => setPdfLang(l.code)}
                                className={`relative z-10 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                                    pdfLang === l.code ? 'text-[#1f2654]' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                </Field>
            </div>
        </Modal>
        </>
    );
};
