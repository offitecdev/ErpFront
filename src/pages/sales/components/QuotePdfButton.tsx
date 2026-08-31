import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Eye } from '@/components/icons/antIconCompat';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { t } from '@/i18n/translate';
import { usePdfSettings } from '@/store/pdfSettingsStore';

/**
 * "Angebot ansehen" auf der Auftragsseite: öffnet das Angebots-PDF der
 * verknüpften Offerte in einem von unten aufsteigenden Blatt und lädt genau
 * dieselbe Datei über den Fussknopf herunter.
 *
 * Das Dokument ist dasselbe wie der Export auf der Offertseite — es wird hier
 * jedoch im Browser erzeugt (`buildQuotePdf`), darum kommt der Generator per
 * dynamischem Import: jsPDF und die Schriften bleiben aus dem Auftrags-Chunk
 * heraus, bis wirklich jemand das Angebot öffnet. Einmal gebaut, bleibt das
 * Dokument im Zustand — erneutes Öffnen ist sofort da.
 */
export const QuotePdfButton = ({ tenderId, tenderNumber, label, variant = 'button' }: {
    tenderId: string;
    tenderNumber?: string | null;
    /** Gesetzt: Knopf mit Text; leer: nur das Auge-Symbol. */
    label?: string;
    /**
     * 'button' = umrandeter Knopf (Kopfzeilen, Angabenzeilen).
     * 'link'   = Textzeile im Fliesstext. Der Hinweis am Fuss der
     *            Auftragskarte fragt in EINEM Satz nach dem Angebots-PDF und
     *            muss darum wie ein Satzteil aussehen, nicht wie ein Knopf —
     *            geöffnet wird beide Male dasselbe Dokument.
     */
    variant?: 'button' | 'link';
}) => {
    const settings = usePdfSettings();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    // Laufende Stufe (Bilder → Positionen → Abschluss), im Fuss des Blattes.
    const [stage, setStage] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const saveRef = useRef<(() => void) | null>(null);

    const openPreview = async () => {
        setOpen(true);
        if (saveRef.current) return;
        setBusy(true);
        setStage(t('tenders.pdf_gorseller_yukleniyor'));
        try {
            const module = await import('@/utils/pdf/quotePdf');
            const doc = await module.buildQuotePdf(tenderId, settings, {
                onProgress: (p) => {
                    if (p.stage === 'positions') {
                        setStage(t('tenders.pdf_positions_progress', { done: p.done, total: p.total }));
                    } else if (p.stage === 'finalize') {
                        setStage(t('tenders.pdf_finalizing'));
                    }
                },
            });
            saveRef.current = () => module.saveQuotePdf(doc);
            setBlob(doc.blob);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || e?.message || t('services.toastPdfError'));
            setOpen(false);
        } finally {
            setBusy(false);
            setStage(null);
        }
    };

    return (
        <>
            {variant === 'link' ? (
                // Die Beschriftung IST der Satz — darum kein aria-label, das
                // ihn überschreiben würde.
                <button
                    type="button"
                    onClick={() => { void openPreview(); }}
                    disabled={busy}
                    title={t('common.preview')}
                    className="ofi-quote-pdf-link inline-flex items-center gap-1.5"
                >
                    <Eye size={14} />
                    {label}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => { void openPreview(); }}
                    disabled={busy}
                    title={t('common.preview')}
                    aria-label={t('common.preview')}
                    className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 text-[12px] font-semibold text-slate-600 transition-colors hover:border-[#272f67] hover:text-[#272f67] disabled:cursor-progress disabled:opacity-60 dark:border-white/20 dark:text-white/70 dark:hover:border-white/40 dark:hover:text-white ${
                        label ? 'px-2 py-1' : 'size-7'
                    }`}
                >
                    <Eye size={13} />
                    {label}
                </button>
            )}

            <PdfPreviewSheet
                open={open}
                title={t('projects.tender')}
                subtitle={tenderNumber || undefined}
                blob={blob}
                loading={busy}
                loadingLabel={stage ?? t('tenders.pdf_olusturuluyor')}
                emptyText={t('services.toastPdfError')}
                downloadLabel={t('common.download')}
                onClose={() => setOpen(false)}
                onDownload={() => {
                    saveRef.current?.();
                    toast.success(t('tenders.pdf_indirildi'));
                }}
            />
        </>
    );
};
