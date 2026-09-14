import { useEffect, useMemo } from 'react';
import { FileDownload02 as DownloadIcon } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { PopupDialog } from '@/components/ui-shared/PopupKit';

/**
 * PDF-Vorschau als Mac-Fenster (10.09.2026, Samet: «die Pop-ups der Rapporte
 * … wie ein natives macOS-Programm»): ein mittiges Fenster über leichtem
 * Schleier, Titel und Untertitel in der Titelleiste, rechts daneben EIN
 * blauer Druckknopf «Herunterladen», darunter das Blatt in einem Haarlinien-
 * Rahmen. Bis dahin war es ein Sockelfenster von unten mit dunklem Grund.
 *
 * Gezeigt wird das ECHTE PDF: die Generatoren geben mit `output: 'blob'` (bzw.
 * `buildQuotePdf`) ein Dokument zurück statt es herunterzuladen, das hier in
 * einem Rahmen dargestellt wird. Die Vorschau entspricht damit exakt der
 * späteren Datei — es ist kein nachgebauter Entwurf. Der Knopf lädt genau
 * diese Datei herunter. Chromes eigene Werkzeugleiste im Rahmen ist
 * ausgeblendet (`#toolbar=0`) — Blättern und Zoomen bleiben, die dunkle
 * Leiste mit Dateinamen und Druck-Symbolen nicht.
 *
 * Benutzt von den Kundenrapporten, dem Gesamtrapport des Projekts und der
 * Angebotsvorschau der Auftragsseite; die Beschriftungen sind darum
 * überschreibbar.
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
    // Objekt-URLs sind eine Ressource: die URL entsteht mit dem Dokument, und
    // bei jedem Wechsel und beim Schliessen wird die alte wieder freigegeben,
    // sonst hält der Tab die Dokumente fest.
    const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
    useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

    const busyLabel = loadingLabel ?? i18nT('common.loading');

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={title}
            subtitle={subtitle}
            width={1100}
            z={650}
            bodyClassName="ofi-pdfwin"
            headerActions={(
                <button
                    type="button"
                    className="ofi-cal-btn is-primary"
                    disabled={!blob}
                    onClick={onDownload}
                >
                    <DownloadIcon size={14} />
                    {downloadLabel ?? i18nT('projects.general.generatePdf')}
                </button>
            )}
        >
            <div className="ofi-pdfwin__frame">
                {loading && <div className="ofi-pdfwin__note">{busyLabel}</div>}
                {!loading && !url && (
                    <div className="ofi-pdfwin__note">{emptyText ?? i18nT('projects.general.noReportsInRange')}</div>
                )}
                {!loading && url && (
                    <iframe src={`${url}#toolbar=0&navpanes=0`} title={title} className="ofi-pdfwin__paper" />
                )}
            </div>
        </PopupDialog>
    );
};
