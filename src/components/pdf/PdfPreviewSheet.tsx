import { useEffect, useState } from 'react';
import { FileDownload02 as DownloadIcon } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { Button } from '@/components/ui-shared/Button';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';

/**
 * Von unten aufsteigende PDF-Vorschau, geschlossen über das "X" oben rechts.
 *
 * Gezeigt wird das ECHTE PDF: die Generatoren geben mit `output: 'blob'` (bzw.
 * `buildQuotePdf`) ein Dokument zurück statt es herunterzuladen, das hier in
 * einem Rahmen dargestellt wird. Die Vorschau entspricht damit exakt der
 * späteren Datei — es ist kein nachgebauter Entwurf. Der Fussknopf lädt genau
 * diese Datei herunter.
 *
 * Benutzt von den Kundenrapporten und von der Angebotsvorschau der
 * Auftragsseite; die Beschriftungen sind darum überschreibbar.
 */
export const PdfPreviewSheet = ({
    open,
    title,
    subtitle,
    blob,
    loading,
    loadingLabel,
    emptyText,
    downloadLabel,
    onClose,
    onDownload,
}: {
    open: boolean;
    title: string;
    subtitle?: string;
    blob: Blob | null;
    loading: boolean;
    /** Text während der Erzeugung; Standard: "Wird geladen…". */
    loadingLabel?: string;
    /** Text, wenn kein Dokument entstanden ist. */
    emptyText?: string;
    /** Beschriftung des Download-Knopfes; Standard: "PDF erstellen". */
    downloadLabel?: string;
    onClose: () => void;
    onDownload: () => void;
}) => {
    const [url, setUrl] = useState<string | null>(null);

    // Objekt-URLs sind eine Ressource: bei jedem Wechsel und beim Schliessen
    // wird die alte wieder freigegeben, sonst hält der Tab die Dokumente fest.
    useEffect(() => {
        if (!blob) { setUrl(null); return; }
        const next = URL.createObjectURL(blob);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [blob]);

    const busyLabel = loadingLabel ?? i18nT('common.loading');

    return (
        <BottomSheet
            open={open}
            title={title}
            subtitle={subtitle}
            onClose={onClose}
            width={1100}
            height={820}
            footer={
                <>
                    <span className="text-[12px] text-slate-500 dark:text-white/60">
                        {loading ? busyLabel : ''}
                    </span>
                    <Button variant="primary" icon={<DownloadIcon size={13} />} disabled={!blob} onClick={onDownload}>
                        {downloadLabel ?? i18nT('projects.general.generatePdf')}
                    </Button>
                </>
            }
        >
            <div className="h-full min-h-0 bg-slate-100 p-3 dark:bg-black/20">
                {loading && (
                    <div className="flex h-full items-center justify-center text-[13px] text-slate-500 dark:text-white/60">
                        {busyLabel}
                    </div>
                )}
                {!loading && !url && (
                    <div className="flex h-full items-center justify-center text-[13px] text-slate-500 dark:text-white/60">
                        {emptyText ?? i18nT('projects.general.noReportsInRange')}
                    </div>
                )}
                {!loading && url && (
                    <iframe
                        src={url}
                        title={title}
                        className="h-full w-full rounded-[2px] border border-slate-300 bg-white dark:border-white/15"
                    />
                )}
            </div>
        </BottomSheet>
    );
};
