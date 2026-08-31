import { createPortal } from 'react-dom';
import { File05 as FileText } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

// Full-screen "Generating PDF…" indicator shown while a tender PDF is being
// assembled — including the stage where product image URLs are fetched (images
// are no longer kept in the tender detail; they load only at this point).
// Standalone component so any export flow can drop it in.
type PdfGeneratingOverlayProps = {
    open: boolean;
    /** Optional sub-line, e.g. "Loading product images…" for the image stage. */
    detail?: string | null;
    /** Optional 0–100 completion; shows a progress bar under the status text. */
    progress?: number | null;
};

export const PdfGeneratingOverlay = ({ open, detail, progress }: PdfGeneratingOverlayProps) => {
    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
            {/* `.ofi-pop` — die gemeinsame Fensteroberfläche, siehe index.css
                "FENSTER-OBERFLÄCHE". `rounded-2xl` kam als 8px an. */}
            <div className="ofi-pop flex flex-col items-center gap-4 px-10 py-8">
                <div className="relative flex h-14 w-14 items-center justify-center">
                    <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#1f2654]" />
                    <FileText size={22} className="text-[#1f2654]" />
                </div>
                <div className="text-center">
                    <div className="text-[14px] font-semibold text-slate-800">{t('tenders.pdf_olusturuluyor')}</div>
                    {detail && <div className="mt-1 text-[12px] text-slate-500">{detail}</div>}
                </div>
                {typeof progress === 'number' && (
                    <div className="h-1.5 w-52 overflow-hidden rounded-full bg-slate-200">
                        <div
                            className="h-full rounded-full bg-[#1f2654] transition-[width] duration-200 ease-out"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        />
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
};
