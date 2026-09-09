import { useRef, useState } from 'react';

import { File05 } from '@/components/icons/antIconCompat';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { PopupCaption, PopupDialog, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { lazyToast as toast } from '@/lib/lazyToast';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { PdfLang } from '@/utils/pdf/tenderPdfModern';

/* Die drei Sprachen des Belegs — dieselben drei wie beim Offert-Export, mit
   den Namen in ihrer EIGENEN Sprache (eine Sprachwahl, die sich mitübersetzt,
   ist für den unlesbar, der die Oberflächensprache nicht spricht). */
const PDF_LANGS: { code: PdfLang; labelKey: string; flag: string }[] = [
    { code: 'de', labelKey: 'language.de', flag: '🇩🇪' },
    { code: 'en', labelKey: 'language.en', flag: '🇬🇧' },
    { code: 'tr', labelKey: 'language.tr', flag: '🇹🇷' },
];
const DEFAULT_PDF_LANG: PdfLang = 'de';

export interface AddonPdfTarget {
    id: string;
    orderNumber: string;
}

/**
 * ── NACHTRAG-PDF ─────────────────────────────────────────────────────────────
 * Der Knopf zum eigenen Beleg eines Zusatzauftrags (NT-…). Bernstein, weil
 * die Anwendung dem Nachtrag überall diese Farbe gibt — der marineblaue
 * Nachbar ist die Auftragsbestätigung des Hauptauftrags.
 *
 * Ein Klick fragt zuerst die SPRACHE (Deutsch vorgewählt und im Fokus, Enter
 * genügt), dann wird das Dokument gebaut und in der Vorschau gezeigt, aus der
 * es heruntergeladen wird. Der Generator (`utils/pdf/addonOrderPdf`) wird
 * dynamisch geladen — jsPDF samt Schriften bleibt aus dem Seitenpaket.
 *
 * `variant="icon"` ist die quadratische Fassung für Tabellenzeilen. Der
 * Wrapper schluckt Klicks: die Fenster sind Portale, React lässt ihre Klicks
 * aber durch den Baum bis zur Zeile steigen — die darf davon nichts merken.
 */
export const AddonOrderPdfButton = ({ addon, variant = 'button', size = 'sm', className, disabled }: {
    addon: AddonPdfTarget | null;
    variant?: 'button' | 'icon';
    size?: 'sm' | 'lg';
    className?: string;
    disabled?: boolean;
}) => {
    const settings = usePdfSettings();
    const [langOpen, setLangOpen] = useState(false);
    const [selected, setSelected] = useState<PdfLang>(DEFAULT_PDF_LANG);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [stage, setStage] = useState<string | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const saveRef = useRef<(() => void) | null>(null);

    const generate = async (lang: PdfLang) => {
        if (!addon) return;
        setSelected(lang);
        setLangOpen(false);
        saveRef.current = null;
        setBlob(null);
        setPreviewOpen(true);
        setBusy(true);
        setStage(t('tenders.pdf_olusturuluyor'));
        try {
            const module = await import('@/utils/pdf/addonOrderPdf');
            const doc = await module.buildAddonOrderPdf(addon.id, settings, {
                lang,
                onProgress: (p) => {
                    if (p.stage === 'positions') {
                        setStage(t('tenders.pdf_positions_progress', { done: p.done, total: p.total }));
                    } else if (p.stage === 'finalize') {
                        setStage(t('tenders.pdf_finalizing'));
                    }
                },
            });
            saveRef.current = () => module.saveAddonOrderPdf(doc);
            setBlob(doc.blob);
        } catch (error: unknown) {
            const failure = error as { response?: { data?: { error?: string } }; message?: string };
            toast.error(failure?.response?.data?.error || failure?.message || t('services.toastPdfError'));
            setPreviewOpen(false);
        } finally {
            setBusy(false);
            setStage(null);
        }
    };

    const isDisabled = disabled || !addon;

    return (
        <span className="contents" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
            <button
                type="button"
                onClick={() => setLangOpen(true)}
                disabled={isDisabled}
                title={t('crm.addon.pdfTitle')}
                aria-label={variant === 'icon' ? t('crm.addon.pdfButton') : undefined}
                className={`ofi-addon-pdf-btn ${variant === 'icon' ? 'is-icon' : ''} ${size === 'lg' ? 'ofi-addon-pdf-btn--lg' : ''} ${className || ''}`}
            >
                <File05 size={variant === 'icon' ? 15 : 14} />
                {variant === 'button' && <span>{t('crm.addon.pdfButton')}</span>}
            </button>

            <PopupDialog
                open={langOpen}
                onClose={() => setLangOpen(false)}
                title={t('crm.addon.pdfTitle')}
                subtitle={addon?.orderNumber || undefined}
                icon={<File05 size={20} />}
                width={520}
            >
                <PopupCaption>{t('crm.addon.pdfLanguageQuestion')}</PopupCaption>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
                    {PDF_LANGS.map((lang) => (
                        <button
                            key={lang.code}
                            type="button"
                            role="radio"
                            aria-checked={selected === lang.code}
                            autoFocus={lang.code === DEFAULT_PDF_LANG}
                            onClick={() => { void generate(lang.code); }}
                            className={`ofi-tp-tile ${selected === lang.code ? 'is-on' : ''}`}
                        >
                            <span aria-hidden className="block text-[20px] leading-none">{lang.flag}</span>
                            <span className="ofi-tp-tile__title pt-1.5">{t(lang.labelKey)}</span>
                            <span className="ofi-tp-tile__desc">{lang.code.toUpperCase()}</span>
                        </button>
                    ))}
                </div>
                <PopupNote className="mt-3">{t('crm.addon.pdfHint')}</PopupNote>
            </PopupDialog>

            <PdfPreviewSheet
                open={previewOpen}
                title={t('crm.addon.pdfTitle')}
                subtitle={addon?.orderNumber || undefined}
                blob={blob}
                loading={busy}
                loadingLabel={stage ?? t('tenders.pdf_olusturuluyor')}
                emptyText={t('services.toastPdfError')}
                downloadLabel={t('common.download')}
                onClose={() => setPreviewOpen(false)}
                onDownload={() => {
                    saveRef.current?.();
                    toast.success(t('tenders.pdf_indirildi'));
                }}
            />
        </span>
    );
};
