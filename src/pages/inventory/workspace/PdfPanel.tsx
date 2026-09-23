import { useEffect, useState } from 'react';
import { File05, FileDownload02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { PurchaseOrderRow } from '@/types/inventory';
import type { OrderPdfLang } from '@/utils/pdf/orderPdf';
import { localizePurchaseCode } from '@/utils/purchaseCode';
import { SectionCard } from '../components/primitives';

const PDF_LANGS: OrderPdfLang[] = ['de', 'tr', 'en'];

/**
 * ── DAS BELEGBLATT, ERST WENN MAN ES ANSIEHT (22.09.2026) ──────────────────
 *
 * Vorgabe Samet: «Biz bu tablara bastıkça veri gelecek, tüm veriler asla aynı
 * anda yüklenmesin.» Dieses Blatt ist der teuerste Reiter der Seite — es baut
 * ein ganzes PDF im Browser. Darum ist es ein EIGENES Bauteil, das erst beim
 * Öffnen des Reiters eingehängt wird: solange niemand auf «PDF» klickt, läuft
 * hier kein Byte.
 */
export const PdfPanel = ({ order, priceRequest }: { order: PurchaseOrderRow; priceRequest: boolean }) => {
    const settings = usePdfSettings();
    const [lang, setLang] = useState<OrderPdfLang>('de');
    const [url, setUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Der Dateiname trägt den Code in der Sprache des DOKUMENTS.
    const fileName = `${localizePurchaseCode(order.referenceNumber, lang)}.pdf`;

    useEffect(() => {
        let cancelled = false;
        let objectUrl: string | null = null;
        // Der Anzeiger erst NACH dem Rendern — sonst rendert der Effekt sich selbst nach.
        queueMicrotask(() => { if (!cancelled) { setBusy(true); setError(null); } });
        (async () => {
            // Immer dynamisch: der PDF-Bauer wiegt mehr als die halbe Seite.
            const bytes = priceRequest
                ? await (await import('@/utils/pdf/priceRequestPdf')).buildPriceRequestPdfBytes(order, settings, lang)
                : await (await import('@/utils/pdf/orderPdf')).buildOrderPdfBytes(order, settings, lang);
            if (cancelled) return;
            objectUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
            setUrl(objectUrl);
        })()
            .catch((err: unknown) => { if (!cancelled) setError((err as Error)?.message || 'error'); })
            .finally(() => { if (!cancelled) setBusy(false); });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            setUrl(null);
        };
        // `updatedAt` erneuert die Vorschau nach einer Änderung.
    }, [order.id, order.updatedAt, lang, priceRequest]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <SectionCard
            title={t('inv.orders.views.pdf')}
            action={(
                <div className="flex items-center gap-2">
                    {/* Die Vorschau ist eine blob:-URL — Chromes eigene Leiste ist
                        darum aus; Name und Download kommen von hier. */}
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-white/80">
                        <File05 size={14} />
                        {fileName}
                    </span>
                    <button
                        type="button"
                        disabled={!url}
                        onClick={() => {
                            if (!url) return;
                            const anchor = document.createElement('a');
                            anchor.href = url;
                            anchor.download = fileName;
                            document.body.appendChild(anchor);
                            anchor.click();
                            anchor.remove();
                        }}
                        className="flex items-center gap-1 rounded-md bg-[#0a7aff] px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#0066e0] disabled:opacity-50"
                    >
                        <FileDownload02 size={13} />
                        {t('common.download')}
                    </button>
                    <div className="ofi-lager-tabs flex items-center gap-1 rounded-md border border-slate-200 p-0.5 dark:border-white/15">
                        {PDF_LANGS.map((entry) => (
                            <button
                                key={entry}
                                type="button"
                                onClick={() => setLang(entry)}
                                aria-current={lang === entry ? 'page' : undefined}
                                className={`rounded px-2.5 py-1 text-[11.5px] font-semibold uppercase transition-colors ${
                                    lang === entry
                                        ? 'bg-[#0a7aff]/10 text-[#0a7aff] dark:bg-[#3b8dff]/25 dark:text-[#5c9fff]'
                                        : 'text-slate-500 hover:bg-[#0a7aff]/[0.06] hover:text-[#0066e0] dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white'
                                }`}
                            >
                                {entry}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        >
            <div className="h-[70vh] min-h-[420px] overflow-hidden bg-slate-100 dark:bg-white/5">
                {busy || !url ? (
                    <div className="flex h-full items-center justify-center text-[13px] text-slate-500 dark:text-white/60">
                        {error || t('inv.orders.pdfGenerating')}
                    </div>
                ) : (
                    <iframe title={fileName} src={`${url}#toolbar=0&navpanes=0`} className="h-full w-full" />
                )}
            </div>
        </SectionCard>
    );
};
