import { useState } from 'react';
import { toast } from 'sonner';

import { PdfGeneratingOverlay } from '@/components/pdf/PdfGeneratingOverlay';
import { t } from '@/i18n/translate';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import { useTenderStore } from '@/store/tenderStore';
import { toCurrencyCode } from '@/utils/currency';
// Old (classic, sablon.pdf letterhead) template — to go back, switch this line:
// import type { TenderPdfTotals } from '@/utils/pdf/tenderPdf';
import type { PdfLang, TenderPdfTotals } from '@/utils/pdf/tenderPdfModern';

import { flattenTenderTreeForPdf } from '../tenderDetailUtils';
import { attachPdfPositionImages } from '../utils/tenderPdfImages.utils';
import { parseClosingImages } from '../utils/tenderProduct.utils';
import { TenderDialog } from './shell/TenderPopupShell';

// Stage boundaries on the single 0–100 progress bar. The image download owns a
// real slice of it (rather than one placeholder tick) so the bar keeps moving
// while the bytes come in.
const IMAGES_DONE_PCT = 15;
const POSITIONS_DONE_PCT = 85;

/* Die drei Sprachen, in denen das Offert-PDF gesetzt werden kann — genau die
   drei, die `tenderPdfModern` übersetzt (PdfLang). Die Namen stehen in ihrer
   EIGENEN Sprache: eine Sprachwahl, die sich mitübersetzt, ist unlesbar für
   den, der die Oberflächensprache gerade nicht spricht.
   `titleKey` trägt aus demselben Grund «PDF exportieren» je Sprache — die
   Schlüssel stehen in allen drei Sprachdateien mit DEMSELBEN Wert, genau wie
   `language.*`, und ergeben zusammen den Fenstertitel. */
const PDF_LANGS: { code: PdfLang; labelKey: string; titleKey: string; flag: string }[] = [
    { code: 'de', labelKey: 'language.de', titleKey: 'tenders.pdf_export_de', flag: '🇩🇪' },
    { code: 'en', labelKey: 'language.en', titleKey: 'tenders.pdf_export_en', flag: '🇬🇧' },
    { code: 'tr', labelKey: 'language.tr', titleKey: 'tenders.pdf_export_tr', flag: '🇹🇷' },
];

/* Deutsch ist vorgewählt — die Kundschaft ist deutschsprachig, jede andere
   Sprache ist die Ausnahme. Die Kachel steht beim Öffnen markiert und im
   Fokus; wer nichts anderes will, drückt Enter oder klickt sie an. */
const DEFAULT_PDF_LANG: PdfLang = 'de';

type ExportPopupProps = {
    open: boolean;
    onClose: () => void;
    tenderId: string;
    tenderNumber: string;
    tree: any[];
    grandTotal: number;
    /** Document-level discount summary (for the discount line in the PDF totals). */
    pdfTotals?: TenderPdfTotals | null;
};

/**
 * "PDF exportieren" — ein einziger Zwischenschritt: die Sprache. Sobald eine
 * Kachel geklickt ist, läuft alles von selbst weiter — das Offert-PDF wird
 * gebaut und SOFORT als Datei abgelegt («Angebot-<Nummer>.pdf»). Keine
 * Vorschau, kein zweiter Tab, kein Bestätigungsknopf: die Sprachwahl IST die
 * Bestätigung. Während der Erzeugung bleibt nur der Fortschritts-Schleier.
 */
export const ExportPopup = ({ open, onClose, tenderId, tenderNumber, tree, grandTotal, pdfTotals }: ExportPopupProps) => {
    // Shows the "Generating PDF…" overlay while the doc is assembled (incl. the
    // image-fetch stage). Holds the current sub-line, or null when idle.
    const [pdfStage, setPdfStage] = useState<string | null>(null);
    // 0–100 across the whole pipeline (images → layout → finalize → download),
    // so the overlay tracks the status until the file drops.
    const [pdfProgress, setPdfProgress] = useState<number | null>(null);
    // Die markierte Kachel. Startet auf Deutsch, damit der Dialog nie ohne
    // Vorauswahl dasteht.
    const [selected, setSelected] = useState<PdfLang>(DEFAULT_PDF_LANG);
    // Gesetzt, sobald eine Sprache gewählt wurde: die Kachelauswahl weicht dann
    // dem Schleier und der Lauf startet. Ein zweiter Klick prallt daran ab.
    const [running, setRunning] = useState(false);
    const { detail, activities, ensurePdfContent } = useTenderStore();
    const settings = usePdfSettings();

    const runExport = async (lang: PdfLang) => {
        if (!detail) { onClose(); return; }
        try {
            const flatPositions = flattenTenderTreeForPdf(tree);
            // Fetch ONLY the images we actually need: the distinct product ids
            // used in this tender (not the whole detail, not duplicates). This
            // is the single biggest cost of generating the PDF.
            setPdfStage(t('tenders.pdf_gorseller_yukleniyor'));
            setPdfProgress(1);
            const [positions, pdfContent, pdfModule] = await Promise.all([
                attachPdfPositionImages(
                    tenderId,
                    flatPositions,
                    // Real byte progress across the image stage's slice of the bar,
                    // so it advances while the download runs instead of resting on
                    // a placeholder until the next stage starts.
                    (fraction) => setPdfProgress(1 + Math.round(fraction * (IMAGES_DONE_PCT - 1))),
                ),
                ensurePdfContent(tenderId),
                import('@/utils/pdf/tenderPdfModern'),
            ]);
            setPdfStage(t('tenders.pdf_olusturuluyor'));
            setPdfProgress(IMAGES_DONE_PCT);
            const { buildTenderPdfBytes } = pdfModule;
            // The offer's own currency wins over the company default so the
            // exported PDF matches what's shown on screen.
            const pdfSettings = {
                ...settings,
                currency: toCurrencyCode((detail.tender as { currency?: string | null }).currency),
            };
            const bytes = await buildTenderPdfBytes(
                {
                    tenderNumber: detail.tender.tenderNumber,
                    version: detail.tender.version,
                    // Kommission / Referenz — shown as rows in the cover info card
                    // when set; the card skips the row when empty.
                    commission: detail.tender.commissionNumber,
                    customerReference: detail.tender.customerReference,
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
                    // Payment plan of the quote — the PDF appends it as its own
                    // table at the end; without a plan the block is skipped.
                    paymentStages: parsePaymentStages(detail.tender.paymentStages),
                    // Optional content blocks — the PDF skips any that are empty.
                    coverLetter: pdfContent.coverLetter,
                    closingImages: parseClosingImages(pdfContent.closingImages),
                    // Die im Popup gewählte Dokumentsprache — sie betrifft NUR
                    // das PDF, nicht die Oberfläche.
                    lang,
                },
                pdfSettings,
                // Map pipeline stages onto one 0–100 bar: images 1–15 % (driven by
                // the bytes actually received), position layout 15–85 %, finalize
                // (QR/background merge) 92 %.
                (p) => {
                    if (p.stage === 'positions') {
                        setPdfStage(t('tenders.pdf_positions_progress', { done: p.done, total: p.total }));
                        setPdfProgress(IMAGES_DONE_PCT + Math.round((p.done / Math.max(1, p.total)) * (POSITIONS_DONE_PCT - IMAGES_DONE_PCT)));
                    } else if (p.stage === 'finalize') {
                        setPdfStage(t('tenders.pdf_finalizing'));
                        setPdfProgress(92);
                    }
                }
            );
            setPdfProgress(100);
            const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            // Direkt in den Download-Ordner: der Dateiname trägt «Angebot» und
            // die Offertnummer, damit die Datei ohne Umbenennen ablegbar ist.
            // Zeichen, die Windows im Dateinamen verbietet, werden ersetzt.
            const code = (tenderNumber || detail.tender.tenderNumber || '').replace(/[\\/:*?"<>|]/g, '-').trim();
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = code ? `Angebot-${code}.pdf` : 'Angebot.pdf';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast.success(t('tenders.pdf_indirildi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error || e.message || t('tenders.export_aktarim_basarisiz'));
        } finally {
            setPdfStage(null);
            setPdfProgress(null);
            onClose();
        }
    };

    const pick = (lang: PdfLang) => {
        if (running) return;
        setSelected(lang);
        setRunning(true);
        void runExport(lang);
    };

    return (
        <>
            <TenderDialog
                open={open && !running}
                onClose={onClose}
                // Der Titel steht dreisprachig, damit ihn auch liest, wer die
                // Oberflächensprache nicht spricht — dieselbe Überlegung wie
                // bei den Kacheln darunter. Er wickelt sich um (index.css,
                // `.ofi-tp-dialog__title`), zwei Zeilen sind eingeplant.
                title={PDF_LANGS.map((lang) => t(lang.titleKey)).join(' · ')}
                subtitle={t('tenders.pdf_language_question')}
                width={520}
            >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
                    {PDF_LANGS.map((lang) => (
                        <button
                            key={lang.code}
                            type="button"
                            role="radio"
                            aria-checked={selected === lang.code}
                            // Deutsch trägt den Fokus, sobald der Dialog steht:
                            // Enter/Leertaste exportiert damit sofort deutsch,
                            // ohne dass jemand die Maus anfassen muss.
                            autoFocus={lang.code === DEFAULT_PDF_LANG}
                            onClick={() => pick(lang.code)}
                            className={`ofi-tp-tile ${selected === lang.code ? 'is-on' : ''}`}
                        >
                            <span aria-hidden className="block text-[20px] leading-none">{lang.flag}</span>
                            <span className="ofi-tp-tile__title pt-1.5">{t(lang.labelKey)}</span>
                            <span className="ofi-tp-tile__desc">{lang.code.toUpperCase()}</span>
                        </button>
                    ))}
                </div>
            </TenderDialog>

            <PdfGeneratingOverlay open={pdfStage !== null} detail={pdfStage} progress={pdfProgress} />
        </>
    );
};
